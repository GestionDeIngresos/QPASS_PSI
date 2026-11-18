# HU 60 — Catálogo y carrito de venta

## Contratos comprobados y estado de integración

Se revisaron el checkout Aliaga y las referencias ya descargadas origin/Aguilar, origin/Aliaga, origin/Main, origin/Herbas, origin/Bullain y origin/backup-main, sin fetch, checkout ni merge. En origin/Aguilar el último commit inspeccionado es 654790d. No se encontraron módulos/DDL/contratos de negocios, productos, precios en puntos, disponibilidad, negocio-evento o asignación comercial activa. Las referencias locales pueden estar desactualizadas respecto al servidor Git; no se afirma que C no haya avanzado fuera de ellas.

El contrato reutilizable confirmado sigue siendo usuarios.activo/rol y asignaciones_staff por usuario, rol y evento. No equivale a autorización comercial. Se mantiene el guard de Ayudante y se vuelve a comprobar el evento dentro del proveedor de catálogo.

`lib/ayudante/catalogo-server.ts` es el punto de adaptación futuro de C: por ahora retorna pendiente. No hay consultas a tablas ni RPC inventadas. Los DTO de `contracts.ts` y `carrito.ts` son modelos de aplicación, no firmas de la base.

**Producción:** catálogo pendiente, sin productos ficticios ni operaciones de venta. **Desarrollo:** solo una demostración explícita, tras autenticación/rol activo/evento autorizado. No está completada la integración con Supabase.

## Implementación local

- Selección de negocio entre los incluidos en el catálogo de presentación y en su evento.
- Productos solo del negocio seleccionado, búsqueda por nombre e indicación de no disponibles.
- Añadir, fusionar productos repetidos, cambiar cantidades, eliminar y vaciar.
- Cambio de negocio con confirmación y vaciado; cancelar conserva el carrito previo.
- Cantidades enteras positivas, límite provisional de interfaz de 999 por producto. Ese límite NO representa stock ni una regla entregada por C.
- Subtotal por línea y subtotal/total global provisional; sin cargos o descuentos inventados.
- Aritmética decimal exacta con BigInt interno y salida textual; acepta decimales sin separadores ni exponentes, hasta 64 caracteres como límite de entrada. No se fija una precisión monetaria de B ni se envían BigInt al componente del servidor.
- Estado del carrito con IDs/cantidades, sin precios almacenados en líneas. Datos adicionales de precio/total inyectados en una línea no influyen en el cálculo.
- Un catálogo actualizado que retire negocio/producto o disponibilidad invalida el resumen; no se presenta como una venta confirmada.

Los importes se derivan del snapshot de catálogo recibido por la UI, que sigue estando en un navegador controlable por el usuario. Modificar ese snapshot en DevTools puede modificar la vista previa; NO es una barrera financiera ni una validación para cobrar. HU 61 debe releer permisos, disponibilidad, cantidades y precios vigentes en servidor/SQL. No se produce una solicitud de cobro en esta fase.

El carrito vive en memoria y se pierde al recargar/salir; no se persiste una venta ni datos comerciales en almacenamiento local. La interfaz no abre cámara, no identifica un QR, no consulta saldo ni registra comprobantes. Los botones de identificación y cobro siguen deshabilitados.

## Demostración aislada

1. Ejecutar `npm run dev` y entrar con una cuenta de prueba activa de rol ayudante y un evento asignado real autorizado.
2. Abrir `/ayudante/ventas/nueva` y pulsar “Probar demostración con productos ficticios”, o abrir `/ayudante/ventas/nueva?demo=catalogo`.
3. Confirmar el aviso “Demostración · Productos y negocios ficticios”. Los negocios y productos demo NO prueban asignaciones comerciales reales.
4. Elegir Bebidas, buscar Jugo, añadir Agua y Jugo, repetir producto y modificar cantidades. Refresco debe aparecer no disponible.
5. Cambiar a Comida con carrito lleno: cancelar debe conservarlo; confirmar debe vaciarlo antes de mostrar el catálogo nuevo. Nunca mezclar productos entre negocios.
6. Eliminar productos y vaciar. Un carrito vacío tiene total provisional cero cuando existe catálogo de demostración; con catálogo pendiente se muestra “—”.
7. Comprobar que no se habilita “Confirmar cobro” ni “Identificar asistente”.
8. Con `npm run build` y `npm run start`, la misma URL con demo debe seguir mostrando catálogo pendiente; no hay activación por variable pública o parámetro que salte la restricción de producción.

Los fixtures están en `lib/ayudante/demo/catalogo.ts`, marcado server-only e importado únicamente en la rama de desarrollo. No se utiliza un modo mock de sesión ni se habilita el acceso a inactivos. Para retirar la demo, quitar su enlace y el import condicionado cuando se conecte el proveedor real de C.

## Pruebas ejecutables

```text
node scripts/validar-carrito-ayudante.cjs
node scripts/validar-base-ayudante.cjs
npx tsc --noEmit
npm run lint
npm run build
node scripts/validar-base-ayudante.cjs --browser
git diff --check
```

HU 60 cubre cantidades inválidas, productos deshabilitados, negocio ajeno al evento, mezcla entre negocios, cambio confirmado/cancelado por el modelo, productos repetidos, precio inyectado en líneas, carrito vacío, búsqueda, precio inválido, catálogo revocado, precisión decimal, bloqueo de demo en producción y ayudante inactivo. Son pruebas aisladas; no se usa Supabase.

Las pruebas de base conservan los guards y el aislamiento de roles. Su proveedor de catálogo está simulado y adaptado al nuevo componente. La opción --browser añade fixtures de carrito con Bebidas y Comida: Edge/Chromium mide ancho/navegación/controles financieros deshabilitados a 390 y 1280 px con CSS compilado. Estas mediciones usan HTML SSR aislado con estados preparados; no son una prueba de clics/hidratación de React ni de permisos comerciales reales. El recorrido interactivo anterior debe verificarse en navegador con la cuenta de prueba.

No se alteraron las pruebas de A ni los contratos compartidos. No se ejecutaron migraciones ni se instalaron dependencias.

## Entregas pendientes de C/B y criterio de cierre

Solicitar los contratos reales, sin presuponer sus nombres:

| Área | Información necesaria |
| --- | --- |
| Negocios autorizados | Firma de lectura, IDs, estado activo, alcance por ayudante y evento, RLS |
| Productos | Firma de catálogo por negocio autorizado, IDs, búsqueda/paginación, habilitación y disponibilidad/stock |
| Precios | Campo y unidad real, precisión/redondeo, vigencia, cambios y precio cero si corresponde |
| Asignación comercial | Relación ayudante-negocio-evento y condición activa; revocación y alcance |
| HU 61 | Operación transaccional única con recalculo, reservas/saldo gastable, ítems históricos e idempotencia |

Después de recibirlos: crear el adaptador server-only, validar los datos recibidos, comprobar asignación comercial real y probar dos ayudantes con negocios distintos, revocación/inactividad y cambios de precio/stock. Las consultas deben fallar de forma cerrada y nunca aceptar IDs comerciales del navegador sin autorización. Volver a validar en cada futura operación de servidor; la UI no garantiza revocación en tiempo real.

**Estado:** carrito local implementado y probado con catálogo aislado; HU 60 pendiente de integración y aceptación con datos/autorización reales de C. Cobro y puntos permanecen fuera de alcance.
