'use server'

import { revalidatePath } from 'next/cache'
import { exigirCuenta, exigirPersonal, eventosCaja } from './server'
import { identificarQr } from '@/lib/qr/server'
import {
  idValido,
  uuidValido,
  codigoValido,
  importeValido,
  normalizarImporte,
  mensajeCaja
} from './validacion'
import type {
  RolCaja,
  SaldoPersona,
  TicketLocalizado,
  ResultadoCaja,
  ConfirmacionCaja
} from './types'

function invalidos(): ResultadoCaja {
  return { estado: 'rechazada', mensaje: 'Datos inválidos. Revisa los campos.' }
}
function rechazoSql(error: { code?: string }) {
  return [
    'P0001',
    '42501',
    '22023',
    '23514',
    '23503',
    '22003',
    '40001',
    '40P01',
    '55P03',
    '57014'
  ].includes(error.code ?? '')
}
function resultado(
  data: unknown,
  error: { code?: string; message: string } | null
): ResultadoCaja {
  if (error)
    return {
      estado: rechazoSql(error) ? 'rechazada' : 'incierto',
      mensaje: mensajeCaja(error.message)
    }
  if (!data || typeof data !== 'object')
    return {
      estado: 'incierto',
      mensaje:
        'No se conoce el resultado. Reintenta con los mismos datos y el mismo identificador.'
    }
  const r = data as Partial<ConfirmacionCaja>
  if (
    !idValido(r.id) ||
    typeof r.referencia !== 'string' ||
    typeof r.puntos !== 'string' ||
    !importeValido(
      r.puntos.startsWith('-') ? r.puntos.slice(1) : r.puntos,
      true
    ) ||
    !importeValido(r.importe, true) ||
    !importeValido(r.saldo, true) ||
    r.simulada !== true
  )
    return {
      estado: 'incierto',
      mensaje:
        'La respuesta no pudo verificarse. Conserva este intento y consulta el historial.'
    }
  return { estado: 'confirmada', operacion: r as ConfirmacionCaja }
}
function revalidar() {
  for (const ruta of [
    '/recargador/historial',
    '/recargador/reportes',
    '/devolucion/historial',
    '/devolucion/solicitudes',
    '/mi-cuenta/saldos',
    '/mi-cuenta/devoluciones',
    '/admin/reportes'
  ])
    revalidatePath(ruta)
}
export async function consultarPersona(
  rol: RolCaja,
  evento: number,
  codigo: string
): Promise<{ persona?: SaldoPersona; error?: string }> {
  if (
    !['recargador', 'devolucion'].includes(rol) ||
    !idValido(evento) ||
    !codigoValido(codigo)
  )
    return { error: 'Evento o código inválido.' }
  const { supabase } = await exigirPersonal(rol)
  try {
    const identidad = await identificarQr(codigo, evento)
    if (!identidad.identificacionValida)
      return { error: mensajeCaja('IDENTIFICACION_INVALIDA') }
    const { data, error } = await supabase.rpc('consultar_saldo_staff', {
      p_evento: evento,
      p_codigo: codigo.trim(),
      p_rol: rol
    })
    if (error) return { error: mensajeCaja(error.message) }
    return { persona: data as SaldoPersona }
  } catch {
    return {
      error: 'No se pudo verificar el QR o los permisos para este evento.'
    }
  }
}
export async function confirmarRecarga(
  evento: number,
  codigo: string,
  monto: string,
  solicitud: string
): Promise<ResultadoCaja> {
  const { supabase } = await exigirPersonal('recargador')
  if (
    !idValido(evento) ||
    !codigoValido(codigo) ||
    !importeValido(monto) ||
    !uuidValido(solicitud)
  )
    return invalidos()
  try {
    const { data, error } = await supabase.rpc('registrar_recarga', {
      p_evento: evento,
      p_codigo: codigo.trim(),
      p_monto: normalizarImporte(monto),
      p_solicitud: solicitud
    })
    const r = resultado(data, error)
    if (r.estado === 'confirmada') revalidar()
    return r
  } catch {
    return {
      estado: 'incierto',
      mensaje:
        'Se perdió la conexión. Reintenta el mismo intento sin modificar los datos.'
    }
  }
}
export async function confirmarAjuste(
  id: number,
  monto: string,
  motivo: string,
  solicitud: string
): Promise<ResultadoCaja> {
  const { supabase } = await exigirPersonal('recargador')
  if (
    !idValido(id) ||
    !importeValido(monto, true) ||
    typeof motivo !== 'string' ||
    motivo.trim().length < 5 ||
    motivo.length > 500 ||
    !uuidValido(solicitud)
  )
    return invalidos()
  try {
    const { data, error } = await supabase.rpc('ajustar_recarga', {
      p_recarga: id,
      p_monto_correcto: normalizarImporte(monto),
      p_motivo: motivo.trim(),
      p_solicitud: solicitud
    })
    const r = resultado(data, error)
    if (r.estado === 'confirmada') revalidar()
    return r
  } catch {
    return {
      estado: 'incierto',
      mensaje:
        'No se conoce el resultado del ajuste. Reintenta el mismo intento.'
    }
  }
}
export async function enviarReporte(
  id: number,
  descripcion: string,
  solicitud: string
) {
  const { supabase } = await exigirPersonal('recargador')
  if (
    !idValido(id) ||
    !uuidValido(solicitud) ||
    typeof descripcion !== 'string' ||
    descripcion.trim().length < 5 ||
    descripcion.length > 2000
  )
    return {
      error: 'Incluye una descripción de 5 a 2000 caracteres.',
      incierto: false
    }
  try {
    const { data, error } = await supabase.rpc('reportar_recarga', {
      p_recarga: id,
      p_descripcion: descripcion.trim(),
      p_solicitud: solicitud
    })
    if (error)
      return { error: mensajeCaja(error.message), incierto: !rechazoSql(error) }
    if (!idValido(data))
      return {
        error:
          'No se pudo verificar el número del reporte. Reintenta con la misma solicitud.',
        incierto: true
      }
    revalidar()
    return { id: data as number }
  } catch {
    return {
      error:
        'No se conoce el resultado. Reintenta el mismo reporte para recuperar su número.',
      incierto: true
    }
  }
}
export async function subirEvidencia(
  form: FormData
): Promise<{ ruta?: string; error?: string }> {
  const { supabase, user } = await exigirPersonal('devolucion')
  const archivo = form.get('archivo'),
    evento = Number(form.get('evento')),
    solicitud = form.get('solicitud'),
    tipo = form.get('tipo')
  if (
    !(archivo instanceof File) ||
    archivo.size < 1 ||
    archivo.size > 2097152 ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type) ||
    !idValido(evento) ||
    !uuidValido(solicitud) ||
    !['foto', 'comprobante'].includes(String(tipo))
  )
    return { error: 'Adjunta una imagen JPG, PNG o WEBP de hasta 2 MB.' }
  // Verifica firma del archivo además del MIME declarado por el navegador.
  const b = new Uint8Array(await archivo.slice(0, 12).arrayBuffer())
  const valida =
    archivo.type === 'image/jpeg'
      ? b[0] === 255 && b[1] === 216 && b[2] === 255
      : archivo.type === 'image/png'
        ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)
        : String.fromCharCode(...b.slice(0, 4)) === 'RIFF' &&
          String.fromCharCode(...b.slice(8, 12)) === 'WEBP'
  if (!valida)
    return {
      error: 'El contenido del archivo no corresponde al formato indicado.'
    }
  try {
    if (!(await eventosCaja('devolucion')).some((e) => e.id === evento))
      return { error: mensajeCaja('SIN_PERMISOS') }
    const ext =
      archivo.type === 'image/png'
        ? 'png'
        : archivo.type === 'image/webp'
          ? 'webp'
          : 'jpg'
    const ruta = `${user.id}/${evento}/${solicitud}/${tipo}.${ext}`
    const { error } = await supabase.storage
      .from('devb-evidencias')
      .upload(ruta, archivo, { contentType: archivo.type, upsert: false })
    if (error) {
      const { data } = await supabase.storage
        .from('devb-evidencias')
        .download(ruta)
      if (!data)
        return {
          error:
            'No se pudo guardar la imagen. Conserva el intento para reintentar.'
        }
      const hash = async (bytes: ArrayBuffer) =>
        Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
        ).join(',')
      if (
        (await hash(await data.arrayBuffer())) !==
        (await hash(await archivo.arrayBuffer()))
      )
        return {
          error:
            'Este intento ya tiene otra imagen vinculada. Recupera el archivo original; no se reemplazará la evidencia.'
        }
    }
    return { ruta }
  } catch {
    return {
      error:
        'No se pudo confirmar la carga. Conserva el intento y vuelve a subir la misma imagen.'
    }
  }
}
export async function confirmarDevolucion(
  evento: number,
  codigo: string,
  puntos: string,
  comprobante: string,
  foto: string,
  solicitud: string
): Promise<ResultadoCaja> {
  const { supabase } = await exigirPersonal('devolucion')
  if (
    !idValido(evento) ||
    !codigoValido(codigo) ||
    !importeValido(puntos) ||
    !uuidValido(solicitud) ||
    typeof comprobante !== 'string' ||
    typeof foto !== 'string' ||
    comprobante.length > 512 ||
    foto.length > 512
  )
    return invalidos()
  try {
    const { data, error } = await supabase.rpc('registrar_devolucion', {
      p_evento: evento,
      p_codigo: codigo.trim(),
      p_puntos: normalizarImporte(puntos),
      p_comprobante: comprobante,
      p_foto: foto,
      p_solicitud: solicitud
    })
    const r = resultado(data, error)
    if (r.estado === 'confirmada') revalidar()
    return r
  } catch {
    return {
      estado: 'incierto',
      mensaje:
        'No se conoce el resultado. Conserva el intento, las imágenes y los datos para reintentar.'
    }
  }
}
export async function localizarTicket(
  codigo: string,
  evento: number
): Promise<{ ticket?: TicketLocalizado | null; error?: string }> {
  const { supabase } = await exigirCuenta()
  if (!codigoValido(codigo) || !idValido(evento))
    return { error: 'Evento o código inválido.' }
  const { data, error } = await supabase.rpc('consultar_ticket_extraviado', {
    p_codigo: codigo.trim(),
    p_evento: evento
  })
  if (error)
    return {
      error: 'No se pudo consultar el ticket. Revisa los datos y tus permisos.'
    }
  return { ticket: data as TicketLocalizado | null }
}
