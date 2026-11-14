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
function traducirError(error: {
  message: string
  code?: string
  details?: string | null
  hint?: string | null
}): ResultadoCompra {
  const ticket = error.details ? `«${error.details}»` : 'este tipo de entrada'

  if (error.code === 'PGRST202' || error.code === '42883') {
    console.error('[comprarEntradas] No se encontró comprar_entradas() en Supabase:', error)
    return fallo(
      'Las compras de prueba no están disponibles en este momento. Contacta al administrador.'
    )
  }

  switch (error.message.trim()) {
    case 'SOLICITUD_REUTILIZADA':
      return fallo('Esta solicitud ya se utilizó con otros datos. Recarga la página.')
    case 'NO_AUTH':
      return fallo('Tu sesión expiró. Inicia sesión para continuar.')
    case 'CUENTA_INACTIVA':
      return fallo('Tu cuenta no está habilitada para comprar.')
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
    case 'DESTINATARIO_NO_VALIDO':
      return fallo(
        'No se puede asignar la entrada a ese correo. La persona debe tener una cuenta registrada y activa.',
        'correo'
      )
    case 'DESTINATARIO_NO_COINCIDE':
      return fallo('No se pudo verificar el destinatario. La compra no se realizó; contacta al administrador.', 'correo')
    case 'COMPRA_INCONSISTENTE':
      return fallo('No se pudo verificar la compra. La operación se canceló; contacta al administrador.')
    case 'DESTINATARIO_ES_COMPRADOR':
      return fallo('Ese es tu propio correo. Desactiva "Para otra persona" para comprar para ti.', 'correo')
    default:
      console.error('[comprarEntradas] error inesperado de comprar_entradas():', error)
      return fallo(MENSAJE_GENERICO)
  }
}

export async function comprarEntradas(input: CompraInput): Promise<ResultadoCompra> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input?.solicitudId ?? '') || !['aprobado', 'rechazado', 'vencido'].includes(input?.resultadoPrueba)) {
    return fallo('La solicitud de prueba no es válida. Recarga la página.')
  }
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
  if (correo && (correo.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))) {
    return fallo('Ingresa un correo válido.', 'correo')
  }

  // 2) Sesión: comprador_id lo decide Postgres con auth.uid(), nunca el cliente.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fallo('Tu sesión expiró. Inicia sesión para continuar.')
  const { data: perfil, error: errorPerfil } = await supabase.from('usuarios').select('activo').eq('id', user.id).maybeSingle()
  if (errorPerfil || perfil?.activo !== true) return fallo('Tu cuenta no está habilitada para comprar.')

  // 3) Una sola llamada = una sola transacción.
  const { data, error } = await supabase.rpc('comprar_entradas_terceros_prueba', {
    p_evento_id: eventoId,
    p_lineas: lineas.map((l) => ({ tipo_ticket_id: l.tipoTicketId, cantidad: l.cantidad })),
    p_correo_destino: correo || null,
    p_solicitud_id: input.solicitudId,
    p_resultado: input.resultadoPrueba,
  })

  if (error) return traducirError(error)

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    console.error('[comprarEntradas] comprar_entradas() devolvió una respuesta inválida:', data)
    return fallo(MENSAJE_GENERICO)
  }

  const r = data as Record<string, unknown>
  if (r.error === 'PAGO_PRUEBA_RECHAZADO') return fallo('Prueba: pago rechazado. No se generaron entradas ni se descontó cupo.')
  if (r.error === 'PAGO_PRUEBA_VENCIDO') return fallo('Prueba: pago vencido. No se generaron entradas ni se descontó cupo.')
  const compraId =
    typeof r.compra_id === 'string' || typeof r.compra_id === 'number' ? String(r.compra_id) : ''
  const entradas = Number(r.entradas)
  const subtotal = Number(r.subtotal)
  const cargos = Number(r.cargos_servicio)
  const total = Number(r.total)
  const destinatario =
    typeof r.destinatario === 'string' || r.destinatario === null ? r.destinatario : undefined

  if (
    !compraId ||
    !Number.isInteger(entradas) ||
    entradas < 1 ||
    !Number.isFinite(subtotal) ||
    !Number.isFinite(cargos) ||
    !Number.isFinite(total) ||
    destinatario === undefined
  ) {
    console.error('[comprarEntradas] comprar_entradas() devolvió datos incompletos:', data)
    return fallo(MENSAJE_GENERICO)
  }

  // El cupo cambió: que el detalle del evento no muestre números viejos.
  revalidatePath(`/eventos/${eventoId}`)
  revalidatePath('/mis-compras')

  return {
    ok: true,
    compraId,
    entradas,
    subtotal,
    cargos,
    total,
    destinatario,
  }
}
