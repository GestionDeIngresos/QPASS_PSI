/* eslint-disable @typescript-eslint/no-require-imports -- PostgreSQL aislado, sin red. */
const fs = require('node:fs');
const catalogo = require('../docs/integracion-supabase/qpass_catalogo_supabase_2026-11-16.json');
const ident = s => '"' + s.replaceAll('"', '""') + '"';
const literal = s => "'" + s.replaceAll("'", "''") + "'";
const rol = s => s === 'public' || s === '' ? 'PUBLIC' : ident(s);
const migraciones = fs.readdirSync('supabase/migrations').filter(s => /^20261116000[0-4]_/.test(s)).sort();
async function recrearCatalogo(db) {
  await db.exec(`create schema auth; create schema storage;
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
      if exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls)) then
        raise exception 'ROLES_DE_PRUEBA_PRIVILEGIADOS'; end if;
    end $$;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create table storage.objects(bucket_id text,name text);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    set timezone='UTC';`);
  for (const nombre of [...new Set(catalogo.enums.map(e => e.tipo))]) {
    await db.exec(`create type public.${ident(nombre)} as enum (${catalogo.enums.filter(e => e.tipo === nombre).map(e => literal(e.valor)).join(',')})`);
  }
  for (const r of catalogo.relaciones.filter(r => r.tipo === 'S')) await db.exec(`create sequence public.${ident(r.nombre)}`);
  for (const r of catalogo.relaciones.filter(r => r.tipo === 'r')) {
    const cols = r.columnas.map(a => `${ident(a.nombre)} ${a.tipo}${a.identity ? ` generated ${a.identity === 'a' ? 'always' : 'by default'} as identity` : a.default ? ` default ${a.default}` : ''}${a.not_null ? ' not null' : ''}`);
    await db.exec(`create table public.${ident(r.nombre)} (${cols.join(',')})`);
  }
  for (const tipo of ['p', 'u', 'c', 'f']) for (const r of catalogo.relaciones.filter(r => r.tipo === 'r')) {
    for (const c of r.constraints.filter(c => c.tipo === tipo)) {
      await db.exec(`alter table public.${ident(r.nombre)} add constraint ${ident(c.nombre)} ${c.definicion}`);
    }
  }
  // Todas las definiciones, también las que no usa directamente Dev D.
  const ordenFunciones = [...catalogo.funciones].sort((a, b) => Number(b.nombre === 'qpass_autorizado_evento') - Number(a.nombre === 'qpass_autorizado_evento'));
  for (const f of ordenFunciones) await db.exec(f.definicion);
  for (const i of catalogo.indices) await db.exec(i.indexdef.replace(/INDEX /, 'INDEX IF NOT EXISTS '));
  for (const r of catalogo.relaciones.filter(r => r.tipo === 'r')) {
    if (r.rls) await db.exec(`alter table public.${ident(r.nombre)} enable row level security`);
    if (r.rls_forzada) await db.exec(`alter table public.${ident(r.nombre)} force row level security`);
    await db.exec(`revoke all on public.${ident(r.nombre)} from public,anon,authenticated,service_role`);
    for (const acl of r.acl || []) {
      const [, nombre, permisos] = acl.match(/^(.*?)=([^/]*)\//);
      const mapa = { a: 'INSERT', r: 'SELECT', w: 'UPDATE', d: 'DELETE', D: 'TRUNCATE', x: 'REFERENCES', t: 'TRIGGER', m: 'MAINTAIN' };
      const priv = [...permisos].filter(p => mapa[p]).map(p => mapa[p]);
      if (priv.length) await db.exec(`grant ${priv.join(',')} on public.${ident(r.nombre)} to ${rol(nombre)}`);
    }
  }
  await db.exec('grant usage,select on all sequences in schema public to anon,authenticated,service_role');
  for (const f of catalogo.funciones) {
    const firma = `public.${ident(f.nombre)}(${f.firma})`;
    await db.exec(`revoke all on function ${firma} from public,anon,authenticated,service_role`);
    for (const acl of f.acl || ['=X/postgres']) {
      const [, nombre, permisos] = acl.match(/^(.*?)=([^/]*)\//);
      if (permisos.includes('X')) await db.exec(`grant execute on function ${firma} to ${rol(nombre)}`);
    }
  }
  for (const p of catalogo.politicas) {
    await db.exec(`create policy ${ident(p.policyname)} on public.${ident(p.tablename)} as ${p.permissive}
      for ${p.cmd} to ${p.roles.map(rol).join(',')}${p.qual ? ` using (${p.qual})` : ''}${p.with_check ? ` with check (${p.with_check})` : ''}`);
  }
  for (const t of catalogo.triggers) await db.exec(t.definicion);
  await db.exec(`create trigger fixture_alta after insert on auth.users for each row execute function public.handle_new_user();
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
}
const usuario = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
async function sembrar(db) {
  for (let n = 1; n <= 6; n++) await db.query('insert into auth.users values($1,$2,$3)', [usuario(n), `u${n}@test.local`, { nombre: `Prueba ${n}`, carnet_identidad: `${n}` }]);
  await db.exec(`update usuarios set rol='admin' where id='${usuario(1)}';
    update usuarios set rol='ayudante' where id in ('${usuario(3)}','${usuario(4)}');
    insert into eventos(organizador_id,titulo,fecha_evento,fecha_fin,estado) values
      ('${usuario(1)}','Evento prueba',now()+interval '1 day',now()+interval '2 days','publicado'),
      ('${usuario(1)}','Otro evento',now()+interval '1 day',now()+interval '2 days','publicado');
    insert into tipos_ticket(evento_id,nombre,precio,cantidad_disponible,limite_por_usuario) values(1,'General',10,100,10),(2,'Otro',10,100,10);
    insert into compras(comprador_id,subtotal,total,estado_pago) values('${usuario(2)}',10,10,'confirmado'),('${usuario(2)}',10,10,'pendiente');
    insert into entradas(compra_id,tipo_ticket_id,usuario_destino_id,codigo_qr,estado) values
      (1,1,'${usuario(5)}','QR-REGALO','usada'),(1,2,'${usuario(5)}','QR-OTRO','activa'),
      (2,1,'${usuario(5)}','QR-PENDIENTE','activa');
    insert into negocios(dueno_id,nombre) values('${usuario(1)}','Negocio uno'),('${usuario(1)}','Negocio dos');
    insert into ayudantes(negocio_id,usuario_id) values(1,'${usuario(3)}'),(1,'${usuario(4)}'),(2,'${usuario(3)}');
    insert into asignaciones_staff(usuario_id,evento_id,rol_staff) values('${usuario(3)}',1,'ayudante'),('${usuario(4)}',1,'ayudante');
    insert into productos(negocio_id,nombre,precio) values(1,'Agua',1.25),(1,'Comida',10),(2,'Ajeno',5);
    insert into saldos_puntos(usuario_id,evento_id,saldo) values('${usuario(5)}',1,100);`);
}
module.exports = { recrearCatalogo, sembrar, usuario, migraciones };
