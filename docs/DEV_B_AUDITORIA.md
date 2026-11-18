# QPass · Auditoría e implementación Dev B

> Actualización de QA: el estado vigente y los conteos consolidados están en [DEV_B_REPORTE_FINAL.md](DEV_B_REPORTE_FINAL.md). Se probó la equivalencia temporal 1:1 y la concurrencia en PostgreSQL 17.11 real local. Supabase, dispositivos y aceptación autenticada siguen pendientes. El inventario inicial y los resultados de implementación siguientes se conservan como registro de esa fase.

Fecha: 17/11/2026. Base auditada: `2e7a5db`, rama `Bullain`, árbol inicialmente limpio. Aguilar, Aliaga y Herbas ya integradas. No se requieren merges.

## Inventario inicial

| HU | Estado inicial | Archivos encontrados | Existente | Problemas / trabajo necesario | Dependencias |
|---|---|---|---|---|---|
| 15 | PARCIAL | lib/qr/{server,types}.ts; components/qr/LectorQr.tsx; supabase/sprint3_devA_qr.sql | Identificación QR digital/física de staff | Falta flujo de extraviados y consulta limitada propia; no revelar datos de terceros al cliente | A: entradas/manillas, roles/asignaciones |
| 16 | PARCIAL | supabase/migrations/202611160003_devd_comercio_base.sql | Saldo único y reservado; consultas de venta y devolución virtual | Falta /mi-cuenta/saldos y RPC propia independiente del plazo de devolución | D: saldo total/reservado |
| 36 | PARCIAL | lib/qr/server.ts; identificar_qr | RPC permite recargador asignado | Falta panel /recargador y validaciones definitivas | A: QR compartido |
| 37 | PENDIENTE | tabla recargas en catálogo exportado | Tabla sin RPC/UI de recarga | Operación atómica/idempotente y política de conversión explícita | Equipo: tasa Bs/punto no definida |
| 38 | PENDIENTE | tabla recargas | Persistencia base | Historial autorizado por operador/evento, filtros y límites | HU37 |
| 39 | PARCIAL | reportes_recarga; listar_reportes_admin; resolver_reporte_admin | Administración enumera/resuelve reportes de recarga | Alta/seguimiento del recargador; ajuste explícito auditable sin editar el histórico | A: administración existente |
| 40 | PENDIENTE | tabla reportes_recarga | Estado pendiente/solucionado | Vista propia y consulta limitada | A: resolución existente |
| 46 | PARCIAL | lib/qr/server.ts; lib/devolucion/solicitudes.ts | Guard devolucion/admin | identificar_qr no permite devolucion; falta escaneo presencial | A: extensión compatible del rol asignado |
| 47 | PARCIAL | saldo-reservado en D y C | Semántica disponible conservadora | Consulta de staff de devoluciones sin otorgar rol recargador | D/C: reservas compartidas |
| 48 | PENDIENTE | tabla devoluciones; stub app/devolucion/solicitudes/actions.ts | Solicitudes virtuales C; bucket privado de QR bancarios | Débito atómico, archivos privados, foto, comprobante y liquidación idempotente compatible | C: aceptarSolicitud; D: liberar reserva solo al liquidar |
| 49 | PENDIENTE | tabla devoluciones | Persistencia base sin evento presencial | Evento explícito para nuevos registros e historial propio con URLs temporales | HU48 |

## Fuentes y límites de la auditoría

Instaladas: Next 16.3.7, React 19.2.8, TypeScript 5.9.3, @supabase/ssr 0.12.7 y @zxing/browser 0.2.1. Se leyeron AGENTS.md y guías locales de autenticación, Server Actions, revalidatePath y middleware/proxy. Se revisaron catálogo exportado, migraciones D 000–004, SQL A/C, guards, navegación, Storage y administración.

No se encontraron en el repositorio: `Gestión_de_Ingresos_-_BACKLOG 1.docx`, `QPass - Vista de computadora.svg`, `qpass-bd 1.sql`, `ChatClaude.pdf`, `CIERRE_DEV_A_SPRINT3.md`. Se usa el diseño actual y el contrato disponible `docs/CONTRATO_DEV_C_SPRINT3.md`. El catálogo exportado es evidencia histórica, no una conexión al esquema remoto vigente. No se han leído secretos ni aplicado SQL remoto.

No existe política aprobada de conversión dinero/puntos en las fuentes disponibles. Las nuevas operaciones monetarias exigirán una configuración por evento sin valor predeterminado. Se reutiliza `saldos_puntos`; no se crea un saldo paralelo. `aprobada` ya reserva en D: liquidación necesita un indicador explícito para liberar una sola vez, sin reinterpretar solicitudes aprobadas heredadas.

