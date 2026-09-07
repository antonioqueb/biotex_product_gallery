import base64
from io import BytesIO

from PIL import Image

from odoo.exceptions import AccessError, ValidationError
from odoo.tests import TransactionCase, tagged
from odoo.tests.common import new_test_user


@tagged('post_install', '-at_install')
class TestProductGallery(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.operator = new_test_user(
            cls.env(context={**cls.env.context, 'no_reset_password': True}),
            login='gallery_test_operator', groups='biotex_base.group_biotex_delegation',
        )
        cls.gallery = cls.env['biotex.product.gallery'].with_user(cls.operator)
        cls.brand = cls.env['biotex.brand'].create({'name': 'VisualMarca', 'code': 'VSGA'})
        cls.category = cls.env['product.category'].create({'name': 'VisualFamilia'})
        cls.product = cls.env['product.template'].create({
            'name': 'VisualGaleria Compresa Húmeda hombro', 'categ_id': cls.category.id,
            'biotex_brand_id': cls.brand.id, 'default_code': 'VG-REF-0189',
            'biotex_reference': 'Proveedor987', 'biotex_alt_code': 'Cliente654',
            'biotex_legacy_code': 'Anterior321', 'barcode': '998877665544332211',
            'biotex_characteristics': 'Terapeutica biodegradable',
        })
        cls.other = cls.env['product.template'].create({
            'name': 'VisualGaleria Guante estéril', 'categ_id': cls.category.id,
            'default_code': 'VG-REF-0190', 'biotex_photo_waived': True,
        })
        cls.archived = cls.env['product.template'].create({
            'name': 'VisualGaleria Producto archivado', 'active': False, 'categ_id': cls.category.id,
        })
        cls.env['biotex.product.synonym'].create({'name': 'AlmohadillaX', 'product_tmpl_id': cls.product.id})

    def ids(self, **kwargs):
        return [row['id'] for row in self.gallery.search_products(**kwargs)['products']]

    def test_words_in_any_order_across_fields_and_partial_codes(self):
        self.assertEqual(self.ids(query='hombro VisualMarca 0189 compresa'), self.product.ids)
        self.assertEqual(self.ids(query='VG-REF-0189'), self.product.ids)
        self.assertEqual(self.ids(query='BIODEGRADABLE proveedor987'), self.product.ids)

    def test_accents_case_and_synonyms(self):
        self.assertEqual(self.ids(query='humeda COMPRESA visualgaleria'), self.product.ids)
        self.assertEqual(self.ids(query='almohadillax'), self.product.ids)

    def test_reference_barcode_alternate_and_legacy(self):
        for query in ('Proveedor987', 'Cliente654', 'Anterior321', '998877665544332211'):
            self.assertEqual(self.ids(query=query), self.product.ids)

    def test_any_word_broadens_results(self):
        self.assertFalse(self.ids(query='compresa NoSuchGalleryWord'))
        self.assertIn(self.product.id, self.ids(query='compresa NoSuchGalleryWord', match='any'))

    def test_filters_are_optional_and_archived_is_explicit(self):
        self.assertEqual(set(self.ids(query='VisualGaleria')), {self.product.id, self.other.id})
        self.assertEqual(self.ids(query='VisualGaleria', status='archived'), self.archived.ids)
        self.assertEqual(len(self.ids(query='VisualGaleria', status='all')), 3)
        self.assertEqual(self.ids(query='VisualGaleria', brand_id=self.brand.id), self.product.ids)
        self.assertEqual(len(self.ids(query='VisualGaleria', category_id=self.category.id)), 2)

    def test_secondary_photo_can_be_cover_and_images_are_not_returned_in_rpc(self):
        image = BytesIO()
        Image.new('RGB', (24, 24), '#087e8b').save(image, format='PNG')
        self.product.biotex_image_2 = base64.b64encode(image.getvalue())
        self.assertEqual(self.ids(query='VisualGaleria', photos='with'), self.product.ids)
        self.assertEqual(self.ids(query='VisualGaleria', photos='without'), self.other.ids)
        detail = self.gallery.get_product(self.product.id)
        self.assertEqual([photo['field'] for photo in detail['photos']], ['biotex_image_2'])
        self.assertIn('/512x512?unique=', detail['photos'][0]['thumbnail'])
        self.assertTrue(detail['photos'][0]['url'].startswith('/web/image/product.template/'))
        for field in ('image_1920', 'biotex_image_2', 'biotex_image_3', 'standard_price', 'list_price'):
            self.assertNotIn(field, detail)

    def test_photo_waiver_is_not_a_photo(self):
        self.assertIn(self.other.id, self.ids(query='VisualGaleria', photos='without'))
        self.assertFalse(self.gallery.get_product(self.other.id)['photos'])

    def test_pagination_clamp_and_limits(self):
        first = self.gallery.search_products(query='VisualGaleria', limit=1)
        second = self.gallery.search_products(query='VisualGaleria', limit=1, offset=1)
        self.assertEqual(first['total'], 2)
        self.assertNotEqual(first['products'][0]['id'], second['products'][0]['id'])
        self.assertEqual(self.gallery.search_products(query='VisualGaleria', limit=1, offset=999)['offset'], 1)
        self.assertEqual(self.gallery.search_products(query='VisualGaleria', limit=999)['limit'], 60)

    def test_public_user_cannot_call_any_gallery_endpoint(self):
        gallery = self.gallery.with_user(self.env.ref('base.public_user'))
        for method, args in ((gallery.search_products, []), (gallery.get_filters, []), (gallery.get_product, [self.product.id])):
            with self.assertRaises(AccessError):
                method(*args)

    def test_record_rules_apply_to_search_detail_and_filter_options(self):
        self.env['ir.rule'].create({
            'name': 'Gallery test restricted product',
            'model_id': self.env['ir.model']._get_id('product.template'),
            'domain_force': "[('id', '!=', %d)]" % self.product.id,
        })
        self.assertFalse(self.ids(query='Proveedor987'))
        with self.assertRaises(AccessError):
            self.gallery.get_product(self.product.id)
        self.assertNotIn(self.brand.id, [item['id'] for item in self.gallery.get_filters()['brands']])

    def test_company_rules_are_respected(self):
        company = self.env['res.company'].create({'name': 'Gallery isolated company'})
        self.product.company_id = company
        self.assertFalse(self.ids(query='Proveedor987'))
        with self.assertRaises(AccessError):
            self.gallery.get_product(self.product.id)

    def test_invalid_filters_and_missing_products(self):
        with self.assertRaises(ValidationError):
            self.gallery.search_products(match='sql')
        with self.assertRaises(ValidationError):
            self.gallery.search_products(query='x' * 513)
        with self.assertRaises(ValidationError):
            self.gallery.get_product(0)

    def test_facets_and_deterministic_order(self):
        filters = self.gallery.get_filters()
        self.assertIn(self.brand.id, [item['id'] for item in filters['brands']])
        self.assertIn(self.category.id, [item['id'] for item in filters['categories']])
        self.assertEqual(self.ids(query='VisualGaleria', order='code'), [self.product.id, self.other.id])
        self.assertEqual(self.ids(query='VisualGaleria', order='untrusted order'), self.ids(query='VisualGaleria'))
