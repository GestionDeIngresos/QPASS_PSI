# Base del módulo Ayudante — Sprint 3

## Alcance de esta fase

Rutas: `/ayudante`, `/ayudante/ventas/nueva`, `/ayudante/historial`. Son pantallas iniciales sin ventas, cobros, débito, modificación de saldo ni generación de comprobantes. No hay Server Actions financieras, RPC nuevas ni migraciones.

El dashboard muestra indicadores no disponibles, sin ceros inventados. Nueva venta contiene espacios para catálogo, carrito, identidad QR y resultado; los botones están deshabilitados. Historial prepara filtros, listado y detalle sin registros ficticios. Las pantallas usan los tokens de QPass, navegación adaptable y acciones de cuenta/cierre de sesión compartidas.

## Autorización real utilizada

`lib/ayudante/auth.ts` reutiliza `obtenerSesionActual` y React cache por petición. `exigirAyudante` exige sesión, perfil existente, `activo === true` y rol exacto `ayudante`. Admin, organizador y otros roles no reciben acceso implícito. El layout y cada página ejecutan autorización; middleware no es la barrera única.

`obtenerContextoAyudante` consulta solo `asignaciones_staff.evento_id` filtrando por `usuario_id` actual y `rol_staff='ayudante'`, con cliente de sesión y RLS. Este contrato ya está en el código/migraciones del proyecto. No se crean consultas para negocios/productos/ventas inexistentes.

- Sin evento: dashboard accesible al ayudante activo con aviso; Nueva venta e Historial no muestran su contenido operativo.
- Un evento válido: se muestra el ID asignado y la estructura inicial, con cobros siempre deshabilitados.
- Más de un evento distinto: se bloquea el contexto para revisión del administrador, en lugar de elegir uno silenciosamente. No se modifica el contrato de un evento por persona de C.
- Error de consulta/ID inválido: error controlado; no se presume autorización.
- `exigirEventoAyudante(eventoId)` permite a futuras consultas/acciones comprobar que un ID concreto coincide con el contexto autorizado. No autoriza un negocio ni reemplaza comprobaciones transaccionales.

`middleware.ts`, `MenuCuenta.tsx` y `OcultarEnPanel.tsx` reciben únicamente la adición del prefijo/enlace `/ayudante`. Se conservan la lógica de cookies, Server Actions, menús de A/B y reglas de HU 4. No se migra middleware a proxy en esta tarea.

## Contratos preparados, no integración declarada

`lib/ayudante/contracts.ts` define DTO de aplicación propuestos, no tablas/columnas ni firmas RPC definitivas. Reutiliza `IdentidadQr` de A. Los contratos admiten estado pendiente para representar ausencia de integración, sin ventas de ejemplo en producción.

| Área | Falta acordar/verificar |
| --- | --- |
| Negocios y productos (C) | IDs reales, negocio-evento, catálogo, precios en puntos, disponibilidad/stock y asignación comercial activa del ayudante |
| Saldo gastable (B) | Alcance por usuario/evento, unidad/precisión, reservas, recargas/devoluciones y contrato autorizado de lectura |
| Venta transaccional (B/C/D/líder) | Propietario de la única operación SQL, permisos, bloqueo de saldo/reservas, ítems históricos, unicidad e idempotencia |
| Historial/dashboard | Alcance autorizado, estado confirmado, fechas America/La_Paz, agregados coherentes y paginación |
| QR (A) | Contrato existente identificarQr/IdentidadQr/LectorQr disponible; no se invoca hasta integrar permisos comerciales y el flujo de venta |

Puntos se modela en los DTO propuestos como texto decimal para no imponer aritmética flotante antes de conocer la precisión de B. No se realizan conversiones ni cálculos. `gastable` debe llegar según el contrato de B; no restar reservas por segunda vez. Los nombres de campos son del modelo de presentación y se mapearán mediante adaptadores acordados.

La verificación de negocio/asignación comercial todavía NO está implementada. Ningún ayudante puede vender por tener solo evento asignado.

## Verificación reproducible

```text
node scripts/validar-base-ayudante.cjs
npx tsc --noEmit
npm run lint
npm run build
node scripts/validar-base-ayudante.cjs --browser
git diff --check
```

Las 22 pruebas aisladas ejercitan los guards con sesiones/asignaciones simuladas, denegación de todos los otros roles, perfiles inactivos/inexistentes, evento correcto/ajeno, ausencia/ambigüedad/error de asignación, middleware con petición NextRequest real y Auth simulado, navegación y render SSR. También inspeccionan que no existan escrituras/RPC/acciones de cobro en el módulo. No prueban login ni RLS de Supabase real.

La opción `--browser` requiere build previo y un Chromium ya instalado. Por defecto usa Edge en Windows; se puede indicar `QPASS_BROWSER_PATH`. Levanta un servidor temporal en loopback y un perfil aislado del navegador para HTML de prueba con datos ficticios explícitos, componentes reales y CSS compilado. Comprueba las tres rutas a 390 y 1280 px, navegación y controles deshabilitados. No contacta Auth/Supabase ni sirve esos fixtures dentro de Next o del código de producción. El perfil temporal queda en TEMP; no contiene datos personales de la sesión del usuario.

Las mediciones de fixtures no sustituyen la revisión visual ni la navegación autenticada de la aplicación real. No se añadió ni actualizó dependencia alguna.

## Comprobaciones manuales pendientes

1. Con una cuenta de prueba activa con rol ayudante y evento real asignado, abrir las tres rutas desde Mi Cuenta y la navegación interna; comprobar el ID del evento.
2. Acceder directamente a cada URL con cliente, admin, organizador, supervisor y otros roles: deben salir del módulo. Sin sesión deben ir a login; ayudante inactivo o sin perfil no debe acceder.
3. Ayudante activo sin evento: verificar aviso y ausencia de contenido operativo en Nueva venta/Historial. Si el esquema permite asignaciones ambiguas, comprobar bloqueo usando solo datos de prueba autorizados.
4. Probar “Mi Cuenta”, perfil y cierre de sesión compartido: cancelar conserva sesión; confirmar vuelve a login y bloquea acceso posterior. No modificar el componente compartido para esta prueba.
5. Revisar móvil/escritorio, teclado, foco y lectores de pantalla. No deben verse cabeceras públicas duplicadas dentro del panel. El historial puede desplazarse dentro de su contenedor en móvil.
6. Confirmar que ningún botón permite escanear, registrar venta o descontar saldo. No interpretar “—” como cero ventas reales ni como un saldo.

No se ejecuta SQL remoto ni se cambian datos para preparar estas cuentas. La lectura de asignaciones requiere que usuarios.activo y RLS de asignaciones_staff estén aplicados; ante errores no se amplían permisos desde este módulo.

## Próximo bloque recomendado

Acordar primero con C el catálogo y las asignaciones comerciales, y con B el contrato de saldo gastable/transacción. Después implementar HU 60 con lecturas autorizadas y carrito; dashboard e historial deben conectarse al mismo contrato de ventas confirmadas. HU 61 requiere resolver antes la transacción única, reservas e idempotencia. Esta base no declara completadas HU 59–63.
