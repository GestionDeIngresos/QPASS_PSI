import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { obtenerSesionActual } from '@/lib/auth/sesion';

/** Solo ayudantes activos; un admin no se convierte implícitamente en ayudante. */
export const exigirAyudante = cache(async () => {
  const sesion = await obtenerSesionActual();
  if (!sesion) redirect('/login?next=/ayudante');
  if (sesion.perfil?.rol !== 'ayudante' || sesion.perfil.activo !== true) redirect('/eventos');
  return sesion;
});

export type AsignacionAyudante =
  | { estado: 'asignado'; eventoId: number }
  | { estado: 'sin_asignacion' | 'asignacion_ambigua' };

/** Lee únicamente el contrato existente, con la sesión del ayudante y RLS. */
export const obtenerContextoAyudante = cache(async () => {
  const sesion = await exigirAyudante();
  const { data, error } = await sesion.supabase.from('asignaciones_staff')
    .select('evento_id').eq('usuario_id', sesion.user.id).eq('rol_staff', 'ayudante');
  if (error || !Array.isArray(data)) throw new Error('No se pudo verificar tu evento asignado. Inténtalo de nuevo.');
  const ids = data.map((fila: { evento_id: number | string | null }) => Number(fila.evento_id));
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('No se pudo verificar tu evento asignado. Contacta al administrador.');
  const eventos = [...new Set(ids)];
  const asignacion: AsignacionAyudante = eventos.length === 1 ? { estado: 'asignado', eventoId: eventos[0] }
    : { estado: eventos.length === 0 ? 'sin_asignacion' : 'asignacion_ambigua' };
  return { sesion, asignacion };
});

/** Para futuras lecturas/acciones de un evento concreto; no autoriza un negocio. */
export async function exigirEventoAyudante(eventoId: number) {
  const contexto = await obtenerContextoAyudante();
  if (!Number.isSafeInteger(eventoId) || eventoId <= 0 || contexto.asignacion.estado !== 'asignado' || contexto.asignacion.eventoId !== eventoId) {
    redirect('/ayudante');
  }
  return contexto;
}
