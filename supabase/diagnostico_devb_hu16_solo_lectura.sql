-- HU16: diagnostico de catalogo; no invoca RPC ni devuelve datos de usuarios.
-- Para un resumen de todo Dev B, preferir preflight_devb_resumen_solo_lectura.sql.
begin transaction read only;

with requeridas(tabla,columna) as (values
  ('usuarios','id'),('usuarios','activo'),('eventos','id'),('eventos','titulo'),
  ('saldos_puntos','usuario_id'),('saldos_puntos','evento_id'),
  ('saldos_puntos','saldo'),('saldos_puntos','reservado')
)
select tabla,columna,exists(select 1 from pg_attribute a
  where a.attrelid=to_regclass('public.'||tabla) and a.attname=columna
    and a.attnum>0 and not a.attisdropped) presente
from requeridas order by tabla,columna;

select p.oid is not null rpc_existe,
  coalesce(p.prorettype='jsonb'::regtype,false) devuelve_jsonb,
  coalesce(p.prosecdef,false) security_definer,
  coalesce(p.proconfig @> array['search_path=""'],false) search_path_vacio,
  coalesce(has_function_privilege((select oid from pg_roles where rolname='authenticated'),p.oid,'EXECUTE'),false) authenticated_puede_ejecutar,
  coalesce(has_function_privilege((select oid from pg_roles where rolname='anon'),p.oid,'EXECUTE'),false) anon_puede_ejecutar,
  to_regprocedure('auth.uid()') is not null auth_uid_disponible
from (values (1)) x(n)
left join pg_proc p on p.oid=to_regprocedure('public.consultar_mis_saldos()');

select c.relname tabla,c.relrowsecurity rls,c.relforcerowsecurity rls_forzada
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('usuarios','eventos','saldos_puntos')
order by c.relname;

select exists(select 1 from pg_trigger where tgrelid=to_regclass('public.solicitudes_devolucion')
    and tgname='devd_reserva' and not tgisinternal and tgenabled='O') trigger_reserva_d,
  exists(select 1 from pg_constraint where conrelid=to_regclass('public.saldos_puntos')
    and conname='devd_saldo_cubre_reserva' and convalidated) constraint_reserva_d,
  to_regprocedure('public.crear_solicitud_devolucion(integer,numeric,text)') is not null rpc_solicitud_c;

select objeto,to_regclass('public.'||objeto) is not null presente
from (values ('devb_conversion'),('devb_movimientos'),('recargas'),('devoluciones')) x(objeto)
order by objeto;
rollback;
