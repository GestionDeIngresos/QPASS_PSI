# QPASS — revisión final de las migraciones 000–004

**Dictamen: no aplicar todavía el paquete comercial completo.**

> Actualización HU61: **R1 corregido** en la edición local actual de 004. El defecto
> se reprodujo antes de corregirlo y ya no se reproduce en las regresiones. Consultar
> [CORRECCION_HU61_INMUTABILIDAD.md](CORRECCION_HU61_INMUTABILIDAD.md) y
> `manifest-hu61-corregida.json` para el estado y hashes vigentes. 003 sigue bloqueada.
> Las descripciones del fallo y hashes anteriores documentan la revisión previa.
Rama confirmada: **Aliaga**. Se leyó AGENTS.md, las cinco migraciones completas,
el informe de entrega y todas las secciones del catálogo del 16/11/2026.
Las cinco migraciones y los 29 archivos del manifiesto anterior permanecen sin
modificar. Esta revisión agrega consultas, pruebas y documentación; no corrige
silenciosamente los archivos revisados.

No hubo conexiones ni cambios a Supabase remoto, commit o push. Los SQL se
ejecutaron únicamente en PostgreSQL 17.11 local, con datos ficticios. El catálogo
es evidencia del momento exportado, no una comprobación del estado remoto actual.

Fuente: `qpass_catalogo_supabase_2026-11-16.json`.
SHA-256 comprobado: `dbee7ad1fa7f95ea7741d7e61eca365f174caa1087adc781f58c9718574c4a07`.
Se verifican 25 funciones originales, sus firmas, cuerpos normalizados,
propietarios, SECURITY DEFINER, search_path, ACL y EXECUTE efectivo tras cada paso.
No se sustituyen las definiciones reales por las versiones locales antiguas.

## Tabla de decisión

«Lista» significa compatible técnicamente para una primera aplicación sobre el
catálogo revisado, después de respaldo, comprobación de deriva y revisión humana.
No significa autorización de ejecución remota ni aprobación general de B/C.

| Migración | Objetos que crea o modifica | Compatibilidad | Riesgos | Pruebas realizadas en esta revisión | Estado |
| --- | --- | --- | --- | --- | --- |
| **000 — precondiciones** | Consultas de catálogo y bloque DO; no persiste objetos/datos. | Coincide con tipos críticos, RLS, unicidad y cuatro RPC de A del exportado. | Verificación parcial: no contrasta todos los cuerpos/ACL, todos los tipos, ni nuevas RPC financieras; complementar con catálogo nuevo y control 90. | Primera ejecución, repetición sobre esquema previo, consulta posterior y comparación de las 25 funciones. | **Lista** como control inicial. |
| **001 — HU 9** | Dos RPC; altera política SELECT de entradas; agrega política RESTRICTIVE y revoca DML directo. | Comprador conserva resumen sin QR; destinatario activo conserva QR. Las 25 funciones previas, incluidas compras/QR de A/C, quedan intactas. | Clientes antiguos que leían entradas regaladas del comprador deben usar el resumen. No es reejecutable completa por CREATE POLICY. Bloqueo DDL breve sobre entradas. | Compra/regalo, comprador sin QR, resumen, destinatario con QR, permisos y política permisiva adicional; firmas/cuerpos/ACL A intactos. | **Lista** para primera aplicación. |
| **002 — HU 14** | solicitud_id UUID e índice único; dos RPC; política propia sin GRANT SELECT de tabla; revocación de acceso directo. | Listado y resolución de Admin A se conservan; reporte propio de comprador/destinatario sin alterar QR/estado. | ALTER TABLE bloquea; índice no concurrente puede tardar. IF NOT EXISTS no valida objetos previos equivalentes. CREATE POLICY impide repetición completa. | Reportes propios/ajenos, idempotencia, resolución/listado Admin A y verificación posterior. | **Lista** para primera aplicación. |
| **003 — comercio base** | negocios_eventos; columnas ventas/items; índices; reservado y CHECK; triggers de reservas/saldo; SELECT de catálogo y revocaciones financieras. | Reutiliza las tablas reales. No reemplaza RPC financieras de débito del catálogo: no existen en public. | Contrato de reserva no aprobado por B; liquidación no implementada; C debe aceptar negocio-evento y unidad precio/puntos. Actualiza TODAS las filas de saldos_puntos.reservado y mantiene bloqueos DDL. | Compilación, ACL/RLS, saldo reservado, inicialización sin débito, rechazo/rollback por devolución heredada, reserva excesiva o saldo ausente. | **Bloqueada** para producción hasta coordinación y conciliación B/C. |
| **004 — comercio RPC, corregida** | RPC y helpers; bloqueo de cabecera; validadores de suma/históricos/DTO; dos triggers diferidos y límites de service_role. | Conserva el cobro atómico/idempotente y funciones de A. Depende de 003. | R1 ya no se reproduce. Mantiene restricciones a writers privilegiados y no habilita producción por sí sola. | 26 SQL, 5 carreras, 19 de integridad y regresión original corregida. | **Lista técnicamente**, condicionada a 003 y revisión del paquete. |

