"""Read-only gallery over the existing catalog; no copied products or images."""
import re
from urllib.parse import urlencode

from odoo import api, models, _
from odoo.exceptions import AccessError, ValidationError
from odoo.fields import Domain


class ProductGallery(models.AbstractModel):
    _name = 'biotex.product.gallery'
    _description = 'Galería visual de productos'

    _search_fields = (
        'name', 'biotex_name', 'default_code', 'product_variant_ids.default_code',
        'barcode', 'product_variant_ids.barcode', 'biotex_reference',
        'biotex_alt_code', 'biotex_legacy_code', 'biotex_model',
        'biotex_measure', 'biotex_content', 'description',
        'biotex_characteristics', 'biotex_usage_notes',
        'biotex_brand_id.name', 'biotex_brand_id.code',
        'categ_id.name', 'categ_id.biotex_code',
        'biotex_classifier_id.name', 'biotex_classifier_id.code',
        'biotex_generic_id.name', 'biotex_generic_id.code',
        'biotex_synonym_ids.name', 'biotex_specialty_ids.name',
        'biotex_equipment_ids.name', 'biotex_manufacturer_id.name',
    )
    _image_fields = ('image_1920', 'biotex_image_2', 'biotex_image_3')
    _card_fields = (
        'name', 'default_code', 'active', 'categ_id', 'biotex_brand_id',
        'biotex_reference', 'biotex_measure', 'biotex_content', 'write_date',
    )
    _detail_fields = (
        'barcode', 'biotex_alt_code', 'biotex_legacy_code', 'biotex_model',
        'biotex_characteristics', 'description', 'biotex_usage_notes',
    )

    def _products(self):
        if not self.env.user.has_group('base.group_user'):
            raise AccessError(_('La galería está disponible para usuarios internos del catálogo.'))
        products = self.env['product.template'].with_context(active_test=False, bin_size=True)
        products.check_access('read')
        return products

    def _domain(self, query='', match='all', category_id=False, brand_id=False,
                photos='all', status='active'):
        if match not in ('all', 'any') or photos not in ('all', 'with', 'without') or status not in ('all', 'active', 'archived'):
            raise ValidationError(_('Revise los filtros de la galería.'))
        query = str(query or '').strip()
        if len(query) > 512:
            raise ValidationError(_('La búsqueda admite hasta 512 caracteres.'))
        # Punctuation separates terms: fragments of structured/legacy codes work too.
        terms = list(dict.fromkeys(re.findall(r'[^\W_]+', query, flags=re.UNICODE)))
        if len(terms) > 24:
            raise ValidationError(_('Use hasta 24 palabras por búsqueda.'))
        domain = Domain.TRUE
        if terms:
            words = [Domain.OR(Domain(field, 'ilike', term) for field in self._search_fields) for term in terms]
            domain &= Domain.AND(words) if match == 'all' else Domain.OR(words)
        if category_id:
            domain &= Domain('categ_id', 'child_of', int(category_id))
        if brand_id:
            domain &= Domain('biotex_brand_id', '=', int(brand_id))
        if status != 'all':
            domain &= Domain('active', '=', status == 'active')
        if photos != 'all':
            domain &= Domain('biotex_photo_count', '>' if photos == 'with' else '=', 0)
        return domain

    def _serialize(self, products, detail=False):
        fields = self._card_fields + self._image_fields + (self._detail_fields if detail else ())
        rows = products.read(list(fields))
        for row in rows:
            row['photos'] = []
            version = urlencode({'unique': str(row.pop('write_date') or '')})
            for index, field in enumerate(self._image_fields, 1):
                # bin_size=True reads presence/size, never transfers base64 images in RPC.
                if row.pop(field):
                    path = '/web/image/product.template/%s/%s' % (row['id'], field)
                    row['photos'].append({
                        'field': field, 'label': _('Foto %s', index),
                        'thumbnail': path + '/512x512?' + version,
                        'url': path + '?' + version,
                    })
        return rows

    @api.model
    def search_products(self, query='', match='all', category_id=False, brand_id=False,
                        photos='all', status='active', order='name', offset=0, limit=24):
        products = self._products()
        domain = self._domain(query, match, category_id, brand_id, photos, status)
        ordering = {
            'name': 'name, id', 'code': 'default_code, name, id',
            'recent': 'write_date desc, id desc',
        }.get(order, 'name, id')
        limit = max(1, min(int(limit), 60))
        total = products.search_count(domain)
        # Clamp a page that disappeared after a product was archived or edited.
        offset = min(max(0, int(offset)), ((total - 1) // limit) * limit if total else 0)
        page = products.search(domain, order=ordering, offset=offset, limit=limit)
        return {'products': self._serialize(page), 'total': total, 'offset': offset, 'limit': limit}

    @api.model
    def get_product(self, product_id):
        product = self._products().browse(int(product_id)).exists()
        if not product:
            raise ValidationError(_('Este producto ya no está disponible. Actualice la galería.'))
        product.check_access('read')
        return self._serialize(product, detail=True)[0]

    @api.model
    def get_filters(self):
        products = self._products()
        # The facets are derived from accessible products, using the caller's record rules.
        def facet(field):
            values = products._read_group([], [field], ['__count'])
            return sorted(
                [{'id': record.id, 'name': record.display_name} for record, count in values if record],
                key=lambda value: value['name'].casefold(),
            )
        return {'categories': facet('categ_id'), 'brands': facet('biotex_brand_id')}
