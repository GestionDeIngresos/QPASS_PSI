'use server'

import { exigirAdmin } from '@/lib/admin/auth'

const mensajes: Record<string, string> = {
  EVENTO_NO_FISICO: 'Selecciona un evento con acceso QR Físico.',
  SOLICITUD_REUTILIZADA: 'La solicitud corresponde a otro lote. Recarga la página.',
  ENTRADA_NO_ENCONTRADA: 'No encontramos la entrada digital indicada.',
  ENTRADA_NO_VALIDA: 'La entrada debe estar activa y su compra confirmada.',
  IDENTIDAD_NO_COINCIDE: 'El carnet no coincide con el perfil del propietario de la entrada.',
  MANILLA_NO_ENCONTRADA: 'No encontramos ese código físico.',
  EVENTO_NO_COINCIDE: 'La entrada y la manilla pertenecen a eventos distintos.',
  MANILLA_YA_VINCULADA: 'La manilla ya tiene un propietario.',
  ENTRADA_YA_VINCULADA: 'Esta entrada ya tiene una manilla.',
}
function mensaje(error: { code?: string; message: string }) {
  if (error.code === '23505') return 'Esta entrada o manilla ya se vinculó en otra operación.'
  if (error.code === '42501') return 'No tienes permisos para realizar esta operación.'
  return mensajes[error.message] ?? 'No se pudo completar la operación. Intenta de nuevo.'
}
export async function generarLote(eventoId: number, cantidad: number, solicitud: string) {
  const { supabase } = await exigirAdmin()
  if (!Number.isSafeInteger(eventoId) || eventoId < 1 || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 200 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(solicitud)) return { error: 'Revisa el evento y la cantidad (1–200).' }
  const { data, error } = await supabase.rpc('generar_lote_qr', { p_evento: eventoId, p_cantidad: cantidad, p_solicitud: solicitud })
  return error ? { error: mensaje(error) } : { loteId: Number(data) }
}
export async function vincularManilla(codigo: string, entrada: string, carnet: string) {
  const { supabase } = await exigirAdmin()
  if (![codigo, entrada, carnet].every(v => typeof v === 'string' && v.trim().length > 0) || codigo.length > 255 || entrada.length > 255 || carnet.length > 50) return { error: 'Completa los dos códigos y el carnet del propietario.' }
  const { error } = await supabase.rpc('vincular_manilla', { p_codigo: codigo.trim(), p_entrada_codigo: entrada.trim(), p_carnet: carnet.trim() })
  return error ? { error: mensaje(error) } : { ok: true }
}