## Hallazgos que impiden aprobar todo el paquete

### R1 — carrera original en inmutabilidad de líneas (004), corregida

`devd_proteger_venta_confirmada()` consulta el estado de la cabecera sin bloquearla.
Una venta pendiente creada y confirmada en transacciones separadas por escritores
privilegiados puede sufrir esta secuencia:

1. La cabecera pendiente ya es visible; sus líneas suman 2.50.
2. Conexión A actualiza confirmada_en; todavía no hace COMMIT.
3. Conexión B con service_role inserta otra línea de 1.25. Su trigger ve la versión
   anterior, pendiente, y permite la inserción. No serializa con la confirmación.
4. Ambas transacciones confirman. Cabecera total=2.50; líneas=3.75.

Reproducido en PostgreSQL 17.11 con conexiones independientes por
`scripts/revisar-final-migraciones-devd.cjs`. Una línea contra una venta NUEVA
todavía no visible sí fue rechazada por la FK; ese primer caso no es el defecto.

**Alcance:** no se reprodujo un débito duplicado en cobrar_venta ni un acceso desde
anon/authenticated. El defecto afecta la garantía de inmutabilidad frente a
escritores privilegiados que mantienen ventas pendientes entre transacciones,
posibilidad relevante porque sus GRANT se conservan para integrar B/C.

La edición revisada entonces requería serializar cambios de líneas y
confirmación sobre la cabecera, comprobar ambos padres al mover una línea en
orden estable, y validar total/históricos/respuesta al confirmar. Puede optarse
por restringir todos los escritores de tablas a RPC revisadas con un rol de
escritura dedicado, si el equipo lo acuerda. Repetir la carrera exigiendo rechazo
o una serialización consistente. La corrección posterior ahora implementa esas
barreras; ver el informe HU61 enlazado al inicio para código y resultados vigentes.

### R2 — semántica financiera y compatibilidad B/C (003)

El catálogo público contiene tablas financieras y una referencia de lectura a
recargas desde listar_reportes_admin. **No contiene RPC que debiten/recarguen saldo
ni triggers financieros existentes.** No se encuentra, por tanto, una función
financiera pública instalada que 003/004 sobrescriban. El catálogo no inventaría
pantallas, Edge Functions, servicios externos ni otros esquemas: esos escritores
deben inventariarse con B/C antes de certificar compatibilidad de toda la solución.

Contrato propuesto: saldo es total sin descontar reservas; en_revision/aprobada
reservan monto completo; rechazada libera. No hay liquidación de devoluciones
pagadas. Mantener aprobadas reservadas protege fondos, pero puede impedir gastos
indefinidamente; no marcar pagadas como rechazadas para liberar dinero.

003 aborta ante **cualquier fila** en devoluciones, no solo ante devoluciones
pendientes, y ante reservas sin saldo o superiores al saldo. No hay filas reales
en el catálogo: esas puertas deben medirse antes de 003. Incluso si las puertas
dan cero, B debe confirmar que no descontó ya reservas por otro mecanismo.

