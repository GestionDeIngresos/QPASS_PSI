# QPass · Contratos Dev B con A/C/D

> QA posterior: [DEV_B_REPORTE_FINAL.md](DEV_B_REPORTE_FINAL.md) registra las pruebas reales y correcciones. `scripts/fixtures/devb-desarrollo.json` configura Bs1=1 punto solo en pruebas aisladas; no se añadió una tasa predeterminada a producción. Los intentos con un primer envío incierto conservan su UUID incluso si después reciben un rechazo.

> Decisión posterior del equipo: **Bs 1 = 1 punto** es la regla confirmada del proyecto. La fixture anterior conserva su etiqueta histórica de prueba. Para habilitar operaciones en Supabase falta desplegar B y configurar `bs_por_punto=1.000000` por evento autorizado; la configuración no modifica históricos ni acredita puntos. El plazo de devolución de la fixture no constituye un plazo oficial. Estado vigente del despliegue: [DEV_B_DESPLIEGUE_SEGURO.md](DEV_B_DESPLIEGUE_SEGURO.md).

## Contrato vigente encontrado

- A: `identificar_qr(p_codigo text,p_evento integer) -> jsonb`, autoriza supervisor/recargador/ayudante por evento, más admin; `identificacionValida` admite entrada usada y pago confirmado. `LectorQr`, `AccionesCuenta`, guards y reportes admin se reutilizan.
- C: `crear_solicitud_devolucion(integer,numeric,text) -> integer`, `devc_eventos_devolucion_cliente()`, `devc_mis_solicitudes_devolucion()`, `devc_eventos_encargado()`, `listar_solicitudes_devolucion(integer,text)`, `rechazar_solicitud_devolucion(integer)`. QR bancario privado en bucket `devoluciones`. `aceptarSolicitud` era un stub. No se reemplazan sus pantallas ni tablas.
- D: `saldo` es total, `reservado` agrega solicitudes `en_revision`/`aprobada`; gastable = saldo-reservado. `cobrar_venta(integer,integer,text,jsonb,uuid,numeric)` descuenta con bloqueo de la fila de saldo y registra venta una vez. Precios de productos en puntos; no define conversión Bs/puntos.

## Firmas implementadas

Todas las RPC operan con la sesión de usuario, sin service role. Se revoca EXECUTE público/anónimo y se concede únicamente a authenticated; helpers `devb_*` internos no son invocables por ese rol. Además de la ACL cada RPC revalida sesión, cuenta activa, rol, propiedad y evento en PostgreSQL.

| RPC | Retorno | Permiso / contrato |
|---|---|---|
| `devb_eventos(p_rol text)` | `jsonb[] {id,titulo,tasa}` | recargador/devolucion y sus asignaciones; admin. Tasa nullable |
| `consultar_saldo_staff(p_evento integer,p_codigo text,p_rol text)` | `{nombre,entradaId,saldo,reservado,disponible}` | Rol exacto recargador/devolucion o admin, asignación y QR válido; sin UUID/CI/correo |
| `registrar_recarga(p_evento integer,p_codigo text,p_monto numeric,p_solicitud uuid)` | Confirmación | Recargador asignado/admin, evento publicado no finalizado; monto en Bs simulados |
| `ajustar_recarga(p_recarga integer,p_monto_correcto numeric,p_motivo text,p_solicitud uuid)` | Confirmación | Recargador original asignado/admin. Total correcto en Bs, 0 permitido para anular; delta auditado |
| `reportar_recarga(p_recarga integer,p_descripcion text,p_solicitud uuid)` | `integer` id reporte | Recargador original/admin; no modifica saldo |
| `historial_recargas(p_evento integer,p_antes integer default null)` | `jsonb[]` | Solo operaciones propias en evento autorizado, 25 por página, cursor id descendente; incluye ajustes |
| `mis_reportes_recarga(p_antes integer default null)` | `jsonb[]` | Solo reportes propios en eventos aún autorizados; 100 por página con cursor descendente |
| `registrar_devolucion(p_evento integer,p_codigo text,p_puntos numeric,p_comprobante text,p_foto text,p_solicitud uuid)` | Confirmación | Encargado devolucion asignado/admin; débito de puntos gastables y dos evidencias privadas obligatorias |
| `historial_devoluciones(p_evento integer,p_antes integer default null)` | `jsonb[]` | Solo operaciones propias, 25 por página; rutas privadas convertidas en URLs de 300 segundos en servidor |
| `liquidar_solicitud_devolucion(p_solicitud integer)` | Confirmación | Encargado asignado/admin; una sola devolución por solicitud, incluso entre operadores |
| `consultar_mis_saldos()` | `jsonb[] {eventoId,evento,saldo,reservado,disponible}` | Cuenta activa; siempre `usuario_id = auth.uid()` |
| `consultar_ticket_extraviado(p_codigo text,p_evento integer)` | `null` o `{entradaId,evento,estado,propio,nombre?}` | Cliente solo su manilla; staff supervisor/recargador/devolucion asignado o admin obtiene nombre limitado. Sin CI, email, UUID, saldos ni datos bancarios |
| `cancelar_solicitud_devolucion(p_solicitud integer)` | void | Titular activo, únicamente en_revision. Reintento de cancelación retorna sin otro efecto |

