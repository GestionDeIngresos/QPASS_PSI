// ════════════════════════════════════════════════════════════════
// Sesión del panel del organizador (Sprint 2 · Dev B). SOLO servidor.
// Solo el rol organizador accede al panel y a sus server actions.
// ════════════════════════════════════════════════════════════════
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type PerfilOrganizador = { nombre: string; rol: string }

/** Para server actions: { supabase, user } o null si no hay sesión */
async function leerSesion() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).maybeSingle()
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
  supabase: NonNullable<Awaited<ReturnType<typeof obtenerSesion>>>['supabase'],
  user: { id: string; email?: string | null }
): Promise<PerfilOrganizador> {
  const { data } = await supabase.from('usuarios').select('nombre, rol').eq('id', user.id).maybeSingle()
  const perfil = data as { nombre: string | null; rol: string | null } | null
  return { nombre: perfil?.nombre ?? user.email ?? 'Usuario', rol: perfil?.rol ?? 'cliente' }
}
