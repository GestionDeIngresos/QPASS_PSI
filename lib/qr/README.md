# QR compartido · Dev A

Aplicar primero las migraciones de Sprint 2 (en particular `usuarios.activo`) y después `supabase/sprint3_devA_qr.sql`. La migración se probó en PostgreSQL temporal, no se ejecutó en Supabase remoto.

## Identificación para B y D

Desde código de servidor, importar `identificarQr(codigo, eventoId)` de `@/lib/qr/server`. Retorna `IdentidadQr` de `types.ts` y consulta el RPC `identificar_qr(p_codigo text,p_evento integer)` con la sesión del usuario; nunca requiere service role.

- `entradaId`, `usuarioId`, `nombre`, `eventoId`, `origen`, `estadoEntrada`.
- `pagoConfirmado`: estado de la compra asociada.
- `aptaIngreso`: entrada activa, compra confirmada y propietario activo.
- `identificacionValida`: entrada activa/usada, compra confirmada y propietario activo. Esta es la condición que B/D deben comprobar para recargas/ventas; una entrada usada al ingresar puede seguir identificando al asistente.

Permisos SQL: admin activo, o supervisor/recargador/ayudante activo cuyo rol y evento coincidan con `asignaciones_staff`. No se equipara escaneador con supervisor. D debe validar además negocio y asignación activa del ayudante según el contrato de C; este helper no sustituye las validaciones dentro de la transacción de cobro. Consultar un QR no consume una entrada ni descuenta puntos.

Errores SQL: `SIN_PERMISOS` (42501), `DATOS_INVALIDOS` (22023), `QR_NO_VALIDO_PARA_EVENTO`. El helper TypeScript traduce esos errores a mensajes y no revela códigos de otros eventos.

## Lotes y vinculación · Admin

- Pantalla `/admin/qr-fisicos`: generar 1–200 códigos, imprimir/guardar PDF y vincular mediante cámara, lector externo o código pegado. Mis Compras muestra el QR de recogida de la entrada física.
- `generar_lote_qr(p_evento integer,p_cantidad integer,p_solicitud uuid)` retorna id de lote. La misma solicitud y selección retorna el mismo lote; otra selección con la misma clave se rechaza.
- `consultar_lote_qr(p_lote integer)` retorna evento y códigos del lote sin información de documentos.
- `vincular_manilla(p_codigo text,p_entrada_codigo text,p_carnet text)` requiere compra confirmada, entrada activa, evento físico coincidente y carnet guardado en el perfil del destinatario. Retorna id de entrada; repetir la misma vinculación no cambia cupos. Una entrada tiene una sola manilla y una manilla un solo propietario.
- No hay backfill automático de vínculos antiguos sin `entrada_id`: deben conciliarse antes de ser válidos. Se conservan sus datos; los vínculos que solo identificaban al usuario no acreditan una compra.
- El código digital y el físico resuelven a la misma entrada. `registrar_acceso` (migración `sprint3_devA_accesos.sql`) realiza el consumo atómico. `components/qr/LectorQr.tsx` proporciona cámara reutilizable, requiere localhost o HTTPS y permiso del navegador. La cámara se detiene al cerrar o abandonar el componente.

## Pruebas

`scripts/validar-qr.cjs` usa `@electric-sql/pglite` en una instalación de validación externa al bundle. Si no está instalado localmente, indicar su ruta mediante `QPASS_PGLITE_MODULE`. Las pruebas crean y destruyen una base en memoria con datos ficticios. No se conectan a Supabase.

Se cubren repetición de migración y lote, selección reutilizada, compra pendiente, identidad/evento incorrectos, doble vínculo, permisos por rol/evento/cuenta activa, acceso directo a tablas, estado compartido entre códigos y cupo conservado. Falta la prueba con conexiones PostgreSQL independientes para documentar concurrencia real y la validación visual con Supabase.
