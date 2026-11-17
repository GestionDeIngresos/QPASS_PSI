import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// React cache se limita a la petición RSC: no comparte usuarios entre peticiones.
export const obtenerSesionActual = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil, error } = await supabase.from('usuarios')
    .select('id, nombre, correo, rol, activo').eq('id', user.id).maybeSingle()
  if (error) throw new Error('No se pudo consultar el perfil de la cuenta.')
  return { supabase, user, perfil }
})
