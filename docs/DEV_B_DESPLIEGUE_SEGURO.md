# Dev B: revisión y despliegue de prueba

Fecha: 17/11/2026. Rama: Bullain. Candidata: `supabase/migrations/202611170001_devb_saldos.sql`.

SHA-256 del archivo revisado: `cd73bd23130ccf2f6211a993a63eb284fc394af1744cda6715e75b78b5d9db8d`. Si cambia la candidata, volver a revisar el despliegue.

## Estado al cierre del código

- El equipo confirmó **Bs 1 = 1 punto**. La regla deja de estar pendiente de acuerdo; falta cargar `bs_por_punto=1.000000` por evento autorizado en `devb_conversion` después del despliegue. No se recalculan históricos ni se crean puntos al configurar la tasa.
- El responsable informó un preflight con 0 bloqueos, 16 advertencias y 181 OK. La revisión de cada advertencia y de políticas Storage sigue siendo necesaria; ese resumen no autoriza ejecutar SQL.
- La conexión PostgreSQL al proyecto compartido se comprobó con TLS de cliente `verify-full`, identidad del proyecto y una transacción explícita READ ONLY. No se aplicó B.
- Hay un respaldo manual real fuera de Git, con índice, lectura integral, esquema/datos y cinco hashes verificados. El ensayo completo en PostgreSQL local quedó bloqueado al restaurar roles gestionados; además falta `supabase_vault` en ese motor. Todavía no hay recuperación completa acreditada en un Supabase compatible.
- `.env.local` debe permanecer solo en el equipo, sin seguimiento Git. La eliminación del índice no elimina copias antiguas del historial; una clave privada previamente versionada requiere rotación coordinada antes del despliegue.
- El cierre del código no equivale a aceptación de las 11 HUs en Supabase: siguen pendientes el despliegue autorizado, postflight, configuración por evento/plazo y pruebas reales de cliente, operadores, QR/cámara y Storage con datos ficticios.

Las secciones siguientes conservan la revisión original de la candidata. Las referencias a una tasa aún por acordar quedan actualizadas por la decisión 1:1 anterior; el plazo virtual continúa pendiente de confirmación.

## Decisión

**La candidata puede ensayarse completa en un Supabase aislado con los prerrequisitos verificados. Todavía no está autorizada ni certificada para la base compartida.** No se necesita escribir una RPC alternativa para HU16: está incluida en B y funciona sin tasa de conversión. Si el cliente no tiene filas de saldo, debe mostrar el estado vacío, sin crearle puntos.

El usuario confirmó en SQL Editor que `public.consultar_mis_saldos()` no existe y que faltan las tablas B. Eso demuestra despliegue pendiente de esos objetos, pero no certifica ausencia de una instalación parcial ni todo el catálogo A/C/D. En esta revisión no se hizo ninguna conexión ni cambio remoto. Las observaciones remotas del diagnóstico anterior están en `DEV_B_DIAGNOSTICO_HU16.md`; no se presentan como un inventario actualizado.

Se revisaron la migración completa, D 000–004, A QR/reportes/pagos, C negocios/ayudantes/devoluciones, los contratos y los reportes de QA. Se prepararon dos SQL adicionales de solo lectura y una prueba reproducible en memoria. No se modificó la migración candidata ni código funcional A/C/D.

## Objetos y efectos de B

