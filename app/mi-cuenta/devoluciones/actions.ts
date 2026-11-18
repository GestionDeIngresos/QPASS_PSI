'use server'

import { revalidatePath } from 'next/cache'
import { obtenerSesionActual } from '@/lib/auth/sesion'
import { idValido, importeValido, uuidValido } from '@/lib/saldos/validacion'

const PATH = '/mi-cuenta/devoluciones'

type EventoInfo = { eventoId: number; disponible: string }

function mensajeRpc(msg: string): string {
  const textos: Record<string, string> = {
    PLAZO_NO_CONFIGURADO: 'El plazo de devolución aún no está configurado.',
    EVENTO_NO_FINALIZADO:
      'Podrás solicitar la devolución cuando finalice el evento.',
    FUERA_DE_PLAZO: 'El plazo para solicitar la devolución ya venció.',
    QR_INVALIDO: 'No se pudo validar el QR adjunto. Vuelve a subirlo.',
    SIN_SALDO: 'No tienes saldo disponible para devolver.',
    SALDO_INSUFICIENTE: 'No tienes saldo disponible para devolver.',
    SOLICITUD_PENDIENTE: 'Ya tienes una solicitud en proceso para este evento.',
    SIN_PERMISOS: 'No tienes permiso para esta acción.'
  }
  return textos[msg] ?? 'No se pudo completar la operación. Inténtalo de nuevo.'
}

// HU 17: registra una solicitud de devolución virtual subiendo el QR bancario.
// El monto se obtiene exclusivamente del servidor; nunca del formulario.
export async function solicitarDevolucion(
  formData: FormData
): Promise<{ ok?: true; error?: string } | null> {
  const sesion = await obtenerSesionActual()
  if (!sesion || !sesion.perfil?.activo) {
    return { error: 'Debes iniciar sesión para continuar.' }
  }

  const eventoId = Number(formData.get('eventoId'))
  const solicitud = formData.get('solicitud')
  if (!uuidValido(solicitud))
    return {
      error:
        'No se pudo verificar el intento. Recarga la página y vuelve a intentarlo.'
    }
  if (!idValido(eventoId)) {
    return { error: 'Evento inválido.' }
  }

  const archivo = formData.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: 'Selecciona una imagen del QR bancario.' }
  }
  if (archivo.size > 5242880) {
    return { error: 'La imagen no puede superar 5 MB.' }
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(archivo.type)) {
    return { error: 'Formato no permitido. Usa PNG, JPG o WEBP.' }
  }

  const ext =
    archivo.type === 'image/png'
      ? 'png'
      : archivo.type === 'image/webp'
        ? 'webp'
        : 'jpg'
  const ruta = `${sesion.user.id}/${eventoId}/${solicitud}.${ext}`
  // Respuesta perdida: recuperar una solicitud propia del mismo intento antes de consultar disponible.
  const { data: anteriores, error: errorAnteriores } =
    await sesion.supabase.rpc('devc_mis_solicitudes_devolucion')
  if (errorAnteriores)
    return {
      error:
        'No se pudo comprobar si este intento ya fue registrado. Reintenta sin cambiar la imagen.'
    }
  const previa = (
    (anteriores ?? []) as { qrRuta: string; monto: string }[]
  ).find((s) => s.qrRuta === ruta)
  const hash = async (v: ArrayBuffer) =>
    Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', v))).join(
      ','
    )
  if (previa) {
    const { data: existente } = await sesion.supabase.storage
      .from('devoluciones')
      .download(ruta)
    if (
      !existente ||
      (await hash(await existente.arrayBuffer())) !==
        (await hash(await archivo.arrayBuffer()))
    )
      return {
        error:
          'El intento ya fue registrado con otra imagen. Revisa Mis solicitudes o recupera el archivo original.'
      }
    revalidatePath(PATH)
    return { ok: true }
  }
  // Obtener el disponible del servidor; nunca desde el navegador.
  const { data: eventosData, error: errorEventos } = await sesion.supabase.rpc(
    'devc_eventos_devolucion_cliente'
  )
  if (errorEventos)
    return { error: 'No se pudo verificar tu saldo. Inténtalo de nuevo.' }
  const eventos = (eventosData ?? []) as EventoInfo[]
  const evento = eventos.find((e) => e.eventoId === eventoId)
  if (!evento) return { error: 'No tienes saldo registrado para ese evento.' }
  const disponible = evento.disponible
  if (!importeValido(disponible)) {
    return { error: 'No tienes saldo disponible para devolver.' }
  }

  // Subir archivo al bucket devoluciones con ruta del servidor.
  const { error: errorUpload } = await sesion.supabase.storage
    .from('devoluciones')
    .upload(ruta, archivo, { contentType: archivo.type, upsert: false })
  if (errorUpload) {
    const { data: existente } = await sesion.supabase.storage
      .from('devoluciones')
      .download(ruta)
    if (!existente)
      return {
        error: 'No se pudo guardar el QR. Comprueba la conexión y reintenta.'
      }
    if (
      (await hash(await existente.arrayBuffer())) !==
      (await hash(await archivo.arrayBuffer()))
    )
      return {
        error:
          'El intento conserva otra imagen. Reintenta con el archivo original.'
      }
  }

  // Registrar solicitud (el trigger de D reserva el monto automáticamente).
  const { error: errorRpc } = await sesion.supabase.rpc(
    'crear_solicitud_devolucion',
    {
      p_evento: eventoId,
      p_monto: disponible,
      p_qr_ruta: ruta
    }
  )
  if (errorRpc) {
    return { error: mensajeRpc(errorRpc.message ?? '') }
  }

  revalidatePath(PATH)
  return { ok: true }
}
