# QPass · Sprint 3 · Dev D · Informe previo a integración real

> Actualización: el catálogo completo ya fue recibido y analizado. Consultar
> [la entrega de integración real](ENTREGA_REAL_DEVD_2026-11-16.md). Este informe
> conserva la evidencia y limitaciones de la fase anterior.

Fecha: 16/11/2026, America/La_Paz. Rama comprobada: `Aliaga`.
**No hay autorización de aplicación ni se ejecutó ninguna escritura remota.**

## Evidencia obtenida y límite del acceso

Proyecto configurado: `gnpqyrypallnloltwceu.supabase.co`. Se leyó `.env.local`
sin mostrar valores de claves. Se utilizó la clave configurada solo para GET del
documento OpenAPI, sin consultar filas, iniciar sesiones, enviar correos o ejecutar RPC.

`esquema-api.json` contiene 25 relaciones y 20 RPC expuestas, columnas, tipos,
referencias declaradas y hashes SHA-256 de los SQL locales. No contiene datos de
usuarios, QR, importes de cuentas ni credenciales. Es evidencia de API, no un dump.

Las peticiones de metadatos a los perfiles `pg_catalog` e `information_schema`
fueron rechazadas con HTTP 406 / `PGRST106`. No hay conexión PostgreSQL, cliente
`psql`, token Management API o herramienta Supabase MCP disponible en esta sesión.
Una service role de Data API no permite enviar SQL arbitrario. No se creó un RPC
de introspección para resolverlo, porque sería una escritura remota no autorizada.

Por tanto **NO se conocen todavía RLS, ACL completas, índices, precisión numeric,
triggers, cuerpos/propietarios de funciones ni dependencias efectivas**. Una RPC
ausente en OpenAPI puede existir sin estar expuesta o sin permisos para este rol.
Tampoco puede afirmarse que no haya más objetos en otros esquemas.

Se leyó además `/auth/v1/settings`: email habilitado, registro habilitado y
`mailer_autoconfirm=true`. Esto no verifica SMTP, entrega de recuperación,
caducidad de enlaces ni lista de redirecciones permitidas. No se modificó Auth.

## 1. Estructuras existentes

Relaciones observadas en el esquema expuesto:

`asignaciones_staff`, `auditoria_accesos`, `ayudantes`, `categorias_evento`,
`compras`, `devoluciones`, `entradas`, `eventos`, `intentos_compra_prueba`,
`lotes_qr_fisico`, `negocios`, `productos`, `recargas`, `registros_acceso`,
`reportes_acceso`, `reportes_entrada`, `reportes_recarga`, `saldos_puntos`,
`solicitudes_devolucion`, `solicitudes_organizador`, `tipos_ticket`, `usuarios`,
`venta_items`, `ventas`, `vinculos_qr_fisico`.

| Contrato real expuesto | Consecuencia |
| --- | --- |
| `ventas.ayudante_id -> ayudantes.id` (integer) | No equivale al UUID de sesión. Resolver `ayudantes.usuario_id`, negocio y activo en servidor/SQL. |
| `ayudantes(usuario_id, negocio_id, activo)` | Hay asignación comercial; falta verificar restricciones, RLS y asignación al evento. |
| `negocios(dueno_id,nombre,descripcion,estado,creado_en)` | `estado` es boolean; no hay `evento_id` expuesto. No inferir relación comercial con evento por ventas previas o dueño. |
| `productos(negocio_id,nombre,descripcion,precio,disponible)` | Precio es numeric. No inventar `precio_puntos`, precisión o unidad de conversión. |
| `venta_items(venta_id,producto_id,cantidad,precio_unitario)` | Ya existe precio registrado por línea. No agregar otro precio histórico ni reemplazarlo por catálogo. Falta acreditar su inmutabilidad. |
| `ventas(cliente_id,evento_id,negocio_id,total,comprobante_url,creado_en)` | Ya hay venta y total; no hay estado/confirmación ni clave idempotente expuestos. No declarar confirmadas todas las filas heredadas. |
| `saldos_puntos(usuario_id,evento_id,saldo)` | Hay ámbito usuario/evento en columnas. Unicidad, no negatividad y semántica de saldo pendiente de catálogo. |
| `solicitudes_devolucion(monto_solicitado,estado,usuario_id,evento_id,...)` | Estados expuestos: en_revision/aprobada/rechazada. No deducir cuáles reservan fondos ni si saldo ya los descuenta. |
| `devoluciones(solicitud_id,usuario_id,encargado_id,monto,...)` | No expone evento directo; requiere relación de solicitud y protocolo real de débito. `solicitud_id` no está marcado requerido en API. |
| `recargas(recargador_id,usuario_id,evento_id,monto,...)` | Tabla existente; no acredita una operación atómica ni su mecanismo de actualización del saldo. |