Los cambios actúan al instalar 003, aunque QPASS_COMERCIO_REAL esté apagada:
revoca DML de usuarios normales, instala invariantes y reserva fondos existentes.
También impide borrar solicitudes, cambiar usuario/evento del saldo y modificar
reservado por una actualización directa de primer nivel. Estos contratos pueden
chocar con writers futuros o externos de B/C. La protección por profundidad de
trigger detecta accidentes; no es un límite frente a un escritor privilegiado.

### R3 — límites de reejecución

Las migraciones no son SQL idempotente para repetir indiscriminadamente. Su
seguridad ante una segunda aplicación es **abortar y revertir toda la versión**:

| Archivo | Resultado al repetir |
| --- | --- |
| 000 | Se repite sin cambios sobre el esquema previo; después de 003/004 rechaza triggers nuevos. Entre 001 y 002 puede seguir pasando, porque es un guard parcial. |
| 001 | Error al recrear devd_entradas_destinatario_limite; ROLLBACK revierte los CREATE OR REPLACE anteriores. |
| 002 | IF NOT EXISTS reutiliza columna/índice por nombre; luego falla CREATE POLICY y revierte la versión. No garantiza tipo/definición si se ejecutan fragmentos. |
| 003 | Error por negocios_eventos ya existente; no reinstala reservas ni debita saldo. |
| 004 | Error por trigger ya existente; revierte sus reemplazos de función previos. |

Se probaron los cinco rechazos después de la instalación completa y se compararon
funciones, políticas, columnas, saldos y cantidades de ventas/líneas antes/después:
sin cambios parciales. Repetir 000 sobre el estado inicial también se probó.

Aplicar cada versión una sola vez y registrar versión/hash/resultado. Si se usa
Supabase CLI, revisar antes el historial real de migraciones; no marcar aplicada
una versión fallida. Si se usa SQL Editor, usar archivos completos con sus
BEGIN/COMMIT y, ante error, comprobar ROLLBACK de esa sesión antes de continuar.
Los psql con ON_ERROR_STOP y cierre de conexión también revierten una transacción
sin COMMIT. Nunca proseguir con la versión siguiente tras un error.

## SECURITY DEFINER, EXECUTE, RLS y bandera

- Las RPC nuevas usan search_path vacío y relaciones calificadas, con identidad
  tomada de auth.uid(). El propietario esperado/aplicador es postgres. No reciben
  del navegador un usuario o cobrador que autorice la operación.
- Las funciones originales mantienen cuerpos, firmas, propietarios, ACL y EXECUTE.
  es_admin() conserva la limitación previa de no comprobar activo; no se endurece
  a escondidas el contrato de A. HU14 probó listado y resolución con admin activo.
- 001/002 revocan PUBLIC/anon, conceden authenticated y conservan EXECUTE heredado
  de service_role. Las RPC financieras de 004 revocan también service_role y solo
  conceden authenticated. Los helpers internos de 003/004 no son ejecutables por
  roles de API, salvo devd_negocio_autorizado, booleano necesario para RLS.
- Después de 003, **anon y authenticated, incluido un administrador con ese rol
  SQL, no pueden escribir directamente precios, saldos ni ventas**. Se probaron
  UPDATE e INSERT reales denegados, además de privilegios efectivos por columna.
  No hay una RPC pública del catálogo que permita eludirlo para esas tablas.
- **service_role y postgres siguen siendo privilegiados.** El primero conserva
  DML sobre tablas comerciales/saldos; por eso no sería correcto afirmar que
  «ningún cliente, bajo ninguna clave» puede cambiar precios o dinero. No se usa
  service_role en el cobro de la aplicación y su clave no debe llegar al navegador.
  Propietarios y BYPASSRLS pueden omitir RLS, como documenta
  [PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).
- El límite RESTRICTIVE de HU9 impide que otra política permisiva reabra QR al
  comprador. Su resumen sigue autorizado y no incluye QR o identidad del destino.
  El destinatario activo puede leer su QR; sus eventos/tickets siguen sujetos a
  las políticas previas de visibilidad de A/C.
- HU14 revoca acceso directo y usa RPC. La política propia existe sin GRANT SELECT;
  es intencional. Las funciones administrativas definer acceden como postgres.
