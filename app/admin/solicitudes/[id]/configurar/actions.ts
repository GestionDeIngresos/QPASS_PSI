'use server'

import { revalidatePath } from 'next/cache'
import { obtenerAdmin } from '@/lib/admin/auth'
import { guardarEventoCompleto } from '@/lib/eventos/guardar'
import type { AccionFinal, EventoBorrador, ResultadoGuardado } from '@/lib/eventos/wizard-types'

/** HU 31: el admin guarda los cambios del evento o lo publica ("publicado") */
export async function guardarComoAdmin(datos: EventoBorrador, accionFinal: AccionFinal): Promise<ResultadoGuardado> {
  const admin = await obtenerAdmin()
  if (!admin) return { ok: false, error: 'No tienes permisos de administrador.' }
  if (!datos.id) return { ok: false, error: 'Falta el evento a editar.' }

  const publicar = accionFinal === 'publicar'
  const resultado = await guardarEventoCompleto(admin.supabase, datos, publicar ? { estado: 'publicado' } : {})
  if (!resultado.ok) return resultado

  revalidatePath('/eventos')
  revalidatePath(`/eventos/${datos.id}`)
  revalidatePath('/admin/solicitudes')
  return {
    ok: true,
    eventoId: resultado.eventoId,
    mensaje: publicar ? '¡Evento publicado! Ya aparece en Explorar eventos.' : 'Cambios guardados.',
  }
}
