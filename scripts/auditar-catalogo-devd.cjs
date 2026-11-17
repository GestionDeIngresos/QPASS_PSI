/* eslint-disable @typescript-eslint/no-require-imports -- Auditoría local de metadatos. */
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const archivo = 'docs/integracion-supabase/qpass_catalogo_supabase_2026-11-16.json';
const raw = fs.readFileSync(archivo);
const c = JSON.parse(raw);
for (const clave of ['relaciones', 'funciones', 'indices', 'politicas', 'triggers', 'permisos_tabla', 'permisos_columna', 'dependencias', 'default_acl', 'enums', 'vistas']) {
  if (!Array.isArray(c[clave])) throw new Error(`Catálogo incompleto: ${clave}`);
}
const sqlLocales = fs.readdirSync('supabase').filter(n => n.endsWith('.sql')).map(n => [n, fs.readFileSync(path.join('supabase', n), 'utf8')]);
const normalizar = s => s.replace(/\r/g, '').replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
const informe = {
  archivo, sha256: crypto.createHash('sha256').update(raw).digest('hex'), capturado: c.capturado_en,
  version: c.version, database: c.database, soloLectura: c.solo_lectura,
  cantidades: Object.fromEntries(Object.entries(c).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length])),
  relaciones: c.relaciones.map(r => ({ ...r, indices: c.indices.filter(i => i.tablename === r.nombre), politicas: c.politicas.filter(p => p.tablename === r.nombre), triggers: c.triggers.filter(t => t.tabla === r.nombre) })),
  funciones: c.funciones.map(f => {
    // Revisar TODO el cuerpo y comparar el bloque interno con los SQL locales.
    const cuerpo = f.definicion.match(/AS \$(\w*)\$([\s\S]*)\$\1\$/i)?.[2] || f.definicion;
    return { nombre: f.nombre, firma: f.firma, retorno: f.retorno, propietario: f.propietario,
      definer: f.definer, configuracion: f.configuracion, acl: f.acl,
      anonExecute: f.anon_execute, authenticatedExecute: f.authenticated_execute,
      sha256: crypto.createHash('sha256').update(f.definicion).digest('hex'),
      coincidenciasLocales: sqlLocales.filter(([, s]) => normalizar(s).includes(normalizar(cuerpo))).map(([n]) => n),
      referenciasFinancieras: [...new Set(cuerpo.replace(/--[^\n]*/g, '').match(/\b(?:ventas|venta_items|saldos_puntos|solicitudes_devolucion|devoluciones|recargas)\b/gi) || [])],
    };
  }),
  // El catálogo fuente conserva cada GRANT. Aquí se resumen todos, sin copiar
  // miles de filas redundantes de permisos de columna heredados de tabla.
  permisosTabla: c.permisos_tabla,
  permisosColumna: Object.fromEntries([...new Set(c.permisos_columna.map(p => p.table_name))].map(nombre => [nombre,
    { entradas: c.permisos_columna.filter(p => p.table_name === nombre).length,
      grantsEspecificos: c.relaciones.find(r => r.nombre === nombre)?.columnas.filter(a => a.acl !== null).map(a => ({ columna: a.nombre, acl: a.acl })) || [] }])),
  dependencias: c.dependencias, defaultAcl: c.default_acl, enums: c.enums, vistas: c.vistas,
};
if (process.argv.includes('--guardar')) {
  fs.writeFileSync('docs/integracion-supabase/auditoria-catalogo-devd.json', JSON.stringify(informe, null, 2) + '\n');
}
console.log(JSON.stringify({ sha256: informe.sha256, cantidades: informe.cantidades, funciones: informe.funciones }, null, 2));
