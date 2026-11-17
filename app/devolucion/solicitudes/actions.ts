'use server'

import { exigirEncargadoDevolucion } from '@/lib/devolucion/solicitudes'

// Pendiente: conectar con la operación de liquidación de Dev B
export async function aceptarSolicitud(solicitudId: number): Promise<{ error: string }> {
  await exigirEncargadoDevolucion()
  void solicitudId
  return {
    error: 'La aceptación estará disponible cuando se integre el procesamiento de devoluciones.',
  }
}
