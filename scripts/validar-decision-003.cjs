/* eslint-disable @typescript-eslint/no-require-imports -- SQL de decisión en memoria; sin red ni ejecución de migraciones. */
const fs = require('node:fs'), assert = require('node:assert/strict');
const { recrearCatalogo, sembrar, usuario } = require('./devd-catalogo-fixture.cjs');
const sql = fs.readFileSync('supabase/verificacion-devd/decision_003_solo_lectura.sql', 'utf8');
const detalleSql = fs.readFileSync('supabase/verificacion-devd/detalle_funciones_pre003.sql', 'utf8');
async function main() {
  const postgres = process.argv.includes('--postgres');
  let db;
  if (postgres) {
    const url = new URL(process.env.QPASS_TEST_DATABASE_URL || '');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^\/qpass_devd_test\w*$/.test(url.pathname)) throw new Error('Solo PostgreSQL local y base nueva qpass_devd_test*.');
    const { Client } = require(process.env.QPASS_PG_MODULE || 'pg');
    const cliente = new Client({ connectionString: url.href }); await cliente.connect();
    const r = await cliente.query("select count(*)::int n from pg_tables where schemaname='public'");
    if (r.rows[0].n !== 0) { await cliente.end(); throw new Error('Base no vacía; no se borrarán objetos.'); }
    db = { exec: s => cliente.query(s), query: (s, args) => cliente.query(s, args), close: () => cliente.end() };
  } else {
    const { PGlite } = require(process.env.QPASS_PGLITE_MODULE || '@electric-sql/pglite');
    db = new PGlite();
  }
  let total = 0;
  const probar = async (nombre, fn) => { await fn(); total++; console.log(`PASS ${nombre}`); };
  const consulta = async () => {
    await db.exec('begin read only');
    try {
      const filas = (await db.query(sql)).rows;
      const detalle = (await db.query(detalleSql)).rows;
      const revision = filas.find(r => r.comprobacion === 'Sin funciones de escritura financiera aparente o SQL dinamico');
      const cantidad = revision.detalle.match(/(?:^|; )REVISION=(\d+)/);
      assert.ok(cantidad, 'Conteo REVISION presente');
      assert.equal(detalle.length, Number(cantidad[1]), 'Detalle y detector deben contar las mismas funciones REVISION');
      assert.ok(detalle.every(r => r.clasificacion === 'REVISION'));
      assert.ok(detalle.every(r => Object.keys(r).join(',') === 'esquema,nombre,firma,clasificacion,motivo,relacion_financiera_detectada'));
      assert.equal(new Set(detalle.map(r => `${r.esquema}.${r.nombre}(${r.firma})`)).size, detalle.length, 'Sin duplicados por sobrecargas o rutas');
      return filas;
    }
    finally { await db.exec('rollback'); }
  };
  const fila = (filas, nombre) => { const r = filas.find(f => f.comprobacion === nombre); assert.ok(r, nombre); return r; };
  try {
    // Solo reconstrucción efímera del catálogo exportado. No aplicar 000–004.
    await recrearCatalogo(db);
    await probar('detalle de funciones es una única SELECT de catálogos y no consulta filas de aplicación', async () => {
      const limpio = detalleSql.replace(/--[^\n]*|'(?:''|[^'])*'/g, '');
      assert.equal((limpio.match(/;/g) || []).length, 1);
      assert.doesNotMatch(limpio, /\b(?:insert\s+into|update\s+public\.|delete\s+from|alter\s|create\s|drop\s|grant\s|revoke\s|truncate\s)/i);
      assert.doesNotMatch(limpio, /\b(?:from|join)\s+public\./i);
      await consulta();
    });
    await probar('una sentencia SELECT devuelve exactamente las tres columnas solicitadas', async () => {
      const limpio = sql.replace(/--[^\n]*|'(?:''|[^'])*'/g, '');
      assert.equal((limpio.match(/;/g) || []).length, 1);
      assert.doesNotMatch(limpio, /\b(?:insert\s+into|update\s+public\.|delete\s+from|alter\s|create\s|drop\s|grant\s|revoke\s|truncate\s)/i);
      const filas = await consulta(); assert.equal(filas.length, 29);
      assert.ok(filas.every(r => Object.keys(r).join(',') === 'comprobacion,correcto,detalle'));
    });
    await probar('esquema anterior a 003: no hay negocios_eventos, reservado ni columnas comerciales futuras', async () => {
      const ausentes = await db.query(`select count(*)::int n from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='negocios_eventos'`);
      assert.equal(ausentes.rows[0].n, 0);
      const cols = await db.query(`select count(*)::int n from pg_catalog.pg_attribute a
        join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and not a.attisdropped and ((c.relname='saldos_puntos' and a.attname='reservado')
          or (c.relname='ventas' and a.attname in ('solicitud_id','confirmada_en','respuesta')))`);
      assert.equal(cols.rows[0].n, 0);
      const filas = await consulta();
      for (const nombre of ['negocios_eventos pendiente de 003', 'saldos_puntos.reservado pendiente de 003']) {
        const r = fila(filas, nombre); assert.equal(r.correcto, true); assert.match(r.detalle, /^PENDIENTE:/);
      }
    });
    await probar('objetos pendientes solo se inspeccionan por catálogo, sin resolver nombres ni descompilar funciones', async () => {
      const limpio = sql.replace(/--[^\n]*|'(?:''|[^'])*'/g, '');
      assert.doesNotMatch(limpio, /\b(?:to_regclass|to_regtype|pg_get_functiondef)\s*\(|::\s*(?:regclass|regnamespace)\b/i);
      assert.doesNotMatch(limpio, /\b(?:from|join)\s+public\.negocios_eventos\b/i);
      assert.match(limpio, /pg_catalog\.pg_class/); assert.match(limpio, /pg_catalog\.pg_attribute/);
    });
    await probar('tablas vacías NO aprueban contrato; acceso a recargas del listado admin queda pendiente', async () => {
      const filas = await consulta();
      assert.equal(fila(filas, 'RESULTADO TECNICO').correcto, null);
      const r = fila(filas, 'Sin funciones de escritura financiera aparente o SQL dinamico');
      assert.equal(r.correcto, null); assert.match(r.detalle, /public.listar_reportes_admin/);
      assert.equal(fila(filas, 'Contrato B/C de unidad precio/puntos aprobado').correcto, null);
      assert.equal(fila(filas, 'Contrato B de saldo, reserva y liquidacion aprobado').correcto, null);
      assert.equal(fila(filas, 'RESULTADO FINAL PARA INSTALAR 003').correcto, null);
    });
    const hooks = require('./fixture-supabase-permisos-003.json').funciones;
    await probar('reproduce falsos positivos con los dos hooks oficiales de Supabase', async () => {
      await db.exec('create schema extensions');
      for (const hook of hooks) await db.exec(hook.definicion);
      const anteriores = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='extensions' and p.prosrc ~* '\\mexecute\\M' order by p.proname`);
      assert.deepEqual(anteriores.rows.map(r => r.proname), hooks.map(h => h.nombre));
      const filas = await consulta(); assert.equal(filas.length, 29);
      const r = fila(filas, 'Sin funciones de escritura financiera aparente o SQL dinamico');
      assert.equal(r.correcto, null);
      assert.match(r.detalle, /RIESGO=0;/);
      assert.doesNotMatch(r.detalle, /extensions.grant_pg_net_access/);
      assert.equal(fila(filas, 'RESULTADO TECNICO').correcto, null);
      assert.equal(fila(filas, 'RESULTADO FINAL PARA INSTALAR 003').correcto, null);
    });
    await probar('un hook con el mismo nombre pero con escritura financiera sigue bloqueando', async () => {
      const hook = hooks.find(h => h.nombre === 'grant_pg_net_access');
      await db.exec(hook.definicion.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION')
        .replace('BEGIN', 'BEGIN\n UPDATE public.saldos_puntos SET saldo=0;'));
      const filas = await consulta();
      const r = fila(filas, 'Sin funciones de escritura financiera aparente o SQL dinamico');
      assert.equal(r.correcto, false); assert.match(r.detalle, /extensions.grant_pg_net_access/);
      assert.equal(fila(filas, 'RESULTADO TECNICO').correcto, false);
      await db.exec(hook.definicion.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION'));
    });
    await probar('GRANT EXECUTE no oculta EXECUTE dinámico en el mismo cuerpo ni esquema', async () => {
      const hook = hooks.find(h => h.nombre === 'grant_pg_net_access');
      await db.exec(hook.definicion.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION')
        .replace('BEGIN', `BEGIN\n EXECUTE 'UPDATE public.saldos_puntos SET saldo=0';`));
      assert.equal(fila(await consulta(), 'Sin funciones de escritura financiera aparente o SQL dinamico').correcto, null);
      await db.exec(hook.definicion.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION'));
    });
    await probar('permisos EXECUTE multilínea y REVOKE en QPass tampoco son ejecución', async () => {
      await db.exec(`create function public.fixture_permisos() returns void language plpgsql as $$begin
        GRANT\nEXECUTE\nON\nFUNCTION auth.uid() TO authenticated;
        REVOKE EXECUTE ON FUNCTION auth.uid() FROM anon; end$$`);
      const filas = await consulta();
      assert.equal(fila(filas, 'Sin funciones de escritura financiera aparente o SQL dinamico').correcto, null);
      assert.doesNotMatch(fila(filas, 'Sin funciones de escritura financiera aparente o SQL dinamico').detalle, /public.fixture_permisos/);
      assert.equal(fila(filas, 'Escritores externos e indirectos coordinados').correcto, null);
    });
    await probar('Realtime oficial: SQL dinámico genérico es NULL, no escritor financiero confirmado', async () => {
      await db.exec(`create schema realtime;
        create type realtime.action as enum ('INSERT','UPDATE','DELETE','ERROR');
        create type realtime.wal_column as (name text,type_name text,type_oid oid,value jsonb,is_pkey boolean,is_selectable boolean);
        create type realtime.wal_rls as (wal jsonb,is_rls_enabled boolean,subscription_ids uuid[],errors text[]);
        create table realtime.subscription(id bigint,entity regclass,claims jsonb,claims_role regrole,filters jsonb,action_filter text);`);
      for (const f of require('./fixture-supabase-realtime-003.json').funciones) await db.exec(f.definicion);
      const filas = await consulta(); assert.equal(filas.length, 29);
      const r = fila(filas, 'Sin funciones de escritura financiera aparente o SQL dinamico');
      assert.equal(r.correcto, null); assert.match(r.detalle, /RIESGO=0;/);
      assert.match(r.detalle, /realtime.apply_rls\([^]*?REVISION: SQL dinamico/);
      assert.match(r.detalle, /realtime.cast\([^]*?REVISION: SQL dinamico/);
      assert.equal(fila(filas, 'RESULTADO TECNICO').correcto, null);
      assert.equal(fila(filas, 'RESULTADO FINAL PARA INSTALAR 003').correcto, null);
    });
    await probar('función ordinaria sin vínculo financiero no se marca por su esquema o SECURITY DEFINER', async () => {
      await db.exec(`create function realtime.fixture_constante() returns integer language sql security definer as $$select 1$$;
        create function public.fixture_constante() returns integer language sql as $$select 2$$`);
      const r = fila(await consulta(), 'Sin funciones de escritura financiera aparente o SQL dinamico');
      assert.doesNotMatch(r.detalle, /fixture_constante/); assert.match(r.detalle, /SIN RELACION DETECTADA=/);
    });
    await probar('dependencias reales: función SQL preanalizada -> función -> vista -> saldo', async () => {
      await db.exec(`create view public.fixture_vista_saldo as select saldo from public.saldos_puntos;
        create function public.fixture_lectura_vista() returns numeric language sql
          begin atomic select saldo from public.fixture_vista_saldo limit 1; end;
        create function realtime.fixture_cadena() returns numeric language sql security definer
          begin atomic select public.fixture_lectura_vista(); end;`);
      const deps = await db.query(`select count(*)::int n from pg_depend d
        join pg_proc p on p.oid=d.objid join pg_class dc on dc.oid=d.classid
        join pg_proc destino on destino.oid=d.refobjid join pg_class rc on rc.oid=d.refclassid
        where dc.relname='pg_proc' and rc.relname='pg_proc'
          and p.proname='fixture_cadena' and destino.proname='fixture_lectura_vista'`);
      assert.ok(deps.rows[0].n > 0);
      const r = fila(await consulta(), 'Sin funciones de escritura financiera aparente o SQL dinamico');
      assert.equal(r.correcto, null); assert.match(r.detalle, /realtime.fixture_cadena/);
      assert.match(r.detalle, /public.fixture_lectura_vista/); assert.match(r.detalle, /RIESGO=0;/);
    });
    await probar('llamadas PLpgSQL ausentes de pg_depend y ciclos se recorren sin ejecutar', async () => {
      await db.exec(`create function realtime.fixture_ciclo_a() returns void language plpgsql as $$
          begin perform realtime.fixture_ciclo_b(); end$$;
        create function realtime.fixture_ciclo_b() returns void language plpgsql as $$
          begin perform realtime.fixture_ciclo_a(); perform realtime.cast('0','integer'); end$$;`);
      const r = fila(await consulta(), 'Sin funciones de escritura financiera aparente o SQL dinamico');
      assert.equal(r.correcto, null); assert.match(r.detalle, /fixture_ciclo_a/); assert.match(r.detalle, /fixture_ciclo_b/);
    });
    await probar('UPDATE mencionado en un literal o comentario no prueba escritura', async () => {
      await db.exec(`create function realtime.fixture_mensaje() returns text language plpgsql as $$
        begin -- update public.saldos_puntos set saldo=0;
          return 'update public.saldos_puntos set saldo=0'; end$$`);
      const r = fila(await consulta(), 'Sin funciones de escritura financiera aparente o SQL dinamico');
      assert.equal(r.correcto, null); assert.doesNotMatch(r.detalle, /fixture_mensaje/); assert.match(r.detalle, /RIESGO=0;/);
    });
    await probar('quoting no resuelto se marca NULL en lugar de afirmar DML financiero', async () => {
      await db.exec(`create function realtime.fixture_dollar() returns text language plpgsql as $body$
        begin return $texto$update public.saldos_puntos set saldo=0$texto$; end $body$`);
      const r = fila(await consulta(), 'Sin funciones de escritura financiera aparente o SQL dinamico');
      assert.equal(r.correcto, null); assert.match(r.detalle, /fixture_dollar[^\]]*REVISION: quoting/);
      assert.match(r.detalle, /RIESGO=0;/);
    });
    await sembrar(db);
    await probar('solicitud pendiente y aprobada aparecen en filas separadas de conciliación', async () => {
      await db.query('insert into solicitudes_devolucion(usuario_id,evento_id,monto_solicitado,qr_bancario_url) values($1,1,10,$2)', [usuario(5), 'fixture/qr']);
      let filas = await consulta();
      assert.equal(fila(filas, 'Sin solicitudes en_revision por conciliar').correcto, false);
      assert.equal(fila(filas, 'Sin solicitudes aprobada por conciliar').correcto, true);
      await db.exec("update solicitudes_devolucion set estado='aprobada'");
      filas = await consulta();
      assert.equal(fila(filas, 'Sin solicitudes aprobada por conciliar').correcto, false);
      assert.equal(fila(filas, 'Reservas propuestas no superan saldo').correcto, true);
    });
    await probar('reserva superior al saldo y objetos de 003 previos bloquean el avance', async () => {
      await db.exec('update solicitudes_devolucion set monto_solicitado=101; alter table saldos_puntos add column reservado numeric(10,2)');
      const filas = await consulta();
      assert.equal(fila(filas, 'Reservas propuestas no superan saldo').correcto, false);
      assert.equal(fila(filas, 'Objetos de primera instalacion de 003 libres').correcto, false);
      assert.match(fila(filas, 'Objetos de primera instalacion de 003 libres').detalle, /saldos_puntos.reservado/);
      assert.equal(fila(filas, 'RESULTADO FINAL PARA INSTALAR 003').correcto, false);
    });
    await probar('triggers financieros se señalan con su nombre sin ejecutarlos', async () => {
      await db.exec(`create function fixture_financiero() returns trigger language plpgsql as $$begin return new; end$$;
        create trigger fixture_financiero before update on saldos_puntos for each row execute function fixture_financiero();`);
      const r = fila(await consulta(), 'Sin triggers financieros que requieran revision');
      assert.equal(r.correcto, false); assert.match(r.detalle, /saldos_puntos.fixture_financiero/);
    });
    await probar('detecta cuerpo de escritor financiero, sin llamar la función', async () => {
      await db.exec('create function fixture_debito() returns void language sql as $$update public.saldos_puntos set saldo=0$$');
      const antes = (await db.query('select saldo from saldos_puntos')).rows[0].saldo;
      const r = fila(await consulta(), 'Sin funciones de escritura financiera aparente o SQL dinamico');
      assert.equal(r.correcto, false); assert.match(r.detalle, /fixture_debito/);
      assert.equal((await db.query('select saldo from saldos_puntos')).rows[0].saldo, antes);
    });
    await probar('escritor indirecto: el destino sigue alertado y no se aprueba la coordinación', async () => {
      await db.exec(`create function extensions.fixture_intermediaria() returns void language plpgsql as $$
        begin perform public.fixture_debito(); end$$`);
      const filas = await consulta();
      assert.match(fila(filas, 'Sin funciones de escritura financiera aparente o SQL dinamico').detalle, /public.fixture_debito/);
      assert.equal(fila(filas, 'RESULTADO TECNICO').correcto, false);
      assert.equal(fila(filas, 'Escritores externos e indirectos coordinados').correcto, null);
      assert.equal((await db.query('select saldo from saldos_puntos')).rows[0].saldo, '100.00');
    });
    await probar('SQL preanalizado mantiene la alerta sin descompilar ni ejecutar', async () => {
      await db.exec(`create function public.fixture_preanalizada() returns void language sql
        begin atomic update public.saldos_puntos set saldo=0; end`);
      const r = fila(await consulta(), 'Sin funciones de escritura financiera aparente o SQL dinamico');
      assert.equal(r.correcto, false); assert.match(r.detalle, /fixture_preanalizada/);
    });
    await probar('miembro de extensión SECURITY DEFINER no oculta escritura financiera', async () => {
      await db.exec(`create function extensions.fixture_extension_writer() returns void language plpgsql security definer as $$
        begin update public.saldos_puntos set saldo=0; end$$;
        alter extension plpgsql add function extensions.fixture_extension_writer();`);
      const r = fila(await consulta(), 'Sin funciones de escritura financiera aparente o SQL dinamico');
      assert.equal(r.correcto, false);
      assert.match(r.detalle, /extensions.fixture_extension_writer\(\) \[RIESGO:[^\]]*SECURITY DEFINER=true[^\]]*extension=plpgsql/);
      assert.equal((await db.query('select saldo from saldos_puntos')).rows[0].saldo, '100.00');
    });
    await probar('dependencia indirecta vía trigger de otra tabla se informa', async () => {
      await db.exec(`create table public.fixture_puente (id integer);
        create function realtime.fixture_trigger() returns trigger language plpgsql as $$
          begin update public.saldos_puntos set saldo=0; return new; end$$;
        create trigger fixture_puente after insert on public.fixture_puente for each row execute function realtime.fixture_trigger();
        create function public.fixture_activa_trigger() returns void language sql
          begin atomic insert into public.fixture_puente values(1); end;`);
      const r = fila(await consulta(), 'Sin funciones de escritura financiera aparente o SQL dinamico');
      assert.equal(r.correcto, false); assert.match(r.detalle, /public.fixture_activa_trigger/);
      assert.match(r.detalle, /realtime.fixture_trigger\(\) \[RIESGO:/);
      assert.equal((await db.query('select count(*)::int n from fixture_puente')).rows[0].n, 0);
    });
    await probar('dependencia real de operador SQL hacia función financiera se conserva', async () => {
      await db.exec(`create function realtime.fixture_operador(a integer,b integer) returns integer language plpgsql as $$
        begin update public.saldos_puntos set saldo=0; return a+b; end$$;
        create operator public.## (leftarg=integer,rightarg=integer,function=realtime.fixture_operador);
        create function public.fixture_usa_operador() returns integer language sql
          begin atomic select 1 operator(public.##) 2; end;`);
      const r = fila(await consulta(), 'Sin funciones de escritura financiera aparente o SQL dinamico');
      assert.equal(r.correcto, false); assert.match(r.detalle, /public.fixture_usa_operador/);
      assert.match(r.detalle, /realtime.fixture_operador[^\]]*RIESGO:/);
    });
    await probar('nueva política de productos exige revisión y no se borra', async () => {
      await db.exec('create policy fixture_producto on productos for select to authenticated using(true)');
      const filas = await consulta();
      assert.equal(fila(filas, 'Politicas de productos coinciden con catalogo previo').correcto, false);
      assert.match(fila(filas, 'Politicas de productos coinciden con catalogo previo').detalle, /fixture_producto/);
      assert.equal(fila(filas, 'RLS de productos activada sin FORCE').correcto, true);
    });
    await probar('una función legada que menciona negocios_eventos y reservado no se ejecuta', async () => {
      await db.exec(`create function fixture_legada_pre003() returns void language plpgsql as $$
        begin update public.negocios_eventos set activo=false;
          update public.saldos_puntos set reservado=0; end $$;`);
      const r = fila(await consulta(), 'Sin funciones de escritura financiera aparente o SQL dinamico');
      assert.equal(r.correcto, false); assert.match(r.detalle, /fixture_legada_pre003/);
      const rls = fila(await consulta(), 'RLS de productos activada sin FORCE'); assert.equal(rls.correcto, true);
    });
    await probar('tabla pendiente ya existente se informa como colisión, sin consultar columnas de esa tabla', async () => {
      // Fixture deliberadamente incompleto: no simula ni aplica la migración 003.
      await db.exec('create table public.negocios_eventos (fixture_sin_columnas_reales boolean)');
      const filas = await consulta();
      assert.equal(fila(filas, 'negocios_eventos pendiente de 003').correcto, false);
      assert.match(fila(filas, 'negocios_eventos pendiente de 003').detalle, /^YA EXISTE:/);
      assert.equal(fila(filas, 'Objetos de primera instalacion de 003 libres').correcto, false);
    });
    await probar('permisos por columna nuevos se señalan sin alterar grants ni RLS', async () => {
      await db.exec('grant update(precio) on public.productos to authenticated');
      const r = fila(await consulta(), 'Permisos de columnas de ventas y productos sin desviaciones');
      assert.equal(r.correcto, false); assert.match(r.detalle, /productos ACL=/);
    });
    console.log(`${total} pruebas de decisión 003 aprobadas en ${postgres ? 'PostgreSQL local' : 'PGlite'}. Sin consultas remotas ni ejecución de migraciones.`);
  } finally { await db.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
