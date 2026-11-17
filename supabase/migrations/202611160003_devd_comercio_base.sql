-- PROPUESTA v1: precios en puntos, saldo total sin descontar reservas.
-- Pendiente de coordinación B/C. No habilita ningún negocio/evento.
-- en_revision y aprobada reservan el monto COMPLETO; rechazada libera.
-- No inferir liquidación desde una fila de devoluciones: no hay protocolo B.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

create table public.negocios_eventos (
  negocio_id integer not null references public.negocios(id),
  evento_id integer not null references public.eventos(id),
  activo boolean not null default false,
  contrato text not null default 'reservas_conservadoras_v1'
    check(contrato='reservas_conservadoras_v1'),
  primary key(negocio_id,evento_id)
);
alter table public.negocios_eventos enable row level security;
revoke all on public.negocios_eventos from public,anon,authenticated;

alter table public.ventas
  add column solicitud_id uuid,
  add column solicitud_payload jsonb,
  add column confirmada_en timestamptz,
  add column negocio_nombre_historico text,
  add column entrada_id integer references public.entradas(id),
  add column cobrador_id uuid references public.usuarios(id),
  add column respuesta jsonb;
alter table public.venta_items add column producto_nombre_historico text;
-- Sin backfill de ventas, nombres ni precios: las heredadas no se certifican.
create unique index devd_ventas_idempotencia on public.ventas(cobrador_id,solicitud_id);
create index devd_ventas_historial on public.ventas(ayudante_id,evento_id,creado_en desc,id desc)
  where confirmada_en is not null;
create index devd_items_venta on public.venta_items(venta_id);
create index devd_productos_negocio on public.productos(negocio_id,id);
create index devd_solicitudes_reservas on public.solicitudes_devolucion(usuario_id,evento_id)
  where estado in ('en_revision','aprobada');

-- Impedir carreras con escritores privilegiados durante la inicialización.
lock table public.solicitudes_devolucion, public.saldos_puntos in share row exclusive mode;
do $$ begin
  if exists(select 1 from public.solicitudes_devolucion d
    left join public.saldos_puntos s on s.usuario_id=d.usuario_id and s.evento_id=d.evento_id
    where d.estado in ('en_revision','aprobada') and s.id is null) then
    raise exception 'RESERVAS_SIN_SALDO: conciliar, no crear saldo artificial';
  end if;
  if exists(select 1 from public.devoluciones) then
    raise exception 'DEVOLUCIONES_HEREDADAS: conciliar semantica B antes de instalar reservas v1';
  end if;
  if exists(select 1 from public.saldos_puntos s where s.saldo <
    (select coalesce(sum(d.monto_solicitado),0) from public.solicitudes_devolucion d
     where d.usuario_id=s.usuario_id and d.evento_id=s.evento_id and d.estado in ('en_revision','aprobada'))) then
    raise exception 'RESERVAS_SUPERAN_SALDO: conciliar sin descontar dos veces';
  end if;
end $$;
alter table public.saldos_puntos add column reservado numeric(10,2) not null default 0;
update public.saldos_puntos s set reservado=(select coalesce(sum(d.monto_solicitado),0)
  from public.solicitudes_devolucion d where d.usuario_id=s.usuario_id and d.evento_id=s.evento_id
  and d.estado in ('en_revision','aprobada'));
alter table public.saldos_puntos add constraint devd_saldo_cubre_reserva
  check(reservado>=0 and saldo>=reservado and saldo<>'NaN'::numeric and reservado<>'NaN'::numeric);

-- Una única fila de saldo es el cerrojo común. Reservar actualiza esa fila,
-- también cuando antes NO existía ninguna solicitud (evita phantoms).
create or replace function public.devd_mantener_reserva()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_antes numeric:=0; v_despues numeric:=0;
begin
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'AISLAMIENTO_NO_SOPORTADO';
  end if;
  if tg_op='UPDATE' then
    if new.usuario_id is distinct from old.usuario_id or new.evento_id is distinct from old.evento_id then
      raise exception 'RESERVA_IDENTIDAD_INMUTABLE';
    end if;
    if old.estado in ('en_revision','aprobada') then v_antes:=old.monto_solicitado; end if;
  end if;
  if new.monto_solicitado='NaN'::numeric then raise exception 'MONTO_INVALIDO'; end if;
  if new.estado in ('en_revision','aprobada') then v_despues:=new.monto_solicitado; end if;
  if v_despues<>v_antes then
    update public.saldos_puntos set reservado=reservado+v_despues-v_antes
      where usuario_id=new.usuario_id and evento_id=new.evento_id
        and reservado+v_despues-v_antes between 0 and saldo;
    if not found then raise exception 'SALDO_INSUFICIENTE_PARA_RESERVA'; end if;
  end if;
  return new;
