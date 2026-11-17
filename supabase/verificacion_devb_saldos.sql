-- QPass · Sprint 3 · Dev B · comprobación posterior, solo lectura.
-- Ejecutar únicamente DESPUÉS de 202611170001_devb_saldos.sql.
begin transaction read only;
select 'saldo_unico' prueba,not exists(select 1 from public.saldos_puntos group by usuario_id,evento_id having count(*)>1) correcto;
select 'saldo_y_reserva_consistentes' prueba,not exists(
  select 1 from public.saldos_puntos s where s.saldo<s.reservado or s.reservado<0 or s.saldo='NaN'::numeric
  or s.reservado is distinct from (select coalesce(sum(d.monto_solicitado),0) from public.solicitudes_devolucion d
    where d.usuario_id=s.usuario_id and d.evento_id=s.evento_id and d.estado in ('en_revision','aprobada') and d.liquidada_en is null)
) correcto;
select 'liquidaciones_unicas' prueba,not exists(select 1 from public.devoluciones where solicitud_id is not null group by solicitud_id having count(*)>1) correcto;
select 'liquidacion_con_historico' prueba,not exists(select 1 from public.solicitudes_devolucion s where s.liquidada_en is not null
  and (s.estado<>'aprobada' or not exists(select 1 from public.devoluciones d where d.solicitud_id=s.id))) correcto;
select 'movimientos_coherentes' prueba,not exists(select 1 from public.devb_movimientos where saldo_despues<>saldo_antes+delta or saldo_despues<0) correcto;
select 'operaciones_idempotentes' prueba,not exists(select 1 from public.devb_movimientos group by actor_id,solicitud having count(*)>1) correcto;
select 'conversion_configurada' observacion,count(*) eventos_configurados from public.devb_conversion;
select 'evidencias_privadas' prueba,exists(select 1 from storage.buckets where id='devb-evidencias' and not public and file_size_limit=2097152) correcto;
select 'sin_escritura_directa_authenticated' prueba,not (
  has_table_privilege('authenticated','public.saldos_puntos','UPDATE')
  or has_table_privilege('authenticated','public.recargas','INSERT')
  or has_table_privilege('authenticated','public.devoluciones','INSERT')
  or has_table_privilege('authenticated','public.devb_movimientos','UPDATE')
) correcto;
select 'helpers_privados' prueba,not (
  has_function_privilege('authenticated','public.devb_tasa(integer)','EXECUTE')
  or has_function_privilege('anon','public.registrar_recarga(integer,text,numeric,uuid)','EXECUTE')
) correcto;
rollback;
