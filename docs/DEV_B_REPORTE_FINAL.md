# QPass · Dev B · Reporte final de pruebas y correcciones

Fecha: 17/11/2026. Rama conservada: `Bullain`. HEAD: `2e7a5dbd55454a3406511cf0cccd94f38c35bee3`.

## A. Resumen ejecutivo

Se conservó la implementación anterior y sus 43 archivos pendientes. Esta fase agregó configuración temporal aislada, un escenario completo de saldo, pruebas de seguridad de configuración y fotografía, y corrigió el manejo de reintentos inciertos. No se reconstruyeron los módulos A/C/D ni se modificó el SQL de producción para imponer una tasa.

**Resultado consolidado: 456 ejecuciones de casos aprobadas en 25 suites completas; 0 casos funcionales fallidos en la corrida final; 9 comprobaciones HTTP adicionales aprobadas.** Tres suites antiguas de A se intentaron ejecutar y terminaron con exit 1 antes de probar sus casos porque falta el SQL base. El build predeterminado también falla por el problema de Turbopack/PostCSS del entorno; el build alternativo Webpack terminó con exit 0.

Se ejecutó PostgreSQL 17.11 real en un clúster nuevo, local y dedicado a datos ficticios. **126 casos se comprobaron en ese motor**, incluidos seis escenarios de concurrencia de B y cinco de D, observando esperas de bloqueo entre conexiones. Esto reemplaza el pendiente anterior de concurrencia: ya no se fundamenta en PGlite ni en mocks.

El caso requerido comenzó con un cliente ficticio sin saldo: **recarga Bs 50 → 50 puntos; venta de 15 → 35; devolución presencial de 20 puntos → Bs 20 simulados y saldo final 15**. Repetir recarga, venta y devolución con sus claves originales conservó exactamente ese saldo. Se ejecutó en PostgreSQL real y PGlite por separado.

**Límite material:** el PostgreSQL local reproduce el catálogo exportado y aplica las migraciones sobre fixtures. No es Supabase real: `auth.uid()` se alimenta de una sesión SQL de pruebas y Storage utiliza tablas de metadatos de fixture. No se probó JWT/login autenticado, PostgREST/RPC por HTTP ni el servicio Storage remoto. Cámara/canvas se simulan en sus pruebas unitarias; no certifican un dispositivo real. No se hicieron operaciones sobre datos reales de usuarios.

## B. Estado de las 11 HUs

La columna inicial corresponde al inventario previo a la implementación. Al entrar en esta fase todas tenían código; HU37/HU48 estaban bloqueadas por conversión no acordada. **El estado actual distingue verificación SQL/local de aceptación final**, sin declarar completa una integración remota no ejecutada.

