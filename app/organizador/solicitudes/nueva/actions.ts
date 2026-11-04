'use server'

import { revalidatePath } from 'next/cache'
import { crearSolicitudDeEvento } from '@/lib/eventos/guardar'
import type { AccionFinal, EventoBorrador, ResultadoGuardado } from '@/lib/eventos/wizard-types'
import { obtenerSesion } from '@/lib/organizador/auth'
import { MAX_SOLICITUDES_EN_REVISION, contarSolicitudesEnRevision } from '@/lib/organizador/queries'

/**
 * HU 18: enviar una solicitud de evento.
 * Crea el evento en "pendiente_aprobacion" + la solicitud en "en_revision" (función de Dev A).
 * La acción final se ignora: aquí no hay "publicar", solo enviar.
 */
export async function enviarSolicitud(datos: EventoBorrador, accionFinal: AccionFinal): Promise<ResultadoGuardado> {
  void accionFinal
  const sesion = await obtenerSesion()
  if (!sesion) return { ok: false, error: 'Inicia sesión para continuar.' }
  const { supabase, user } = sesion

  // límite de solicitudes pendientes a la vez
  const enRevision = await contarSolicitudesEnRevision(supabase, user.id)
  if (enRevision >= MAX_SOLICITUDES_EN_REVISION) {
    return {
      ok: false,
      error: `Ya tienes ${enRevision} solicitudes en revisión. Espera a que el administrador responda antes de enviar otra.`,
    }
  }

  // el id nunca viene del navegador al CREAR: la función de Dev A lo ignora y crea uno nuevo
  const resultado = await crearSolicitudDeEvento(supabase, datos, user.id)
  if (resultado.ok) {
    revalidatePath('/organizador/solicitudes')
    revalidatePath('/admin/solicitudes')
  }
  return resultado
}