Confirmación: `{id:number, referencia:string, puntos:string, importe:string, saldo:string, simulada:true}`. `puntos` en ajuste es el delta firmado; en recarga/devolución es el monto de puntos de la operación. `saldo` es la respuesta original persistida, no una lectura de saldo actual en un reintento.

## Unidades y precisión

- PostgreSQL `numeric(10,2)` para dinero/puntos. Navegador y Server Actions envían decimales como texto, sin aritmética monetaria con float. Tasas `numeric(16,6)` en Bs por punto.
- `recargas.monto`: importe simulado en Bs para nuevos registros; `puntos` y `tasa` guardan conversión histórica. No se reinterpretan los montos ni se inventan tasas para recargas heredadas; sus columnas nuevas son null y no admiten ajuste automático.
- `devoluciones.monto`: puntos, compatible con `monto_solicitado` C; columnas nuevas `importe_simulado` y `tasa` guardan su equivalencia simulada. `evento_id` se añade para presenciales. Históricos no relacionados con solicitud conservan evento desconocido, sin inferirlo.
- La regla confirmada es Bs 1 = 1 punto. `devb_conversion` no contiene filas predeterminadas: se debe configurar `bs_por_punto=1.000000` por evento después del despliegue autorizado. Sin esa fila: `CONVERSION_NO_CONFIGURADA`. Una conversión que no sea exacta a 2 decimales devuelve `CONVERSION_INEXACTA`; se conserva la validación de precisión.
- Precio de productos D continúa en puntos. La venta no necesita conocer Bs/punto y no fue reescrita.

## Saldo, reservas y liquidación

Se usa exclusivamente `saldos_puntos`, que ya tiene UNIQUE(usuario_id,evento_id). `saldo` es total y `reservado` es el acumulado de solicitudes en_revision/aprobada **no liquidadas**. `disponible = saldo - reservado`.

La extensión de `devd_mantener_reserva` conserva su función/trigger y su barrera `saldo >= reservado >= 0`. Agrega `liquidada_en` como condición terminal explícita; no libera una solicitud por pasar simplemente a aprobada. No borra solicitudes ni mueve puntos sin registro.

Liquidar bloquea la solicitud, libera su reserva mediante ese trigger, descuenta total e inserta devolución y movimiento en una transacción. La solicitud queda aprobada con `liquidada_en`; un índice único en devoluciones.solicitud_id impide un segundo histórico. Una aprobada heredada sin liquidada_en sigue reservando y requiere liquidación explícita, sin deducir que ya se pagó. Estados rechazados/liquidados no se reabren.

