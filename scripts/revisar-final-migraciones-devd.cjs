/* eslint-disable @typescript-eslint/no-require-imports -- Revisión reproducible en PostgreSQL LOCAL nuevo. */
const fs = require('node:fs'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { Client } = require(process.env.QPASS_PG_MODULE || 'pg');
const { recrearCatalogo, sembrar, usuario, migraciones } = require('./devd-catalogo-fixture.cjs');
async function main() {
  const url = new URL(process.env.QPASS_TEST_DATABASE_URL || '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^\/qpass_devd_test\w*$/.test(url.pathname)) throw new Error('Solo base nueva de pruebas en loopback.');
  const root = new Client({ connectionString: url.href });
  const a = new Client({ connectionString: url.href }); const b = new Client({ connectionString: url.href });
  await Promise.all([root.connect(), a.connect(), b.connect()]);
  const db = { exec: sql => root.query(sql), query: (sql, args) => root.query(sql, args) };
  let comprobaciones = 0;
  const probar = async (nombre, fn) => { await fn(); comprobaciones++; console.log(`PASS ${nombre}`); };
  const leer = nombre => fs.readFileSync(nombre, 'utf8');
  async function comprobarConsulta(nombre) {
    const res = await root.query(leer(nombre));
    const filas = (Array.isArray(res) ? res : [res]).flatMap(r => r.rows);
    const checks = filas.filter(r => 'correcto' in r);
    assert.ok(checks.length, `Sin verificaciones en ${nombre}`);
    for (const r of checks) assert.equal(r.correcto, true, `${nombre}: ${r.prueba}`);
  }
  const estado = async () => (await root.query(`select jsonb_build_object(
    'funciones',(select jsonb_agg(pg_get_functiondef(p.oid) order by p.oid) from pg_proc p where p.pronamespace='public'::regnamespace),
    'politicas',(select jsonb_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p where schemaname='public'),
    'columnas',(select jsonb_agg(to_jsonb(c) order by table_name,ordinal_position) from information_schema.columns c where table_schema='public'),
    'saldos',(select jsonb_agg(to_jsonb(s) order by id) from saldos_puntos s),
    'ventas',(select count(*) from ventas),'lineas',(select count(*) from venta_items)) estado`)).rows[0].estado;
  try {
    assert.equal((await root.query("select count(*)::int n from pg_tables where schemaname='public'")).rows[0].n, 0, 'Base no vacía; no se borran objetos.');
    await probar('archivos del manifiesto vigente coinciden con los hashes revisados', async () => {
      const archivo = fs.existsSync('docs/integracion-supabase/manifest-hu61-corregida.json')
        ? 'docs/integracion-supabase/manifest-hu61-corregida.json' : 'docs/integracion-supabase/manifest-devd.json';
      const m = JSON.parse(leer(archivo));
      for (const x of m.archivos) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(x.archivo)).digest('hex'), x.sha256, x.archivo);
    });
    await recrearCatalogo(db); await sembrar(db);
    for (let n = 0; n < migraciones.length; n++) {
      await probar(`migración 00${n}, consulta posterior y 25 funciones originales preservadas`, async () => {
        await root.query(leer(`supabase/migrations/${migraciones[n]}`));
        const archivo = fs.readdirSync('supabase/verificacion-devd').find(f => f.startsWith(`0${n}_`));
        await comprobarConsulta(`supabase/verificacion-devd/${archivo}`);
        await comprobarConsulta('supabase/verificacion-devd/90_funciones_originales.sql');
      });
      if (n === 0) await probar('000 puede repetirse sobre el esquema previo sin modificaciones', async () => {
        const antes = await estado(); await root.query(leer(`supabase/migrations/${migraciones[0]}`)); assert.deepEqual(await estado(), antes);
      });
    }
    for (const archivo of migraciones) await probar(`reejecución ${archivo}: aborta sin cambios parciales`, async () => {
      const antes = await estado();
      await assert.rejects(() => root.query(leer(`supabase/migrations/${archivo}`)));
      await root.query('rollback'); assert.deepEqual(await estado(), antes);
    });
    await probar('anon/authenticated sin escritura directa de precio, saldo o venta', async () => {
      for (const rol of ['anon', 'authenticated']) {
        await root.query(`set role ${rol}`);
        for (const sql of ['update productos set precio=0 where id=1', 'update saldos_puntos set saldo=1000 where id=1',
          'update ventas set total=0 where id=1', 'insert into ventas(ayudante_id,cliente_id,evento_id,negocio_id,total) values(1,$1,1,1,0)']) {
          await assert.rejects(() => root.query(sql, sql.includes('$1') ? [usuario(5)] : []), e => e.code === '42501');
        }
        await root.query('reset role');
      }
    });
    await probar('service_role conserva escritura privilegiada: fuera de la garantía de cliente web', async () => {
      assert.equal((await root.query("select has_table_privilege('service_role','public.productos','UPDATE') ok")).rows[0].ok, true);
    });

    // Primero comprobar el caso de una venta que todavía no es visible afuera.
    await root.query('insert into negocios_eventos(negocio_id,evento_id,activo) values(1,1,true)');
    await a.query(`begin; set local statement_timeout='10s'; set local role authenticated; set local test.uid='${usuario(3)}'`);
    const venta = (await a.query('select cobrar_venta(1,1,$1,$2,$3,2.50) v', ['QR-REGALO', '[{"producto_id":1,"cantidad":2}]', '30000000-0000-0000-0000-000000000001'])).rows[0].v;
    assert.equal(venta.total, '2.50');
    await b.query("begin; set local statement_timeout='10s'; set local role service_role");
    const pidB = (await b.query('select pg_backend_pid() pid')).rows[0].pid;
    const pendiente = b.query("insert into venta_items(venta_id,producto_id,cantidad,precio_unitario,producto_nombre_historico) values($1,1,1,1.25,'Linea concurrente')", [Number(venta.id)])
      .then(resultado => ({ resultado }), error => ({ error }));
    const noVisible = await pendiente;
    assert.equal(noVisible.error?.code, '23503', noVisible.error?.message);
    await b.query('rollback'); await a.query('commit');
    comprobaciones++; console.log('PASS FK rechaza insertar línea de una venta nueva aún no visible.');

    // Regresión del defecto original: la confirmación debe bloquear el INSERT
    // concurrente de service_role y rechazarlo una vez confirmado el padre.
    const previa = (await root.query(`insert into ventas(ayudante_id,cobrador_id,cliente_id,evento_id,negocio_id,total,
      solicitud_id,solicitud_payload,negocio_nombre_historico,entrada_id,respuesta)
      values(1,$1,$2,1,1,2.50,'30000000-0000-0000-0000-000000000002','{}','Negocio uno',1,
      '{"total":"2.50"}') returning id`, [usuario(3), usuario(5)])).rows[0].id;
    await root.query("insert into venta_items(venta_id,producto_id,cantidad,precio_unitario,producto_nombre_historico) values($1,1,2,1.25,'Agua')", [previa]);
    await root.query('update ventas set respuesta=devd_venta_dto(id) where id=$1', [previa]);
    await a.query("begin; set local statement_timeout='10s'");
    await a.query('update ventas set confirmada_en=now() where id=$1', [previa]);
    await b.query("begin; set local statement_timeout='10s'; set local role service_role");
    const concurrente = b.query("insert into venta_items(venta_id,producto_id,cantidad,precio_unitario,producto_nombre_historico) values($1,1,1,1.25,'Linea concurrente')", [previa])
      .then(resultado => ({ resultado }), error => ({ error }));
    let bloqueo = false;
    const limite = Date.now() + 5000;
    while (Date.now() < limite) {
      const r = await root.query('select wait_event_type from pg_stat_activity where pid=$1', [pidB]);
      if (r.rows[0]?.wait_event_type === 'Lock') { bloqueo = true; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(bloqueo, true, 'El escritor de líneas debe bloquear la cabecera.');
    await a.query('commit'); const r = await concurrente;
    assert.match(r.error?.message || '', /VENTA_CONFIRMADA_INMUTABLE/); await b.query('rollback');
    const fila = (await root.query('select v.total::text total,sum(i.cantidad*i.precio_unitario)::text lineas from ventas v join venta_items i on i.venta_id=v.id where v.id=$1 group by v.id', [previa])).rows[0];
    assert.deepEqual(fila, { total: '2.50', lineas: '2.50' });
    comprobaciones++;
    console.log('PASS regresión R1: línea concurrente rechazada; total 2.50 y líneas 2.50.');
    console.log(`${comprobaciones} comprobaciones de revisión aprobadas. R1 corregido; 003 sigue pendiente de coordinación B/C.`);
  } finally {
    await Promise.allSettled([a.query('rollback'), b.query('rollback'), root.query('rollback')]);
    await Promise.allSettled([a.end(), b.end(), root.end()]);
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