## 2. Comparación por HU y faltantes reales

| HU | Existe en remoto/API | Falta confirmar o preparar |
| --- | --- | --- |
| 4 | Auth email y configuración local; implementación existente | Allowlist de `/reset-password`, SMTP y recorrido real vigente. No requiere tabla/RPC pública nueva. |
| 9 | Compras, entradas, simulador, usuarios activos | Fachada `comprar_entradas_terceros_prueba` y `consultar_compra_propia` no expuestas; comprobar catálogo y revisar permisos/RLS antes de aplicar SQL local. |
| 13 | Entradas/código QR, tickets, eventos y contrato QR de A expuestos | Autorización real y pruebas PDF/lector. No requiere tabla ni RPC PDF nueva. |
| 14 | `reportes_entrada` y RPC Admin A | `solicitud_id` no expuesto; RPC propias de D no expuestas. Revisar triggers y propietarios antes de aplicar migración existente. |
| 59 | Ventas, total y fecha | Regla verificable de confirmación y consultas agregadas autorizadas; evitar métricas de filas no confirmadas. |
| 60 | Negocios/productos/ayudantes | Relación negocio-evento y políticas comerciales; adaptador real aún desconectado. |
| 61 | Saldo, ventas/líneas, solicitudes y devoluciones, QR A | Protocolo común de bloqueos, semántica de reservas, escritores/triggers y operación atómica idempotente. |
| 62 | Venta, líneas, precio_unitario y total | Nombres históricos, evidencia de confirmación y lectura autorizada; no reconstruir históricos ausentes con valores actuales. |
| 63 | Ventas, fechas y negocios | Confirmación, filtros, paginación, alcance autorizado e índices revisados. |

**No se identifica ninguna tabla nueva obligatoria con la evidencia actual.**
Eso no significa que todos los contratos estén completos. La relación negocio-evento
y la reserva podrían resolverse con objetos no expuestos o requerir una decisión
de B/C/líder; no se creó una tabla alternativa para suplir esa incertidumbre.

## 3. RPC existentes y propuestas locales

Expuestas: `comprar_entradas_prueba`, `historial_accesos`, `evento_tiene_entradas`,
`resolver_reporte_admin`, `consultar_lote_qr`, `es_admin`, `eventos_supervisor`,
`reportar_acceso`, `corregir_acceso`, `qpass_autorizado_evento`, `generar_lote_qr`,
`guardar_evento_completo`, `resumen_dashboard`, `identificar_qr`, `comprar_entradas`,
`vincular_manilla`, `eliminar_evento_sin_ventas`, `listar_reportes_admin`,
`registrar_acceso`, `estadisticas_evento`.

Contratos locales de D no expuestos en el inventario:

- `comprar_entradas_terceros_prueba(text,jsonb,text,uuid,text)` y
  `consultar_compra_propia(text)` en `supabase/sprint3_devD_compra_terceros.sql`.
- `reportar_entrada_propia(integer,text,uuid)` y
  `consultar_mis_reportes_entrada()` en `supabase/sprint3_devD_reportes_entrada.sql`.

Son candidatos a aplicación, no funciones comprobadas en PostgreSQL real. No se
modificaron sus archivos. Tampoco se inventó una firma RPC financiera definitiva.
La migración nueva de históricos no crea ninguna función.

## 4. RLS y compatibilidad A/B/C

No se puede identificar una lista completa de políticas que deba ajustarse sin
el catálogo. No desactivar RLS ni agregar políticas permisivas para probar acceso.

Cambios ya propuestos por los SQL locales, que deben revisarse expresamente:

- HU 9 reemplaza `entradas_select_comprador_o_destinatario` por lectura del
  destinatario activo; el comprador usa resumen sin QR. Otras políticas SELECT
  podrían ampliar el acceso al combinarse: inventariarlas todas primero.
