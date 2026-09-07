const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(call) {
    const hooks = {};
    const services = { orm: { call }, action: { doAction: (value) => value }, dialog: { add() {} }, notification: { add() {} } };
    const context = {
        Component: class {}, useState: (state) => state, useService: (name) => services[name],
        onWillStart: (fn) => { hooks.start = fn; }, onWillDestroy: (fn) => { hooks.destroy = fn; },
        registry: { category: () => ({ add() {} }) }, Dialog: class {}, _t: (value) => value,
        setTimeout, clearTimeout,
    };
    vm.createContext(context);
    let source = fs.readFileSync(path.join(__dirname, '../static/src/gallery.js'), 'utf8');
    source = source.replace(/^import .*;$/gm, '').replace(/export class /g, 'class ');
    vm.runInContext(source + '\nglobalThis.Classes = { ProductGallery, ProductPhotoDialog };', context);
    const gallery = new context.Classes.ProductGallery();
    gallery.setup();
    return { gallery, hooks, context };
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const result = (name) => ({ products: [{ id: 1, name }], total: 1, offset: 0, limit: 24 });

test('the latest search wins even when the old response arrives last', async () => {
    const first = deferred(), second = deferred(); let count = 0;
    const { gallery } = harness(() => (++count === 1 ? first : second).promise);
    const a = gallery.load(); gallery.state.query = 'new'; const b = gallery.load(0);
    second.resolve(result('new')); await b;
    first.resolve(result('old')); await a;
    assert.equal(gallery.state.products[0].name, 'new');
    assert.equal(gallery.state.loading, false);
});
test('typing invalidates a pending request before the debounce has fired', async () => {
    const old = deferred(); const { gallery, hooks } = harness(() => old.promise);
    const pending = gallery.load(); gallery.onSearch({ target: { value: 'new' } });
    old.resolve(result('old')); await pending;
    assert.equal(gallery.state.products.length, 0);
    assert.equal(gallery.state.loading, true);
    hooks.destroy();
});
test('leaving the action discards late responses', async () => {
    const call = deferred(); const { gallery, hooks } = harness(() => call.promise);
    const pending = gallery.load(); hooks.destroy(); call.resolve(result('old')); await pending;
    assert.equal(gallery.state.products.length, 0);
});
test('errors can be retried and broadening clears all optional restrictions', async () => {
    let fail = true; let params;
    const { gallery } = harness(async (model, method, args, options) => { params = options; if (fail) throw new Error('offline'); return result('ready'); });
    await gallery.load(); assert.ok(gallery.state.error); assert.equal(gallery.state.loading, false);
    fail = false; Object.assign(gallery.state, { query: 'compresa 1012', category_id: '3', brand_id: '2', photos: 'with' });
    await gallery.broaden();
    assert.equal(gallery.state.error, ''); assert.equal(params.query, 'compresa 1012');
    assert.equal(params.category_id, false); assert.equal(params.brand_id, false);
    assert.equal(params.match, 'any'); assert.equal(params.photos, 'all'); assert.equal(params.status, 'all');
});
test('viewer cycles only available photos, handles keyboard and opens the original record', () => {
    const { context, gallery } = harness(async () => result('ready'));
    const viewer = new context.Classes.ProductPhotoDialog();
    let closed = false, opened;
    viewer.props = { product: { id: 42, photos: [{ field: 'biotex_image_2' }, { field: 'biotex_image_3' }] }, close: () => { closed = true; }, openProduct: (id) => { opened = id; } };
    viewer.setup(); viewer.move(-1); assert.equal(viewer.photo.field, 'biotex_image_3');
    let prevented = false; viewer.onKeydown({ key: 'ArrowRight', preventDefault: () => { prevented = true; } });
    assert.equal(viewer.photo.field, 'biotex_image_2'); assert.ok(prevented);
    viewer.openProduct(); assert.ok(closed); assert.equal(opened, 42);
    const action = gallery.openProduct(42); assert.equal(action.res_model, 'product.template'); assert.equal(action.res_id, 42);
    viewer.props.product.photos = []; viewer.move(1); assert.equal(viewer.photo, undefined);
});