| Elemento | Cambio concreto |
|---|---|
| Tablas nuevas | `devb_conversion` (tasa acordada por evento) y `devb_movimientos` (auditoría e idempotencia). Inicialmente vacías |
| Columnas en `recargas` | `puntos numeric(10,2)`, `tasa numeric(16,6)`; históricos permanecen NULL |
| Columnas en `devoluciones` | `evento_id integer` con FK, `importe_simulado numeric(10,2)`, `tasa numeric(16,6)`; sin inferir evento ni equivalencia histórica |
| Columnas en `solicitudes_devolucion` | `liquidada_en`, `cancelada_en`, ambas timestamptz nullable |
| Columna en `reportes_recarga` | `solicitud_id uuid`, para idempotencia por autor |
| Índices explícitos | `devb_liquidacion_unica` (solicitud no nula), `devb_reporte_solicitud` (autor/intento), `devb_recargas_historial`, `devb_devoluciones_historial` |
| Restricciones implícitas | PK de cada tabla nueva; UNIQUE(actor_id,solicitud) en movimientos, sus índices y secuencia identity. Siete FK nuevas en total; checks de conversión/acuerdo, tipo/coherencia del movimiento y `devb_recarga_nueva_valida` |
| Triggers nuevos | `devb_recarga_inmutable`, `devb_devolucion_inmutable`, `devb_movimiento_inmutable`: bloquean UPDATE y DELETE de cualquier fila, incluso histórica |
| D reemplazada | `devd_mantener_reserva()`: conserva el trigger `devd_reserva`; solo reservan solicitudes en_revision/aprobada sin liquidada_en. Protege estados terminales; no recalcula saldos existentes |
| A reemplazada | `identificar_qr(text,integer)`: mismo DTO; agrega rol devolucion con autorización por evento. Conserva supervisor/recargador/ayudante/admin, pago confirmado e identificación de entrada usada |
| C reemplazadas | `crear_solicitud_devolucion(integer,numeric,text)` añade reintento por ruta y excluye liquidadas del bloqueo de solicitudes pendientes; `devc_mis_solicitudes_devolucion()` añade booleanos liquidada/cancelada. Firmas conservadas |
| RLS/ACL de tablas | Activa RLS y revoca TODOS los derechos de PUBLIC/anon/authenticated en `devb_conversion`, `devb_movimientos`, `recargas`, `devoluciones`, `reportes_recarga`. Acceso funcional mediante RPC; no elimina políticas existentes |
| Storage | Crea o actualiza bucket `devb-evidencias`: privado, 2 MiB, PNG/JPEG/WEBP. Si ya existe, cambia esos parámetros. Añade políticas INSERT/SELECT por actor y evento a `storage.objects`. No añade UPDATE/DELETE ni altera las políticas del bucket C `devoluciones` |

Las 19 funciones nuevas son:

- Helpers privados: `devb_inmutable`, `devb_exigir_staff`, `devb_identidad_bloqueada`, `devb_reintento`, `devb_tasa`, `devb_archivo`.
- RPC autenticadas: `devb_eventos`, `consultar_saldo_staff`, `registrar_recarga`, `ajustar_recarga`, `reportar_recarga`, `registrar_devolucion`, `liquidar_solicitud_devolucion`, `consultar_mis_saldos`, `consultar_ticket_extraviado`, `historial_recargas`, `mis_reportes_recarga`, `historial_devoluciones`, `cancelar_solicitud_devolucion`.

El cierre de permisos recorre funciones nuevas por nombre y el patrón `devb_%`: revoca EXECUTE a PUBLIC/anon/authenticated/service_role y concede solo las RPC previstas a authenticated. El preflight rechaza colisiones en ese espacio de nombres. Las cuatro funciones reemplazadas conservan propietario/ACL anteriores; deben auditarse. No se cambian enums, vistas, funciones de venta D ni el rechazo C. No se instala un proveedor bancario: importes y referencias siguen siendo simulados.

## Orden de aplicación

Hay dos situaciones distintas. **No se debe lanzar `supabase db push`, un reset ni todos los SQL por orden de nombre**: varios scripts A/C están fuera de `migrations/`, y D000 rechaza catálogos que ya tienen triggers posteriores.

### Destino con A/C/D ya instalados

1. Verificar catálogo y versiones contra los archivos. No repetir D000..004, A QR/reportes ni C devoluciones.
2. Ejecutar `supabase/preflight_devb_despliegue_solo_lectura.sql` y revisar TODOS sus resultados.
3. Si pasa y la revisión humana de políticas/escritores también pasa, aplicar **solo** `202611170001_devb_saldos.sql`, una vez y completa.
4. Ejecutar `supabase/postflight_devb_despliegue_solo_lectura.sql` y `supabase/verificacion_devb_saldos.sql`.

### Orden válido para completar un esquema inicial compatible, antes de D

Este orden describe dependencias, no autoriza repetir scripts en la base actual:

