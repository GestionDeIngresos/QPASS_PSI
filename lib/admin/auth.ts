// Guard de administrador (Sprint 2 · Dev A). Se usa en el layout /admin y en TODAS las acciones del panel.
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type PerfilAdmin = { id: string; nombre: string; rol: string }

/** Devuelve { supabase, user, perfil } si el usuario actual es admin; si no, null (para server actions) */
export async function obtenerAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('usuarios').select('id, nombre, rol').eq('id', user.id).maybeSingle()
  const perfil = data as PerfilAdmin | null
  if (!perfil || perfil.rol !== 'admin') return null
  return { supabase, user, perfil }
}

/** Para páginas/layouts: sin sesión → login; con sesión pero no admin → /eventos */
export async function exigirAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin')
  const admin = await obtenerAdmin()
  if (!admin) redirect('/eventos')
  return admin
}