- El código compara QPASS_COMERCIO_REAL con el literal true; ausente queda apagada.
  Se comprobó que no está definida en .env.local y no está activa en el entorno
  heredado de estas pruebas. El estado de variables del despliegue no se conoce.
  La bandera **no deshabilita una RPC directa**. Negocios_eventos empieza vacío
  y activo=false por defecto; ese cierre SQL también debe conservarse.

El cobro normal valida QR digital/físico, entradas activas/usadas, compra confirmada,
cuenta y asignaciones, negocio/evento, disponibilidad y precios bloqueados. Usa
saldo-reservado y una fila de saldo bloqueada para cobros y reservas concurrentes.
Solicitud/cobrador y selección canónica impiden repetir débito con la misma clave.
Una UUID nueva representa otra venta: después de una recarga de página con resultado
incierto hay que consultar el historial; la UI no conserva el intento tras cerrarla.

## Bloqueos y datos existentes

| Versión | Bloqueos/efectos previstos |
| --- | --- |
| 000 | Lecturas de catálogos y locks de lectura normales; no modifica datos ni toma locks DDL de tablas de negocio. Puede esperar DDL ajeno. |
| 001 | ALTER TABLE ENABLE RLS y cambios de política/ACL toman locks de catálogo/relación; ENABLE RLS puede requerir ACCESS EXCLUSIVE sobre entradas hasta COMMIT, aunque ya esté activado. No cambia sus filas. |
| 002 | ADD COLUMN requiere ACCESS EXCLUSIVE sobre reportes_entrada. CREATE INDEX UNIQUE sin CONCURRENTLY puede bloquear escritores y recorrer la tabla. No rellena solicitudes históricas. |
| 003 | ALTER TABLE sobre ventas, venta_items y saldos puede bloquear lecturas/escrituras hasta COMMIT. Tiene LOCK explícito SHARE ROW EXCLUSIVE en solicitudes/saldos, luego UPDATE de todas las filas de reservado y validación CHECK. Índices no concurrentes. Genera WAL y versiones de fila. No modifica el valor de saldo ni certifica ventas antiguas. |
| 004 | CREATE TRIGGER, ALTER TABLE CHECK y validación sobre ventas/venta_items requieren locks que pueden bloquear escritores y, para ALTER TABLE, lectores. No hace backfill. Los locks por fila/advisory del cobro ocurren al llamar la RPC, no al definirla. |

