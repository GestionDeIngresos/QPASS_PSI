// Importes viajan como texto. La aritmética monetaria definitiva pertenece a numeric de PostgreSQL.
import type { ResultadoCaja } from './types'

// Un rechazo de un reintento no demuestra qué pasó con un envío previo sin respuesta.
export function conservarIncertidumbre(
  resultado: ResultadoCaja,
  enviadoAntes: boolean
): ResultadoCaja {
  if (enviadoAntes && resultado.estado === 'rechazada')
    return {
      estado: 'incierto',
      mensaje: `El reintento fue rechazado, pero el primer envío pudo haberse confirmado. Conserva este intento y revisa el historial. ${resultado.mensaje}`
    }
  return resultado
}
export const idValido = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= 2147483647
export const uuidValido = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
export const codigoValido = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 255
export function importeValido(v: unknown, permitirCero = false): v is string {
  if (typeof v !== 'string' || !/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(v))
    return false
  return permitirCero || /[1-9]/.test(v)
}
export function normalizarImporte(v: string) {
  const [entero, fraccion = ''] = v.split('.')
  return entero + '.' + fraccion.padEnd(2, '0')
}
export function mensajeCaja(codigo: string) {
  const textos: Record<string, string> = {
    SIN_PERMISOS: 'No tienes permiso para operar en ese evento.',
    DATOS_INVALIDOS: 'Revisa el evento, código, importe y motivo.',
    IDENTIFICACION_INVALIDA:
      'La entrada no permite identificar una cuenta activa con pago confirmado.',
    QR_NO_VALIDO_PARA_EVENTO:
      'El QR no corresponde a una entrada de este evento.',
    CONVERSION_NO_CONFIGURADA:
      'El equipo debe configurar la conversión Bs/punto de este evento antes de operar.',
    CONVERSION_INEXACTA:
      'Este importe no permite una conversión exacta a dos decimales. Revisa la tasa y el importe.',
    SALDO_INSUFICIENTE:
      'El saldo disponible no cubre la devolución. Los puntos reservados no están disponibles.',
    SALDO_CONSUMIDO_O_RESERVADO:
      'No se puede retirar ese importe: el saldo ya fue consumido o está reservado. Registra un reporte.',
    SALDO_FUERA_DE_RANGO: 'El saldo resultante supera el límite permitido.',
    EVIDENCIA_INVALIDA:
      'Adjunta el comprobante y la foto de este intento antes de confirmar.',
    SOLICITUD_REUTILIZADA:
      'El identificador del intento ya corresponde a otros datos. Recupera el intento original.',
    SOLICITUD_YA_PROCESADA: 'La solicitud ya fue procesada o rechazada.',
    RECARGA_HEREDADA_SIN_TASA:
      'Esta recarga histórica no tiene una tasa verificable. Registra un reporte para conciliación.',
    CUENTA_INACTIVA: 'La cuenta del cliente está inactiva.',
    EVENTO_NO_DISPONIBLE: 'El evento no está disponible para nuevas recargas.',
    RESERVA_INCONSISTENTE:
      'No se pudo verificar la reserva. Solicita una conciliación al administrador.'
  }
  return (
    textos[codigo] ??
    'No se pudo completar la operación. Comprueba la conexión y las migraciones del módulo.'
  )
}
