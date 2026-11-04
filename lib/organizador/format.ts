// ════════════════════════════════════════════════════════════════
// Formatos del panel del organizador (Sprint 2 · Dev B). Todo en hora de Bolivia.
// ════════════════════════════════════════════════════════════════
import { ZONA_HORARIA, formatearFecha } from '@/lib/eventos/format'
import { partesBolivia } from '@/lib/eventos/wizard-types'

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** "Viernes, 24 Abr – Lunes, 03 May" (o solo "Viernes, 24 Abr" si empieza y termina el mismo día) */
export function rangoEvento(inicio: string, fin: string | null): string {
  const a = formatearFecha(inicio)
  if (!fin) return a
  const b = formatearFecha(fin)
  return a === b ? a : `${a} – ${b}`
}

/** "Viernes, 24 Abr – Lunes, 03 May · 22:00 a 06:00" */
export function rangoEventoConHoras(inicio: string, fin: string | null): string {
  const base = rangoEvento(inicio, fin)
  const h1 = partesBolivia(inicio).hora
  const h2 = fin ? partesBolivia(fin).hora : ''
  return h1 && h2 ? `${base} · ${h1} a ${h2}` : h1 ? `${base} · ${h1}` : base
}

/** "Agosto 05" */
function diaMesLargo(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const mes = new Intl.DateTimeFormat('es-BO', { timeZone: ZONA_HORARIA, month: 'long' }).format(d)
  const dia = new Intl.DateTimeFormat('es-BO', { timeZone: ZONA_HORARIA, day: '2-digit' }).format(d)
  return `${mayuscula(mes)} ${dia}`
}

/** "Agosto 05 - Agosto 07" (como en el mockup de Mis Solicitudes) */
export function fechasPropuestas(inicio: string | null, fin: string | null): string {
  if (!inicio) return 'por definir'
  const a = diaMesLargo(inicio)
  const b = fin ? diaMesLargo(fin) : ''
  return b && b !== a ? `${a} - ${b}` : a
}

/** "12/10/2026" */
export function fechaCorta(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('es-BO', { timeZone: ZONA_HORARIA, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

/** rol de la BD → texto de la barra superior */
export const etiquetaRol = (rol: string) => (rol ? mayuscula(rol) : 'Cliente')