lock_timeout=3s y statement_timeout=30s abortan la sentencia/versión cuando se exceden;
no acortan mágicamente las esperas acumuladas de todo el paquete. No hay prueba de
carga/volumen real. Medir tamaños y transacciones largas con la consulta 00; usar
ventana de mantenimiento de escritores B/C. No eliminar guards para forzar avance.
Referencia de modos y duración: [bloqueos PostgreSQL 17](https://www.postgresql.org/docs/17/explicit-locking.html).

## Orden y prueba inmediata después de cada archivo

**000 → 001 → 002 → 003 → 004 es correcto por dependencias.**
002 no necesita 001 para crear reportes, pero el orden propuesto permite comprobar
el flujo completo del regalo. 004 necesita las columnas, índices, acumulado y
helper de 003. No sustituir archivos por los SQL antiguos de D/A/C.

Se agregaron seis consultas autónomas en `supabase/verificacion-devd/`, todas con
BEGIN READ ONLY y ROLLBACK, sin modificaciones a datos ni llamadas de cobro.

| Después de | Consulta de lectura inmediata | Aceptación funcional en clon/cuentas autorizadas |
| --- | --- | --- |
| 000 | `00_tras_000.sql` y `90_funciones_originales.sql` | Todas las filas correcto=true; revisar puertas comerciales, tamaños y sesiones largas. Las puertas con datos no invalidan HU9/HU14, pero bloquean 003. |
| 001 | `01_tras_001.sql` y `90_funciones_originales.sql` | Comprador de regalo abre resumen sin QR; destinatario activo ve su entrada; usuario ajeno no ve compra/QR. |
| 002 | `02_tras_002.sql` y `90_funciones_originales.sql` | Comprador/destinatario reportan con UUID; reintento devuelve mismo ID; admin lista y resuelve; autor ve solucionado y QR/estado no cambian. |
| 003 | `03_tras_003.sql` y `90_funciones_originales.sql` | Sin pares activos; reservado coincide con solicitudes; saldo intacto respecto al respaldo; usuarios normales no actualizan producto/saldo/venta. No habilitar cobros. |
| 004 | `04_tras_004.sql`, `90_funciones_originales.sql` y verificación 30 existente | ACL y constraints correctos. Después de corregir R1, ejecutar carreras de cobro/reserva e inmutabilidad. Probar reintento, historial/comprobante y métricas. No aprobar solo porque los SELECT de metadatos den true. |

90 compara las 25 funciones originales, no solo existencia/firma. Su MD5 de
definición normalizada es un control de igualdad; los hashes SHA-256 de archivos
siguen en el manifiesto anterior. Si falta un objeto o correcto=false, detener
avance y revisar; no convertir el resultado esperado en una escritura automática.

## Respaldo y recuperación concretos

Procedimiento separado: [RESPALDO_RECUPERACION_DEVD.md](RESPALDO_RECUPERACION_DEVD.md).
Incluye congelación de escritores, respaldo verificado, evidencia de catálogo,
servicios libpq sin contraseñas en comandos, ensayos de restauración, y acciones
distintas para una versión fallida o un error después de COMMIT. No se ejecutó.

## Pruebas ejecutadas en esta revisión

| Suite | Resultado |
| --- | --- |
| `revisar-final-migraciones-devd.cjs` | 15 comprobaciones: manifiesto, cinco etapas/consultas/25 funciones, reejecución/rollback, DML denegado y alcance privilegiado. Además reproduce R1; salida explícita NO aprobación. |
| `validar-integracion-real-devd.cjs --postgres` | 26 escenarios aprobados en PostgreSQL 17.11 local. |
| `validar-concurrencia-devd.cjs` | 5 carreras de cobros/reservas/rollback aprobadas con conexiones independientes, incluido otro ayudante. |
| `validar-guardas-comercio-devd.cjs` | 5 escenarios aprobados en base en memoria. |
| `validar-comercio-app-devd.cjs` | 17 escenarios aprobados con sesión/RPC simuladas, incluidos flag apagado y resultado incierto. |
| ESLint de los dos scripts nuevos y git diff --check | Sin errores. |

No se repitió build/TypeScript porque no cambió código de aplicación ni SQL de las
cinco migraciones; ya estaban aprobados en la entrega anterior. Las nuevas consultas
se ejecutaron y comprobaron localmente, etapa por etapa. No se probó restauración
de un respaldo real ni el volumen, PostgREST/Auth/Storage o variables del despliegue
remoto. El servicio PostgreSQL temporal se detuvo al finalizar.

## Condiciones antes de activar cobros

1. Corregir R1 y repetir pruebas de inmutabilidad, integrales y concurrencia.
2. Acordar con B el modelo de saldo/reservas y liquidación atómica de devoluciones,
   o excluir explícitamente ese flujo del piloto y garantizar que no habrá writers
   de devolución mientras opere con reserva conservadora.
3. C confirma unidad precio/puntos, relación negocio-evento, permisos y escritores.
4. Verificar catálogo nuevo contra el exportado y consumidores externos; todas las
   puertas de datos de 003 deben ser compatibles sin reparaciones automáticas.
5. Respaldo recuperable y restauración ensayada; migraciones registradas una vez y
   consultas posteriores sin inconsistencias. Resolver filas históricas por separado.
6. Probar permisos con JWT normales vía la API real en clon, incluidos usuario
   ajeno, ayudante desactivado, negocio/evento no autorizado y QR de terceros.
7. Solo entonces habilitar pares reales revisados y QPASS_COMERCIO_REAL=true.
   Para cortar, apagar flag y desactivar pares SQL; esperar transacciones en curso.
   No poner service_role en el navegador ni eludir el cobro SQL con escrituras separadas.

Se entrega el informe y se detiene el trabajo. Ninguna migración remota está autorizada
o ejecutada por esta revisión.