## Resultado de la fase de implementación (anterior a QA)

`COMPLETA (local)` significa código integrado y pruebas locales ejecutadas; **no certifica que esté desplegado en Supabase ni probado con una sesión/cámara real**. Todas las RPC nuevas requieren aplicar la migración antes de usar las pantallas contra el servidor remoto. HU37 y HU48 tienen código y pruebas, pero se clasifican BLOQUEADA para operación monetaria hasta que el equipo acuerde/configure la tasa. No se simuló una integración remota exitosa.

| HU | Inicial | Final técnico | Archivos principales | Validación ejecutada / aceptación pendiente |
|---|---|---|---|---|
| 15 | PARCIAL | COMPLETA (local) | app/mi-cuenta/ticket-extraviado; components/saldos/TicketExtraviado.tsx; consultar_ticket_extraviado en SQL B | Cliente ajeno recibe null, propio sin PII, staff asignado obtiene nombre limitado; lector A reutilizado. Cámara real pendiente |
| 16 | PARCIAL | COMPLETA (local) | app/mi-cuenta/saldos; lib/saldos/server.ts; consultar_mis_saldos | Saldo propio/evento, total/reservado/disponible y denegación directa por ACL comprobados |
| 36 | PARCIAL | COMPLETA (local) | app/recargador; components/saldos/Caja.tsx; lib/saldos/actions.ts | QR usado válido, inválido, impago y evento ajeno probados; QR de A reutilizado |
| 37 | PENDIENTE | BLOQUEADA (tasa; código listo) | registrar_recarga; devb_conversion; devb_movimientos; Caja | Recarga/idempotencia/rollback probados. Sin tasa configurada se rechaza; no se inventa dinero/puntos |
| 38 | PENDIENTE | COMPLETA (local) | app/recargador/historial; HistorialCaja.tsx; historial_recargas | Historial propio por evento, paginado por cursor y ajustes visibles; otro operador no ve las recargas |
| 39 | PARCIAL | COMPLETA (local) | GestionRecarga.tsx; ajustar_recarga; reportar_recarga | Original inmutable, delta y motivo auditados, rechazo de retiro consumido/reservado, reporte a administración A |
| 40 | PENDIENTE | COMPLETA (local) | app/recargador/reportes; mis_reportes_recarga | Pendiente/solucionado, solo autor autorizado y paginación; resolver no cambia saldo |
| 46 | PARCIAL | COMPLETA (local) | app/devolucion; Caja; extensión compatible identificar_qr | Encargado asignado identifica QR usado; no puede recargar ni operar otro evento |
| 47 | PARCIAL | COMPLETA (local) | consultar_saldo_staff; Caja | Consulta disponible = saldo-reservado; reservas no se gastan en presencial/venta |
| 48 | PENDIENTE | BLOQUEADA (tasa; código listo) | registrar_devolucion; liquidar_solicitud_devolucion; subirEvidencia; app/devolucion/solicitudes/actions.ts | Foto/comprobante privados, débito y rollback, reintento, reserva, liquidación única y bloqueo sin tasa probados. Upload/cámara/Storage real pendientes |
| 49 | PENDIENTE | COMPLETA (local) | app/devolucion/historial; historial_devoluciones; leerDevoluciones | Historial propio por evento, cursor, referencias simuladas; URLs privadas de 300 s generadas en servidor, integración Storage real pendiente |

### Funcionalidad integrada

- Se mantienen las rutas, UI y contratos existentes de A/C/D. No se duplicó el lector QR, tabla de saldos, reportes administrativos, solicitudes virtuales ni ventas.
- Rutas nuevas: `/recargador`, `/recargador/historial`, `/recargador/reportes`, `/mi-cuenta/saldos`, `/mi-cuenta/ticket-extraviado`, `/devolucion`, `/devolucion/historial`. `/devolucion/solicitudes` se conserva dentro del layout protegido nuevo.
- Núcleo en `supabase/migrations/202611170001_devb_saldos.sql`; validación posterior de solo lectura en `supabase/verificacion_devb_saldos.sql`. No se ejecutaron contra Supabase remoto.
- Extensión mínima a C: liquidar el stub, tratar una aprobada liquidada como cerrada, ruta/UUID estables para solicitudes e importes textuales sin float. Se conservan sus pantallas y filtros. No se implementan otras HUs ajenas.
- Nuevos datos de aplicación proceden de RPC reales de Supabase, sin mocks ni balances inventados en producción. Las fixtures se limitan a scripts de prueba.
- La reserva se libera explícitamente al liquidar; aprobar sin liquidar sigue reservando. Recargas/devoluciones/movimientos son inmutables; correcciones se registran como movimientos nuevos.

