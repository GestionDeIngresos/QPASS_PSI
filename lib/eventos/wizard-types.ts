// ════════════════════════════════════════════════════════════════
// Tipos y validación del formulario por pasos de eventos (Sprint 2 · Dev A)
// Se usa en el navegador (EventoWizard) Y en el servidor (acciones):
// la validación es la misma en ambos lados.
// ════════════════════════════════════════════════════════════════
import type { TipoAcceso } from '@/lib/eventos/types'
import { OFFSET_ZONA, ZONA_HORARIA } from '@/lib/eventos/format'

export type ModoWizard = 'solicitud' | 'admin' | 'organizador'
export type PasoWizard = 1 | 2 | 3 | 4
export type AccionFinal = 'guardar' | 'publicar'

/** Los números van como texto porque vienen de <input>; se convierten al guardar */
export type TicketBorrador = {
  id?: string // solo si ya existe en la BD
  nombre: string
  descripcion: string
  precio: string
  cantidad: string
  limite: string
}

export type EventoBorrador = {
  id?: string // solo si ya existe en la BD
  // Paso 1
  titulo: string
  descripcion: string
  categoriaId: string // '' = sin categoría
  fotoUrl: string
  // Paso 2
  ubicacion: string
  mapaUrl: string
  // Paso 3
  tipoAcceso: TipoAcceso
  tickets: TicketBorrador[]
  // Paso 4 (hora de Bolivia)
  fechaInicio: string // YYYY-MM-DD
  horaInicio: string // HH:MM
  fechaFin: string
  horaFin: string
}

export type ResultadoGuardado =
  | { ok: true; mensaje?: string; eventoId?: string }
  | { ok: false; error: string }

/** Lo que cada pantalla le inyecta al formulario (server action) */
export type AccionGuardar = (
  datos: EventoBorrador,
  accionFinal: AccionFinal
) => Promise<ResultadoGuardado>

export const MAX_TICKETS = 20

export const nuevoTicket = (): TicketBorrador => ({
  nombre: '',
  descripcion: '',
  precio: '',
  cantidad: '',
  limite: '1',
})

export const borradorVacio = (): EventoBorrador => ({
  titulo: '',
  descripcion: '',
  categoriaId: '',
  fotoUrl: '',
  ubicacion: '',
  mapaUrl: '',
  tipoAcceso: 'qr_digital',
  tickets: [nuevoTicket()],
  fechaInicio: '',
  horaInicio: '',
  fechaFin: '',
  horaFin: '',
})

// ─── Fechas: siempre en hora de Bolivia ──────────────────────────
export const aIsoBolivia = (fecha: string, hora: string) => `${fecha}T${hora}:00${OFFSET_ZONA}`

/** ISO (timestamptz) → { fecha: 'YYYY-MM-DD', hora: 'HH:MM' } en hora de Bolivia */
export function partesBolivia(iso: string | null | undefined): { fecha: string; hora: string } {
  const vacio = { fecha: '', hora: '' }
  if (!iso) return vacio
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return vacio
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const g = (t: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === t)?.value ?? ''
  return { fecha: `${g('year')}-${g('month')}-${g('day')}`, hora: `${g('hour')}:${g('minute')}` }
}

// ─── Validación ──────────────────────────────────────────────────
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/
const esUrlHttp = (u: string) => /^https?:\/\//i.test(u)

/** Devuelve el primer error del paso, o null si está bien */
export function validarPaso(paso: PasoWizard, d: EventoBorrador): string | null {
  if (paso === 1) {
    const t = d.titulo.trim()
    if (t.length < 3) return 'El título debe tener al menos 3 caracteres.'
    if (t.length > 160) return 'El título no puede superar los 160 caracteres.'
    if (d.descripcion.length > 5000) return 'La descripción es demasiado larga (máx. 5000 caracteres).'
    if (d.fotoUrl && !esUrlHttp(d.fotoUrl)) return 'La foto de portada no es válida.'
    return null
  }

  if (paso === 2) {
    const u = d.ubicacion.trim()
    if (u.length < 3) return 'Indica la ubicación del evento.'
    if (u.length > 255) return 'La ubicación no puede superar los 255 caracteres.'
    if (d.mapaUrl && !esUrlHttp(d.mapaUrl)) return 'La imagen del mapa no es válida.'
    return null
  }

  if (paso === 3) {
    if (d.tipoAcceso !== 'qr_digital' && d.tipoAcceso !== 'qr_fisico') return 'Elige el tipo de acceso.'
    if (d.tickets.length < 1) return 'Agrega al menos un ticket.'
    if (d.tickets.length > MAX_TICKETS) return `Máximo ${MAX_TICKETS} tipos de ticket.`
    for (let i = 0; i < d.tickets.length; i++) {
      const t = d.tickets[i]
      const n = `Ticket #${i + 1}`
      const nombre = t.nombre.trim()
      if (!nombre || nombre.length > 80) return `${n}: el nombre es obligatorio (máx. 80 caracteres).`
      const precio = Number(t.precio)
      if (t.precio.trim() === '' || !Number.isFinite(precio) || precio < 0 || precio > 100000)
        return `${n}: el precio no es válido.`
      const cantidad = Number(t.cantidad)
      if (t.cantidad.trim() === '' || !Number.isInteger(cantidad) || cantidad < 0 || cantidad > 1000000)
        return `${n}: la cantidad debe ser un número entero (0 o más).`
      const limite = Number(t.limite)
      if (t.limite.trim() === '' || !Number.isInteger(limite) || limite < 1 || limite > 100)
        return `${n}: el límite por usuario debe ser un entero entre 1 y 100.`
      if (t.descripcion.length > 500) return `${n}: la descripción es demasiado larga (máx. 500).`
    }
    return null
  }

  if (!RE_FECHA.test(d.fechaInicio) || !RE_HORA.test(d.horaInicio)) return 'Indica la fecha y hora de inicio.'
  if (!RE_FECHA.test(d.fechaFin) || !RE_HORA.test(d.horaFin)) return 'Indica la fecha y hora de fin.'
  const inicio = new Date(aIsoBolivia(d.fechaInicio, d.horaInicio))
  const fin = new Date(aIsoBolivia(d.fechaFin, d.horaFin))
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return 'Las fechas no son válidas.'
  if (fin.getTime() <= inicio.getTime()) return 'El fin del evento debe ser posterior al inicio.'
  return null
}

/** Valida los 4 pasos; devuelve en cuál falló */
export function validarTodo(d: EventoBorrador): { paso: PasoWizard; error: string } | null {
  for (const paso of [1, 2, 3, 4] as const) {
    const error = validarPaso(paso, d)
    if (error) return { paso, error }
  }
  return null
}
