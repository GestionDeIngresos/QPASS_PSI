/* eslint-disable @typescript-eslint/no-require-imports -- Integridad y carreras en PostgreSQL LOCAL nuevo. */
const fs = require('node:fs'), assert = require('node:assert/strict');
const { Client } = require(process.env.QPASS_PG_MODULE || 'pg');
const { recrearCatalogo, sembrar, usuario, migraciones } = require('./devd-catalogo-fixture.cjs');
async function main() {
  const url = new URL(process.env.QPASS_TEST_DATABASE_URL || '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^\/qpass_devd_test\w*$/.test(url.pathname)) throw new Error('Solo base nueva de pruebas en loopback.');
  const root = new Client({ connectionString: url.href });
  const a = new Client({ connectionString: url.href }), b = new Client({ connectionString: url.href });
  await Promise.all([root.connect(), a.connect(), b.connect()]);
  const db = { exec: sql => root.query(sql), query: (sql, args) => root.query(sql, args) };
  const q = async (sql, args = []) => (await root.query(sql, args)).rows[0];
  let total = 0, clave = 0;
  const probar = async (nombre, fn) => { await fn(); total++; console.log(`PASS ${nombre}`); };
  const begin = async c => c.query("begin; set local statement_timeout='10s'; set local role service_role");
  const cerrar = async () => { await Promise.all([a.query('rollback'), b.query('rollback')]); };
  const capturar = promesa => promesa.then(resultado => ({ resultado }), error => ({ error }));
  async function bloqueada(c) {
    const pid = (await c.query('select pg_backend_pid() pid')).rows[0].pid;
    return async () => {
      const limite = Date.now() + 5000;
      while (Date.now() < limite) {
        if ((await q('select wait_event_type from pg_stat_activity where pid=$1', [pid])).wait_event_type === 'Lock') return;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error('No hubo bloqueo real entre conexiones.');
    };
  }
  async function pendiente() {
    const solicitud = `40000000-0000-0000-0000-${String(++clave).padStart(12, '0')}`;
    const id = (await q(`insert into ventas(ayudante_id,cobrador_id,cliente_id,evento_id,negocio_id,total,
      solicitud_id,solicitud_payload,negocio_nombre_historico,entrada_id)
      values(1,$1,$2,1,1,2.50,$3,'{}','Negocio uno',1) returning id`, [usuario(3), usuario(5), solicitud])).id;
    const linea = (await q("insert into venta_items(venta_id,producto_id,cantidad,precio_unitario,producto_nombre_historico) values($1,1,2,1.25,'Agua') returning id", [id])).id;
    await root.query('update ventas set respuesta=devd_venta_dto(id) where id=$1', [id]);
    return { id, linea };
  }
  const confirmar = (c, id) => c.query('update ventas set confirmada_en=now() where id=$1', [id]);
  const insertar = (c, id) => c.query("insert into venta_items(venta_id,producto_id,cantidad,precio_unitario,producto_nombre_historico) values($1,1,1,1.25,'Otra linea')", [id]);
  const coherente = id => q('select v.confirmada_en is not null confirmada,v.total::text total,sum(i.cantidad*i.precio_unitario)::text lineas from ventas v left join venta_items i on i.venta_id=v.id where v.id=$1 group by v.id', [id]);
  try {
    assert.equal((await q("select count(*)::int n from pg_tables where schemaname='public'")).n, 0, 'Base no vacía; no se borran objetos.');
    await recrearCatalogo(db); await sembrar(db);
    for (const m of migraciones.slice(0, 4)) await root.query(fs.readFileSync(`supabase/migrations/${m}`, 'utf8'));
    const mala = (await q(`insert into ventas(ayudante_id,cobrador_id,cliente_id,evento_id,negocio_id,total,
      solicitud_id,solicitud_payload,negocio_nombre_historico,entrada_id,confirmada_en,respuesta)
      values(1,$1,$2,1,1,2.50,'40000000-0000-0000-0000-000000000000','{}','Negocio uno',1,now(),'{}') returning id`, [usuario(3), usuario(5)])).id;
    await insertar(root, mala); // 1.25 no coincide con total 2.50; todavía no existe 004.
    await probar('004 aborta y revierte DDL ante confirmación previa inconsistente', async () => {
      await assert.rejects(() => root.query(fs.readFileSync(`supabase/migrations/${migraciones[4]}`, 'utf8')), /VENTA_TOTAL_INCONSISTENTE/);
      await root.query('rollback');
      assert.equal((await q("select to_regprocedure('public.cobrar_venta(integer,integer,text,jsonb,uuid,numeric)') p")).p, null);
      // Corregir SOLO el fixture sintético anterior a 004: no hay reparación en la migración.
      await root.query('update ventas set confirmada_en=null where id=$1', [mala]);
    });
    await root.query(fs.readFileSync(`supabase/migrations/${migraciones[4]}`, 'utf8'));

    let confirmada;
    await probar('caso original: confirmar primero bloquea INSERT y conserva total 2.50 / líneas 2.50', async () => {
      confirmada = await pendiente();
      const espera = await bloqueada(b);
      await begin(a); await confirmar(a, confirmada.id);
      await begin(b); const p = capturar(insertar(b, confirmada.id));
      await espera(); await a.query('commit');
      assert.match((await p).error?.message || '', /VENTA_CONFIRMADA_INMUTABLE/); await b.query('rollback');
      assert.deepEqual(await coherente(confirmada.id), { confirmada: true, total: '2.50', lineas: '2.50' });
    });
    for (const op of ['INSERT', 'UPDATE', 'DELETE']) await probar(`${op} primero bloquea confirmación y rechaza total desactualizado`, async () => {
      const v = await pendiente(); const espera = await bloqueada(a);
      await begin(b);
      if (op === 'INSERT') await insertar(b, v.id);
      if (op === 'UPDATE') await b.query('update venta_items set cantidad=3 where id=$1', [v.linea]);
      if (op === 'DELETE') await b.query('delete from venta_items where id=$1', [v.linea]);
      await begin(a); const p = capturar(confirmar(a, v.id));
      await espera(); await b.query('commit');
      assert.match((await p).error?.message || '', op === 'DELETE' ? /VENTA_SIN_LINEAS/ : /VENTA_TOTAL_INCONSISTENTE/);
      await a.query('rollback'); assert.equal((await coherente(v.id)).confirmada, false);
    });
    for (const op of ['UPDATE', 'DELETE']) await probar(`confirmación primero impide ${op} concurrente de línea`, async () => {
      const v = await pendiente(); const espera = await bloqueada(b);
      await begin(a); await confirmar(a, v.id);
      await begin(b); const p = capturar(b.query(op === 'UPDATE' ? 'update venta_items set cantidad=3 where id=$1' : 'delete from venta_items where id=$1', [v.linea]));
      await espera(); await a.query('commit');
      assert.match((await p).error?.message || '', /VENTA_CONFIRMADA_INMUTABLE/); await b.query('rollback');
      assert.deepEqual(await coherente(v.id), { confirmada: true, total: '2.50', lineas: '2.50' });
    });
    await probar('rollback de operación de líneas permite confirmar el total original', async () => {
      const v = await pendiente(); const espera = await bloqueada(a);
      await begin(b); await b.query('update venta_items set cantidad=3 where id=$1', [v.linea]);
      await begin(a); const p = capturar(confirmar(a, v.id)); await espera(); await b.query('rollback');
      assert.ifError((await p).error); await a.query('commit');
      assert.deepEqual(await coherente(v.id), { confirmada: true, total: '2.50', lineas: '2.50' });
    });
    await probar('service_role no modifica líneas/históricos/cabecera ya confirmados', async () => {
      const destino = await pendiente();
      const operaciones = [
        ['insert into venta_items(venta_id,producto_id,cantidad,precio_unitario,producto_nombre_historico) values($1,2,1,0,\'Falso\')', [confirmada.id]],
        ['update venta_items set cantidad=9 where id=$1', [confirmada.linea]],
        ['update venta_items set precio_unitario=0 where id=$1', [confirmada.linea]],
        ["update venta_items set producto_nombre_historico='Falso' where id=$1", [confirmada.linea]],
        ['delete from venta_items where id=$1', [confirmada.linea]],
        ['update venta_items set venta_id=$1 where id=$2', [destino.id, confirmada.linea]],
        ['update venta_items set venta_id=$1 where id=$2', [confirmada.id, destino.linea]],
        ['update ventas set total=0 where id=$1', [confirmada.id]],
        ["update ventas set respuesta='{}' where id=$1", [confirmada.id]],
        ['delete from ventas where id=$1', [confirmada.id]],
      ];
      for (const [sql, args] of operaciones) {
        await begin(b); await assert.rejects(() => b.query(sql, args), /VENTA_CONFIRMADA_INMUTABLE/); await b.query('rollback');
      }
    });
    await probar('confirmación rechaza nombre histórico/DTO ausentes aunque la suma coincida', async () => {
      const v = await pendiente(); await begin(a);
      await a.query('update venta_items set producto_nombre_historico=null where id=$1', [v.linea]);
      await assert.rejects(() => confirmar(a, v.id), /VENTA_HISTORICO_INCONSISTENTE/); await a.query('rollback');
      await begin(a); await a.query("update ventas set respuesta='{}' where id=$1", [v.id]);
      await assert.rejects(() => confirmar(a, v.id), /VENTA_RESPUESTA_INCONSISTENTE/); await a.query('rollback');
    });
    await probar('venta sin líneas e INSERT ya confirmado se rechazan', async () => {
      const v = await pendiente(); await begin(a);
      await a.query('delete from venta_items where id=$1', [v.linea]);
      await assert.rejects(() => confirmar(a, v.id), /VENTA_SIN_LINEAS/); await a.query('rollback');
      await begin(a);
      await assert.rejects(() => a.query(`insert into ventas(ayudante_id,cliente_id,evento_id,negocio_id,total,confirmada_en) values(1,$1,1,1,0,now())`, [usuario(5)]), /VENTA_SIN_LINEAS/);
      await a.query('rollback');
    });
    await probar('dos movimientos opuestos de líneas bloquean padres en orden estable', async () => {
      const x = await pendiente(), y = await pendiente(); const espera = await bloqueada(b);
      await begin(a); await a.query('update venta_items set venta_id=$1 where id=$2', [y.id, x.linea]);
      await begin(b); const p = capturar(b.query('update venta_items set venta_id=$1 where id=$2', [x.id, y.linea]));
      await espera(); await a.query('commit'); assert.ifError((await p).error); await b.query('commit');
      assert.equal((await q('select venta_id from venta_items where id=$1', [x.linea])).venta_id, y.id);
      assert.equal((await q('select venta_id from venta_items where id=$1', [y.linea])).venta_id, x.id);
    });
    await probar('REPEATABLE READ y SERIALIZABLE se rechazan para proteger snapshots', async () => {
      const v = await pendiente();
      for (const iso of ['repeatable read', 'serializable']) {
        await a.query(`begin isolation level ${iso}; set local role service_role`);
        await assert.rejects(() => confirmar(a, v.id), /AISLAMIENTO_NO_SOPORTADO/); await a.query('rollback');
      }
    });
    await probar('hora UTC del DTO permanece coherente aunque cambie la zona de la sesión', async () => {
      const v = await pendiente(); await begin(a); await a.query("set local timezone='America/La_Paz'");
      await confirmar(a, v.id); await a.query("set local timezone='Asia/Tokyo'"); await a.query('commit');
      assert.equal((await coherente(v.id)).confirmada, true);
    });
    await probar('sentencia CTE con modificación y confirmación revierte ambos cambios', async () => {
      const v = await pendiente(); await begin(a);
      await assert.rejects(async () => {
        await a.query(`with linea as (update venta_items set cantidad=3 where id=$1 returning venta_id)
          update ventas set confirmada_en=now() where id in (select venta_id from linea)`, [v.linea]);
        await a.query('commit');
      }, /VENTA_TOTAL_INCONSISTENTE/);
      await a.query('rollback'); assert.deepEqual(await coherente(v.id), { confirmada: false, total: '2.50', lineas: '2.50' });
    });
    await probar('SET CONSTRAINTS IMMEDIATE tampoco permite cambiar líneas después de confirmar', async () => {
      const v = await pendiente(); await begin(a); await a.query('set constraints all immediate');
      await confirmar(a, v.id);
      await assert.rejects(() => a.query('update venta_items set cantidad=3 where id=$1', [v.linea]), /VENTA_CONFIRMADA_INMUTABLE/);
      await a.query('rollback'); assert.equal((await coherente(v.id)).confirmada, false);
    });
    await probar('validación diferida detecta un trigger posterior y revierte también el débito al COMMIT', async () => {
      const v = await pendiente();
      await root.query(`create function fixture_zz_total() returns trigger language plpgsql as $$
        begin if new.id=${v.id} and new.confirmada_en is not null then new.total:=new.total+1; end if; return new; end $$;
        create trigger zz_fixture_total before update on ventas for each row execute function fixture_zz_total();`);
      const antes = (await q('select saldo::text saldo from saldos_puntos where id=1')).saldo;
      await begin(a); await a.query('update saldos_puntos set saldo=saldo-2.50 where id=1');
      await confirmar(a, v.id); // BEFORE principal valida; zz cambia NEW después.
      await assert.rejects(() => a.query('commit'), /VENTA_TOTAL_INCONSISTENTE/); await a.query('rollback');
      assert.equal((await q('select saldo::text saldo from saldos_puntos where id=1')).saldo, antes);
      assert.deepEqual(await coherente(v.id), { confirmada: false, total: '2.50', lineas: '2.50' });
    });
    await probar('triggers diferidos, RLS y helpers internos conservan protección de roles API', async () => {
      const filas = (await root.query(`select tgdeferrable,tginitdeferred,tgenabled from pg_trigger where tgname in ('devd_venta_coherente_al_cierre','devd_items_coherentes_al_cierre')`)).rows;
      assert.equal(filas.length, 2); assert.ok(filas.every(r => r.tgdeferrable && r.tginitdeferred && r.tgenabled === 'O'));
      for (const rol of ['anon', 'authenticated', 'service_role']) {
        for (const f of ['public.devd_validar_venta_confirmada(public.ventas)', 'public.devd_comprobar_venta_al_cierre()']) assert.equal((await q('select has_function_privilege($1,$2,$3) ok', [rol, f, 'EXECUTE'])).ok, false);
      }
      assert.equal((await q("select bool_and(relrowsecurity) ok from pg_class where oid in ('public.ventas'::regclass,'public.venta_items'::regclass,'public.saldos_puntos'::regclass)")).ok, true);
      for (const tabla of ['public.ventas', 'public.venta_items']) for (const permiso of ['TRUNCATE', 'TRIGGER'])
        assert.equal((await q('select has_table_privilege($1,$2,$3) ok', ['service_role', tabla, permiso])).ok, false);
      assert.equal((await q("select has_parameter_privilege('service_role','session_replication_role','SET') ok")).ok, false);
      assert.equal((await q("select pg_has_role('service_role','postgres','SET') ok")).ok, false);
    });
    await probar('ninguna venta confirmada termina con suma o respuesta discordante', async () => {
      const ids = (await root.query('select id from ventas where confirmada_en is not null')).rows;
      assert.ok(ids.length >= 4);
      for (const { id } of ids) {
        const v = await coherente(id); assert.equal(v.total, v.lineas);
        assert.equal((await q('select respuesta=devd_venta_dto(id) ok from ventas where id=$1', [id])).ok, true);
      }
    });
    console.log(`${total} pruebas de inmutabilidad HU61 aprobadas. El defecto 2.50/3.75 ya no se reproduce.`);
  } finally {
    await cerrar(); await root.query('rollback');
    await Promise.allSettled([a.end(), b.end(), root.end()]);
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