La firma de `crear_solicitud_devolucion(integer,numeric,text)` de C se mantiene: conserva plazo, evento finalizado, cuenta activa, propiedad de QR, validación de saldo y trigger. La misma ruta privada + mismo monto devuelve el mismo id; ruta reutilizada con otro monto se rechaza. Se recupera antes de comprobar nuevamente el plazo. La Server Action de C conserva UUID por pestaña/evento y ruta estable, verifica imagen ante reintentos y transmite el disponible como texto. `devc_mis_solicitudes_devolucion` agrega booleanos liquidada/cancelada; su UI ya no considera pendiente una aprobada liquidada. Rechazar sigue usando la RPC de C; cancelar agrega una RPC para el titular, sin rehacer su pantalla.

Los ajustes no cambian recargas originales: recalculan el total correcto a la tasa original, restan del total de puntos original más ajustes previos y aplican solo ese delta. Si retiran saldo consumido/reservado se rechazan. Motivo, actor, antes/después y respuesta quedan en `devb_movimientos`, inmutable junto con recargas y devoluciones. Resolver un reporte mediante la administración A continúa sin efectos financieros.

## Idempotencia, concurrencia y orden de bloqueo

- B: UUID + actor, único en devb_movimientos, con payload que incluye tipo y SHA-256 del QR (no su valor). Un advisory lock serializa reintentos; payload diferente devuelve SOLICITUD_REUTILIZADA. El histórico y el saldo se confirman juntos; no hay dos peticiones para acreditar/debitar.
- Reportes: UUID + autor, mismo id y descripción normalizada; reuse diferente se rechaza.
- Virtual: id de solicitud, sin depender de UUID de navegador ni de que el mismo encargado reintente. Solo un registro incluso si otro encargado autorizado recupera el resultado.
- READ COMMITTED requerido. Las RPC monetarias bloquean cuenta/rol y asignación actuales con SHARE, evento con SHARE, configuración con SHARE. Se bloquean objetos QR en el orden A/D: compra → tipo_ticket → entrada → manilla → usuario; se reidentifica después de bloquear. La fila única de saldo se bloquea FOR UPDATE como cerrojo común con D/C.
- Ajustes bloquean la recarga original antes del saldo; solicitudes existentes se bloquean antes del saldo. La creación C bloquea saldo antes de insertar una solicitud nueva y no espera bloqueos de solicitudes existentes. Todas las transacciones trabajan un solo par usuario/evento.
- Aislamiento/espera, revocación concurrente, QR, permisos y saldo se vuelven a comprobar en la operación definitiva. Deadlock/serialization/timeout de SQL acreditan rollback y permiten repetir el mismo UUID. Error HTTP/red sin respuesta deja resultado incierto: la UI conserva payload/UUID y bloquea edición/cancelación hasta recuperar resultado.
- No se certifica concurrencia multiconexión con PGlite. `scripts/validar-devb-concurrencia.cjs` requiere PostgreSQL local NUEVO y observa `pg_stat_activity.wait_event_type = Lock` en seis escenarios. Los seis se ejecutaron y aprobaron en PostgreSQL 17.11 real local durante QA; ver reporte final.

## Storage y privacidad

Bucket `devb-evidencias`, privado, imágenes JPG/PNG/WEBP de hasta 2 MB, rutas `<actor>/<evento>/<UUID>/{comprobante|foto}.ext`. Insert limitado al encargado activo asignado/admin y su carpeta. Select exige mismo actor, rol activo y evento autorizado; no se concede update/delete. La Server Action valida además la firma inicial del archivo y compara SHA-256 si el objeto ya existe; una evidencia no puede reemplazarse dentro del mismo intento. SQL comprueba rutas/tipos de evidencia y existencia antes de debitar.

El bucket `devoluciones` de C y sus QR bancarios se conservan. Los archivos se presentan mediante URLs temporales autorizadas, nunca URLs públicas. Los intentos cancelados antes de confirmar pueden dejar imágenes huérfanas privadas: retención/limpieza administrativa debe definirse consultando referencias antes de borrar; no se implementó borrado automático ni se tocaron datos remotos.

