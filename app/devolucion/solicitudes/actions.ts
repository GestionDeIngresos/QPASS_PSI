'use server'

import { exigirPersonal } from '@/lib/saldos/server'
import { revalidatePath } from 'next/cache'
import { idValido, mensajeCaja } from '@/lib/saldos/validacion'

// Una RPC libera la reserva, debita y registra la simulación una sola vez.
export async function aceptarSolicitud(
  solicitudId: number
): Promise<{ error?: string; ok?: true; referencia?: string }> {
  const { supabase } = await exigirPersonal('devolucion')
  if (!idValido(solicitudId)) return { error: 'Solicitud inválida.' }
  try {
    const { data, error } = await supabase.rpc(
      'liquidar_solicitud_devolucion',
      { p_solicitud: solicitudId }
    )
    if (error) return { error: mensajeCaja(error.message) }
    if (!data || data.simulada !== true || typeof data.referencia !== 'string')
      return {
        error:
          'No se pudo verificar el resultado. Reintenta la misma solicitud.'
      }
    for (const ruta of [
      '/devolucion/solicitudes',
      '/devolucion/historial',
      '/mi-cuenta/devoluciones',
      '/mi-cuenta/saldos'
    ])
      revalidatePath(ruta)
    return { ok: true, referencia: data.referencia }
  } catch {
    return {
      error:
        'No se conoce el resultado. Reintenta esta misma solicitud; no se descontará dos veces.'
    }
  }
}
