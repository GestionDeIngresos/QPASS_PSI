-- Solo validación, sin modificar datos. Ejecutar antes de 001..004.
-- Catálogo fuente SHA256 dbee7ad1fa7f95ea7741d7e61eca365f174caa1087adc781f58c9718574c4a07.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$
declare r record;
begin
  if current_user <> 'postgres' then raise exception 'APLICAR_COMO_POSTGRES'; end if;
  for r in select * from (values
    ('negocios','estado','boolean'),('negocios','dueno_id','uuid'),
    ('productos','precio','numeric(10,2)'),('ayudantes','usuario_id','uuid'),
    ('ventas','ayudante_id','integer'),('ventas','total','numeric(10,2)'),
    ('venta_items','precio_unitario','numeric(10,2)'),('saldos_puntos','saldo','numeric(10,2)'),
    ('solicitudes_devolucion','monto_solicitado','numeric(10,2)'),
    ('entradas','id','integer'),('reportes_entrada','id','integer')
  ) x(tabla,columna,tipo) loop
    if not exists(select 1 from pg_attribute a
      where a.attrelid=to_regclass('public.'||r.tabla) and a.attname=r.columna
      and format_type(a.atttypid,a.atttypmod)=r.tipo and not a.attisdropped) then
      raise exception 'DERIVA_COLUMNA: %.%',r.tabla,r.columna;
    end if;
  end loop;
  if not exists(select 1 from pg_constraint where conrelid='public.saldos_puntos'::regclass
    and conname='saldos_puntos_usuario_id_evento_id_key' and contype='u' and convalidated) then
    raise exception 'SALDO_SIN_UNICIDAD';
  end if;
  if exists(select 1 from pg_trigger where tgrelid in
    ('public.ventas'::regclass,'public.venta_items'::regclass,'public.saldos_puntos'::regclass,
     'public.solicitudes_devolucion'::regclass,'public.devoluciones'::regclass,'public.recargas'::regclass,
     'public.entradas'::regclass,'public.reportes_entrada'::regclass) and not tgisinternal) then
    raise exception 'TRIGGERS_CAMBIARON: recatalogar antes de continuar';
  end if;
  for r in select unnest(array['public.identificar_qr(text,integer)',
    'public.comprar_entradas_prueba(text,jsonb,text,uuid,text)',
    'public.listar_reportes_admin(text,text,text)','public.resolver_reporte_admin(text,integer)']) firma loop
    if not exists(select 1 from pg_proc where oid=to_regprocedure(r.firma)
      and prosecdef and pg_get_userbyid(proowner)='postgres') then
      raise exception 'RPC_INCOMPATIBLE: %',r.firma;
    end if;
  end loop;
  if exists(select 1 from pg_class where oid in ('public.entradas'::regclass,
    'public.reportes_entrada'::regclass,'public.ventas'::regclass,'public.venta_items'::regclass,
    'public.saldos_puntos'::regclass,'public.productos'::regclass,'public.ayudantes'::regclass,
    'public.negocios'::regclass,'public.solicitudes_devolucion'::regclass)
    and (not relrowsecurity or relforcerowsecurity)) then raise exception 'RLS_CAMBIO'; end if;
end $$;
commit;
