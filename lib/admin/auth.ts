// Guard de administrador (Sprint 2 · Dev A). Se usa en el layout /admin y en TODAS las acciones del panel.
import { redirect } from 'next/navigation'
import { obtenerSesionActual } from '@/lib/auth/sesion'
import { cache } from 'react'

export type PerfilAdmin = { id: string; nombre: string; rol: string }

/** Devuelve { supabase, user, perfil } si el usuario actual es admin; si no, null (para server actions) */
export const obtenerAdmin = cache(async () => {
  const sesion = await obtenerSesionActual()
  if (!sesion) return null
  const { supabase, user } = sesion
  const perfil = sesion.perfil as PerfilAdmin | null
  if (!perfil || perfil.rol !== 'admin' || sesion.perfil?.activo === false) return null
  return { supabase, user, perfil }
})

/** Para páginas/layouts: sin sesión → login; con sesión pero no admin → /eventos */
export async function exigirAdmin() {
  if (!await obtenerSesionActual()) redirect('/login?next=/admin')
  const admin = await obtenerAdmin()
  if (!admin) redirect('/eventos')
  return admin
}