| HU | Estado inicial | Estado actual | Archivos principales | Pruebas ejecutadas y resultado | Dependencia restante |
|---|---|---|---|---|---|
| 15 | PARCIAL | Verificada SQL/local; aceptación pendiente | app/mi-cuenta/ticket-extraviado; components/saldos/TicketExtraviado.tsx; consultar_ticket_extraviado en migración B | Cliente ajeno recibe null; propio recibe entrada/evento/estado; staff autorizado obtiene nombre limitado sin CI/correo/UUID. Aprobado | Escáner/dispositivo y sesión reales |
| 16 | PARCIAL | Verificada SQL/local; aceptación pendiente | app/mi-cuenta/saldos; lib/saldos/server.ts; consultar_mis_saldos | Saldo propio por evento; total/reservado/disponible; resultado 15 en flujo 1:1; acceso directo ajeno denegado. Aprobado | RPC desplegada y navegador autenticado |
| 36 | PARCIAL | Verificada SQL/local; aceptación pendiente | app/recargador; Caja.tsx; lib/qr/server.ts | QR válido, usado con identificación válida, inválido, impago y otro evento. Aprobado | Cámara/QR real y Supabase Auth |
| 37 | PENDIENTE | Verificada 1:1 en pruebas; producción pendiente | registrar_recarga; devb_conversion; devb_movimientos; scripts/fixtures/devb-desarrollo.json | Bs50→50, tasa histórica, reintento, dos recargas concurrentes, rollback. Aprobado en PostgreSQL | Tasa oficial y despliegue/aceptación |
| 38 | PENDIENTE | Verificada SQL/local; aceptación pendiente | app/recargador/historial; historial_recargas | Registro real SQL propio/evento, ajustes, cursor; otro recargador no ve recargas ajenas. Aprobado | UI autenticada contra destino |
| 39 | PARCIAL | Verificada SQL/local; aceptación pendiente | GestionRecarga.tsx; ajustar_recarga; reportar_recarga | Motivo/delta auditados; original inmutable; retiro consumido/reservado rechazado; reporte a admin. Aprobado; corregida incertidumbre de reintentos | Aceptación de UI y admin real |
| 40 | PENDIENTE | Verificada SQL/local; aceptación pendiente | app/recargador/reportes; mis_reportes_recarga | Pendiente→solucionado mediante RPC A; saldo intacto; autor/evento autorizados. Aprobado | UI de seguimiento/admin real |
| 46 | PARCIAL | Verificada SQL/local; aceptación pendiente | app/devolucion; consultar_saldo_staff; identificar_qr | Encargado asignado identifica QR usado; evento ajeno y rol cruzado denegados. Aprobado | QR y sesión reales |
| 47 | PARCIAL | Verificada SQL/local; aceptación pendiente | consultar_saldo_staff; Caja.tsx | Gastable=saldo−reservado; SQL real impide devolver/gastar reservas; concurrencia comprobada. Aprobado | Navegador autenticado |
| 48 | PENDIENTE | SQL 1:1 verificado; aceptación de evidencias/cámara pendiente | registrar_devolucion; liquidar_solicitud_devolucion; Caja.tsx; FotoAcceso.tsx | 20 pts→Bs20; foto/comprobante requeridos; paths privados; débito único; rollback; liquidación virtual concurrente. Captura/archivo con mocks aprobados | Supabase Storage/API y dispositivo reales; tasa oficial para producción |
| 49 | PENDIENTE | Verificada SQL/local; aceptación pendiente | app/devolucion/historial; historial_devoluciones; leerDevoluciones | Histórico 20 pts/Bs20 y rutas de evidencias propios; otro rol/evento denegado; RPC paginada. Aprobado SQL | URLs firmadas/expiración en Storage real |

## C. Resultados exactos de pruebas

### Cómo se cuentan

Se cuentan las líneas PASS de cada ejecución final registrada. Un mismo conjunto ejecutado en PostgreSQL y PGlite aparece dos veces, como ejecuciones sobre motores distintos; **456 no significa 456 especificaciones únicas**. No se suman intentos exploratorios repetidos ni la regresión roja que se utilizó para reproducir el error antes de corregirlo.

| Modalidad | Suites completas aprobadas | Casos aprobados | Casos fallidos finales |
|---|---:|---:|---:|
| Regresión, mocks, SSR, PDF y PGlite de la primera corrida consolidada | 16 | 288 | 0 |
| PostgreSQL 17.11 real local, bases independientes | 7 | 126 | 0 |
| Dev B en PGlite, comprobación cruzada de motor | 2 | 42 | 0 |
| **Total suites completas** | **25** | **456** | **0** |
| HTTP real al build, sin sesión | No es suite de negocio | **9** | **0** |

Hay **3 suites bloqueadas por un prerrequisito ausente**, con exit 1 y 0 casos ejecutados dentro de ellas. No se inventa el número de casos que habrían contenido. Hay **10 comprobaciones manuales de aceptación definidas y no ejecutadas**, listadas en G. Separadamente hay **1 validación técnica fallida**: build Turbopack.

### Detalle de suites completas

Todos los scripts están en `scripts/` y comienzan por `validar-`.

