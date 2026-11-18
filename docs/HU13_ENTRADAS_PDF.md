# HU 13 — Entradas PDF con QR

## Implementación

Se reutiliza `generarTicketPdf` en `lib/compras/pdf.ts`, invocado desde el botón del modal de Mis Compras. No se añade una ruta de descarga ni una consulta nueva.

- Digital: encabezado e instrucciones para presentar el QR en el acceso.
- Física: encabezado y botón de recogida; instrucciones para presentar QR y carnet al administrador y recoger/vincular la manilla. El PDF indica que no sustituye la manilla necesaria para ingresar.
- Ambos incluyen evento, fecha con año y hora de Bolivia, ubicación (o “Por confirmar”), tipo de entrada y el valor QR original, sin transformarlo.
- Texto ajustado al ancho con posición vertical acumulada y páginas adicionales si hace falta. Se mantienen juntos QR, código e instrucciones.
- QR negro sobre blanco, 600 px, 90 mm al colocarlo en PDF, corrección M y margen de cuatro módulos.
- Sin nombre, correo, carnet ni saldo del usuario. Se conserva la identidad visual QPass en el encabezado.

No se modificaron consultas, tipos, políticas RLS, pagos, identificación QR ni el PDF del comprobante de compra. La autorización sigue en las consultas del servidor y RLS. Generar un PDF en el navegador no constituye una barrera de autorización nueva ni permite revocar copias ya descargadas.

## Pruebas automatizadas

```text
node scripts/validar-ticket-pdf.cjs
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

El script usa las versiones instaladas de jsPDF y qrcode, con datos ficticios. Genera el PDF en memoria y examina las llamadas de dibujo para comprobar límites de página y superposición. ZXing decodifica la imagen PNG realmente incorporada al PDF y debe devolver el código original. Comprueba versiones digital/física, textos extensos con paginación, ubicación ausente, código de 255 caracteres y rechazo de código vacío/tipo desconocido. No persiste PDFs, instala dependencias ni usa red.

La prueba no rasteriza el PDF final ni comprueba cámara, impresión, fuentes en un visor real o autorización remota. PNG y ZXing son dependencias ya disponibles en el árbol instalado; no se agregaron a package.json.

## Pruebas manuales con cuentas de prueba

1. Iniciar la aplicación con `npm run dev`. Confirmar que `NEXT_PUBLIC_USE_MOCK_COMPRAS` no sea `true` al probar autorización real. Usar únicamente cuentas y eventos de prueba autorizados.
2. Iniciar sesión como comprador/destinatario A. Abrir `/mis-compras`. La vista actual lista entradas asignadas al destinatario; para esta prueba digital usar una entrada comprada para sí mismo. La visibilidad de regalos para el comprador corresponde a HU 9 y no se modifica aquí.
3. En una entrada digital, abrir “Ver QR” y pulsar “Descargar entrada PDF”. Revisar nombre, fecha/año/hora de Bolivia, ubicación, tipo y texto de acceso. Comparar el código mostrado con el de la aplicación.
4. Abrir el archivo en un visor PDF. Comprobar que no haya superposición, recortes ni alteraciones de caracteres. Si hay textos largos, revisar también páginas adicionales.
5. Si existe una entrada física, abrir “QR de recogida” y pulsar “Descargar PDF de recogida”. Confirmar las instrucciones de carnet y recogida/vinculación, y la aclaración de que no sustituye la manilla. Si no hay datos de prueba físicos, registrar pendiente; no crear compras o manillas en producción para simular aprobación.
6. Con una cuenta de supervisor de prueba autorizada, abrir `/supervisor` y usar “Escanear con cámara” para leer el PDF desde otra pantalla o una impresión. El lector existente rellena el campo “Código QR”; comparar el texto exactamente, incluido el prefijo. No registrar ingreso ni vincular manillas para esta comprobación: leer el código no exige consumir una entrada. La cámara requiere localhost o HTTPS y permiso del navegador.
7. Cerrar sesión e ingresar con B, una cuenta de prueba que no sea comprador ni destinatario de la entrada de A. Mis Compras no debe mostrar esa entrada. Abrir la URL de confirmación de compra de A previamente anotada (`/compra/confirmacion/<compraId>`): debe denegar la consulta, normalmente con 404. No compartir el PDF o QR de A con B para esta prueba: una copia ya entregada no comprueba RLS.
8. Repetir descarga/escaneo en móvil y escritorio. Confirmar lectura del QR impreso a tamaño real y buen contraste.

Si no aparece una entrada esperada, revisar asignación al destinatario, estado y visibilidad del evento/tipo de ticket en las consultas existentes antes de atribuirlo al generador. No ampliar RLS para resolverlo sin coordinación.

**Estado:** pendiente de aceptación visual, impresión/cámara y autorización con Supabase real. Las pruebas aisladas no declaran la historia terminada.