| Orden | Archivo o requisito | Razón |
|---|---|---|
| 0 | Esquema base QPass y Sprint 1/2 aprobados | Deben existir las tablas/enums, `usuarios.activo`, roles recargador/devolucion, `eventos.fecha_fin`, Auth y Storage reales. `sprint2_devA_admin_eventos.sql` aporta es_admin; precede a `sprint2_devC_usuarios.sql`. `compras_politicas_y_funcion.sql` precede a A pagos |
| 1 | `supabase/sprint3_devA_qr.sql` | Tablas QR y qpass_autorizado_evento/identificar_qr |
| 2 | `supabase/sprint3_devA_reportes.sql` | Administración y resolución de reportes A |
| 3 | `supabase/sprint3_devA_pagos_prueba.sql` | Simulador delegado por D HU9 |
| 4 | `migrations/202611160000_devd_precondiciones.sql` | Catálogo anterior a D001..004; verifica funciones A y ausencia de triggers financieros |
| 5 | `migrations/202611160001_devd_hu9.sql` | Compra a terceros sobre simulador A/C |
| 6 | `migrations/202611160002_devd_hu14.sql` | Reportes propios sobre administración A |
| 7 | `migrations/202611160003_devd_comercio_base.sql` | Saldo reservado, unicidad, triggers, negocios_eventos y permisos |
| 8 | `migrations/202611160004_devd_comercio_rpc.sql` | Venta atómica, historiales e inmutabilidad D |
| 9 | `supabase/sprint3_devC_negocios.sql` | Requiere D003; productos/negocios y acceso de propietarios |
| 10 | `supabase/sprint3_devC_ayudantes.sql` | Requiere C negocios |
| 11 | `supabase/sprint3_devC_devoluciones.sql` | Requiere A QR y D003; parámetros, bucket C y RPC de solicitudes |
| 12 | Preflight de Dev B | Barreras de instalación y conciliación |
| 13 | `migrations/202611170001_devb_saldos.sql` | B al final; extiende A/C/D |
| 14 | Los dos SQL posteriores | Catálogo, permisos e invariantes financieras |

D001 y D002 son independientes entre sí; D004 y C negocios no requieren orden mutuo después de D003. La tabla fija un orden válido reproducible. C negocios/ayudantes no son dependencias SQL estrictas de HU16/B: se incluyen para probar la integración comercial completa A/C/D sin omitir módulos existentes. A accesos/dashboards/edición segura no son prerrequisitos directos de B; no se deben introducir como parte de este despliegue.

**No hay una receta certificada desde una base completamente vacía en este repositorio**: las suites antiguas A referencian un SQL base ausente (`ARCHIVOS CONTEXTO IA/qpass-bd 1.sql`). No ejecutar los fixtures de pruebas para sustituir Auth/Storage de Supabase. El responsable del esquema debe proporcionar un baseline íntegro aprobado o una copia de estructura mediante Supabase Branching. El catálogo JSON de noviembre sirve para los tests locales, no es una migración oficial de arranque.

Después de B, volver a aplicar A QR, C devoluciones o D003 sobrescribiría sus extensiones. Los verificadores antiguos D que suman toda aprobada sin mirar liquidada_en dejan de describir el contrato posterior a B; usar la verificación B para reservas.

## Bloqueos y riesgos que deben resolverse