| Suite | Modalidad | Casos aprobados |
|---|---|---:|
| base-ayudante | Mocks/SSR | 22 |
| carrito-ayudante | Mocks/SSR | 31 |
| comercio-app-devd | Mocks/SSR | 17 |
| compra-terceros | Mocks y revisión estática | 33 |
| lecturas-ventas | Mocks/SSR | 34 |
| recuperacion | Mocks | 18 |
| reportes-entrada | Mocks/SSR | 31 |
| ticket-pdf | PDF local real y QR decodificado | 5 |
| preparacion-integracion | Mocks y SQL estático | 6 |
| auditoria-003 --sql | Mocks y PGlite | 5 |
| integracion-real-devd | PGlite | 26 |
| guardas-comercio-devd | PGlite | 5 |
| decision-003 | PGlite | 28 |
| devb-app | Mocks/SSR/estado de componentes | 17 |
| devb-config | Guardas con mocks explícitos | 3 |
| devb-foto | Cámara/canvas/DOM simulados | 7 |
| devb-saldos --postgres | PostgreSQL real local | 27 |
| devb-integracion --postgres | PostgreSQL real local, escenario 1:1 | 15 |
| devb-concurrencia | PostgreSQL real local, dos conexiones | 6 |
| integracion-real-devd --postgres | PostgreSQL real local | 26 |
| concurrencia-devd | PostgreSQL real local | 5 |
| inmutabilidad-hu61 | PostgreSQL real local | 19 |
| decision-003 --postgres | PostgreSQL real local | 28 |
| devb-saldos | PGlite aislado | 27 |
| devb-integracion | PGlite aislado, escenario 1:1 | 15 |

### Bloqueos y comprobaciones técnicas

| Comprobación | Resultado real | Causa / alcance |
|---|---|---|
| validar-qr.cjs | Exit 1; no ejecutable | Falta ARCHIVOS CONTEXTO IA/qpass-bd 1.sql |
| validar-supervisor.cjs | Exit 1; no ejecutable | Mismo archivo ausente |
| validar-pagos-prueba.cjs | Exit 1; no ejecutable | Mismo archivo ausente |
| TypeScript --noEmit --incremental false | Exit 0 | Sin errores |
| npm run lint | Exit 0 | 0 errores; 1 advertencia preexistente Button sin uso en app/eventos/[id]/page.tsx:6 |
| npm run build | Exit 1 | TurbopackInternalError al crear proceso de PostCSS de app/globals.css; proceso Node termina antes de conectar |
| npm run build -- --webpack | Exit 0 | Compilación, TypeScript, generación de páginas y trazas correctos |
| HTTP ocho rutas protegidas | 8 aprobadas | 307 a login preservando ruta y query en next |
| HTTP /login | 1 aprobada | 200 y formulario renderizado |
| git diff --check / marcadores | Sin errores / sin coincidencias | Revisión de cambios finales |

Next también avisa sobre la convención middleware.ts deprecada. No se cambió la arquitectura global ni package.json para ocultar el fallo del build predeterminado.

Las trazas y conteos de esta corrida se guardaron en `.next/devb-resultados/`: `suites.json`, `postgres.json`, `devb-pglite.json`, `http.json` y un log por suite, además de ambos builds. Son artefactos locales ignorados por Git; este reporte conserva sus conteos y comandos aunque se limpie .next.

## D. Correcciones e integración con A/C/D

### Error funcional reproducido y corregido

El primer envío de una recarga o ajuste podía quedar incierto por pérdida de respuesta. Si un reintento posterior era rechazado —por ejemplo, porque se revocaron permisos— la UI lo trataba como confirmación de rollback del envío original y habilitaba cancelar/eliminar su identificador. El rechazo del reintento no demuestra qué ocurrió con el primero.

La prueba se hizo fallar antes de la corrección: el botón Cancelar revisión quedaba habilitado. Se agregó `conservarIncertidumbre` y persistencia del estado enviado en Caja/GestionRecarga. Ahora, después de un envío sin respuesta, un rechazo posterior mantiene el UUID/payload bloqueados hasta recuperar confirmación o conciliar el histórico. Se verifica también después de recargar la página. Los reportes distinguen error SQL definitivo, respuesta mal formada y error de red; ya no muestran éxito con un id inválido.

Archivos: `lib/saldos/{validacion,actions}.ts`, `components/saldos/{Caja,GestionRecarga}.tsx`, `scripts/validar-devb-app.cjs`.

### Fotografía

La devolución utilizaba un input capture, que en escritorio no proporciona captura por cámara y en móvil puede forzar una única vía de selección. Ahora reutiliza `components/supervisor/FotoAcceso.tsx`, con captura mediante getUserMedia/canvas y selección de archivo separadas. Se añadieron propiedades opcionales de título/contexto/límite; **Dev A conserva 5 MB y su comportamiento por defecto**, mientras B usa 2 MB y el contexto devolución. No se reescribió su módulo de accesos. Confirmar y cancelar quedan bloqueados durante la captura para evitar estados incompletos.

