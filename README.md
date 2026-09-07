# Galería de productos · Odoo 19

Aplicación independiente para consultar visualmente el catálogo existente. Incluye icono SVG propio, tarjetas adaptables a móvil, visor de hasta tres fotografías y acceso a la ficha del producto para cargar o actualizar sus imágenes.

La galería usa los colores del tema activo de Odoo y los estilos compartidos del sistema. Su área interna permite desplazarse por todos los productos y llegar a la paginación con rueda, gesto táctil o teclado, también en pantallas pequeñas. El icono mantiene el estilo y el verde de la aplicación de Catálogo.

## Uso

Abra **Galería de productos** desde el menú de aplicaciones. Escriba en la barra de búsqueda y pulse Buscar, o espere a que los resultados se actualicen mientras escribe.

- **Todas las palabras**: encuentra palabras en cualquier orden, aunque estén en distintos campos. `compresa marca 1012` puede coincidir con el nombre, la marca y la referencia del mismo producto.
- **Cualquier palabra**: amplía los resultados a productos que coincidan con al menos una palabra.
- La búsqueda acepta coincidencias parciales en nombres, descripciones, claves internas y de variantes, códigos de barras, referencias, claves alternas y anteriores, marcas, categorías, clasificadores, genéricos, medidas, presentación, características, notas de uso, sinónimos, especialidades, equipos y fabricante.
- No exige una pestaña, categoría o etiqueta de búsqueda. Las familias, marcas, imágenes y estado son filtros opcionales. El botón **Ampliar búsqueda** también incluye archivados y elimina los filtros.
- La búsqueda sin acentos utiliza el soporte `unaccent` estándar de Odoo/PostgreSQL. Actívelo en instalaciones nuevas si se requiere equivalencia entre `húmeda` y `humeda`.
- La galería incluye inicialmente todos los productos activos, tengan o no imágenes. La autorización para completar un producto sin foto no cuenta como fotografía.
- Las tarjetas muestran 24 productos por página. Puede ordenar por nombre, clave o última actualización.

**Ver detalle** abre el visor; las miniaturas y las flechas cambian la imagen. **Abrir imagen completa** abre la fotografía original. **Abrir ficha / agregar fotos** lleva a la ficha existente: imagen principal y pestaña de fotografías (fotos 2 y 3). Después de guardar, vuelva a la galería y pulse **Actualizar**.

## Instalación

Dependencias: `biotex_catalog` y `web`, con sus dependencias instaladas. Compatible con el catálogo `19.0.2.2.1` y posteriores; no requiere actualizarlo.

```sh
git clone https://github.com/antonioqueb/biotex_product_gallery.git /ruta/addons/biotex_product_gallery
odoo -c /ruta/odoo.conf -d BASE -i biotex_product_gallery --stop-after-init --without-demo=True
```

Reinicie Odoo y recargue el navegador. Para actualizar este módulo use `-u biotex_product_gallery`.

Registre también el repositorio en el inventario de despliegue/restauración de su instalación. El directorio se debe conservar al sincronizar addons y al restaurar una base que tenga esta aplicación instalada.

## Seguridad y datos

La galería no crea ni duplica productos, fotos, precios o consecutivos. Sus métodos consultan el catálogo con el usuario y las compañías de la sesión; conservan los permisos y las reglas de registros de Odoo. El menú usa el grupo de delegación del catálogo. Los usuarios públicos y de portal no pueden consultar la API de la galería.

Las fotos se sirven por la ruta estándar de Odoo con sus controles de acceso. Las respuestas RPC contienen rutas de imagen y metadatos, sin los binarios de las fotografías ni costos/precios. Las miniaturas se cargan de forma diferida y se invalidan cuando cambia el producto. Los filtros se obtienen de productos accesibles al usuario. No se usa `sudo`, SQL directo ni un controlador público nuevo.

## Validación

Las pruebas de integración usan transacciones con reversión: búsqueda por palabras/campos, acentos, sinónimos, claves, filtros, archivados, fotos secundarias, paginación, permisos y compañías.

```sh
odoo -c /ruta/odoo.conf -d BASE -i biotex_product_gallery --test-enable \
  --test-tags /biotex_product_gallery --stop-after-init --without-demo=True
node --test tests/gallery_frontend.test.cjs
```

Las pruebas JavaScript verifican búsquedas simultáneas, respuestas tardías, cancelación al salir y navegación del visor usando el componente real con servicios sustituidos. El procedimiento de instalación debe comprobar además la compilación de assets y la salud del servicio.

Para renderizar las plantillas con el motor Owl de su instalación de Odoo (requiere Node.js compatible con jsdom):

```sh
npm ci
OWL_PATH=/ruta/odoo/addons/web/static/lib/owl/owl.js npm run test:templates
```

Esta prueba monta las plantillas reales en un DOM de prueba y verifica tarjetas, búsqueda, filtros, limpieza, apertura de ficha y navegación entre fotos. No sustituye una revisión visual en el navegador. Las dependencias de Node son exclusivamente de desarrollo; Odoo no las necesita para instalar ni ejecutar el módulo.

Licencia: LGPL-3.0-or-later.
