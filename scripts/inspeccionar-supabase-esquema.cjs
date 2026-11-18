/* eslint-disable @typescript-eslint/no-require-imports -- Herramienta local de inventario. */
// Solo GET del documento OpenAPI. No consulta filas, invoca RPC ni ejecuta SQL.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

async function main() {
  const root = path.resolve(__dirname, '..');
  process.loadEnvFile(path.join(root, '.env.local'));
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.username || url.password) {
    throw new Error('CONFIGURACION_NO_ADMITIDA');
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error('FALTA_CLAVE_LOCAL');
  const response = await fetch(new URL('/rest/v1/', url), {
    method: 'GET', redirect: 'error',
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const api = await response.json();
  if (!api.definitions || !api.paths) throw new Error('OPENAPI_INCOMPLETO');
  function property(p) {
    const result = Object.fromEntries(['type', 'format', 'maxLength', 'enum', '$ref'].filter(k => p[k] !== undefined).map(k => [k, p[k]]));
    // No exportar comentarios arbitrarios ni defaults que puedan contener secretos.
    const fk = /<fk table='([a-zA-Z_0-9]+)' column='([a-zA-Z_0-9]+)'\/>/.exec(p.description || '');
    if (fk) result.referencia = { tabla: fk[1], columna: fk[2] };
    if ((p.description || '').includes('<pk/>')) result.clavePrimaria = true;
    if (p.default !== undefined && (p.default === null || typeof p.default === 'boolean' || typeof p.default === 'number' || ['now()', 'en_revision', 'pendiente'].includes(p.default))) result.default = p.default;
    if (p.properties) result.properties = Object.fromEntries(Object.entries(p.properties).map(([k, v]) => [k, property(v)]));
    if (p.required) result.required = p.required;
    return result;
  }
  const tables = Object.fromEntries(Object.entries(api.definitions).sort(([a], [b]) => a.localeCompare(b)).map(([name, d]) => [name, {
    requeridasSegunAPI: d.required || [], columnas: Object.fromEntries(Object.entries(d.properties || {}).map(([n, p]) => [n, property(p)])),
  }]));
  const rpcs = Object.fromEntries(Object.entries(api.paths).filter(([p]) => p.startsWith('/rpc/')).sort(([a], [b]) => a.localeCompare(b)).map(([p, methods]) => [p.slice(5), {
    metodosExpuestos: Object.keys(methods),
    argumentos: property((methods.post?.parameters || []).find(p => p.in === 'body')?.schema || {}),
  }]));
  const sqlSources = Object.fromEntries(fs.readdirSync(path.join(root, 'supabase')).filter(n => n.endsWith('.sql')).sort().map(n => [n, createHash('sha256').update(fs.readFileSync(path.join(root, 'supabase', n))).digest('hex')]));
  const snapshot = {
    capturadoEn: new Date().toISOString(), proyecto: url.hostname,
    alcance: 'OpenAPI de public visible para la clave configurada; NO es pg_dump ni auditoría de RLS, triggers o cuerpos SQL. Sin filas de negocio.',
    versionAPI: api.info?.version || null, tablas: tables, rpcs, sqlLocalesSHA256: sqlSources,
  };
  const destination = path.join(root, 'docs', 'integracion-supabase', 'esquema-api.json');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`Proyecto: ${url.hostname}. ${Object.keys(tables).length} relaciones expuestas; ${Object.keys(rpcs).length} RPC expuestas.`);
  console.log('Inventario de metadatos guardado en docs/integracion-supabase/esquema-api.json. Sin claves ni filas.');
}
main().catch(error => {
  // No imprimir objetos fetch/headers/env ni mensajes remotos arbitrarios.
  const code = /^(HTTP_\d+|CONFIGURACION_NO_ADMITIDA|FALTA_CLAVE_LOCAL|OPENAPI_INCOMPLETO)$/.test(error.message) ? error.message : error.name;
  console.error(`Inventario no completado: ${code}`);
  process.exitCode = 1;
});
