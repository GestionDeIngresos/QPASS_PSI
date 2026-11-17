// ════════════════════════════════════════════════════════════════
// Sesión del panel del organizador (Sprint 2 · Dev B). SOLO servidor.
// Solo el rol organizador accede al panel y a sus server actions.
// ════════════════════════════════════════════════════════════════
import { redirect } from 'next/navigation'
import { obtenerSesionActual } from '@/lib/auth/sesion'

export type PerfilOrganizador = { nombre: string; rol: string }

/** Para server actions: { supabase, user } o null si no hay sesión */
async function leerSesion() {
  const sesion = await obtenerSesionActual()
  if (!sesion) return null
  const { supabase, user, perfil } = sesion
  return { supabase, user, rol: perfil?.rol }
}

export async function obtenerSesion() {
  const sesion = await leerSesion()
  return sesion?.rol === 'organizador' ? sesion : null
}

/** Para páginas/layouts: sin sesión → login (y vuelve a donde estaba) */
export async function exigirSesion(volverA = '/organizador/eventos') {
  const sesion = await leerSesion()
  if (!sesion) redirect(`/login?next=${encodeURIComponent(volverA)}`)
  if (sesion.rol !== 'organizador') redirect('/eventos')
  return sesion
}

/** Nombre y rol para la barra superior (si falla la lectura, se usa el correo) */
export async function obtenerPerfil(
  _supabase: NonNullable<Awaited<ReturnType<typeof obtenerSesion>>>['supabase'],
  user: { id: string; email?: string | null }
): Promise<PerfilOrganizador> {
  const sesion = await obtenerSesionActual()
  const perfil = sesion?.user.id === user.id ? sesion.perfil : null
  return { nombre: perfil?.nombre ?? user.email ?? 'Usuario', rol: perfil?.rol ?? 'cliente' }
}
