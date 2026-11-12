import 'server-only'
import { redirect } from 'next/navigation'
import { obtenerSesionActual } from '@/lib/auth/sesion'

export async function exigirSupervisor() {
  const sesion = await obtenerSesionActual()
  if (!sesion) redirect('/login?next=/supervisor')
  if (sesion.perfil?.rol !== 'supervisor' || sesion.perfil.activo === false) redirect('/eventos')
  return sesion
}
export async function eventosSupervisor() {
  const { supabase } = await exigirSupervisor()
  const { data, error } = await supabase.rpc('eventos_supervisor')
  if (error) throw new Error('No se pudieron cargar los eventos asignados.')
  return (data ?? []) as { id: number; titulo: string }[]
}
export type Acceso = {
  id: number; nombre: string; resultado: 'permitido' | 'denegado'; registrado_en: string
  foto_url: string | null; fotoFirmada?: string; observacion: string; eliminado: boolean; version: number
  reportes: { id: number; descripcion: string; estado: string }[]
  correcciones: { motivo: string; fecha: string; antes: string; despues: string }[]
}
export async function historialSupervisor(evento: number, resultado: string, fecha: string, eliminados: boolean) {
  const { supabase } = await exigirSupervisor()
  const { data, error } = await supabase.rpc('historial_accesos', {
    p_evento: evento, p_resultado: resultado, p_fecha: fecha || null, p_incluir_eliminados: eliminados,
  })
  if (error) throw new Error('No se pudo consultar el historial de accesos.')
  const filas = (data ?? []) as Acceso[]
  const rutas = [...new Set(filas.map(f => f.foto_url).filter((v): v is string => !!v))]
  const firmadas = rutas.length ? await supabase.storage.from('accesos').createSignedUrls(rutas, 300) : null
  const urls = new Map(firmadas?.data?.map(v => [v.path, v.signedUrl]) ?? [])
  return filas.map(f => ({ ...f, fotoFirmada: f.foto_url ? urls.get(f.foto_url) ?? undefined : undefined }))
}
