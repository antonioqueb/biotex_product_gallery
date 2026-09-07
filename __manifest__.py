{
    'name': 'Galería de productos',
    'summary': 'Catálogo visual, visor de fotos y búsqueda libre por palabras, claves, marcas y sinónimos',
    'version': '19.0.1.0.0',
    'category': 'Distribución de insumos',
    'author': 'Alphaqueb Consulting SAS',
    'website': 'https://github.com/antonioqueb/biotex_product_gallery',
    'license': 'LGPL-3',
    'depends': ['biotex_catalog', 'web'],
    'data': ['views/gallery_views.xml'],
    'assets': {
        'web.assets_backend': [
            'biotex_product_gallery/static/src/gallery.js',
            'biotex_product_gallery/static/src/gallery.xml',
            'biotex_product_gallery/static/src/gallery.scss',
        ],
    },
    'icon': '/biotex_product_gallery/static/description/icon.svg',
    'application': True,
    'installable': True,
}
