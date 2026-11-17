export type IdentidadQr = {
  entradaId: number; usuarioId: string; nombre: string; eventoId: number
  origen: 'digital' | 'fisico'; estadoEntrada: 'activa' | 'usada' | 'reportada' | 'anulada'
  pagoConfirmado: boolean; aptaIngreso: boolean; identificacionValida: boolean
}
export type LoteQr = { id: number; eventoId: number; evento: string; cantidad: number; codigos: { codigo: string; vinculado: boolean }[] }
