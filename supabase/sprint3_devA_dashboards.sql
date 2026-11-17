-- QPass · Sprint 3 · Dev A · HU 23 y HU 24
begin;
create or replace function public.resumen_dashboard(p_evento integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_rol text; v_result jsonb;
begin
  select rol::text into v_rol from public.usuarios where id=auth.uid() and activo;
  if v_rol is null then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
  if p_evento is null then
    if v_rol<>'admin' then raise exception 'SIN_PERMISOS' using errcode='42501'; end if;
    select jsonb_build_object(
      'entradas',(select count(*) from public.entradas en join public.compras c on c.id=en.compra_id where c.estado_pago='confirmado' and en.estado<>'anulada'),
      'compras',(select count(*) from public.compras where estado_pago='confirmado'),
      'ingresos',(select coalesce(sum(total),0) from public.compras where estado_pago='confirmado'),
      'usuarios',(select count(*) from public.usuarios),
      'eventos',(select count(*) from public.eventos where estado='publicado' and fecha_evento>=now()),
      'historial',(select coalesce(jsonb_agg(x order by x.creado_en desc),'[]'::jsonb) from
        (select id,total,creado_en from public.compras where estado_pago='confirmado' order by creado_en desc,id desc limit 10) x)
    ) into v_result;
  else
    if v_rol<>'organizador' or not exists(select 1 from public.eventos where id=p_evento and organizador_id=auth.uid()) then
      raise exception 'SIN_PERMISOS' using errcode='42501';
    end if;
    with entradas_evento as (
      select en.* from public.entradas en join public.tipos_ticket t on t.id=en.tipo_ticket_id
      join public.compras c on c.id=en.compra_id where t.evento_id=p_evento and c.estado_pago='confirmado' and en.estado<>'anulada'
    ), compras_evento as (
      select c.id,c.total,c.creado_en from public.compras c
      where c.id in (select compra_id from entradas_evento)
    )
    select jsonb_build_object('entradas',(select count(*) from entradas_evento),
      'compras',(select count(*) from compras_evento),
      'ingresos',(select coalesce(sum(total),0) from compras_evento),
      'usuarios',(select count(distinct usuario_destino_id) from entradas_evento),
      'eventos',1,
      'historial',(select coalesce(jsonb_agg(x order by x.creado_en desc),'[]'::jsonb) from
        (select * from compras_evento order by creado_en desc,id desc limit 10) x)) into v_result;
  end if;
  return v_result;
end;
$$;
revoke all on function public.resumen_dashboard(integer) from public,anon;
grant execute on function public.resumen_dashboard(integer) to authenticated;
commit;
