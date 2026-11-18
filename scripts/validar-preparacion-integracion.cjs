/* eslint-disable @typescript-eslint/no-require-imports -- Pruebas aisladas, sin red ni claves reales. */
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const source = fs.readFileSync('scripts/inspeccionar-supabase-esquema.cjs', 'utf8');
const secret = 'CLAVE_FICTICIA_NO_EXPORTAR';
async function ejecutar({ url = 'https://prueba.supabase.co', key = secret, status = 200, api } = {}) {
  const requests = [], writes = [], logs = [];
  const processMock = { env: { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key }, loadEnvFile() {}, exitCode: 0 };
  const mockfs = {
    readdirSync: () => ['prueba.sql'], readFileSync: () => 'select 1;', mkdirSync() {},
    writeFileSync: (name, data) => writes.push({ name, data }),
  };
  await vm.runInNewContext(source, {
    __dirname: path.resolve('scripts'), process: processMock, URL, AbortSignal,
    console: { log: value => logs.push(value), error: value => logs.push(value) },
    require(name) { return name === 'node:fs' ? mockfs : require(name); },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: status === 200, status, json: async () => api || {
        definitions: { tabla: { required: ['id'], properties: {
          id: { type: 'integer', description: 'Note: <pk/>' },
          usuario_id: { type: 'string', format: 'uuid', description: `<fk table='usuarios' column='id'/> ${secret}` },
          valor: { type: 'string', default: secret, description: secret },
        } } },
        paths: { '/rpc/consulta': { post: { parameters: [{ in: 'body', schema: { properties: { id: { type: 'integer' } } } }] } } },
      } };
    },
  });
  return { requests, writes, logs, exitCode: processMock.exitCode };
}
async function main() {
  let total = 0;
  async function probar(name, fn) { await fn(); total++; console.log(`PASS: ${name}`); }
  await probar('inventario solo GET/OpenAPI; no filas ni RPC ejecutadas', async () => {
    const r = await ejecutar();
    assert.equal(r.exitCode, 0); assert.equal(r.requests.length, 1);
    assert.equal(new URL(r.requests[0].url).pathname, '/rest/v1/');
    assert.equal(r.requests[0].options.method, 'GET'); assert.equal(r.requests[0].options.redirect, 'error');
    const snapshot = JSON.parse(r.writes[0].data);
    assert.equal(snapshot.tablas.tabla.columnas.id.clavePrimaria, true);
    assert.equal(snapshot.tablas.tabla.columnas.usuario_id.referencia.tabla, 'usuarios');
    assert.equal(snapshot.rpcs.consulta.argumentos.properties.id.type, 'integer');
  });
  await probar('claves, comentarios y defaults arbitrarios no se exportan', async () => {
    const r = await ejecutar();
    assert.ok(!JSON.stringify({ logs: r.logs, writes: r.writes }).includes(secret));
  });
  await probar('URL ajena/insegura se rechaza antes de enviar claves', async () => {
    for (const url of ['http://prueba.supabase.co', 'https://externo.example', 'https://prueba.supabase.co.externos.example', 'https://usuario:clave@prueba.supabase.co']) {
      const r = await ejecutar({ url }); assert.equal(r.exitCode, 1); assert.equal(r.requests.length, 0);
    }
  });
  await probar('sin clave o con respuesta inválida no se guarda un inventario', async () => {
    for (const options of [{ key: '' }, { status: 403 }, { api: {} }]) {
      const r = await ejecutar(options); assert.equal(r.exitCode, 1); assert.equal(r.writes.length, 0);
      assert.ok(!JSON.stringify(r.logs).includes(secret));
    }
  });
  await probar('borrador bloqueado y sin funciones, DML financiero ni cambios de permisos', async () => {
    const sql = fs.readFileSync('supabase/devD_integracion_10_historicos_ventas.BORRADOR.sql', 'utf8').replace(/--[^\n]*/g, '');
    assert.ok(sql.indexOf('BORRADOR_BLOQUEADO') < sql.indexOf('alter table'));
    assert.doesNotMatch(sql, /\b(insert\s+into|update\s+public\.|delete\s+from|truncate|drop\s|create\s+(or\s+replace\s+)?function|grant\s|revoke\s)/i);
    assert.doesNotMatch(sql, /alter\s+table\s+public\.(saldos_puntos|solicitudes_devolucion|recargas|devoluciones)\b/i);
    assert.match(sql, /begin;/); assert.match(sql, /commit;/);
  });
  await probar('inventario y verificación SQL declaran transacciones de solo lectura', async () => {
    for (const name of ['00_catalogo', '20_verificacion']) {
      const sql = fs.readFileSync(`supabase/devD_integracion_${name}_solo_lectura.sql`, 'utf8').replace(/--[^\n]*/g, '');
      assert.match(sql, /begin transaction isolation level repeatable read read only;/);
      assert.match(sql, /rollback;/);
      assert.doesNotMatch(sql, /\b(insert\s+into|update\s+public\.|delete\s+from|truncate|create\s+|alter\s+|drop\s+|grant\s+|revoke\s+)/i);
    }
  });
  console.log(`${total} pruebas aisladas aprobadas. No equivalen a ejecutar SQL en PostgreSQL.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