- HU 9 revoca EXECUTE de `comprar_entradas` y `comprar_entradas_prueba` a
  PUBLIC/anon/authenticated; la fachada requiere que su propietario pueda delegar.
  Puede romper clientes ajenos que aún invoquen las funciones antiguas. Revisar
  dependencias de A/B/C y llamadas externas antes de aplicar; no restaurar acceso
  público para resolverlo. `service_role` debe revisarse por separado en catálogo.
- HU 14 revoca acceso directo a `reportes_entrada` para PUBLIC/anon/authenticated,
  mantiene las políticas y usa funciones definer. Comprobar que las funciones
  Admin de A conservan acceso y que ningún consumidor legítimo depende de tabla.
- Ventas/saldos: aún no se prepara ningún cambio de políticas ni permisos de
  escritura. Hay que impedir falsificación de confirmaciones y débitos directos
  al conectar; no usar la clave administrativa para el cobro de la aplicación.
- El QR sigue siendo el contrato de A. `identificacionValida` admite entrada
  activa o usada; `aptaIngreso` no es el criterio de venta. No consumir QR al cobrar.

Revisar `SECURITY DEFINER`, `search_path`, propietario, ACL de funciones y secuencias,
RLS forzada y triggers. No volver a ejecutar indiscriminadamente todas las migraciones
de A/C: algunas restauran GRANT o políticas anteriores y desharían restricciones de D.

## 5. Archivos preparados y alcance exacto

| Archivo | Tipo/efecto |
| --- | --- |
| `scripts/inspeccionar-supabase-esquema.cjs` | Inventario GET-only reproducible; solo guarda metadatos locales sanitizados. |
| `docs/integracion-supabase/esquema-api.json` | Evidencia real de API y hashes SQL locales. |
| `supabase/devD_integracion_00_catalogo_solo_lectura.sql` | Inventario transaccional READ ONLY de columnas, constraints, índices, políticas, ACL, funciones/cuerpos, triggers, enums y dependencias. No ejecutado remoto. |
| `supabase/devD_integracion_10_historicos_ventas.BORRADOR.sql` | Candidato aditivo, bloqueado por defecto. No autorizado ni listo para remoto. |
| `supabase/devD_integracion_20_verificacion_solo_lectura.sql` | Consultas posteriores de metadatos/permisos; READ ONLY, no ejecutadas remoto. |
| `scripts/validar-preparacion-integracion.cjs` | Pruebas aisladas de GET-only, sanitización y límites de los scripts. |

El borrador 10 agrega únicamente:

- `ventas.solicitud_id uuid NULL`: unicidad global de operación, índice único
  reutilizable. El futuro RPC deberá comprobar dueño antes de responder un reintento.
- `ventas.solicitud_payload jsonb NULL`: selección canónica de la operación;
  no almacenar QR bruto, carnet, correo o tokens. Su estructura está pendiente.
- `ventas.confirmada_en timestamptz NULL`: futura evidencia transaccional, nunca
  se rellena para ventas heredadas. No basta como barrera de seguridad sin proteger
  sus escritores y analizar triggers/RLS.
- `ventas.negocio_nombre_historico text NULL`.
- `ventas.entrada_id integer NULL` y FK a entrada sin nuevas cascadas.
- `venta_items.producto_nombre_historico text NULL`.

No duplica `precio_unitario`/`total`, no hace backfill, DML, cambios de saldo,
triggers, funciones, políticas, GRANT/REVOKE ni tablas nuevas. Verifica tipos,
reutiliza índice/FK equivalentes y aborta ante conflictos. El orden de columnas no
es contrato; revisar consumidores de `SELECT *`/tipos compuestos antes de aprobar.
Agregar columnas hereda permisos de tabla: revisar ese riesgo antes de cualquier uso.

El guard `qpass.devd_revision_catalogo` solo evita ejecución accidental. No es una
aprobación ni mecanismo de autorización. No habilitarlo en remoto antes de revisar
el catálogo y obtener autorización. El SQL aún necesita pruebas en PostgreSQL.

**No se preparó una migración aplicable de débito:** hacerlo sin conocer escritores
de saldo y reservas podría duplicar descuentos o permitir gastar fondos reservados.
Esta parte de la fase 3 queda bloqueada por falta de metadatos completos.

## 6. Propuesta financiera a completar con el catálogo

