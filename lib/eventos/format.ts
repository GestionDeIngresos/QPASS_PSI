// ════════════════════════════════════════════════════════════════
// Helpers de formato para eventos (fechas, precios, textos)
// ════════════════════════════════════════════════════════════════

// ─── ZONA EDITABLE: configuración regional ───────────────────────
export const ZONA_HORARIA = 'America/La_Paz' // las fechas se muestran en hora de Bolivia
export const OFFSET_ZONA = '-04:00' //          Bolivia no usa horario de verano
export const MONEDA = 'Bs' //                    el esquema no tiene columna de moneda
export const POCOS_TICKETS = 10 //               por debajo de este cupo se muestra "¡Quedan N!"
// ─────────────────────────────────────────────────────────────────

import type { TipoAcceso } from './types'

const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1)

/**
 * "2026-10-14T22:00:00Z" → "Miércoles, 14 Oct" (+ año y/o hora si se piden)
 * Se usa Intl con zona fija para que servidor y navegador muestren lo mismo.
 */
export function formatearFecha(
  iso: string,
  opciones: { conAnio?: boolean; conHora?: boolean } = {}
): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return 'Fecha por confirmar'

  const partes = new Intl.DateTimeFormat('es-BO', {
    timeZone: ZONA_HORARIA,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha)

  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? ''

  const mes = mayuscula(parte('month').replace('.', ''))
  let texto = `${mayuscula(parte('weekday'))}, ${parte('day')} ${mes}`
  if (opciones.conAnio) texto += ` ${parte('year')}`
  if (opciones.conHora) texto += ` · ${parte('hour')}:${parte('minute')}`
  return texto
}

/** true si el evento ya ocurrió */
export function eventoFinalizado(iso: string): boolean {
  const fecha = new Date(iso)
  return !Number.isNaN(fecha.getTime()) && fecha.getTime() < Date.now()
}

/** 25 → "Bs 25.00" */
export function formatearPrecio(precio: number): string {
  return `${MONEDA} ${Number(precio).toFixed(2)}`
}

/** enum tipo_acceso → texto para mostrar */
export function etiquetaAcceso(tipo: TipoAcceso): string {
  if (tipo === 'qr_fisico') return 'QR Físico (Manilla)'
  if (tipo === 'qr_digital') return 'QR Digital'
  return String(tipo)
}

/** Solo permitimos http(s) en enlaces e imágenes que vienen de la base de datos */
export function esUrlHttp(url: string | null | undefined): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim())
}

// ─── Degradado de respaldo cuando el evento no tiene foto ────────
// (mismos colores que las tarjetas del mockup: morado, turquesa, rosa, verde)
const COLORES_RESPALDO = ['#9D00FF', '#0E8FA8', '#C2185B', '#3C8D2F']

export function gradienteRespaldo(id: string): string {
  let hash = 0
  for (const caracter of id) hash = (hash * 31 + caracter.charCodeAt(0)) >>> 0
  const base = COLORES_RESPALDO[hash % COLORES_RESPALDO.length]
  return `linear-gradient(to bottom, ${base} 0%, #F5EEFF 100%)`
}
