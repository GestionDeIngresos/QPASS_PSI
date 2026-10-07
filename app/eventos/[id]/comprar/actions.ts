'use server'

// ════════════════════════════════════════════════════════════════
// Server Action de compra.
// Toda la lógica de negocio (cupo atómico, destinatario, precios, QR) vive en
// la función SQL comprar_entradas(): una sola transacción en Postgres.
// Esta acción solo valida la forma de los datos, comprueba la sesión, llama a
// la función y traduce los errores a mensajes para el usuario.
// ════════════════════════════════════════════════════════════════
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { MAX_ENTRADAS_POR_LINEA, MAX_LINEAS } from '@/lib/compras/calculo'
import type { CompraInput, ResultadoCompra } from '@/lib/compras/types'

const MENSAJE_GENERICO = 'No pudimos completar tu compra. Inténtalo de nuevo en unos minutos.'

const fallo = (error: string, campo?: 'correo'): ResultadoCompra => ({ ok: false, error, campo })

/** Mensajes para los errores que lanza comprar_entradas() (error.message = código) */
function traducirError(error: { message: string; details?: string | null; hint?: string | null }): ResultadoCompra {
  const ticket = error.details ? `«${error.details}»` : 'este tipo de entrada'

  switch (error.message.trim()) {
    case 'NO_AUTH':
      return fallo('Tu sesión expiró. Inicia sesión para continuar.')
    case 'EVENTO_NO_DISPONIBLE':
      return fallo('Este evento ya no está disponible para la venta.')
    case 'LINEAS_INVALIDAS':
    case 'TIPO_INVALIDO':
      return fallo('La selección de entradas no es válida. Recarga la página e inténtalo otra vez.')
    case 'SIN_CUPO':
      return fallo(`No hay suficiente cupo para ${ticket}. Reduce la cantidad o elige otro tipo.`)
    case 'LIMITE_EXCEDIDO': {
      const restantes = Number(error.hint)
      return fallo(
        Number.isFinite(restantes) && restantes > 0
          ? `Superas el límite por persona para ${ticket}. Puedes comprar ${restantes} más.`
          : `Ya alcanzaste el límite por persona para ${ticket}.`
      )
    }
    case 'CORREO_INVALIDO':
      return fallo('Ingresa un correo válido.', 'correo')
    case 'DESTINATARIO_NO_REGISTRADO':
      return fallo(
        'Ese correo no está registrado en QPass. Pídele a la persona que cree su cuenta y vuelve a intentarlo.',
        'correo'
      )
    case 'DESTINATARIO_ES_COMPRADOR':
      return fallo('Ese es tu propio correo. Desactiva "Para otra persona" para comprar para ti.', 'correo')
    default:
      console.error('[comprarEntradas] error inesperado de comprar_entradas():', error)
      return fallo(MENSAJE_GENERICO)
  }
}

export async function comprarEntradas(input: CompraInput): Promise<ResultadoCompra> {
  // 1) Esto llega desde el navegador: se valida la forma, no se confía en nada.
  const eventoId = typeof input?.eventoId === 'string' ? input.eventoId.trim() : ''
  const lineas = Array.isArray(input?.lineas) ? input.lineas : []
  const correo = typeof input?.correoDestino === 'string' ? input.correoDestino.trim().toLowerCase() : ''

  const lineasValidas =
    lineas.length >= 1 &&
    lineas.length <= MAX_LINEAS &&
    lineas.every(
      (l) =>
        typeof l?.tipoTicketId === 'string' &&
        l.tipoTicketId.length > 0 &&
        l.tipoTicketId.length <= 64 &&
        Number.isInteger(l.cantidad) &&
        l.cantidad >= 1 &&
        l.cantidad <= MAX_ENTRADAS_POR_LINEA
    ) &&
    new Set(lineas.map((l) => l.tipoTicketId)).size === lineas.length

  if (!eventoId || eventoId.length > 64 || !lineasValidas) {
    return fallo('La selección de entradas no es válida. Recarga la página e inténtalo otra vez.')
  }
  if (input.correoDestino !== null && !correo) {
    return fallo('Ingresa el correo de la persona destinataria.', 'correo')
  }

  // 2) Sesión: comprador_id lo decide Postgres con auth.uid(), nunca el cliente.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fallo('Tu sesión expiró. Inicia sesión para continuar.')

  // 3) Una sola llamada = una sola transacción.
  const { data, error } = await supabase.rpc('comprar_entradas', {
    p_evento_id: eventoId,
    p_lineas: lineas.map((l) => ({ tipo_ticket_id: l.tipoTicketId, cantidad: l.cantidad })),
    p_correo_destino: correo || null,
  })

  if (error) return traducirError(error)

  const r = data as {
    compra_id: string | number
    entradas: number
    subtotal: number | string
    cargos_servicio: number | string
    total: number | string
    destinatario: string | null
  } | null
  if (!r) return fallo(MENSAJE_GENERICO)

  // El cupo cambió: que el detalle del evento no muestre números viejos.
  revalidatePath(`/eventos/${eventoId}`)

  return {
    ok: true,
    compraId: String(r.compra_id),
    entradas: r.entradas,
    subtotal: Number(r.subtotal),
    cargos: Number(r.cargos_servicio),
    total: Number(r.total),
    destinatario: r.destinatario,
  }
}