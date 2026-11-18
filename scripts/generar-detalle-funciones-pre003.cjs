/* eslint-disable @typescript-eslint/no-require-imports -- Generación local de SQL de catálogo, sin red. */
const fs = require('node:fs');
const origen = 'supabase/verificacion-devd/decision_003_solo_lectura.sql';
const destino = 'supabase/verificacion-devd/detalle_funciones_pre003.sql';
const sql = fs.readFileSync(origen, 'utf8');
const bloque = (inicio, fin) => {
  const a = sql.indexOf(inicio), b = sql.indexOf(fin, a);
  if (a < 0 || b <= a) throw new Error('No se reconoce la estructura del detector; no generar criterios alternativos.');
  return sql.slice(a, b);
};
// Copia literal de CTEs: ninguna modificación de señales, aristas ni clasificación.
const compartido = bloque('catalogo_relaciones as materialized (', 'columnas as (')
  + bloque('clases_catalogo as (', 'decision_funciones as (');
const resultado = `-- Generado por scripts/generar-detalle-funciones-pre003.cjs.
-- Misma clasificacion que decision_003_solo_lectura.sql; NO modifica el detector.
-- UNA sentencia SELECT, solo catalogos. Ejecutar como postgres ANTES de 003.
-- Una fila por funcion REVISION (correcto IS NULL); no invoca esas funciones.
-- Exportar el resultado completo a CSV. Filas esperadas = REVISION del detector
-- en la misma instantanea de catalogo (77 en la salida informada por el usuario).
-- No expone cuerpos, valores predeterminados de argumentos, ACL ni filas de usuarios.
with recursive
${compartido}relaciones_por_funcion(objeto,tabla) as (
  -- Solo proyeccion de las aristas ya clasificadas: no cambia ningun criterio.
  select 'r'||oid::text,'public.'||relname from catalogo_relaciones
  where relname in ('saldos_puntos','solicitudes_devolucion','devoluciones','recargas','ventas','venta_items')
  union
  select a.origen,r.tabla from aristas a join relaciones_por_funcion r on r.objeto=a.destino
)
select f.esquema,f.proname nombre,
  pg_catalog.pg_get_function_identity_arguments(f.oid) firma,
  'REVISION'::text clasificacion,
  f.motivo||'; lenguaje='||f.lenguaje||'; SECURITY DEFINER='||f.prosecdef::text||
    '; extension='||coalesce(f.extension,'no registrada') motivo,
  coalesce((select string_agg(r.tabla,'; ' order by r.tabla) from relaciones_por_funcion r
    where r.objeto='f'||f.oid::text),
    case when f.menciona_finanzas then 'Mencion financiera textual sin ruta resuelta en las aristas'
      else 'Sin vinculo estatico resuelto; NO demuestra ausencia de acceso dinamico o indirecto' end)
    relacion_financiera_detectada
from clasificacion_funciones f
where f.correcto is null
order by f.esquema,f.proname,pg_catalog.pg_get_function_identity_arguments(f.oid);
`;
if (process.argv.includes('--check')) {
  if (!fs.existsSync(destino) || fs.readFileSync(destino, 'utf8') !== resultado) {
    throw new Error('El detalle difiere de los CTEs originales; regenerar y revisar.');
  }
  console.log('PASS detalle conserva literalmente los CTEs de clasificación del detector.');
} else {
  fs.writeFileSync(destino, resultado);
  console.log(`Generado ${destino}; detector intacto.`);
}