Una transacción deberá validar sesión/rol/cuenta y asignaciones staff/comerciales;
resolver QR y titular; serializar solicitud; bloquear las filas relevantes en el
orden acordado; revalidar cuenta, identidad y disponibilidad; recalcular precios;
obtener saldo gastable con reservas; persistir venta, nombres/precios históricos,
líneas, débito y resultado idempotente; confirmar todo junto. Fallo implica rollback.

La unicidad de saldo `(usuario_id,evento_id)` debe comprobarse realmente. Si hay
duplicados, no consolidarlos automáticamente. No usar un `SUM(saldo)` como solución.
La misma solicitud devuelve la misma venta; selección diferente se rechaza. Reintento
tras respuesta perdida no recalcula una venta ya confirmada con el catálogo nuevo.

Ventas, recargas, reservas y devoluciones deben compartir exclusión por saldo. Un
bloqueo por clave de solicitud no protege solicitudes distintas. Bloquear solo
reservas existentes no impide que aparezca otra concurrente. La suma reservada y
su transición deben leerse/modificarse bajo el protocolo común.

No asumir `gastable=saldo-solicitudes.en_revision`: podría descontar dos veces,
ignorar aprobadas aún no pagadas o no reflejar reservas mantenidas por triggers.
No usar escrituras directas más un trigger desconocido: podría duplicar el débito.

Dev A mantiene orden relativo compra -> tipo_ticket -> entrada -> manilla cuando
corresponde. El orden completo con asignaciones, productos, saldo y reservas debe
contrastarse con B/C. Revalidar dentro de la transacción, no confiar en el resultado
previo de TypeScript. Los DTO actuales de D necesitan adaptador: UUID de ayudante
de vista no se mapea directamente a `ventas.ayudante_id` integer.

## 7. Orden de ejecución y puntos de parada

**Hoy solo está habilitada la obtención de metadatos. No ejecutar migraciones.**

1. Guardar esta evidencia; ejecutar 00 con sesión autorizada de catálogo READ ONLY.
   Revisar el resultado sin publicar datos o literales sensibles. Confirmar proyecto.
2. Comparar cuerpos/ACL/RLS/triggers/dependencias con hashes y migraciones locales;
   completar protocolo comercial/financiero con B/C y revisión de llamadas a RPC.
   Si hay diferencias, ajustar los borradores antes de solicitar aplicación.
3. Confirmar respaldo y restauración probada; ensayar en clon aislado. No ejecutar
   seeds ni crear compras/devoluciones de prueba en el proyecto real por esta revisión.
4. Obtener aprobación del usuario de los archivos EXACTOS y sus hashes definitivos.
5. Candidato HU 9: `sprint3_devD_compra_terceros.sql`, solo si cuerpos/propietarios y
   consumidores siguen compatibles. Ejecutar 20, bloque de funciones/RLS, y volver
   a 00 para confirmar que el único cambio de políticas es el revisado.
6. Candidato HU 14: `sprint3_devD_reportes_entrada.sql`. Ejecutar 20: funciones,
   solicitud_id/índice, privilegios y triggers; validar Admin A con cuentas de prueba.
7. Candidato históricos 10, tras completar la revisión. Ejecutar 20: columnas,
   índice y FK; comparar 00 antes/después para probar ACL/RLS/triggers sin cambios.
8. Operación financiera/consultas: **archivo y orden final aún no definidos** hasta
   conocer B/C. No reemplazar este paso por SQL supuesto. Después, verificar atomicidad,
   idempotencia, RLS y concurrencia en conexiones independientes antes de conectar UI.
9. HU 4 y HU 13: aceptación funcional, sin nueva migración pública prevista.

Este es un orden condicionado por dependencias conocidas, no un orden completo de
despliegue aprobado. No hay paquete financiero final listo para aplicar.

## 8. Respaldo, riesgos y recuperación

Antes de cualquier cambio: comprobar plan/retención y disponibilidad real de backup
o PITR en Dashboard; no presuponer que estén habilitados. Obtener respaldo lógico
consistente de esquema/datos/roles relevantes con herramientas autorizadas y guardar
versiones de funciones, ACL, políticas y triggers. Proteger el respaldo fuera de Git;
no imprimir credenciales ni usar URLs de conexión en comandos visibles. Los objetos
de Storage necesitan copia aparte; un dump SQL no respalda sus archivos.

