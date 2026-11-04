'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type DatosPerfil = { nombres: string; apellidos: string; correo: string; carnet: string }
export type ResultadoPerfil = { ok: true; mensaje: string } | { ok: false; error: string }

/** HU 5: el usuario edita su nombre y C.I.; el correo nuevo se confirma por email (Supabase Auth) */
export async function actualizarPerfil(datos: DatosPerfil): Promise<ResultadoPerfil> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const nombres = datos.nombres?.trim() ?? ''
  const apellidos = datos.apellidos?.trim() ?? ''
  const carnet = datos.carnet?.trim() ?? ''
  const correo = datos.correo?.trim().toLowerCase() ?? ''

  if (!nombres || !apellidos) return { ok: false, error: 'Completa nombres y apellidos.' }
  if (nombres.length > 60 || apellidos.length > 60) return { ok: false, error: 'Máximo 60 caracteres por campo.' }
  if (!/^[0-9A-Za-z-]{4,20}$/.test(carnet)) return { ok: false, error: 'El carnet de identidad no es válido.' }
  if (correo.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) {
    return { ok: false, error: 'El correo electrónico no es válido.' }
  }

  // RLS (usuarios_update_propio) solo deja tocar la propia fila; el trigger bloquea rol/estado/correo
  const { data: filas, error } = await supabase
    .from('usuarios')
    .update({ nombre: `${nombres} ${apellidos}`, carnet_identidad: carnet })
    .eq('id', user.id)
    .select('id')
  if (error || !filas?.length) return { ok: false, error: 'No se pudieron guardar tus datos.' }

  revalidatePath('/', 'layout') // el Header muestra el nombre

  if (correo !== (user.email ?? '').toLowerCase()) {
    const { error: errorCorreo } = await supabase.auth.updateUser({ email: correo })
    if (errorCorreo) {
      return {
        ok: false,
        error:
          errorCorreo.code === 'email_exists'
            ? 'Datos guardados, pero ese correo ya pertenece a otra cuenta.'
            : 'Datos guardados, pero no se pudo cambiar el correo.',
      }
    }
    return { ok: true, mensaje: 'Datos guardados. Revisa tu nuevo correo para confirmar el cambio.' }
  }
  return { ok: true, mensaje: 'Datos guardados.' }
}
