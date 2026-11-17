/* eslint-disable @typescript-eslint/no-require-imports -- Auditoría simulada, sin claves/red reales. */
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const source = fs.readFileSync('scripts/auditar-003-solo-lectura.cjs', 'utf8');
const campos = {
  negocios: ['id', 'estado'], productos: ['id', 'negocio_id', 'precio', 'disponible'],
  ayudantes: ['id', 'usuario_id', 'negocio_id', 'activo'], asignaciones_staff: ['id', 'usuario_id', 'evento_id', 'rol_staff'],
  saldos_puntos: ['id', 'usuario_id', 'evento_id', 'saldo'], solicitudes_devolucion: ['id', 'usuario_id', 'evento_id', 'monto_solicitado', 'estado'],
  devoluciones: ['id', 'solicitud_id', 'usuario_id', 'monto'], recargas: ['id', 'usuario_id', 'evento_id', 'monto'],
  ventas: ['id', 'cliente_id', 'evento_id', 'negocio_id', 'ayudante_id', 'total'], venta_items: ['id', 'venta_id', 'producto_id', 'cantidad', 'precio_unitario'],
};
async function ejecutar(opciones = {}) {
  const peticiones = [], archivos = [], logs = [];
  const clave = 'cabecera.' + Buffer.from(JSON.stringify({ role: opciones.anon ? 'anon' : 'service_role' })).toString('base64url') + '.CLAVE_FICTICIA';
  const env = { NEXT_PUBLIC_SUPABASE_URL: opciones.url || 'https://proyecto.supabase.co', SUPABASE_SERVICE_ROLE_KEY: clave };
  const mockfs = { readFileSync: p => p.endsWith('esquema-api.json') ? '{"proyecto":"proyecto.supabase.co"}' : '{}', writeFileSync: (p, s) => archivos.push({ p, s }) };
  const modulo = { exports: {} };
  vm.runInNewContext(source, { module: modulo, exports: modulo.exports, __dirname: 'scripts', Buffer, URL, AbortSignal,
    process: { env, loadEnvFile() {} }, console: { log: s => logs.push(s), error: s => logs.push(s) },
    require: n => n === 'node:fs' ? mockfs : n === 'node:crypto' ? { createHash } : require(n),
    fetch: async (url, config) => {
      peticiones.push({ url, config }); const tabla = new URL(url).pathname.split('/')[3];
      const filas = opciones.filas?.[tabla] || [];
      return { ok: !opciones.denegado, status: opciones.denegado ? 403 : 200,
        headers: { get: () => '*/' + filas.length },
        json: async () => opciones.denegado ? { code: '42501' } : tabla
          ? opciones.incompleto ? [] : filas
          : { definitions: Object.fromEntries(Object.entries(campos).map(([n, c]) => [n, { properties: Object.fromEntries(c.map(x => [x, {}])) }])), paths: {} } };
    },
  });
  await modulo.exports.main(); return { peticiones, archivos, logs, clave };
}
async function main() {
  let n = 0; const probar = async (nombre, fn) => { await fn(); n++; console.log(`PASS ${nombre}`); };
  await probar('solo GET/HEAD, sin RPC y sin datos personales persistidos', async () => {
    const r = await ejecutar(); assert.equal(r.peticiones.length, 21);
    assert.ok(r.peticiones.every(p => ['GET', 'HEAD'].includes(p.config.method) && !p.config.body && !new URL(p.url).pathname.includes('/rpc/')));
    assert.equal(r.archivos.length, 1); assert.ok(!JSON.stringify({ archivos: r.archivos, logs: r.logs }).includes(r.clave));
    assert.equal(JSON.parse(r.archivos[0].s).conteos.saldos_puntos, 0);
  });
  await probar('anon, proyecto ajeno y error HTTP no producen falsa evidencia de cero filas', async () => {
    for (const o of [{ anon: true }, { url: 'https://ajeno.supabase.co' }, { denegado: true }]) await assert.rejects(() => ejecutar(o));
  });
  await probar('lectura incompleta no se guarda como auditoría válida', async () => {
    await assert.rejects(() => ejecutar({ filas: { negocios: [{ id: 1, estado: true }] }, incompleto: true }), /LECTURA_INCOMPLETA/);
  });
  await probar('reservas se comparan exactamente en centésimas sin exponer usuarios', async () => {
    const r = await ejecutar({ filas: {
      saldos_puntos: [{ id: 1, usuario_id: 'USUARIO_PRIVADO', evento_id: 1, saldo: '0.30' }],
      solicitudes_devolucion: [{ id: 1, usuario_id: 'USUARIO_PRIVADO', evento_id: 1, monto_solicitado: '0.31', estado: 'aprobada' }],
    } });
    const informe = JSON.parse(r.archivos[0].s); assert.equal(informe.datos.reservas_v1_superiores_al_saldo, 1);
    assert.ok(!r.archivos[0].s.includes('USUARIO_PRIVADO'));
  });
  if (process.argv.includes('--sql')) await probar('consulta pre003 ejecuta en READ ONLY tras 000–002 sin cambiar el esquema', async () => {
    const { PGlite } = require(process.env.QPASS_PGLITE_MODULE || '@electric-sql/pglite');
    const { recrearCatalogo, migraciones } = require('./devd-catalogo-fixture.cjs');
    const db = new PGlite();
    try {
      await recrearCatalogo(db);
      for (const m of migraciones.slice(0, 3)) await db.exec(fs.readFileSync(`supabase/migrations/${m}`, 'utf8'));
      const antes = (await db.query("select count(*)::int n from pg_class where relnamespace='public'::regnamespace")).rows[0].n;
      const resultado = await db.exec(fs.readFileSync('supabase/verificacion-devd/pre_003_estado_actual_solo_lectura.sql', 'utf8'));
      const conteos = resultado.flatMap(r => r.rows).filter(r => 'tabla' in r && 'filas' in r);
      assert.equal(conteos.length, 9); assert.ok(conteos.every(r => Number(r.filas) === 0));
      assert.equal((await db.query("select count(*)::int n from pg_class where relnamespace='public'::regnamespace")).rows[0].n, antes);
    } finally { await db.close(); }
  });
  console.log(`${n} pruebas de auditoría readonly aprobadas. Sin red real.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