Siete pruebas con mocks cubren archivo, límites A/B, frame→File JPEG, permiso denegado, detención de tracks, revocación de preview y fallo de canvas. Falta probar hardware real.

### Integración compartida comprobada

- **A:** roles y asignaciones SQL, identificación QR (incluida entrada usada), reportes de recarga visibles/resueltos mediante funciones admin, privacidad del ticket y navegación sin sesión. Funciones originales A se reconstruyen desde el catálogo exportado; no se afirma haber ejecutado sus tres suites bloqueadas ni Auth/JWT real.
- **C:** crear solicitud, reservar, cancelar/rechazar y liberar una vez; liquidación única; compatibilidad de la reserva con presencial y venta. Se conservan sus pantallas y firmas extendidas por la implementación anterior.
- **D:** ventas con precios del servidor, saldo posterior, reintentos idempotentes, reservas, rollback e inmutabilidad de venta/líneas. Sus suites de concurrencia/inmutabilidad también pasaron en PostgreSQL real. No se modificó su código productivo.

Se corrigió además la guarda del nuevo helper de pruebas para obtener la dirección mediante `host(inet_server_addr())`: el cast a texto de inet puede incluir /32. Este fue un ajuste del instrumental de QA, sin cambiar permisos del producto ni el SQL monetario.

## E. Supabase, migraciones y aislamiento

### Preparado para el destino, no aplicado remotamente

- `supabase/migrations/202611170001_devb_saldos.sql`.
- `supabase/verificacion_devb_saldos.sql` (solo lectura posterior).

No se encontró una conexión declarada a Supabase de pruebas aislado y no se leyó ni modificó .env.local para buscar credenciales. No se conectó ni se aplicó SQL a la base principal compartida.

### Lo realmente aplicado

En cada base local nueva de las suites B se reconstruyó el catálogo histórico con `scripts/devd-catalogo-fixture.cjs` y se aplicaron:

1. `202611160000_devd_precondiciones.sql`.
2. `202611160001_devd_hu9.sql`.
3. `202611160002_devd_hu14.sql`.
4. `202611160003_devd_comercio_base.sql`.
5. `202611160004_devd_comercio_rpc.sql`.
6. `supabase/sprint3_devC_devoluciones.sql`.
7. `202611170001_devb_saldos.sql`.

Las suites D utilizan su propio fixture y las migraciones D que su script define. Ningún script reconstruyó la base real ni eliminó bases existentes. Se crearon bases nuevas con prefijos qpass_devb_test / qpass_devd_test; las siete bases de la corrida final se enumeran en postgres.json. También se conservan bases locales de ensayos previos, incluido uno detenido por la guarda del nuevo helper; no se borraron ni reutilizaron.

