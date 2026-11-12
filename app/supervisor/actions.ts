'use server'

import { revalidatePath } from 'next/cache'
import { exigirSupervisor } from '@/lib/supervisor/server'
import { identificarQr } from '@/lib/qr/server'

const uuid = (v: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)
function mensaje(error: { message: string; code?: string }) {
  const textos: Record<string, string> = {
    SIN_PERMISOS: 'No tienes permiso para operar en ese evento.', ENTRADA_NO_APTA: 'La entrada ya fue usada, está anulada o no tiene una compra confirmada.',
    FOTO_REQUERIDA: 'Adjunta una foto válida para registrar el acceso.', REGISTRO_CAMBIO: 'El registro cambió. Actualiza el historial antes de corregirlo.',
    SOLICITUD_REUTILIZADA: 'Esta solicitud ya fue utilizada con otros datos.', DATOS_INVALIDOS: 'Revisa los datos e incluye un motivo de al menos 5 caracteres.',
    QR_NO_VALIDO_PARA_EVENTO: 'El QR no corresponde a una entrada de este evento.',
  }
  return textos[error.message] ?? 'No se pudo completar la operación. Intenta de nuevo.'
}
export async function consultarEntrada(codigo: string, evento: number) {
  await exigirSupervisor()
  try { return { identidad: await identificarQr(codigo, evento) } }
  catch (e) { return { error: e instanceof Error ? e.message : 'No se pudo verificar el QR.' } }
}
export async function subirFotoAcceso(form: FormData) {
  const { supabase, user } = await exigirSupervisor()
  const foto = form.get('foto'), evento = Number(form.get('evento')), solicitud = String(form.get('solicitud') ?? '')
  if (!(foto instanceof File) || foto.size === 0 || foto.size > 5242880 || !['image/jpeg', 'image/png', 'image/webp'].includes(foto.type) || !Number.isSafeInteger(evento) || evento < 1 || !uuid(solicitud)) return { error: 'Adjunta una imagen JPG, PNG o WEBP de hasta 5 MB.' }
  const ext = foto.type === 'image/png' ? 'png' : foto.type === 'image/webp' ? 'webp' : 'jpg'
  const ruta = `${user.id}/${evento}/${solicitud}.${ext}`
  const { error } = await supabase.storage.from('accesos').upload(ruta, foto, { contentType: foto.type, upsert: false })
  // En caso de respuesta perdida, comprobar si ya existe el mismo objeto.
  if (error) {
    const { data } = await supabase.storage.from('accesos').createSignedUrl(ruta, 30)
    if (!data) return { error: 'No se pudo guardar la foto. Comprueba la conexión y reintenta.' }
  }
  return { ruta }
}
export async function registrarIngreso(codigo: string, evento: number, permitir: boolean, foto: string, solicitud: string) {
  const { supabase } = await exigirSupervisor()
  if (!uuid(solicitud) || typeof permitir !== 'boolean' || !Number.isSafeInteger(evento) || evento < 1 || typeof codigo !== 'string' || codigo.length > 255 || typeof foto !== 'string' || foto.length > 512) return { error: 'Datos de acceso inválidos.' }
  const { data, error } = await supabase.rpc('registrar_acceso', { p_codigo: codigo.trim(), p_evento: evento, p_permitir: permitir, p_foto: foto, p_solicitud: solicitud })
  if (error) return { error: mensaje(error) }
  revalidatePath('/supervisor/historial')
  return { registro: data as { id: number; resultado: string; repetido: boolean } }
}
export async function corregirRegistro(id: number, version: number, resultado: string, observacion: string, motivo: string, eliminar: boolean) {
  const { supabase } = await exigirSupervisor()
  if (!Number.isSafeInteger(id) || !Number.isSafeInteger(version) || !['permitido','denegado'].includes(resultado) || motivo.length > 500 || observacion.length > 1000) return { error: 'Revisa los datos de la corrección.' }
  const { error } = await supabase.rpc('corregir_acceso', { p_id: id, p_version: version, p_resultado: resultado, p_observacion: observacion, p_motivo: motivo, p_eliminar: eliminar })
  if (error) return { error: mensaje(error) }
  revalidatePath('/supervisor/historial'); return { ok: true }
}
export async function reportarRegistro(id: number, descripcion: string, solicitud: string) {
  const { supabase } = await exigirSupervisor()
  if (!Number.isSafeInteger(id) || !uuid(solicitud) || descripcion.length > 2000) return { error: 'Revisa la descripción del reporte.' }
  const { error } = await supabase.rpc('reportar_acceso', { p_id: id, p_descripcion: descripcion, p_solicitud: solicitud })
  if (error) return { error: mensaje(error) }
  revalidatePath('/supervisor/historial'); revalidatePath('/admin/reportes'); return { ok: true }
}
