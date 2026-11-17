export type RolCaja = 'recargador' | 'devolucion'
export type EventoCaja = { id: number; titulo: string; tasa: string | null }
export type SaldoPersona = {
  nombre: string
  entradaId: number
  saldo: string
  reservado: string
  disponible: string
}
export type SaldoPropio = {
  eventoId: number
  evento: string
  saldo: string
  reservado: string
  disponible: string
}
export type TicketLocalizado = {
  entradaId: number
  evento: string
  estado: string
  propio: boolean
  nombre?: string
}
export type ConfirmacionCaja = {
  id: number
  referencia: string
  puntos: string
  importe: string
  saldo: string
  simulada: true
}
export type ResultadoCaja =
  | { estado: 'confirmada'; operacion: ConfirmacionCaja }
  | { estado: 'rechazada' | 'incierto'; mensaje: string }
export type RecargaVista = {
  id: number
  nombre: string
  monto: string
  puntos: string | null
  fecha: string
  ajustes: { delta: string; motivo: string; fecha: string }[]
}
export type ReporteRecarga = {
  id: number
  recargaId: number
  descripcion: string
  estado: 'pendiente' | 'solucionado'
  fecha: string
}
export type DevolucionVista = {
  id: number
  nombre: string
  puntos: string
  importe: string | null
  fecha: string
  virtual: boolean
  comprobante?: string | null
  foto?: string | null
  comprobanteFirmado?: string
  fotoFirmada?: string
}
