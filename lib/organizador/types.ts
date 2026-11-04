// ════════════════════════════════════════════════════════════════
// Tipos del panel del organizador (Sprint 2 · Dev B)
// ════════════════════════════════════════════════════════════════
import type { TipoAcceso } from '@/lib/eventos/types'

export type EstadoSolicitud = 'en_revision' | 'aprobada' | 'rechazada'
/** Estados en los que el organizador ve y edita su evento en "Mis Eventos" */
export type EstadoEventoPropio = 'aprobado' | 'publicado'

export type SolicitudPropia = {
  id: string
  estado: EstadoSolicitud
  solicitadoEn: string
  eventoId: string | null
  titulo: string
  fechaInicio: string | null
  fechaFin: string | null
}

export type EventoPropio = {
  id: string
  titulo: string
  fotoUrl: string | null
  ubicacion: string | null
  fechaInicio: string
  fechaFin: string | null
  tipoAcceso: TipoAcceso
  estado: EstadoEventoPropio
  estadisticas: EstadisticasEvento
}

/** Lo que muestra el modal "Ver detalles" */
export type EstadisticasEvento = {
  usuarios: number
  entradasVendidas: number
  ingresoEntradas: number
  ingresoServicios: number
  ingresoTotal: number
}
