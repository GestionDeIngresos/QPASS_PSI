// ════════════════════════════════════════════════════════════════
// Sesión del panel del organizador (Sprint 2 · Dev B). SOLO servidor.
// Cualquier usuario con sesión puede entrar: un cliente envía una solicitud
// y, cuando el admin la aprueba, gestiona su evento. Lo que cada quien puede
// hacer lo decide RLS (supabase/sprint2_devB_organizador.sql), no este guard.
// ════════════════════════════════════════════════════════════════
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type PerfilOrganizador = { nombre: string; rol: string }

/** Para server actions: { supabase, user } o null si no hay sesión */
export async function obtenerSesion() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, user }
}

/** Para páginas/layouts: sin sesión → login (y vuelve a donde estaba) */
export async function exigirSesion(volverA = '/organizador/eventos') {
  const sesion = await obtenerSesion()
  if (!sesion) redirect(`/login?next=${encodeURIComponent(volverA)}`)
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
