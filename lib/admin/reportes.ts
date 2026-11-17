import 'server-only'
import { exigirAdmin } from '@/lib/admin/auth'

export type TipoReporte = 'entrada' | 'recarga' | 'acceso'
export type EstadoReporte = 'pendiente' | 'solucionado'
export type ReporteAdmin = {
  id: number; tipo: TipoReporte; descripcion: string; estado: EstadoReporte
  creado_en: string; usuario: string; correo: string; evento: string
}
export type FiltrosReportes = { tipo: TipoReporte | ''; estado: EstadoReporte | ''; q: string }

export async function listarReportes(filtros: FiltrosReportes): Promise<ReporteAdmin[]> {
  const { supabase } = await exigirAdmin()
  const { data, error } = await supabase.rpc('listar_reportes_admin', {
    p_tipo: filtros.tipo, p_estado: filtros.estado, p_busqueda: filtros.q,
  })
  if (error) {
    console.error('listarReportes:', error.code)
    throw new Error('No se pudieron cargar los reportes.')
  }
  return (data ?? []) as ReporteAdmin[]
}
