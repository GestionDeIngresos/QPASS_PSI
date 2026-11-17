-- QPass · Sprint 3 · Dev D · HU 59/61/62/63 · BORRADOR NO APROBADO
-- Basado en columnas/FK observadas en OpenAPI del proyecto real (2026-11-16).
-- BLOQUEADO hasta revisar catálogo, triggers, permisos y dependencias completos.
-- No habilita cobro ni certifica ventas previas. No modifica saldos, reservas o RLS.
-- La habilitación del guard NO sustituye la autorización del usuario.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if current_setting('qpass.devd_revision_catalogo',true) is distinct from 'catalogo-y-dependencias-revisados' then
    raise exception 'BORRADOR_BLOQUEADO: faltan revisión de catálogo y autorización explícita. No habilitar solo para probar en remoto.';
  end if;
end $$;

-- Contrato mínimo observado. Fallar ante deriva, no adaptar tipos silenciosamente.
do $$ declare r record; begin
  for r in select * from (values
    ('ventas','id','integer'),('ventas','ayudante_id','integer'),
    ('ventas','negocio_id','integer'),('ventas','cliente_id','uuid'),
    ('ventas','evento_id','integer'),('ventas','total','numeric'),
    ('venta_items','venta_id','integer'),('venta_items','producto_id','integer'),
    ('venta_items','cantidad','integer'),('venta_items','precio_unitario','numeric'),
    ('entradas','id','integer')
  ) as esperado(tabla,columna,tipo)
  loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=r.tabla and c.column_name=r.columna and c.data_type=r.tipo) then
      raise exception 'ESQUEMA_CAMBIO: %.% no coincide con %',r.tabla,r.columna,r.tipo;
    end if;
  end loop;
end $$;

-- NULL sin default: no se inventan históricos/confirmaciones de registros viejos.
alter table public.ventas
  add column if not exists solicitud_id uuid,
  add column if not exists solicitud_payload jsonb,
  add column if not exists confirmada_en timestamptz,
  add column if not exists negocio_nombre_historico text,
  add column if not exists entrada_id integer;
alter table public.venta_items add column if not exists producto_nombre_historico text;

-- Repetibilidad: comprobar tipos de columnas que ya pudieran existir.
do $$ declare r record; begin
  for r in select * from (values
    ('ventas','solicitud_id','uuid'),('ventas','solicitud_payload','jsonb'),
    ('ventas','confirmada_en','timestamp with time zone'),
    ('ventas','negocio_nombre_historico','text'),('ventas','entrada_id','integer'),
    ('venta_items','producto_nombre_historico','text')
  ) as esperado(tabla,columna,tipo)
  loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public'
      and c.table_name=r.tabla and c.column_name=r.columna and c.data_type=r.tipo
      and c.is_nullable='YES' and c.column_default is null) then
      raise exception 'COLUMNA_INCOMPATIBLE: %.%',r.tabla,r.columna;
    end if;
  end loop;
end $$;

-- Un UUID de operación identifica una sola venta. NULL conserva filas heredadas.
-- El futuro RPC debe verificar propietario antes de devolver un resultado repetido.
-- Reutilizar un índice equivalente si ya existe; no duplicarlo con otro nombre.
do $$ declare v_col smallint; begin
  select attnum into v_col from pg_attribute where attrelid='public.ventas'::regclass
    and attname='solicitud_id' and not attisdropped;
  if not exists(select 1 from pg_index i where i.indrelid='public.ventas'::regclass
    and i.indisunique and i.indisvalid and i.indisready and i.indnatts=1
    and i.indkey[0]=v_col and i.indpred is null and i.indexprs is null) then
    if to_regclass('public.qpass_devd_ventas_solicitud_unica') is not null then
      raise exception 'INDICE_INCOMPATIBLE: qpass_devd_ventas_solicitud_unica';
    end if;
    create unique index qpass_devd_ventas_solicitud_unica on public.ventas(solicitud_id);
  end if;
end $$;

-- Sin cascadas nuevas sobre entradas ni contratos QR de Dev A.
do $$ declare v_col smallint; begin
  select attnum into v_col from pg_attribute where attrelid='public.ventas'::regclass
    and attname='entrada_id' and not attisdropped;
  if not exists(select 1 from pg_constraint c
    where c.conrelid='public.ventas'::regclass and c.contype='f'
      and c.conkey=array[v_col] and c.confrelid='public.entradas'::regclass
      and c.confkey=array[(select attnum from pg_attribute where attrelid='public.entradas'::regclass and attname='id')]::smallint[]
      and c.confdeltype='a' and c.confupdtype='a' and c.convalidated) then
    if exists(select 1 from pg_constraint where conrelid='public.ventas'::regclass and conname='qpass_devd_ventas_entrada_fk') then
      raise exception 'FK_INCOMPATIBLE: qpass_devd_ventas_entrada_fk';
    end if;
    alter table public.ventas add constraint qpass_devd_ventas_entrada_fk
      foreign key(entrada_id) references public.entradas(id);
  end if;
end $$;

-- precio_unitario y total EXISTEN: se conservan, no se duplican ni recalculan.
-- No se cambian funciones, triggers, GRANT/REVOKE, políticas ni estado de entradas.
-- Las columnas nuevas heredan permisos de tabla: NO usarlas como prueba de
-- confirmación hasta revisar ACL/RLS y proteger su escritura en el futuro contrato.
commit;
