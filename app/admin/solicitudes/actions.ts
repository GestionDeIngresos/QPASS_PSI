'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { obtenerAdmin } from '@/lib/admin/auth'

const VOLVER = '/admin/solicitudes'
const id = (f: FormData) => String(f.get('id') ?? '')

/** Aceptar o denegar una solicitud en revisión (HU 30) */
export async function resolverSolicitud(formData: FormData) {
  const admin = await obtenerAdmin()
  if (!admin) redirect('/login')
  const { supabase, user } = admin

  const solicitudId = id(formData)
  const decision = String(formData.get('decision') ?? '')
  if (!/^\d+$/.test(solicitudId) || (decision !== 'aprobar' && decision !== 'denegar')) {
    redirect(`${VOLVER}?error=fallo`)
  }
  const aprobar = decision === 'aprobar'

  const { data: sol } = await supabase
    .from('solicitudes_organizador')
    .select('id, estado, evento_id')
    .eq('id', solicitudId)
    .maybeSingle()
  if (!sol || sol.estado !== 'en_revision') redirect(`${VOLVER}?error=no_pendiente`)

  const { error } = await supabase
    .from('solicitudes_organizador')
    .update({
      estado: aprobar ? 'aprobada' : 'rechazada',
      revisado_en: new Date().toISOString(),
      revisado_por: user.id,
    })
    .eq('id', solicitudId)
  if (error) redirect(`${VOLVER}?error=fallo`)

  // aceptada → evento "aprobado" (falta que el admin lo configure y publique); denegada → "borrador"
  if (sol.evento_id) {
    const { error: errorEvento } = await supabase
      .from('eventos')
      .update({ estado: aprobar ? 'aprobado' : 'borrador' })
      .eq('id', sol.evento_id)
    if (errorEvento) redirect(`${VOLVER}?error=fallo`)
  }

  revalidatePath(VOLVER)
  redirect(VOLVER)
}

/** Elimina una solicitud ya resuelta junto con su evento (si no tiene ventas) */
export async function eliminarSolicitud(formData: FormData) {
  const admin = await obtenerAdmin()
  if (!admin) redirect('/login')
  const { supabase } = admin

  const solicitudId = id(formData)
  if (!/^\d+$/.test(solicitudId)) redirect(`${VOLVER}?error=fallo`)

  const { data: sol } = await supabase
    .from('solicitudes_organizador')
    .select('id, estado, evento_id')
    .eq('id', solicitudId)
    .maybeSingle()
  if (!sol || sol.estado === 'en_revision') redirect(`${VOLVER}?error=fallo`)

  // borrar el evento arrastra la solicitud (ON DELETE CASCADE); sin evento se borra solo la solicitud
  const { error } = sol.evento_id
    ? await supabase.from('eventos').delete().eq('id', sol.evento_id)
    : await supabase.from('solicitudes_organizador').delete().eq('id', solicitudId)
  if (error) redirect(`${VOLVER}?error=${error.code === '23503' ? 'con_ventas' : 'fallo'}`)

  revalidatePath(VOLVER)
  redirect(VOLVER)
}
