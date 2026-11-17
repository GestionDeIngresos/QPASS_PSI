# Consulta de decisión 003 — compatible con objetos todavía ausentes

Se corrigió `supabase/verificacion-devd/decision_003_solo_lectura.sql` en Aliaga.
Es una única sentencia SELECT, de solo lectura, y devuelve un único resultado
de **29 filas** con `comprobacion`, `correcto`, `detalle`.

Cambios:

- Existencia de tablas/índices mediante comparación de nombres en pg_class y
  pg_namespace; columnas en pg_attribute; tipos en pg_type. Sin to_regclass,
  to_regtype ni conversiones a regclass para objetos pendientes.
- No hay FROM/JOIN sobre negocios_eventos ni acceso directo a reservado o las
  nuevas columnas comerciales. Solo se leen datos de tablas base ya existentes.
- Filas explícitas `negocios_eventos pendiente de 003` y
  `saldos_puntos.reservado pendiente de 003`: su ausencia devuelve true como
  precondición esperada y detalle PENDIENTE; su presencia exige revisar colisiones.
- Los cuerpos de funciones se inspeccionan como texto en pg_proc.prosrc, sin
  ejecutarlos ni descompilarlos mediante pg_get_functiondef. Cuerpos SQL
  preanalizados o dinámicos se señalan para revisión conservadora. El análisis
  sigue siendo heurístico: no demuestra ausencia de escritores indirectos.
- Se mantienen saldos, solicitudes/estados, reservas propuestas, devoluciones,
  triggers financieros, funciones, RLS y políticas. Se muestran ACL de tabla y
  se detectan permisos de columna que no figuraban en el catálogo original.
- Acuerdos Dev B/C, escritores externos, respaldo y ventana permanecen NULL:
  ni objetos pendientes ni tablas vacías equivalen a un contrato aprobado.

Validación:

- La copia anterior no reprodujo exactamente el 42P01 reportado al ejecutarla en
  PostgreSQL local. No se afirma haber identificado una causa remota específica.
  La corrección elimina las resoluciones por nombre y descompilaciones anteriores.
- La nueva versión pasó **12 pruebas en PostgreSQL 17.11 local** y otras 12 en
  PGlite sobre el catálogo exportado reconstruido, sin aplicar 003 ni 004.
- Las pruebas verifican que negocios_eventos, reservado y las nuevas columnas de
  ventas NO existen antes de evaluar la consulta. No se crean para hacerla pasar.
- La consulta se ejecuta dentro de BEGIN READ ONLY / ROLLBACK durante las pruebas.
  Se prueban colisiones, solicitudes pendientes/aprobadas, reserva excesiva,
  triggers, funciones de escritura, permisos por columna y políticas nuevas.
- También se prueba una función legada que menciona negocios_eventos y reservado
  ausentes: se informa por metadatos sin ejecutarla. Una tabla negocios_eventos
  deliberadamente incompleta se informa como colisión sin consultar sus columnas.

Pruebas reproducibles: `scripts/validar-decision-003.cjs --postgres`, con módulo pg
de validación y una base NUEVA de prefijo qpass_devd_test en loopback configurados
por QPASS_PG_MODULE y QPASS_TEST_DATABASE_URL. Sin --postgres se usa PGlite mediante
QPASS_PGLITE_MODULE. Nunca se aceptan destinos PostgreSQL remotos para estas pruebas.

Las migraciones 003 y 004 no se modificaron. No se hicieron consultas ni cambios
en Supabase remoto, commit o push. La consulta corregida está probada antes de 003;
su resultado sigue distinguiendo instalación técnica de aprobación financiera.