| Hallazgo | Consecuencia y criterio para avanzar |
|---|---|
| No hay destino aislado certificado en esta revisión | Confirmar proyecto/branch Supabase distinto del compartido, URL y credenciales propias, sin despliegue automático de vuelta a main. Un nombre de base o `localhost` en la web no demuestra aislamiento de Supabase |
| Prerrequisitos A/C/D pendientes o distintos | No aplicar B. El DO inicial de la candidata comprueba solo tres condiciones; el preflight adicional y la comparación de catálogo son necesarios |
| Instalación parcial o B ya instalada | B no es idempotente: CREATE TABLE/FUNCTION, ADD COLUMN, índices y políticas pueden colisionar. Detenerse; preparar reparación específica tras comparar definiciones. No añadir IF NOT EXISTS indiscriminadamente |
| Dos devoluciones con solicitud_id repetido | El índice único aborta la transacción. Conciliar con C/D/B; no borrar registros para forzarlo |
| Cualquier devolución histórica enlazada a una solicitud sin marca de liquidación | Riesgo de segundo débito/liquidación: B deja liquidada_en NULL y no sabe si ya fue pagada. El preflight se detiene incluso con una sola devolución enlazada. El equipo debe acordar una migración de conciliación; no se preparó un UPDATE automático ni se marcaron como pagadas las aprobadas |
| Reservas desajustadas o solicitud activa sin saldo | No crear saldo artificial ni recalcular a ciegas. D003 contiene una inicialización que modifica reservado y rechaza TODAS las devoluciones existentes; no repetir D003 para reparar una base avanzada |
| Históricos sin tasa/evento | Se conservan, pero recargas viejas no admiten ajuste automático y devoluciones presenciales sin evento/solicitud pueden quedar fuera del historial filtrado por evento. Requiere decidir cómo presentarlas/conciliarlas, sin inferir unidades |
| Revocación de acceso directo a tablas compartidas | Puede romper otro módulo o integración que haga SELECT/INSERT/UPDATE directo. Inventariar escritores, jobs, funciones y clientes externos con A/C/D. Admin A revisa reportes mediante SECURITY DEFINER, cuyo propietario/ACL se verifican |
| Triggers de inmutabilidad sobre históricos | Bloquean correcciones directas y borrados, también cascadas que intenten eliminar recargas/devoluciones por borrar usuarios/eventos. Confirmar flujos administrativos y retención antes de compartido |
| Service role/escritores privilegiados | B no convierte RLS en barrera para esos roles. Los triggers UPDATE/DELETE no protegen TRUNCATE; no se revocan todos los privilegios administrativos existentes. Probar permisos de usuarios mediante sesión authenticated, nunca usando service role como evidencia |
| Políticas Storage ajenas | Las políticas permisivas pueden ampliar acceso; la existencia de las dos políticas B no garantiza aislamiento ni inmutabilidad de archivos. Revisar TODAS las políticas de storage.objects y probar lectura/escritura cruzada. No eliminar políticas ajenas sin acuerdo |
| Bucket B preexistente | La candidata cambia privacidad, límite y MIME si ya existía. Confirmar que no pertenece a otro flujo ni contiene evidencias incompatibles |
| Locks, tiempos y reversión | ALTER TABLE e índices pueden bloquear operaciones. lock_timeout 3s y statement_timeout 30s pueden abortar el despliegue; no subirlos automáticamente. Usar ventana acordada y respaldo restaurable. Tras COMMIT no hay down seguro automático: preferir corrección revisada o restauración coordinada, nunca DROP para volver a intentar |
| Tasa, plazo y cuentas de prueba pendientes | No impiden crear el esquema B, pero bloquean aceptación integral. HU16 no los necesita; recargas/devoluciones requieren tasa por evento; solicitudes virtuales requieren plazo C. Confirmar cuentas activas y asignaciones de recargador/devolucion antes de operar |

## Procedimiento en un Supabase aislado

