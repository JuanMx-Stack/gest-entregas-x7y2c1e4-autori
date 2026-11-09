# Gestión de Entregas — GitHub Pages

Sitio estático separado en HTML, CSS, JavaScript y configuración pública JSON, derivado de tu HTML original.

## Publicación gratuita

1. En GitHub, crea un repositorio público llamado `gestion-entregas`.
2. Sube **el contenido** de esta carpeta a la raíz del repositorio (debe quedar `index.html` en la raíz, no dentro de otra carpeta).
3. En el repositorio abre **Settings → Pages → Build and deployment**.
4. En **Source** elige **Deploy from a branch**, con `main` y `/(root)`, y pulsa **Save**.
5. Al finalizar se mostrará **Visit site**. La dirección suele ser `https://USUARIO.github.io/gestion-entregas/`.

El repositorio es público y la página será visible para cualquiera que conozca el enlace. Nunca subas datos de clientes, hojas exportadas, claves de Gemini o credenciales a GitHub.

## Primer uso en la página publicada

- Abre el enlace y entra en el botón ⚙️.
- Configura en *ese navegador* la hoja, URL de Apps Script y clave de Gemini. No vienen incluidos en el código publicado.
- La configuración actual se almacena en `localStorage` del navegador, no en GitHub. En otro móvil/PC deberás configurarla nuevamente.
- El botón **Copiar enlace del sistema** ya no incorpora los datos de configuración ni la clave.
- El escáner necesita HTTPS o permisos adecuados para usar la cámara desde móvil. GitHub Pages proporciona HTTPS.

## Seguridad y limitaciones importantes

**El frontend estático no es un backend seguro.** La clave de Gemini se usa desde el navegador y queda disponible en sus herramientas de desarrollo. No uses una clave compartida con otros usuarios; para un despliegue multiusuario se necesita un intermediario seguro con controles de acceso.

**Google Sheets** se consulta en la versión original usando una URL de Google Visualization (gviz) y las escrituras se envían a un Apps Script. La seguridad y permisos de acceso de esos servicios **no quedan resueltos por GitHub Pages**. No publiques ni enlaces datos de clientes reales hasta verificar los permisos del documento, la autorización de tratamiento y la protección/autenticación de Apps Script. Prueba primero con datos ficticios.

Si tienes claves o URLs de Apps Script compartidas previamente en enlaces, revócalas o rótalas cuando corresponda.

GitHub Pages es un servidor de archivos estáticos; **no ejecuta Python ni Apps Script**. Apps Script/Gemini siguen siendo servicios externos, como antes.

## Archivos

- `index.html`: interfaz idéntica a la versión original.
- `assets/css/styles.css`: estilo oscuro.
- `assets/js/configuracion.js`: configuración local y opciones públicas.
- `assets/js/servicios.js`: red, Gemini y sincronización.
- `assets/js/paquetes.js`: registros, lista, edición, WhatsApp y reportes.
- `assets/js/ocr.js`: Gemini y respaldo con Tesseract.
- `assets/js/inicio.js`: arranque del sistema.
- `config.json`: opciones públicas (el modelo OCR por defecto).

## Copia de seguridad

El HTML antiguo no se borra ni se modifica. Haz copia de tus datos y configuración antes de migrar. Este paquete **no contiene** datos de clientes ni secretos.