end $$;
revoke all on function public.devd_mantener_reserva() from public,anon,authenticated,service_role;
create trigger devd_reserva before insert or update on public.solicitudes_devolucion
for each row execute function public.devd_mantener_reserva();

create or replace function public.devd_impedir_borrado_financiero()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'HISTORICO_FINANCIERO_INMUTABLE'; end $$;
revoke all on function public.devd_impedir_borrado_financiero() from public,anon,authenticated,service_role;
create trigger devd_no_borrar_reservas before delete on public.solicitudes_devolucion
for each row execute function public.devd_impedir_borrado_financiero();
create or replace function public.devd_proteger_saldo()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.usuario_id is distinct from old.usuario_id or new.evento_id is distinct from old.evento_id then
    raise exception 'SALDO_IDENTIDAD_INMUTABLE'; end if;
  -- Detectar escrituras accidentales fuera del trigger de reservas. La autoridad
  -- sigue en ACL/RLS: la profundidad de trigger NO es una credencial.
  if new.reservado is distinct from old.reservado and pg_trigger_depth()<>2 then
    raise exception 'RESERVADO_SOLO_POR_SOLICITUD'; end if;
  return new;
end $$;
revoke all on function public.devd_proteger_saldo() from public,anon,authenticated,service_role;
create trigger devd_saldo_claves before update on public.saldos_puntos
for each row execute function public.devd_proteger_saldo();
-- Conserva la clave y el acumulado; solo el trigger de reserva modifica reservado.
-- current_user dentro de una función definer NO identifica al cliente.
-- La barrera de escritura real son ACL/RLS; B/C deben escribir por RPC revisadas.
revoke all on public.ventas,public.venta_items,public.saldos_puntos,
  public.solicitudes_devolucion from public,anon,authenticated;
revoke all on public.negocios,public.productos,public.ayudantes from public,anon,authenticated;
-- Conserva los grants de service_role existentes; es un escritor privilegiado,
-- NO usar su clave para cobrar ni para pruebas de autorización de usuarios.

create or replace function public.devd_negocio_autorizado(p_evento integer,p_negocio integer)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.usuarios u
    join public.asignaciones_staff s on s.usuario_id=u.id and s.rol_staff='ayudante'
    join public.ayudantes a on a.usuario_id=u.id and a.activo
    join public.negocios n on n.id=a.negocio_id and n.estado
    join public.negocios_eventos ne on ne.negocio_id=n.id and ne.evento_id=s.evento_id and ne.activo
    where u.id=auth.uid() and u.activo and u.rol='ayudante'
      and s.evento_id=p_evento and n.id=p_negocio);
$$;
revoke all on function public.devd_negocio_autorizado(integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.devd_negocio_autorizado(integer,integer) to authenticated;
-- Solo lecturas de catálogo/asignación; operaciones monetarias exclusivamente RPC.
grant select on public.negocios,public.productos,public.ayudantes,public.negocios_eventos to authenticated;
create policy devd_negocios_select on public.negocios for select to authenticated
using(exists(select 1 from public.negocios_eventos ne where ne.negocio_id=id
  and public.devd_negocio_autorizado(ne.evento_id,id)));
create policy devd_productos_select on public.productos for select to authenticated
using(exists(select 1 from public.negocios_eventos ne where ne.negocio_id=productos.negocio_id
  and public.devd_negocio_autorizado(ne.evento_id,productos.negocio_id)));
create policy devd_ayudantes_select on public.ayudantes for select to authenticated
using(usuario_id=auth.uid() and activo and exists(select 1 from public.negocios_eventos ne
  where ne.negocio_id=ayudantes.negocio_id and public.devd_negocio_autorizado(ne.evento_id,ayudantes.negocio_id)));
create policy devd_negocios_eventos_select on public.negocios_eventos for select to authenticated
using(public.devd_negocio_autorizado(evento_id,negocio_id));
-- No se conceden lecturas directas de ventas/saldos/reportes: evitan PII,
-- payload idempotente y columnas futuras. Sus RPC proyectan DTO explícitos.
commit;
