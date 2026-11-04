'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { obtenerSesion } from '@/lib/organizador/auth'

const VOLVER = '/organizador/eventos'

/**
 * HU 21: eliminar un evento propio, SOLO si no tiene entradas vendidas.
 * La regla vive en la base de datos (función eliminar_evento_sin_ventas + RLS):
 * aunque alguien reenvíe este formulario a mano, no se puede borrar un evento con ventas.
 */
export async function eliminarMiEvento(formData: FormData) {
  const sesion = await obtenerSesion()
  if (!sesion) redirect(`/login?next=${VOLVER}`)
  const { supabase } = sesion

  const id = String(formData.get('id') ?? '')
  if (!/^\d+$/.test(id)) redirect(`${VOLVER}?error=fallo`)

  const { error } = await supabase.rpc('eliminar_evento_sin_ventas', { p_evento_id: Number(id) })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('CON_VENTAS') || error.code === '23503') redirect(`${VOLVER}?error=con_ventas`)
    if (msg.includes('NO_ENCONTRADO')) redirect(`${VOLVER}?error=no_encontrado`)
    console.error('eliminarMiEvento:', error)
    redirect(`${VOLVER}?error=fallo`)
  }

  revalidatePath(VOLVER)
  revalidatePath('/organizador/solicitudes')
  revalidatePath('/eventos')
  redirect(`${VOLVER}?ok=eliminado`)
}