## Errores y límites

Errores de negocio SQLSTATE P0001: CONVERSION_NO_CONFIGURADA, CONVERSION_INEXACTA, IDENTIFICACION_INVALIDA, SALDO_INSUFICIENTE, SALDO_CONSUMIDO_O_RESERVADO, SALDO_FUERA_DE_RANGO, EVIDENCIA_INVALIDA, RECARGA_HEREDADA_SIN_TASA, SOLICITUD_REUTILIZADA, SOLICITUD_YA_PROCESADA, RESERVA_INCONSISTENTE, CUENTA_INACTIVA, EVENTO_NO_DISPONIBLE, AISLAMIENTO_NO_SOPORTADO. SIN_PERMISOS usa 42501. Se conservan QR_NO_VALIDO_PARA_EVENTO y errores de plazo/QR de C. Las acciones traducen códigos conocidos sin exponer detalles SQL ni datos privados.

Operaciones simuladas exclusivamente. No hay proveedor bancario, pago verificado ni comprobante de transferencia real. La liquidación virtual genera referencia `SIMULADO-SOL-<id>`; presencial exige imagen aportada como evidencia de la simulación.

## Orden manual de despliegue

1. Verificar en el destino el esquema real y migraciones ya instaladas: A QR/reportes, D 202611160000..004, C negocios/ayudantes/devoluciones según sus dependencias. No volver a ejecutar SQL base ni scripts ya aplicados.
2. Revisar copia de seguridad y catálogo del destino, incluidos writers privilegiados y políticas Storage ajenas. Este trabajo no leyó ni modificó Supabase remoto. El catálogo exportado usado por los tests es histórico.
3. Aplicar una sola vez `supabase/migrations/202611170001_devb_saldos.sql`. Su transacción aborta ante prerequisitos ausentes, duplicados de liquidación heredados o colisiones de esquema; no los corrige borrando datos. Conservar el orden: no reaplicar scripts antiguos de C/D después, pues redefinen funciones que B extiende.
4. Ejecutar `supabase/verificacion_devb_saldos.sql` (solo lectura). Usar este cálculo de reservas posterior a B; las comprobaciones históricas D que no conocen liquidada_en son anteriores al nuevo contrato.
5. Configurar cada evento autorizado con la tasa confirmada por el equipo, Bs 1 = 1 punto, desde SQL administrativo; sin modificar históricos:

```sql
-- Sustituir los tres valores por los acordados; no ejecutar marcadores literalmente.
insert into public.devb_conversion(evento_id,bs_por_punto,acuerdo)
values (:evento_id, 1.000000, :referencia_del_acuerdo)
on conflict(evento_id) do update set bs_por_punto=excluded.bs_por_punto,
  acuerdo=excluded.acuerdo,actualizado_en=now();
```

6. Mantener el plazo C `devc_parametros.plazo_devolucion_horas` acordado; sin él no se crean solicitudes virtuales. Probar roles/asignaciones, cámara y Storage con cuentas de prueba. No se configura automáticamente conversión ni plazo.

## Pendientes reales

- Equipo: Bs 1 = 1 punto confirmado; pendiente su configuración por evento tras desplegar B. Confirmar plazo C y conservar la validación de precisión, sin modificar históricos.
- Despliegue: aplicar B en el entorno real y verificar catálogo/Storage/RLS reales; no se usaron credenciales administrativas.
- Entorno: concurrencia PostgreSQL local ya aprobada en QA; cámara real, API Storage y navegación autenticada aún deben comprobarse con dispositivos/cuentas de prueba.
- D/A/C: APIs y pantallas existentes conservadas. No falta nuevo código de ellos para conectar los módulos implementados, pero su SQL previo debe estar instalado. La tarjeta de ventas del negocio y otras HUs ajenas quedan fuera de alcance.
