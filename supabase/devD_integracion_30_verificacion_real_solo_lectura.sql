-- Después de 000..004, antes de habilitar la aplicación. Ninguna escritura.
begin transaction isolation level repeatable read read only;
set local statement_timeout='30s';
set local lock_timeout='3s';

-- Deben existir siete RPC de cliente (incluye el helper booleano de RLS).
select p.proname,pg_get_function_identity_arguments(p.oid) firma,
  pg_get_userbyid(p.proowner) propietario,p.prosecdef,p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') usuario_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (p.proname like 'devd_%' or p.proname in
  ('cobrar_venta','consultar_catalogo_ayudante','consultar_saldo_venta','consultar_detalle_venta',
   'consultar_resumen_ventas','consultar_historial_ventas','consultar_compra_propia',
   'comprar_entradas_terceros_prueba','reportar_entrada_propia','consultar_mis_reportes_entrada'))
order by p.proname;

select c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
and c.relname in ('entradas','reportes_entrada','negocios','productos','ayudantes','negocios_eventos',
  'ventas','venta_items','saldos_puntos','solicitudes_devolucion') order by c.relname;
select * from pg_policies where schemaname='public' and tablename in
  ('entradas','reportes_entrada','negocios','productos','ayudantes','negocios_eventos','ventas','venta_items','saldos_puntos','solicitudes_devolucion')
order by tablename,policyname;

-- Resultado esperado: todos los contadores en cero. Sin exponer usuarios/QR.
select
  (select count(*) from public.saldos_puntos where saldo<reservado or reservado<0) saldos_inconsistentes,
  (select count(*) from public.saldos_puntos s where s.reservado is distinct from
    (select coalesce(sum(d.monto_solicitado),0) from public.solicitudes_devolucion d
    where d.usuario_id=s.usuario_id and d.evento_id=s.evento_id and d.estado in ('en_revision','aprobada'))) reservas_desincronizadas,
  (select count(*) from public.solicitudes_devolucion d where d.estado in ('en_revision','aprobada')
    and not exists(select 1 from public.saldos_puntos s where s.usuario_id=d.usuario_id and s.evento_id=d.evento_id)) reservas_sin_saldo,
  (select count(*) from public.ventas v where confirmada_en is not null and
    (v.total is distinct from (select sum(i.cantidad*i.precio_unitario) from public.venta_items i where i.venta_id=v.id)
    or v.total::text is distinct from v.respuesta->>'total' or v.respuesta->>'id' is distinct from v.id::text
    or v.respuesta is distinct from public.devd_venta_dto(v.id))) ventas_inconsistentes,
  (select count(*) from public.venta_items i join public.ventas v on v.id=i.venta_id
    where v.confirmada_en is not null and i.producto_nombre_historico is null) items_sin_historico;

select count(*) ventas_heredadas_no_certificadas from public.ventas where confirmada_en is null;
select count(*) devoluciones_pendientes_de_contrato_b from public.devoluciones;
select negocio_id,evento_id,activo,contrato from public.negocios_eventos order by negocio_id,evento_id;
select c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal order by c.relname,t.tgname;
rollback;
