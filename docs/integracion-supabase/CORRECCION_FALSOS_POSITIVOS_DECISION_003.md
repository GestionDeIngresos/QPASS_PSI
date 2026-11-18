# Decisión 003: permisos EXECUTE frente a ejecución dinámica

Revisión local del 17/11/2026, rama Aliaga. Sin consultas ni modificaciones
remotas. Las migraciones 003 y 004 conservan sus SHA-256 del manifiesto HU61.

## Causa y corrección

El detector buscaba cualquier palabra `EXECUTE` en `pg_proc.prosrc`. Por eso
`GRANT EXECUTE ON FUNCTION` disparaba la misma alerta que una instrucción
PL/pgSQL `EXECUTE`. Se reproduce con los cuerpos oficiales de:

| Función | Efecto del cuerpo oficial revisado |
| --- | --- |
| extensions.grant_pg_graphql_access() | Hook DDL para pg_graphql: crea el wrapper graphql_public.graphql, lo asocia a la extensión y concede permisos. No llama graphql.resolve durante el hook. |
| extensions.grant_pg_net_access() | Hook DDL para pg_net: configura rol/permisos y, para versiones antiguas, SECURITY DEFINER/search_path de funciones HTTP. No realiza solicitudes HTTP durante el hook. |

Fuente primaria: [Supabase postgres, schema-17.sql](https://github.com/supabase/postgres/blob/develop/migrations/schema-17.sql).
Los cuerpos utilizados y el SHA-256 del archivo descargado están conservados en
`scripts/fixture-supabase-permisos-003.json`; las pruebas no descargan nada.
El catálogo entregado enumera funciones public de QPass, no los cuerpos de estos
dos hooks: no se afirma haber contrastado sus versiones instaladas remotamente.
La corrección no depende de asumir que esos cuerpos remotos sean idénticos.

En `decision_003_solo_lectura.sql` se neutraliza únicamente el prefijo exacto
`GRANT/REVOKE EXECUTE ON FUNCTION`, admitiendo saltos de línea y mayúsculas.
Se conserva el resto del cuerpo. La búsqueda de DML financiero usa el cuerpo
original. Otro EXECUTE, una escritura financiera o un cuerpo SQL preanalizado
sigue bloqueando. No se agrega lista de nombres confiables ni exclusión del
esquema extensions. Los hooks siguen inspeccionándose; sus nombres aparecen en
el detalle como funciones con instrucciones de permisos, incluso si además son
candidatas peligrosas. Se conservan los filtros previos de catálogos del sistema
y miembros de extensiones identificados por pg_depend; esto NO acredita haber
auditado toda la implementación de cada extensión.

## Escrituras directas e indirectas

Se revisaron los cuerpos de las 25 funciones public del catálogo, sus cuatro
triggers y las claves foráneas financieras. No se identificó en ese snapshot una
RPC que escriba saldos, reservas, ventas o devoluciones, ni una cadena de llamadas
propias que termine en esa escritura. Las compras de entradas escriben compras,
tipos_ticket y entradas; resolver_reporte_admin actualiza reportes, no devuelve
puntos. Los cuatro triggers exportados son de eventos/tipos_ticket/usuarios.
Las claves hacia eventos/usuarios no tienen borrado en cascada financiero;
venta_items sí tiene ON DELETE CASCADE desde ventas: borrar ventas implica borrar
líneas y debe seguir controlándose como escritura financiera.

Conceder EXECUTE sí altera una superficie de acceso: el wrapper GraphQL puede
procesar mutaciones en llamadas posteriores según permisos/RLS, y pg_net permite
HTTP hacia servicios que podrían efectuar movimientos. Eso no convierte a los
hooks de instalación en débitos, pero requiere revisar callers y permisos.
No se ejecutan hooks, resolvers, HTTP ni RPC durante esta consulta.

El escaneo no es un grafo completo de llamadas PL/pgSQL, SQL dinámico, extensiones,
Edge Functions o escritores service_role. Una función intermediaria puede no
tener dependencias registradas en pg_depend; la prueba verifica que su destino
financiero detectado siga bloqueando. La comprobación humana de escritores
externos e indirectos permanece NULL; no se sustituye por una conclusión falsa
de ausencia. Los contratos y coordinación B/C siguen pendientes.

## Verificación y resultados esperados

- 18 pruebas aprobadas en PostgreSQL local 17.11 y 18 en PGlite, sobre el catálogo
  reconstruido ANTERIOR a 003, sin instalar migraciones. Cada evaluación de la
  consulta usa BEGIN READ ONLY / ROLLBACK. Fixtures sintéticos se crean solamente
  en la base local desechable.
- Se reproduce el falso positivo anterior con ambos cuerpos oficiales, y se
  verifica la nueva salida. Una copia del mismo hook con UPDATE de saldos o con
  EXECUTE dinámico sigue dando FALSE. Se prueban permisos multilínea, REVOKE,
  escritor indirecto, SQL preanalizado y los controles previos de saldos,
  reservas, devoluciones, triggers, RLS, políticas, ACL y objetos pendientes.
- Se preservan exactamente 29 filas y las tres columnas originales.
- ESLint del script modificado pasó. Hashes 003/004 verificados contra manifiesto.

Si estos dos GRANT eran las únicas candidatas, la fila de funciones pasa a TRUE.
RESULTADO TECNICO pasa a TRUE únicamente si todas sus demás condiciones reales
pasan; cualquier otra candidata o condición FALSE lo mantiene en FALSE.
RESULTADO FINAL PARA INSTALAR 003 permanece NULL (revisión humana pendiente)
cuando no hay fallos técnicos, y FALSE cuando sí los hay. Nunca se fuerza TRUE.

Esta corrección elimina un bloqueo espurio, no autoriza instalar 003: hace falta
revisar la salida corregida real, conciliar cualquier movimiento, acordar con B
la semántica de saldo/reserva/liquidación y con B/C precios/puntos y autorizaciones
comerciales, y confirmar respaldo y ventana sin escritores. Si se acuerda instalar
solo infraestructura, documentar ese alcance y mantener los cobros apagados.

Archivos de esta corrección: consulta SQL, script validar-decision-003.cjs,
fixture-supabase-permisos-003.json y este informe. No commit ni push.