1. En el Dashboard, seleccionar o preparar con el responsable un entorno de pruebas separado. Preferir una branch Supabase **sin datos** ni conexión a un despliegue automático; una branch Supabase es independiente de la rama Git, que permanece Bullain. No marcar Include data. No copiar usuarios reales, fotos, QR bancarios ni credenciales del compartido. Si Branching no está disponible, usar otro proyecto con baseline aprobado.
2. Confirmar que el destino tiene estructura A/C/D equivalente. Guardar el inventario de funciones/triggers/políticas y un respaldo autorizado en ubicación privada. Revisar también el historial de migraciones si existe; scripts manuales pueden no estar registrados allí. No modificar el historial para fingir una instalación.
3. En **SQL Editor del entorno aislado**, ejecutar completo `supabase/preflight_devb_despliegue_solo_lectura.sql` como postgres. Debe terminar sin excepción; todas las columnas requeridas deben estar presentes. Comprobar tipos, definición de restricciones/triggers y huellas de funciones frente al baseline aprobado. Revisar ACL heredadas, políticas Storage e integraciones privilegiadas. El preflight termina con ROLLBACK y no corrige nada. Si aparece una excepción, detenerse; si la sesión queda abortada, ejecutar únicamente ROLLBACK antes de seguir investigando.
4. Si falta algún prerrequisito, instalar solo lo faltante con su responsable en el orden anterior y repetir el preflight. Si el entorno se obtuvo de una base avanzada con D/C ya instalados, no ejecutar D000 ni D003 otra vez.
5. En una consulta nueva del **mismo destino aislado**, pegar el contenido COMPLETO de `supabase/migrations/202611170001_devb_saldos.sql`, desde BEGIN hasta COMMIT, y ejecutar una vez. No seleccionar solo consultar_mis_saldos. La transacción también incluye el cambio de bucket. Ante error, no continuar con sentencias sueltas ni reintentar hasta comprobar si hubo COMMIT; ejecutar ROLLBACK si la sesión quedó en error.
6. Ejecutar completos `supabase/postflight_devb_despliegue_solo_lectura.sql` y `supabase/verificacion_devb_saldos.sql`. Todos los booleanos de seguridad/invariantes deben ser true; `presente` debe ser true. Conversión/plazo ausentes son observaciones y seguirán bloqueando sus operaciones. Comparar políticas/índices/constraints con la candidata y las políticas ajenas con el inventario inicial. Verificar también las ocho columnas nuevas mediante Table Editor o la inspección de esquema.
7. Configurar la ejecución local con las **tres variables del entorno aislado en el proceso de una terminal dedicada**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. No editar `.env.local`, no mostrar claves en consola/reportes y no mezclar la URL aislada con una clave del compartido. Los valores del proceso tienen prioridad sobre el archivo. Detener cualquier servidor anterior de esa prueba y arrancar en un puerto separado para evitar confundirlo con la sesión compartida:

   ```powershell
   npm run dev -- --webpack --hostname 127.0.0.1 --port 3001
   ```

   La bandera webpack evita el problema local Turbopack/PostCSS registrado en QA. Abrir un perfil de navegador separado en `http://127.0.0.1:3001`, con configuración Auth/redirect del entorno de pruebas adecuada a ese origen. Cerrar esa terminal al terminar para no reutilizar variables de otro proyecto.
8. Cuando se autorice preparar datos ficticios, crear mediante Auth y los flujos administrativos las cuentas de cliente, recargador y devolución, con perfiles activos y asignaciones a eventos ficticios. Confirmar que cada perfil corresponde a su usuario Auth; no insertar perfiles huérfanos. Este documento no crea cuentas ni datos. Para HU16 basta una sesión cliente activa: visitar `/mi-cuenta/saldos` debe mostrar estado vacío si no tiene saldo. Tras una recarga ficticia autorizada, mostrará el saldo propio por evento.
9. Solo con autorización para operaciones ficticias: cargar la tasa oficial 1:1 (`1.000000` Bs/punto) por evento y confirmar el plazo virtual C. El fichero de fixture y sus 72 horas siguen siendo exclusivos de pruebas locales; no se ejecutan directamente contra Supabase. La tasa oficial no habilita cambios históricos. Plantillas administrativas (marcadores, **no ejecutables sin sustituir**):

   ```sql
   insert into public.devb_conversion(evento_id,bs_por_punto,acuerdo)
   values (:evento_ficticio, 1.000000, :referencia_acuerdo)
   on conflict(evento_id) do update set bs_por_punto=excluded.bs_por_punto,
     acuerdo=excluded.acuerdo,actualizado_en=now();

   insert into public.devc_parametros(clave,valor)
   values ('plazo_devolucion_horas', :horas_acordadas)
   on conflict(clave) do update set valor=excluded.valor,actualizado_en=now();
   ```

10. Continuar las 11 HUs según `DEV_B_PRUEBAS.md` y `DEV_B_REPORTE_FINAL.md`: QR propio/usado/ajeno, recarga e historial, ajuste auditado sin borrar original, reporte y resolución A, devolución con foto/comprobante privados, disponible frente a reserva C, liquidación virtual única, historiales, cancelación/rechazo y manilla extraviada. Con acuerdo de prueba 1:1, el flujo 50→venta15→devolución20 debe terminar en 15; repetir debe conservarlo. Habilitar `QPASS_COMERCIO_REAL=true` solo en el proceso aislado si se incluye la venta D y D confirma su configuración. No usar dinero ni evidencias bancarias reales.
11. Probar Auth/RPC HTTP y Storage con sesiones reales: otro cliente no ve saldos ajenos; sin asignación no identifica ni opera; otra cuenta no lee/modifica las evidencias B; URL firmada expira a los 300s; cámara y permiso denegado se prueban en dispositivo. No divulgar URL firmadas. Repetir verificaciones de invariantes al terminar. Los tests en memoria no sustituyen estos pasos.

