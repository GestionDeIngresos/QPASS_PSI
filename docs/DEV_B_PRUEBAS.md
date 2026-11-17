# QPass · Dev B · pruebas y aceptación

> La fase de QA ya terminó: consultar [DEV_B_REPORTE_FINAL.md](DEV_B_REPORTE_FINAL.md) para resultados vigentes (456 ejecuciones aprobadas, PostgreSQL real y 9 verificaciones HTTP) y pendientes. Este documento conserva las instrucciones y resultados de la fase de implementación; sus referencias a concurrencia no ejecutada son históricas. Configuración temporal aislada: `scripts/fixtures/devb-desarrollo.json`, Bs1=1 punto; nunca producción.

## Preparación

Usar la rama actual Bullain. Instalar dependencias del proyecto con `npm ci` si no existen. No ejecutar SQL base, seeds remotos ni reinicios de base. Las pruebas SQL descritas abajo crean fixtures únicamente en una base en memoria o una base LOCAL nueva y vacía.

Para reproducir las pruebas aisladas sin cambiar package.json/lockfiles:

```powershell
npm install --prefix .next/devb-tools --no-save --package-lock=false --no-audit --no-fund @electric-sql/pglite pg
node scripts/validar-devb-saldos.cjs
node scripts/validar-devb-app.cjs
```

Resultados ejecutados: **27 pruebas SQL y 15 de aplicación correctas**. No llaman a Supabase remoto. La suite SQL reconstruye el catálogo histórico exportado SOLO en memoria, aplica D 000–004, C devoluciones y B; no usa credenciales. Carga tasa ficticia exclusivamente en esa fixture y la distingue de una tasa real acordada.

Validación del proyecto ejecutada:

```powershell
npm run lint
.\node_modules\.bin\tsc.cmd --noEmit --incremental false
npm run build -- --webpack
```

Lint sin errores; advertencia preexistente por Button sin uso en app/eventos/[id]/page.tsx:6. Lint específico de los archivos B sin advertencias. TypeScript correcto y build Webpack correcto. Turbopack falla con error interno de proceso/PostCSS en este entorno; no se alteró la configuración para ocultarlo. Next advierte además que middleware.ts está deprecado en favor de proxy.ts.

## Regresión ejecutada

Se ejecutaron con Node y finalizaron con exit 0:

| scripts/validar-*.cjs | Casos declarados por la suite |
|---|---:|
| base-ayudante | 22 |
| carrito-ayudante | 31 |
| comercio-app-devd | 17 |
| compra-terceros | 33 |
| lecturas-ventas | 34 |
| recuperacion | 18 |
| reportes-entrada | 31 |
| ticket-pdf | 5 escenarios |
| preparacion-integracion | 6 |
| auditoria-003 | 4 |
| integracion-real-devd | 26 |
| guardas-comercio-devd | 5 |
| decision-003 | 28 |

Para las suites PGlite anteriores, indicar su módulo aislado en la misma sesión de PowerShell:

```powershell
$env:QPASS_PGLITE_MODULE = (Resolve-Path '.next/devb-tools/node_modules/@electric-sql/pglite').Path
node scripts/validar-integracion-real-devd.cjs
node scripts/validar-guardas-comercio-devd.cjs
node scripts/validar-decision-003.cjs
```

Los nombres históricos de las suites no significan que se validó Supabase real. Sus fixtures/SQL son locales. Las suites de A `validar-qr.cjs`, `validar-supervisor.cjs` y `validar-pagos-prueba.cjs` se intentaron ejecutar y fallaron por ENOENT: falta `ARCHIVOS CONTEXTO IA/qpass-bd 1.sql` en el repositorio. Se conserva ese pendiente preexistente.

## Concurrencia real: ejecutada en la fase de QA posterior

En la fase de implementación faltaba servidor PostgreSQL y el script informó SKIP. En QA se provisionó un clúster portable local aislado, y las seis carreras B aprobaron con espera de bloqueos observada. El reporte final contiene las versiones, bases, comandos y resultados. Las instrucciones siguientes permiten repetirlas en una base nueva.

Con PostgreSQL local instalado, crear manualmente una base **nueva y vacía** llamada `qpass_devb_test` (o con sufijo). La suite rechaza hosts remotos y nombres ajenos; no borra/reinicia bases:

```powershell
# Configurar una conexión LOCAL con el usuario de pruebas; no registrar su contraseña en Git.
$env:QPASS_TEST_DATABASE_URL = '<conexion-local-a-qpass_devb_test>'
node scripts/validar-devb-concurrencia.cjs
```

La suite prepara fixtures en esa base vacía y abre dos transacciones, observando espera real de bloqueo. Casos: mismo UUID de recarga; dos recargas distintas; recarga/venta; venta/devolución; reserva C/devolución presencial; dos liquidaciones virtuales. Conserva la base de pruebas al terminar. `node scripts/validar-devb-saldos.cjs --postgres` permite también ejecutar los casos secuenciales en otra base local nueva y vacía.

## Prueba HTTP ejecutada

Se arrancó temporalmente el build con `npm run start -- --hostname 127.0.0.1 --port 3101`. Se verificó sin cookies de sesión que estas ocho rutas respondieran 307 a /login, con parámetro next incluyendo ruta y query:

`/recargador`, `/recargador/historial`, `/recargador/reportes`, `/devolucion`, `/devolucion/historial`, `/devolucion/solicitudes`, `/mi-cuenta/saldos`, `/mi-cuenta/ticket-extraviado`.

