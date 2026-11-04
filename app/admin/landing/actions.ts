'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { obtenerAdmin } from '@/lib/admin/auth'
import { guardarEventoCompleto } from '@/lib/eventos/guardar'
import type { EventoBorrador, ResultadoGuardado } from '@/lib/eventos/wizard-types'

function refrescar(id?: string) {
  revalidatePath('/')
  revalidatePath('/eventos')
  revalidatePath('/admin/landing')
  if (id) revalidatePath(`/eventos/${id}`)
}

/** HU 25: pone o quita un evento del carrusel de la Landing */
export async function alternarCarrusel(formData: FormData) {
  const admin = await obtenerAdmin()
  if (!admin) redirect('/eventos')
  const id = Number(formData.get('id'))
  const visible = formData.get('visible') === 'true'
  if (!Number.isInteger(id)) redirect('/admin/landing?error=fallo')

  const { error } = await admin.supabase
    .from('eventos')
    .update({ destacado_carrusel: visible })
    .eq('id', id)
    .eq('estado', 'publicado')
  if (error) redirect('/admin/landing?error=fallo')
  refrescar(String(id))
  redirect(`/admin/landing?id=${id}`)
}

/** HU 25: edición rápida (panel derecho) de título, ubicación y descripción */
export async function guardarRapido(formData: FormData) {
  const admin = await obtenerAdmin()
  if (!admin) redirect('/eventos')
  const id = Number(formData.get('id'))
  const titulo = String(formData.get('titulo') ?? '').trim()
  const ubicacion = String(formData.get('ubicacion') ?? '').trim()
  const descripcion = String(formData.get('descripcion') ?? '').trim()
  if (!Number.isInteger(id)) redirect('/admin/landing?error=fallo')
  if (titulo.length < 3 || titulo.length > 160 || ubicacion.length < 3 || ubicacion.length > 255 || descripcion.length > 5000)
    redirect(`/admin/landing?id=${id}&error=invalido`)

  const { error } = await admin.supabase
    .from('eventos')
    .update({ titulo, ubicacion, descripcion: descripcion || null })
    .eq('id', id)
  if (error) redirect(`/admin/landing?id=${id}&error=fallo`)
  refrescar(String(id))
  redirect(`/admin/landing?id=${id}&ok=1`)
}

/** HU 25: edición COMPLETA con el formulario por pasos (no cambia el estado del evento) */
export async function guardarEventoPublicado(datos: EventoBorrador): Promise<ResultadoGuardado> {
  const admin = await obtenerAdmin()
  if (!admin) return { ok: false, error: 'No tienes permisos de administrador.' }
  if (!datos.id) return { ok: false, error: 'Falta el evento a editar.' }
  const r = await guardarEventoCompleto(admin.supabase, datos, {})
  if (!r.ok) return r
  refrescar(datos.id)
  return { ok: true, eventoId: r.eventoId, mensaje: 'Cambios guardados.' }
}
