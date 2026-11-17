# Detección financiera pre-003: riesgo, incertidumbre y ausencia de vínculo detectado

Revisión del 17/11/2026 en Aliaga, con AGENTS.md leído. Este informe actualiza las
conclusiones de CORRECCION_FALSOS_POSITIVOS_DECISION_003.md. No se ejecutó SQL remoto.

## Causa

La consulta trataba cualquier EXECUTE o cuerpo SQL preanalizado como escritor
financiero, sin exigir una relación con QPass. Eso confunde infraestructura de
Supabase con escritura financiera comprobada. Además, la copia local encontrada
al iniciar esta revisión todavía contenía la búsqueda amplia de EXECUTE, aunque
el script de pruebas ya tenía casos de la corrección de permisos anterior.
La distinción GRANT/REVOKE EXECUTE ON FUNCTION queda incorporada en esta versión.

Las funciones señaladas por el usuario son:

| Función oficial revisada | Comportamiento | Clasificación automática |
| --- | --- | --- |
| realtime.apply_rls(jsonb, integer) | Obtiene la relación desde el WAL, consulta permisos/suscripciones y prepara/ejecuta comprobaciones RLS. Las palabras INSERT/UPDATE/DELETE también aparecen como valores del WAL. | NULL: SQL dinámico; relaciones, políticas y funciones indirectas requieren revisión. No se afirma que debite puntos. |
| realtime.cast(text, regtype) | Construye dinámicamente una conversión a JSONB del tipo recibido. | NULL: tipos/casts/funciones de conversión no quedan demostrados por un escaneo estático. IMMUTABLE no se usa como certificado. |

Fuentes primarias de los cuerpos utilizados:

- [Supabase Realtime: cast](https://github.com/supabase/realtime/blob/main/lib/realtime/tenants/repo/migrations/20260218120000_fix_bytea_double_encoding_in_cast.ex).
- [Supabase Realtime: apply_rls](https://github.com/supabase/realtime/blob/main/lib/realtime/tenants/repo/migrations/20260709120000_fix_apply_rls_filter_role_leak.ex).
- [PostgreSQL: dependencias de cuerpos de texto y SQL preanalizado](https://www.postgresql.org/docs/17/ddl-depend.html).

Los cuerpos oficiales y hashes de los archivos descargados están conservados en
scripts/fixture-supabase-realtime-003.json. No se ha obtenido ni comparado el cuerpo
instalado remotamente; las pruebas no suponen que esa versión sea idéntica. En
producción la consulta analiza el prosrc y las dependencias de los objetos reales.

## Corrección

La fila existente de funciones conserva su nombre y ahora calcula:

- FALSE: hay evidencia textual de DML estático dirigido explícitamente a una de
  las seis tablas financieras public (saldos_puntos, solicitudes_devolucion,
  devoluciones, recargas, ventas, venta_items). Se informa como RIESGO y se debe
  revisar la alcanzabilidad del código; no implica que ya se haya ejecutado.
- NULL: hay SQL dinámico, implementación opaca, quoting no resuelto, acceso
  financiero o una cadena hacia un objeto de riesgo/indeterminado. Una lectura
  o dependencia no se etiqueta automáticamente como escritura.
- TRUE: no se detectó riesgo ni incertidumbre en el alcance del analizador.
  Los cuerpos clasificados sin relación detectada NO son una certificación global
  de seguridad. No se infiere aprobación de contratos desde tablas vacías.

FALSE tiene precedencia sobre NULL. El resultado técnico conserva esa misma
precedencia. El resultado final continúa FALSE ante fallos técnicos, y NULL
cuando se requiere revisión, sin forzar TRUE.

Se inspeccionan todos los procedimientos/funciones con OID normal instalado
(FirstNormalObjectId, 16384). Se incluyen miembros de extensiones, funciones en
esquemas del sistema creadas posteriormente, SECURITY DEFINER y todos los
propietarios. No hay lista de nombres/esquemas confiables. Las rutinas bootstrap
de PostgreSQL forman el límite del análisis; modificar el motor o sus rutinas
internas como superusuario queda fuera de este control.

Se usan OIDs de catálogos, no resolución de nombres de objetos futuros. Se siguen:

- pg_depend para funciones, relaciones, operadores y tipos; pg_rewrite para vistas
  y reglas; pg_policy para funciones de políticas; pg_trigger para activaciones.
- Claves foráneas con CASCADE/SET NULL/SET DEFAULT; funciones de operadores,
  funciones de E/S de tipos, tipos compuestos/dominios y funciones de casts.
- Referencias textuales a relaciones y llamadas, para complementar PL/pgSQL y
  cuerpos SQL de texto cuyas dependencias no registra PostgreSQL. Las llamadas
  no cualificadas consideran posibles sobrecargas, no presumen search_path.

El recorrido recursivo usa UNION para terminar incluso con ciclos. Una dependencia
no prueba una llamada ejecutable ni escritura: se informa como revisión.
Se eliminan conjuntamente comentarios y literales simples antes de buscar DML.
Dollar quoting y escapes E se marcan como inconclusos para no afirmar escritura
basándose en un literal que el lexer reducido no haya entendido.

El detalle muestra conteos por categoría y las firmas/motivos de los casos de
riesgo o revisión, con lenguaje, propietario, SECURITY DEFINER y extensión.
Se mantienen **29 filas**, una sola tabla y las columnas originales
comprobacion/correcto/detalle. Las demás verificaciones permanecen activas.

## Validación local

27 pruebas aprobadas en PostgreSQL local 17.11 y 27 en PGlite, sobre el catálogo
exportado reconstruido ANTES de 003. No se instalan 000–004 en estas pruebas.
Cada evaluación del SQL de decisión se ejecuta en BEGIN READ ONLY / ROLLBACK.
Las tablas/tipos Realtime mínimos son fixtures locales de compilación: no se
levanta el servicio ni se invocan las funciones Realtime.

Se probaron cuerpos oficiales apply_rls/cast, hooks de permisos, funciones
SECURITY DEFINER inocuas y escritoras, escritores miembros de una extensión,
SQL dinámico, SQL preanalizado, cadenas a través de funciones/vistas/operadores
y triggers de otra tabla, ciclos, literales, quoting incierto, saldos, solicitudes,
reservas, colisiones, RLS, políticas y ACL. Las pruebas comprueban que el análisis
no ejecute los escritores ni modifique saldos. ESLint del script pasó.

Comando: scripts/validar-decision-003.cjs --postgres con QPASS_PG_MODULE y una base
NUEVA QPASS_TEST_DATABASE_URL de prefijo qpass_devd_test en loopback. El script
rechaza destinos remotos y bases con tablas public existentes. Sin --postgres se
usa PGlite mediante QPASS_PGLITE_MODULE.

003 y 004 mantienen sus SHA-256 del manifiesto HU61. No commit ni push.

## Revisión humana que continúa pendiente

Con los cuerpos oficiales Realtime y sin otros fallos, la fila de funciones y el
resultado técnico son NULL, no FALSE ni un TRUE fabricado. Si hay DML financiero
detectado u otro fallo, el resultado técnico permanece FALSE.

En el snapshot también se detecta que public.listar_reportes_admin lee recargas;
queda como acceso financiero para revisión, no como escritor. La consulta no
modifica su definición ni su acceso administrativo. No se ha acreditado una nueva
dependencia financiera remota que impida instalar 003, pero tampoco seguridad
completa de todos los escritores reales.

Antes de decidir la instalación, revisar las firmas/motivos NULL de la salida
real: cuerpos, ACL/roles, search_path, callers, relaciones/publicaciones Realtime,
políticas RLS y tipos/casts implicados. El análisis no es un parser SQL completo
ni resuelve todos los aliases, SQL construido, llamadas mediante expresiones,
FDW, expresiones de columnas/dominios, tareas externas o código nativo. El control
humano de escritores indirectos/externos permanece NULL por esos límites.

También siguen pendientes los acuerdos B/C sobre precio/puntos, saldo total frente
a gastable, reservas y liquidación, negocio/evento y autorizaciones; además del
respaldo recuperable y una ventana sin escritores. Instalar solo infraestructura
requiere acordar ese alcance y mantener los cobros desactivados.

Archivos de esta revisión: decision_003_solo_lectura.sql,
validar-decision-003.cjs, fixture-supabase-realtime-003.json y este informe.
