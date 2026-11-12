import 'server-only'
import { obtenerSesionActual } from '@/lib/auth/sesion'
import type { IdentidadQr } from './types'

// Consulta sin efectos: no confirma acceso, no descuenta saldo.
export async function identificarQr(codigo: string, eventoId: number): Promise<IdentidadQr> {
  if (!codigo.trim() || codigo.length > 255 || !Number.isSafeInteger(eventoId) || eventoId <= 0) throw new Error('Código o evento inválido.')
  const sesion = await obtenerSesionActual()
  if (!sesion) throw new Error('Inicia sesión para continuar.')
  const { data, error } = await sesion.supabase.rpc('identificar_qr', { p_codigo: codigo.trim(), p_evento: eventoId })
  if (error) throw new Error(error.code === '42501' ? 'No tienes permisos para operar en este evento.' : 'El QR no corresponde a una entrada de este evento.')
  return data as IdentidadQr
}