### Archivos

Creado: `lib/saldos/{types,validacion,server,actions}.ts`, `components/saldos/{Caja,CajaNav,PanelCaja,GestionRecarga,HistorialCaja,TicketExtraviado,ErrorCaja}.tsx`, rutas/layouts/loading/error indicados arriba, migración/verificación B, tres scripts `validar-devb-{app,saldos,concurrencia}.cjs` y estos documentos `DEV_B_{AUDITORIA,CONTRATOS,PRUEBAS}.md`.

Modificados: `middleware.ts`, `components/{MenuCuenta,OcultarEnPanel}.tsx`, `app/devolucion/solicitudes/{actions.ts,SolicitudesCliente.tsx}` y `app/mi-cuenta/devoluciones/{actions.ts,DevolucionesCliente.tsx}`. Los demás módulos no se reescriben. Dependencias y lockfiles del proyecto permanecen intactos; herramientas de prueba/formato instaladas solo en `.next/devb-tools` (ignorado).

### Pruebas y límites

- 27 casos SQL B aprobados en PGlite: migración, permisos/RLS, QR, tasas, reservas, recargas, correcciones, reportes, devoluciones, cancelación/rechazo, idempotencia y rollback provocado después del débito.
- 15 casos de aplicación B aprobados: validación, guards, DTO, upload/firma/hash, recuperación de intento incierto tras recarga de página, bloqueo de edición/cancelación y creación virtual con el mismo UUID/ruta.
- 13 suites preexistentes aprobadas: base-ayudante, carrito-ayudante, comercio-app-devd, compra-terceros, lecturas-ventas, recuperacion, reportes-entrada, ticket-pdf, preparacion-integracion, auditoria-003, integracion-real-devd, guardas-comercio-devd y decision-003. Las tres últimas se ejecutaron en PGlite.
- TypeScript correcto; lint sin errores, con la advertencia preexistente `Button` sin usar en `app/eventos/[id]/page.tsx:6`. Lint dirigido a Dev B sin advertencias.
- `npm run build -- --webpack` correcto con TypeScript/generación/trazas. El build Turbopack por defecto falla internamente al crear el proceso de PostCSS de globals.css en este entorno, como antes del trabajo. El build limitado inicialmente también falló por permisos de `.next/types`; al ejecutarlo con permiso ampliado terminó correctamente. Se conserva configuración/package.json.
- Prueba HTTP con el servidor compilado: ocho rutas redirigen al login con `next` intacto; login devuelve 200 con formulario. Servidor temporal detenido después.
- `validar-devb-concurrencia.cjs`: SKIP explícito por falta de PostgreSQL local y QPASS_TEST_DATABASE_URL; seis carreras preparadas, no certificadas. PGlite usa una conexión y no demuestra concurrencia real.
- Suites preexistentes `validar-qr.cjs`, `validar-supervisor.cjs` y `validar-pagos-prueba.cjs` fallan por ausencia de `ARCHIVOS CONTEXTO IA/qpass-bd 1.sql`, no por los cambios B. No se inventó ni reconstruyó ese SQL original.
- No se validaron sesión autenticada/cámara/subidas/RLS en Supabase real. Ver pasos reproducibles y aceptación manual en `DEV_B_PRUEBAS.md`.

### Pendientes reales y Git

1. Aplicación manual de migración B en el esquema real, previa revisión de prerequisitos/writers/políticas; ejecutar verificación solo lectura.
2. Acuerdo y carga de Bs/punto por evento. Política de redondeo no decidida: conversión inexacta se rechaza.
3. Plazo de devolución C configurado por el equipo si se probará el flujo virtual.
4. PostgreSQL local aislado para concurrencia real; cuentas/dispositivos de prueba para aceptación autenticada y cámara/Storage.
5. Política administrativa de retención de evidencias huérfanas de intentos cancelados.

No falta código nuevo de A/C/D para consumir las operaciones B preparadas; sí necesitan estar instaladas sus migraciones previas. Las tareas ajenas, como ventas del mes del negocio, se mantienen fuera de alcance.

Se conserva `Bullain`, sin merges/rebase, cambios de rama, commits, push ni git add. No había cambios pendientes al inicio. No se modificó ni expuso `.env.local`. Mensaje propuesto: `feat(dev-b): integrar recargas saldos y devoluciones con auditoria e idempotencia`.