Las branches Supabase tienen instancia y credenciales propias y pueden partir sin datos; esto no requiere cambiar de rama Git. Referencias oficiales consultadas: [Branching](https://supabase.com/docs/guides/deployment/branching), [Dashboard sin datos por defecto](https://supabase.com/docs/guides/deployment/branching/dashboard). Para la revisión de RLS/clave administrativa: [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Qué deben acordar A/C/D y el responsable de la base

- **A:** nueva autorización de devolución en identificar_qr, mantenimiento del DTO y acceso de administración a reportes tras revocar acceso directo; efectos de inmutabilidad en sus acciones administrativas.
- **C:** solicitud aprobada no significa liquidada; aceptar usa liquidación atómica, rechazo/cancelación liberan reserva; extensión de sus dos funciones, tratamiento de históricos y plazo oficial.
- **D:** contrato saldo total/reservado/disponible, extensión de su función de trigger, mismo bloqueo de saldo compartido y escritores privilegiados. No reemplazar precios en puntos ni reaplicar su inicialización.
- **Equipo/responsable Supabase:** destino aislado y baseline, permisos de operación, backup/ventana del futuro despliegue compartido, políticas Storage ajenas, retención de evidencias y borrado administrativo; tasa/precisión y fechas de prueba. Una autorización para ensayar en aislado no equivale a autorizar el compartido.

Estas son decisiones de integración y autorización del futuro despliegue compartido. No se enviaron mensajes a compañeros ni se ejecutaron operaciones remotas. Preparar y probar estos archivos localmente ya estaba autorizado.

## Validación de esta revisión

`node scripts/validar-devb-despliegue.cjs`: 16 casos aprobados en PGlite con catálogo histórico, A QR/reportes/pagos, D000..004, C negocios/ayudantes/devoluciones y B. Incluye instalación sin tasa conservando saldo/reserva, HU16 con cliente activo, preflight sin cambios de datos, triggers/RLS deshabilitados, ACL heredada pública, colisión parcial, duplicados y devolución heredada, y detección posterior de ACL anónima o trigger inmutable ausente. Los dos SQL nuevos corren en transacciones READ ONLY.

También se ejecutaron `node scripts/validar-devb-saldos.cjs` (27 casos) y `node scripts/validar-devb-integracion.cjs` (15 casos), ambos aprobados en PGlite. Total de esta revisión: **58 ejecuciones aprobadas**. ESLint del script nuevo: sin errores ni advertencias. No hubo cambios TypeScript ni de aplicación que requirieran repetir su build.

No certifica el catálogo vivo, JWT, API Storage, cámaras ni concurrencia multiconexión de un Supabase real. Las 456 ejecuciones y la concurrencia PostgreSQL del reporte anterior siguen siendo evidencia histórica, no se vuelven a contar como pruebas de este despliegue.

## Comprobaciones antes del commit local

- TypeScript: `tsc --noEmit --incremental false`, correcto.
- Lint: `npm run lint`, 0 errores; advertencia preexistente por `Button` sin uso en `app/eventos/[id]/page.tsx`.
- Build: `npm run build -- --webpack`, correcto. El comando predeterminado con Turbopack sigue fallando al crear el subproceso de PostCSS en este entorno Windows, también fuera del sandbox; no se ocultó ni se cambió la configuración del proyecto.
- 19 casos del resumen de preflight y 3 comprobaciones del diagnóstico HU16, correctos con fixtures en memoria. No ejecutan migraciones ni consultan Supabase.
- Se restauró el diagnóstico HU16 que estaba vacío. Los archivos pendientes de Dev B se revisaron buscando valores de credenciales y claves privadas.
- `.env.local` queda intacto en el equipo y fuera del índice. No se incluyen respaldos, archivos de conexión ni herramientas privadas. La credencial privada presente en el historial anterior debe rotarse coordinadamente; sacar el archivo del índice no elimina ese historial.
- Este commit no despliega B, no configura tasas en la base y no certifica aceptación remota. La recuperación completa, el cierre de advertencias, la aplicación autorizada, postflight y las pruebas con cuentas ficticias siguen pendientes.