Probar restauración en entorno aislado, registrar hora/corte y procedimiento; acordar
ventana o pausa de escritores si hace falta comparar invariantes financieros. Los
backups contienen información personal: acceso limitado y sin adjuntarlos al repo.

Cada migración propuesta es transaccional: ante error abortar y ejecutar ROLLBACK
en esa sesión. No continuar dentro de una transacción fallida. Tras commit, detener
el despliegue ante verificaciones fallidas. Preferir corrección hacia adelante; no
DROP de columnas con datos nuevos ni restauración global sin analizar escrituras
legítimas posteriores. Revertir HU 9 restauraría exposición de QR/permisos si se
copiaran políticas antiguas sin análisis. Preparar reversión específica con el
catálogo capturado; no existe reversión genérica segura sin esa evidencia.

Riesgos actuales: privilegios/triggers desconocidos; otras políticas permisivas;
consumidores externos de RPC; históricos antiguos incompletos; ausencia de relación
negocio-evento confirmada; interbloqueos; precisión de puntos desconocida; bloqueo
de escritura al construir índice/FK. El borrador usa lock_timeout/statement_timeout
para abortar en vez de esperar indefinidamente, pero esos límites pueden requerir
ajuste tras medir volumen en clon. No se consultó volumen ni filas reales.

## 9. Verificación posterior y pruebas pendientes

20 contiene consultas exactas para verificar firmas, EXECUTE efectivo anon/authenticated,
propietarios, search_path, RLS/ACL, políticas, columnas/índices/FK y triggers. Volver a
ejecutar 00 para capturar cuerpos y dependencias después de cada migración aprobada.
Comparar definiciones, no solo existencia. No confundir pruebas con service role
con pruebas de RLS de usuarios normales.

En clon con datos sintéticos y dos usuarios: compra regalada sin QR para comprador;
destinatario ambiguo/concurrente y rollback; idempotencia simulada A preservada;
reporte propio frente a ajeno, reintentos y resolución Admin sin invalidar QR;
saldo insuficiente y reservado; dos cobros simultáneos; cobro contra reserva,
devolución o recarga; respuesta perdida; fallo tras débito/líneas y rollback;
producto deshabilitado y cambio de precios; acceso cruzado a comprobantes; fechas
de Bolivia y métricas no basadas en una página del historial.

HU 4: allowlist exacta `http://localhost:3000/reset-password` y el origen HTTPS real
de despliegue seguido de `/reset-password`; agregar otros puertos/orígenes solo si
se usan. La app construye redirectTo con window.location.origin. Verificar Site URL,
SMTP y recuperación válida/vencida/reutilizada con cuentas autorizadas. No se creó
callback nuevo ni se enviaron correos en esta revisión.

No se afirma que las nueve HU estén integradas. La revisión de catálogo es el
siguiente requisito concreto para terminar la preparación SQL financiera.

Validaciones ejecutadas en esta preparación:

- Inventario real GET/OpenAPI: aprobado, 25 relaciones / 20 RPC expuestas.
- Perfiles de catálogo por Data API: inaccesibles, HTTP 406 / PGRST106.
- `node --check scripts/inspeccionar-supabase-esquema.cjs`: aprobado.
- `node scripts/validar-preparacion-integracion.cjs`: 6 pruebas aisladas aprobadas.
- `node scripts/validar-compra-terceros.cjs`: 33 pruebas aisladas aprobadas.
- `node scripts/validar-reportes-entrada.cjs`: 31 pruebas aisladas aprobadas.
- `npm run lint`: 0 errores, advertencia previa de Button sin uso en eventos/[id].
- `git diff --check` y revisión de whitespace de los 7 archivos nuevos: sin errores.

No se ejecutaron los tres SQL nuevos en PostgreSQL, ni se verificaron su ejecución,
RLS o concurrencia reales. No se repitieron build/TypeScript: no cambió código de
la aplicación ni sus dependencias. Los tests JS no sustituyen validación SQL.

Fuentes técnicas: [Data API](https://supabase.com/docs/guides/api),
[conexión PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres),
[funciones y permisos](https://supabase.com/docs/guides/database/functions),
[transacciones READ ONLY](https://www.postgresql.org/docs/current/sql-set-transaction.html).
