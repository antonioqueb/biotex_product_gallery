/* Run with NODE_PATH pointing to jsdom and OWL_PATH to Odoo 19's web/static/lib/owl/owl.js. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

(async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://gallery.example.test/' });
    const w = dom.window;
    w.eval(fs.readFileSync(process.env.OWL_PATH, 'utf8'));
    const templates = fs.readFileSync(path.join(__dirname, '../static/src/gallery.xml'), 'utf8');
    let source = fs.readFileSync(path.join(__dirname, '../static/src/gallery.js'), 'utf8');
    source = source.replace(/^import .*;$/gm, '').replace(/export class /g, 'class ');
    const product = { id: 17, name: 'Compresa húmeda hombro', default_code: 'CN-MARC-FAM-CLA-17', active: true, categ_id: [4, 'Compresas'], biotex_brand_id: [5, 'Marca'], biotex_reference: '1012', photos: [] };
    const calls = [];
    w.services = {
        orm: { call: async (model, method, args, kwargs) => {
            calls.push({ method, args, kwargs });
            if (method === 'get_filters') return { categories: [{ id: 4, name: 'Compresas' }], brands: [{ id: 5, name: 'Marca' }] };
            if (method === 'get_product') return product;
            return { products: [product], total: 1, offset: 0, limit: 24 };
        } },
        action: { doAction: (action) => { w.lastAction = action; } },
        dialog: { add: (component, props) => { w.lastDialog = props; } }, notification: { add() {} },
    };
    w.eval(`const {Component, onWillDestroy, onWillStart, useState} = owl;
        const useService = (name) => window.services[name];
        const registry = { category: () => ({ add() {} }) }; const _t = (value) => value;
        class Dialog extends Component { static template = owl.xml\`<section><t t-slot="default"/><footer><t t-slot="footer"/></footer></section>\`; static props = ['*']; }
        ${source}
        window.Gallery = ProductGallery; window.Viewer = ProductPhotoDialog;`);
    const tick = () => new Promise((resolve) => setTimeout(resolve, 40));
    const app = new w.owl.App(w.Gallery, { templates, dev: true });
    const gallery = await app.mount(w.document.body);
    assert.equal(w.document.querySelectorAll('.bpg-card').length, 1);
    assert.match(w.document.querySelector('.bpg-card').textContent, /Sin imágenes todavía/);
    const query = w.document.querySelector('input[type="search"]');
    query.value = 'marca 1012'; query.dispatchEvent(new w.Event('input', { bubbles: true }));
    w.document.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await tick(); assert.equal(calls.at(-1).kwargs.query, 'marca 1012');
    const selects = w.document.querySelectorAll('select');
    selects[0].value = 'any'; selects[0].dispatchEvent(new w.Event('change', { bubbles: true }));
    await tick(); assert.equal(calls.at(-1).kwargs.match, 'any');
    selects[1].value = '4'; selects[1].dispatchEvent(new w.Event('change', { bubbles: true }));
    await tick(); assert.equal(calls.at(-1).kwargs.category_id, 4);
    await gallery.reset(); await tick(); assert.equal(selects[0].value, 'all'); assert.equal(selects[1].value, '');
    w.document.querySelector('.bpg-cover').click(); await tick(); assert.equal(w.lastDialog.product.id, 17);
    w.document.querySelector('.bpg-card-footer .btn-link').click(); assert.equal(w.lastAction.res_id, 17);
    app.destroy();
    const photos = [{ field: 'biotex_image_2', label: 'Foto 2', url: '/photo2', thumbnail: '/thumb2' }, { field: 'biotex_image_3', label: 'Foto 3', url: '/photo3', thumbnail: '/thumb3' }];
    const viewerApp = new w.owl.App(w.Viewer, { templates, dev: true, props: { product: { ...product, photos }, close() {}, openProduct() {} } });
    await viewerApp.mount(w.document.body);
    assert.equal(w.document.querySelector('.bpg-stage img').getAttribute('src'), '/photo2');
    w.document.querySelector('[aria-label="Foto siguiente"]').click(); await tick();
    assert.equal(w.document.querySelector('.bpg-stage img').getAttribute('src'), '/photo3');
    w.document.querySelector('.bpg-thumbnails button').click(); await tick();
    assert.equal(w.document.querySelector('.bpg-stage img').getAttribute('src'), '/photo2');
    viewerApp.destroy(); dom.window.close();
    console.log('Odoo Owl templates: render, search, filters, reset, product form and photo navigation OK');
})().catch((error) => { console.error(error); process.exit(1); });
