/** @odoo-module **/
import { Component, onWillDestroy, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";

export class ProductPhotoDialog extends Component {
    static template = "biotex_product_gallery.PhotoDialog";
    static components = { Dialog };
    static props = ["product", "openProduct", "close"];
    setup() {
        this.state = useState({ index: 0 });
    }
    get photo() { return this.props.product.photos[this.state.index]; }
    move(step) {
        const length = this.props.product.photos.length;
        if (length) this.state.index = (this.state.index + step + length) % length;
    }
    onKeydown(ev) {
        if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
            ev.preventDefault();
            this.move(ev.key === "ArrowLeft" ? -1 : 1);
        }
    }
    openProduct() {
        this.props.close();
        this.props.openProduct(this.props.product.id);
    }
}

export class ProductGallery extends Component {
    static template = "biotex_product_gallery.Gallery";
    static props = ["*"];
    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.dialog = useService("dialog");
        this.notification = useService("notification");
        this.state = useState({
            query: "", match: "all", category_id: "", brand_id: "", photos: "all", status: "active", order: "name",
            categories: [], brands: [], products: [], total: 0, offset: 0, limit: 24,
            loading: true, error: "", opening: false,
        });
        this.requestVersion = 0;
        this.alive = true;
        onWillStart(() => this.refresh());
        onWillDestroy(() => {
            this.alive = false;
            this.requestVersion++;
            clearTimeout(this.searchTimer);
        });
    }
    get hasFilters() {
        const s = this.state;
        return !!(s.query || s.category_id || s.brand_id || s.photos !== "all" || s.status !== "active" || s.match !== "all");
    }
    get lastItem() { return Math.min(this.state.offset + this.state.products.length, this.state.total); }
    get errorMessage() { return _t("No se pudo cargar la galería. Intente actualizarla."); }
    async refresh() {
        await Promise.all([this.load(), this.loadFilters()]);
    }
    async loadFilters() {
        try {
            const data = await this.orm.call("biotex.product.gallery", "get_filters", []);
            if (this.alive) Object.assign(this.state, data);
        } catch {
            if (this.alive) this.notification.add(_t("No se pudieron cargar las marcas y familias. Puede seguir usando la búsqueda."), { type: "warning" });
        }
    }
    async load(offset = this.state.offset) {
        clearTimeout(this.searchTimer);
        const version = ++this.requestVersion;
        this.state.loading = true;
        this.state.error = "";
        const { query, match, category_id, brand_id, photos, status, order, limit } = this.state;
        try {
            const data = await this.orm.call("biotex.product.gallery", "search_products", [], {
                query, match, category_id: Number(category_id) || false, brand_id: Number(brand_id) || false,
                photos, status, order, offset, limit,
            });
            if (this.alive && version === this.requestVersion) Object.assign(this.state, data);
        } catch (error) {
            if (this.alive && version === this.requestVersion) {
                this.state.error = error.data?.message || this.errorMessage;
            }
        } finally {
            if (this.alive && version === this.requestVersion) this.state.loading = false;
        }
    }
    onSearch(ev) {
        this.state.query = ev.target.value;
        // Invalidate in-flight results immediately, including during the debounce window.
        this.requestVersion++;
        this.state.loading = true;
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => this.load(0), 300);
    }
    submitSearch() { return this.load(0); }
    setFilter(field, ev) {
        this.state[field] = ev.target.value;
        return this.load(0);
    }
    reset() {
        Object.assign(this.state, { query: "", match: "all", category_id: "", brand_id: "", photos: "all", status: "active", order: "name" });
        return this.load(0);
    }
    broaden() {
        Object.assign(this.state, { match: "any", category_id: "", brand_id: "", photos: "all", status: "all" });
        return this.load(0);
    }
    previous() { return this.load(Math.max(0, this.state.offset - this.state.limit)); }
    next() { return this.load(this.state.offset + this.state.limit); }
    async showProduct(product) {
        if (this.state.opening) return;
        this.state.opening = true;
        try {
            const data = await this.orm.call("biotex.product.gallery", "get_product", [product.id]);
            if (this.alive) this.dialog.add(ProductPhotoDialog, { product: data, openProduct: (id) => this.openProduct(id) });
        } catch (error) {
            if (this.alive) this.notification.add(error.data?.message || this.errorMessage, { type: "danger" });
        } finally {
            if (this.alive) this.state.opening = false;
        }
    }
    openProduct(id) {
        return this.action.doAction({
            type: "ir.actions.act_window", name: _t("Ficha del producto"), res_model: "product.template",
            res_id: id, views: [[false, "form"]], target: "current",
        });
    }
}

registry.category("actions").add("biotex_product_gallery.gallery", ProductGallery);