Se instaló el paquete de binarios portables `@embedded-postgres/windows-x64@17.11.0-beta.19` únicamente en `.next/devb-tools`, siguiendo su [documentación primaria](https://github.com/leinelissen/embedded-postgres). Clúster: `.next/devb-postgres-qa`. Escuchó solo en 127.0.0.1:5433; Windows rechazó inicialmente el puerto 55432. El servidor PostgreSQL y el servidor Next temporal quedaron detenidos al terminar, conservando bases y logs. No se instaló un servicio del sistema.

### RLS y Storage

Se probaron permisos y RLS con roles PostgreSQL anon/authenticated sin privilegios de bypass: denegación de escritura directa en finanzas, helpers privados, propiedad de reportes/históricos, roles cruzados y eventos ajenos. Las políticas SQL del bucket privado también se ejecutaron sobre la tabla storage.objects de fixture.

Esto valida las expresiones SQL reproducidas, **no las políticas efectivas del proyecto remoto ni la API Storage**. Comprobantes/fotos reales, URLs firmadas/expiración, contenido y límites efectivos del servicio requieren aceptación en Supabase aislado. Las pruebas de upload de aplicación usan mocks explícitos.

## F. Conversión temporal

Configuración única: `scripts/fixtures/devb-desarrollo.json`.

- Entorno: desarrollo_pruebas_aisladas.
- Bs por punto: **1.000000**, por tanto Bs1=1 punto.
- Referencia: temporal, exclusiva de desarrollo/pruebas y pendiente de aprobación.
- No se importó en código cliente/productivo ni en migraciones de producción.

`scripts/devb-config-pruebas.cjs` escribe la configuración únicamente en una instancia PGlite reconocida o en PostgreSQL loopback con nombre qpass_devb_test*. Rechaza NODE_ENV=production, servidor remoto, nombre de base principal y sobrescribir una configuración distinta. El nuevo escenario integral consume esa configuración.

Los importes siguen siendo texto/numeric; cada recarga y devolución conserva la tasa aplicada. Se probó que un ajuste usa la tasa histórica de la recarga, aunque cambie la tasa de la fixture. No se modificó ningún histórico ni saldo real para adaptarlo a 1:1. Las suites de regresión antiguas conservan sus ejemplos de otras tasas para comprobar compatibilidad e históricos; no configuran la aplicación ni establecen una política comercial.

El plazo de 72 horas de la fixture es también un valor de prueba, no una política de devolución aprobada. La tasa y el plazo oficiales siguen pendientes para producción.

## G. Despliegue y diez comprobaciones manuales pendientes

### Procedimiento de entorno

1. Proveer un Supabase de pruebas aislado y revisar su catálogo, migraciones instaladas, writers privilegiados y políticas Storage. No usar datos de usuarios reales.
2. Instalar los prerrequisitos A/C/D y aplicar la migración B una sola vez, respetando el orden de `DEV_B_CONTRATOS.md`. No volver a ejecutar el SQL base, seeds o scripts antiguos sobre una base compartida. Ejecutar la verificación B solo después de la migración.
3. En ese entorno aislado, el responsable puede cargar explícitamente la tasa temporal 1.000000 por evento y marcar su acuerdo como TEMPORAL PRUEBAS. No reutilizarla en producción ni sobrescribir una tasa distinta. El helper automático de este trabajo se limita a bases locales; para Supabase remoto aislado se requiere una carga administrativa revisada.
4. Crear cuentas ficticias activas con roles y eventos separados: cliente, recargador, encargado devolucion, ayudante y admin. Habilitar el vínculo negocio/evento requerido por D y configurar un plazo de prueba C.
5. Arrancar la aplicación con sus variables del entorno aislado; no exponer claves administrativas al navegador. Usar localhost o HTTPS para cámara. Completar las diez comprobaciones siguientes y registrar evidencias de aceptación.

| ID | Comprobación manual | Estado / motivo |
|---|---|---|
| M01 | Login/logout y bloqueo de roles mediante Supabase Auth/JWT real | NO EJECUTADA: no hay sesión/cuentas de Supabase aislado |
| M02 | Escáner de QR real con entrada activa, usada y de otro evento | NO EJECUTADA: falta dispositivo/entorno autenticado |
| M03 | Captura y permiso de cámara de un usuario ficticio en móvil/escritorio | NO EJECUTADA: las siete pruebas de foto usan mocks |
| M04 | Seleccionar archivo, subir y descargar comprobante/foto mediante API Storage real | NO EJECUTADA: upload probado solo con mocks y metadatos SQL |
| M05 | Acceso privado a evidencias y expiración de URL firmada a 300 segundos | NO EJECUTADA: requiere servicio Storage del destino |
| M06 | Flujo UI completo recargar Bs50 y ver confirmación/historial/reportes | NO EJECUTADA: SQL real sí aprobado; UI autenticada pendiente |
| M07 | Flujo UI D consumir 15 puntos y recuperar venta idempotente | NO EJECUTADA: SQL real sí aprobado; UI autenticada pendiente |
| M08 | Flujo UI devolver 20 puntos/Bs20 y comprobar saldo final15 | NO EJECUTADA: SQL real sí aprobado; evidencias y UI pendientes |
| M09 | UI virtual C reservar, cancelar/rechazar y liquidar una única vez | NO EJECUTADA: contratos SQL aprobados; UI autenticada pendiente |
| M10 | Verificar RLS/grants y migración B en el proyecto Supabase de destino | NO EJECUTADA: no se accedió ni aplicó SQL remoto |

Los pasos por HU y rutas se amplían en `DEV_B_PRUEBAS.md`. Estas diez comprobaciones no se cuentan como aprobadas por tener mocks o SQL equivalente.

### Reproducir automatización local

```powershell
node scripts/validar-devb-config.cjs
node scripts/validar-devb-app.cjs
node scripts/validar-devb-foto.cjs
node scripts/validar-devb-saldos.cjs
node scripts/validar-devb-integracion.cjs
npm run lint
.\node_modules\.bin\tsc.cmd --noEmit --incremental false
npm run build -- --webpack
```

Los módulos PGlite/pg se instalaron fuera de package.json, en .next/devb-tools. Para PostgreSQL, iniciar el clúster local conservado en el puerto 5433, crear **una base nueva vacía por suite**, y usar QPASS_TEST_DATABASE_URL/QPASS_PG_MODULE en la sesión de pruebas. No reutilizar las bases ya pobladas; los scripts las rechazan. Ejemplo sin contraseña ni destino remoto:

```powershell
& '.\.next\devb-tools\node_modules\@embedded-postgres\windows-x64\native\bin\pg_ctl.exe' -D '.next/devb-postgres-qa' -l '.next/devb-postgres-qa/server.log' -o '-h 127.0.0.1 -p 5433' -w start
# Crear manualmente una base local NUEVA qpass_devb_test_<sufijo> para cada ejecución.
$env:QPASS_TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:5433/qpass_devb_test_<sufijo_nuevo>'
$env:QPASS_PG_MODULE = (Resolve-Path '.next/devb-tools/node_modules/pg').Path
node scripts/validar-devb-integracion.cjs --postgres
# En otra base nueva:
node scripts/validar-devb-saldos.cjs --postgres
# En otra base nueva:
node scripts/validar-devb-concurrencia.cjs
& '.\.next\devb-tools\node_modules\@embedded-postgres\windows-x64\native\bin\pg_ctl.exe' -D '.next/devb-postgres-qa' -m fast -w stop
```

La inicialización local usa confianza de conexión solo para este clúster de pruebas en loopback; no es configuración de producción. Para las suites D se exige el prefijo qpass_devd_test*. Todas estas ejecuciones locales necesitan capacidad de crear roles/objetos con el usuario postgres de la fixture.

## H. Pendientes y responsables

| Prioridad | Pendiente | Responsable |
|---|---|---|
| Alta | Proveer Supabase aislado, aplicar/verificar migraciones y ejecutar M01/M04/M05/M10 | Equipo / responsable Supabase, con B |
| Alta | Acordar tasa oficial y política de redondeo para producción | Equipo; B documenta/consume la configuración |
| Alta | Completar aceptación autenticada M06–M09 | B con A/C/D en entorno aislado |
| Media | Cámara y QR reales M02/M03 | B y QA con dispositivos de prueba |
| Media | Restituir el SQL base de referencia o adaptar tres suites A a un fixture mantenido | Dev A / responsable del repositorio |
| Media | Investigar fallo de Turbopack/PostCSS del entorno; Webpack ya compila | Responsable de entorno/tooling |
| Media | Acordar plazo oficial de solicitudes virtuales y retención de evidencias huérfanas | Equipo / C y B |
| Baja | Import Button sin uso, warning preexistente sin impacto en B | Responsable de la página eventos |

No hay una dependencia pendiente de nuevo código A/C/D para el escenario SQL probado. Sí faltan validación del despliegue remoto y aceptación de sus servicios/pantallas integrados.

## I. Conclusión y Git

- **Listo para revisión de compañeros: SÍ.** Código, contratos y pruebas reproducibles disponibles; regresión de incertidumbre corregida.
- **Listo para iniciar pruebas de aceptación en entorno aislado: SÍ**, cuando se provisionen cuentas/servicios y se apliquen los prerrequisitos. **Aceptación final aprobada: NO**; faltan M01–M10.
- **Listo para despliegue productivo: NO.** Tasa/plazo oficiales, validación Supabase y aceptación reales pendientes; el build predeterminado aún requiere resolver el problema de entorno o aprobar explícitamente Webpack en el proceso de despliegue.
- **Bloqueado en implementación SQL/concurrencia local: NO.** El núcleo y la concurrencia requerida ya se probaron contra PostgreSQL real.

Se mantiene Bullain y el HEAD inicial; los cambios están sin preparar. No se hizo commit, push, merge, rebase, reset, cambio de rama ni git add. No se modificó .env.local ni se sobrescribieron funcionalidades de compañeros. El único ajuste compartido nuevo es la extensión opcional y compatible de FotoAcceso.

Mensaje de commit recomendado:

```text
fix(dev-b): preservar intentos inciertos y validar saldos con PostgreSQL aislado
```
