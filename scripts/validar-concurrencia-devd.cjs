/* eslint-disable @typescript-eslint/no-require-imports -- Solo PostgreSQL local aislado. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Client } = require(process.env.QPASS_PG_MODULE || 'pg');
const { recrearCatalogo, sembrar, usuario, migraciones } = require('./devd-catalogo-fixture.cjs');

async function main() {
  const cadena = process.env.QPASS_TEST_DATABASE_URL;
  if (!cadena) throw new Error('Definir QPASS_TEST_DATABASE_URL para una base local nueva qpass_devd_test*.');
  const url = new URL(cadena);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^\/qpass_devd_test\w*$/.test(url.pathname)) throw new Error('Solo loopback y base qpass_devd_test*. No se aceptan conexiones remotas.');
  const principal = new Client({ connectionString: cadena });
  const a = new Client({ connectionString: cadena }); const b = new Client({ connectionString: cadena });
  await Promise.all([principal.connect(), a.connect(), b.connect()]);
  const db = { exec: sql => principal.query(sql), query: (sql, args) => principal.query(sql, args) };
  let total = 0;
  const prueba = async (nombre, fn) => { await fn(); total++; console.log(`PASS ${nombre}`); };
  const empezar = async (c, actor = 3) => { await c.query('begin'); await c.query("set local statement_timeout='10s'"); await c.query(`set local role authenticated; set local test.uid='${usuario(actor)}'`); };
  const solicitud = n => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const cobrar = (c, n, cantidad = 8) => c.query('select cobrar_venta(1,1,$1,$2,$3,$4) v', ['QR-REGALO', JSON.stringify([{ producto_id: 1, cantidad }]), solicitud(n), String(cantidad * 1.25)]);
  const iniciarPendiente = promesa => promesa.then(respuesta => ({ respuesta }), error => ({ error }));
  async function esperarBloqueo(pid) {
    const limite = Date.now() + 5000;
    while (Date.now() < limite) {
      const r = await principal.query("select wait_event_type from pg_stat_activity where pid=$1", [pid]);
      if (r.rows[0]?.wait_event_type === 'Lock') return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('La segunda conexión no esperó un bloqueo real.');
  }
  const reservar = (c, monto) => c.query(`insert into solicitudes_devolucion(usuario_id,evento_id,monto_solicitado,qr_bancario_url) values($1,1,$2,'fixture/qr')`, [usuario(5), monto]);
  try {
    assert.equal((await principal.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'")).rows[0].n, 0, 'La base debe estar vacía; no se borrarán objetos.');
    await recrearCatalogo(db); await sembrar(db);
    for (const m of migraciones) await db.exec(fs.readFileSync(`supabase/migrations/${m}`, 'utf8'));
    await principal.query('insert into negocios_eventos(negocio_id,evento_id,activo) values(1,1,true)');
    const pidB = (await b.query('select pg_backend_pid() pid')).rows[0].pid;
    await prueba('misma solicitud concurrente espera y devuelve la MISMA venta', async () => {
      await empezar(a); const primera = (await cobrar(a, 1, 2)).rows[0].v;
      await empezar(b); const pendiente = iniciarPendiente(cobrar(b, 1, 2));
      await esperarBloqueo(pidB); await a.query('commit');
      const r = await pendiente; assert.ifError(r.error); assert.deepEqual(r.respuesta.rows[0].v, primera); await b.query('commit');
      assert.equal((await principal.query('select count(*)::int n from ventas')).rows[0].n, 1);
      assert.equal((await principal.query('select saldo::text s from saldos_puntos')).rows[0].s, '97.50');
    });
    await prueba('dos solicitudes distintas no gastan dos veces el último saldo', async () => {
      await principal.query('update saldos_puntos set saldo=10');
      await empezar(a); await cobrar(a, 2);
      await empezar(b, 4); const pendiente = iniciarPendiente(cobrar(b, 3));
      await esperarBloqueo(pidB); await a.query('commit');
      assert.match((await pendiente).error?.message || '', /SALDO_INSUFICIENTE/); await b.query('rollback');
      assert.equal((await principal.query('select saldo::text s from saldos_puntos')).rows[0].s, '0.00');
    });
    await prueba('cobro primero impide una reserva concurrente que exceda el saldo restante', async () => {
      await principal.query('update saldos_puntos set saldo=100');
      await empezar(a); await cobrar(a, 4);
      await b.query('begin'); const pendiente = iniciarPendiente(reservar(b, 95));
      await esperarBloqueo(pidB); await a.query('commit');
      assert.match((await pendiente).error?.message || '', /SALDO_INSUFICIENTE_PARA_RESERVA/); await b.query('rollback');
      assert.equal((await principal.query('select reservado::text r from saldos_puntos')).rows[0].r, '0.00');
    });
    await prueba('reserva primero impide cobrar fondos reservados aunque no había solicitudes previas', async () => {
      await principal.query('update saldos_puntos set saldo=100');
      await a.query('begin'); await reservar(a, 95);
      await empezar(b); const pendiente = iniciarPendiente(cobrar(b, 5));
      await esperarBloqueo(pidB); await a.query('commit');
      assert.match((await pendiente).error?.message || '', /SALDO_INSUFICIENTE/); await b.query('rollback');
      const s = (await principal.query('select saldo::text s,reservado::text r from saldos_puntos')).rows[0];
      assert.deepEqual(s, { s: '100.00', r: '95.00' });
    });
    await prueba('rollback libera el saldo sin dejar venta ni débito parciales', async () => {
      await principal.query("update solicitudes_devolucion set estado='rechazada'");
      await principal.query('update saldos_puntos set saldo=10');
      const antes = (await principal.query('select count(*)::int n from ventas')).rows[0].n;
      await empezar(a); await cobrar(a, 6);
      await empezar(b); const pendiente = iniciarPendiente(cobrar(b, 7));
      await esperarBloqueo(pidB); await a.query('rollback');
      const r = await pendiente; assert.ifError(r.error); await b.query('commit');
      assert.equal((await principal.query('select count(*)::int n from ventas')).rows[0].n, antes + 1);
      assert.equal((await principal.query('select saldo::text s from saldos_puntos')).rows[0].s, '0.00');
    });
    console.log(`${total} pruebas con conexiones PostgreSQL independientes aprobadas. Sin acceso remoto.`);
  } finally {
    await Promise.allSettled([a.query('rollback'), b.query('rollback')]);
    await Promise.allSettled([a.end(), b.end(), principal.end()]);
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
