'use server'

import { revalidatePath } from 'next/cache'
import { guardarEventoCompleto } from '@/lib/eventos/guardar'
import type { AccionFinal, EventoBorrador, ResultadoGuardado } from '@/lib/eventos/wizard-types'
import { obtenerSesion } from '@/lib/organizador/auth'
import { ESTADOS_EDITABLES, obtenerMiEvento } from '@/lib/organizador/queries'

/**
 * HU 20: el organizador guarda los cambios de SU evento.
 * Nunca se pasa `estado` a guardarEventoCompleto → el estado no cambia (no puede auto-publicarse).
 * Además RLS + el trigger de la BD lo impiden aunque alguien llame a la API a mano.
 */
export async function guardarComoOrganizador(datos: EventoBorrador, accionFinal: AccionFinal): Promise<ResultadoGuardado> {
  void accionFinal // el organizador solo "guarda"; publicar es del admin
  const sesion = await obtenerSesion()
  if (!sesion) return { ok: false, error: 'Inicia sesión para continuar.' }
  const { supabase, user } = sesion

  if (!datos.id) return { ok: false, error: 'Falta el evento a editar.' }

  // 1ª barrera (la 2ª es RLS): el evento debe ser MÍO y estar en un estado editable
  const propio = await obtenerMiEvento(supabase, user.id, datos.id)
  if (!propio) return { ok: false, error: 'No tienes permisos para editar este evento.' }
  if (!ESTADOS_EDITABLES.includes(propio.estado as (typeof ESTADOS_EDITABLES)[number])) {
    return { ok: false, error: 'Este evento no se puede editar en este momento.' }
  }

  const resultado = await guardarEventoCompleto(supabase, datos) // sin `estado`
  if (!resultado.ok) return resultado

  revalidatePath('/organizador/eventos')
  revalidatePath('/eventos')
  revalidatePath(`/eventos/${datos.id}`)
  return { ok: true, eventoId: resultado.eventoId, mensaje: 'Cambios guardados.' }
}