`/login` devolvió 200 y el formulario. Se detuvo el servidor al finalizar. El aislamiento de red del entorno impidió inicialmente el acceso a loopback; las verificaciones finales se realizaron con servidor y peticiones locales fuera de esa restricción. No se certificó navegación autenticada con una cuenta real.

## Despliegue manual antes de aceptación

1. Revisar `DEV_B_CONTRATOS.md`, esquema vigente y migraciones ya instaladas. Aplicar únicamente `supabase/migrations/202611170001_devb_saldos.sql` cuando estén A QR/reportes, D 000–004 y C devoluciones.
2. Ejecutar `supabase/verificacion_devb_saldos.sql`. Todos los booleanos correcto deben ser true. Comparar reservas con solicitudes activas **sin liquidada_en**.
3. El equipo debe acordar y configurar devb_conversion.bs_por_punto por evento y el plazo C si se probarán solicitudes virtuales. No usar los valores ficticios de los tests como política real.
4. Tener cuentas activas separadas: cliente con entrada/pago confirmado; recargador asignado; encargado devolucion asignado; ayudante y negocio/evento habilitados; admin. Usar otro evento y otro cliente para probar denegaciones. No compartir cuentas administrativas ni copiar claves al navegador.
5. Arrancar `npm run dev` o usar `npm run build -- --webpack` y `npm run start`. Para cámara usar localhost o HTTPS y otorgar permiso del navegador.

## Aceptación desde el navegador (pendiente de entorno real)

1. **HU36/37:** ingresar como recargador a `/recargador`, elegir evento y escanear/pegar QR. Probar entrada activa y usada con identificación válida: ambas identifican sin volver a registrar acceso. Revisar nombre, total/reservado/disponible. Ingresar Bs simulados compatibles con la tasa; revisar y confirmar. Ver referencia, puntos e importe persistidos. Sin tasa debe poder consultar identidad/saldo pero no confirmar recarga.
2. **HU38:** abrir `/recargador/historial`, filtrar evento y verificar operación, fecha Bolivia y paginación. Otro recargador no debe ver operaciones ajenas.
3. **HU39:** desde una recarga propia abrir Reportar o corregir. Enviar reporte; en `/admin/reportes`, tipo recarga, debe aparecer. Ajustar explícitamente el importe total con motivo; original se conserva y aparece delta. Intentar anular luego de consumir/reservar los puntos: debe rechazarse y permitir reportar.
4. **HU40:** abrir `/recargador/reportes`; comprobar pendiente. Resolver desde admin, volver y comprobar solucionado sin ningún cambio de saldo. Probar Ver anteriores si hay más de 100.
5. **HU16:** ingresar como cliente a `/mi-cuenta/saldos`; debe mostrar exclusivamente sus eventos, total, reservado y disponible. No suministra ids de otros usuarios.
6. **HU15:** en `/mi-cuenta/ticket-extraviado`, indicar evento y escanear una manilla física vinculada. Cliente propio recibe solo su entrada/evento/estado; otro cliente obtiene respuesta neutral. Staff autorizado del evento obtiene únicamente nombre, entrada/evento/estado. No emite reemplazos ni muestra CI/correo/UUID.
7. **HU46/47:** ingresar como encargado a `/devolucion`, identificar QR y comprobar disponible. Probar QR inválido, impago, anulado, evento ajeno y cuenta inactiva. Recargador no debe poder abrir/ejecutar devoluciones y encargado no debe poder recargar.
8. **HU48:** indicar puntos disponibles, revisar, adjuntar comprobante SIMULADO y foto del usuario (cámara móvil o archivo). Confirmar y revisar referencia/importe simulados. Sin archivo, con archivo ajeno/incorrecto o saldo reservado no debe registrarse. Los archivos se mantienen privados y no se reemplazan dentro del mismo intento.
9. **HU49:** abrir `/devolucion/historial`, filtrar evento y comprobar referencias, montos, fotos/comprobantes con URLs de 300 segundos. Ninguna evidencia debe tener URL pública permanente ni poder consultarse con otro operador.
10. **Integración C:** solicitar devolución virtual propia al finalizar evento y dentro del plazo; verificar reserva en Mis saldos. No podrá consumirse en venta D ni devolución presencial. Desde `/devolucion/solicitudes`, confirmar una liquidación simulada: debe liberar reserva, debitar una vez y aparecer en el historial. Repetir la misma solicitud devuelve la misma referencia. Rechazar o cancelar antes de liquidar libera reserva sin descontar saldo.
11. **Reintentos/concurrencia:** cortar respuesta de red después de confirmar; recargar página, usar Recuperar intento pendiente y reintentar. Debe conservar UUID/payload y no acreditar/debitar otra vez. La UI bloquea editar/cancelar un resultado incierto. Ejecutar además la suite PostgreSQL con dos conexiones para certificar carreras, no solo pruebas de navegador.

## Pendientes que no se presentan como completos

No se aplicó ninguna migración remota ni se configuró tasa/plazo. No hay transferencias bancarias reales, datos ficticios en UI de producción ni credenciales administrativas nuevas. Faltan pruebas autenticadas con Supabase, políticas Storage efectivas del destino, dispositivos/cámara y concurrencia PostgreSQL. No se hicieron commits, push, merge, rebase ni cambios de rama.
