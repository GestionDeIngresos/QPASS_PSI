// ════════════════════════════════════════════════════════════════
// Consultas a Supabase para la vista pública de eventos.
// Solo corre en el servidor (usa lib/supabase/server.ts).
// La seguridad real la da RLS (supabase/politicas_eventos_publicos.sql);
// el .eq('estado', 'publicado') de aquí es una segunda barrera.
// ════════════════════════════════════════════════════════════════
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { OFFSET_ZONA } from '@/lib/eventos/format'
import type {
  Categoria,
  EventoDetalle,
  EventoResumen,
  FiltrosEventos,
  TipoAcceso,
  TipoTicket,
} from '@/lib/eventos/types'

// ─── ZONA EDITABLE: límites ──────────────────────────────────────
const LIMITE_POR_SECCION = 24 // máx. de eventos en "próximos" y en "pasados"
const MAX_LARGO_BUSQUEDA = 80
// ─────────────────────────────────────────────────────────────────

// ─── ZONA EDITABLE: columnas que se piden a la API ───────────────
// categorias_evento ( ... ) y tipos_ticket ( ... ) son joins; requieren
// la FK eventos.categoria_id → categorias_evento.id y tipos_ticket.evento_id → eventos.id
const CAMPOS_RESUMEN =
  'id, titulo, foto_url, ubicacion, fecha_evento, tipo_acceso, destacado_carrusel, categorias_evento ( id, nombre )'

const CAMPOS_DETALLE =
  'id, titulo, descripcion, foto_url, ubicacion, mapa_url, fecha_evento, tipo_acceso, destacado_carrusel, categorias_evento ( id, nombre ), tipos_ticket ( id, nombre, descripcion, precio, cantidad_disponible, limite_por_usuario )'
// ─────────────────────────────────────────────────────────────────

// ─── Filas "crudas" tal como las devuelve PostgREST ──────────────
type FilaCategoria = { id: string | number; nombre: string }
type FilaTicket = {
  id: string | number
  nombre: string
  descripcion: string | null
  precio: number | string
  cantidad_disponible: number | null
  limite_por_usuario: number | null
}
type FilaEvento = {
  id: string | number
  titulo: string
  descripcion?: string | null
  foto_url: string | null
  ubicacion: string | null
  mapa_url?: string | null
  fecha_evento: string
  tipo_acceso: TipoAcceso
  destacado_carrusel: boolean | null
  categorias_evento: FilaCategoria | FilaCategoria[] | null
  tipos_ticket?: FilaTicket[] | null
}

// ─── Normalizadores: fila cruda → tipos de la app ────────────────
function normalizarCategoria(fila: FilaEvento['categorias_evento']): Categoria | null {
  const categoria = Array.isArray(fila) ? fila[0] : fila
  return categoria ? { id: String(categoria.id), nombre: categoria.nombre } : null
}

function normalizarResumen(fila: FilaEvento): EventoResumen {
  return {
    id: String(fila.id),
    titulo: fila.titulo,
    foto_url: fila.foto_url,
    ubicacion: fila.ubicacion,
    fecha_evento: fila.fecha_evento,
    tipo_acceso: fila.tipo_acceso,
    destacado_carrusel: Boolean(fila.destacado_carrusel),
    categoria: normalizarCategoria(fila.categorias_evento),
  }
}

function normalizarTicket(fila: FilaTicket): TipoTicket {
  return {
    id: String(fila.id),
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    precio: Number(fila.precio),
    cantidad_disponible: fila.cantidad_disponible ?? 0,
    limite_por_usuario: fila.limite_por_usuario,
  }
}

// ─── Lectura de filtros desde la URL ─────────────────────────────
type ParamsCrudos = Record<string, string | string[] | undefined>

const primero = (valor: string | string[] | undefined) =>
  Array.isArray(valor) ? valor[0] : valor

export function leerFiltros(params: ParamsCrudos): FiltrosEventos {
  return {
    q: (primero(params.q) ?? '').trim().slice(0, MAX_LARGO_BUSQUEDA),
    categoriaId: (primero(params.categoria) ?? '').trim(),
    fecha: (primero(params.fecha) ?? '').trim(),
  }
}

/** Escapa % y _ para que el texto del usuario no actúe como comodín en ILIKE */
const escaparLike = (texto: string) => texto.replace(/[\\%_]/g, (c) => `\\${c}`)

/** "2026-10-14" → rango [00:00, 24:00) de ese día en hora de Bolivia (o null si no es válida) */
function diaARango(fecha: string): { desde: string; hasta: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  const inicio = new Date(`${fecha}T00:00:00${OFFSET_ZONA}`)
  if (Number.isNaN(inicio.getTime())) return null
  const fin = new Date(inicio.getTime() + 24 * 60 * 60 * 1000)
  return { desde: inicio.toISOString(), hasta: fin.toISOString() }
}

type SupabaseServidor = Awaited<ReturnType<typeof createClient>>

// ════════════════════════════════════════════════════════════════
// CATEGORÍAS (para el <select> del filtro)
// ════════════════════════════════════════════════════════════════
export async function listarCategorias(): Promise<Categoria[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categorias_evento')
    .select('id, nombre')
    .order('nombre', { ascending: true })

  if (error) throw new Error(`No se pudieron cargar las categorías: ${error.message}`)

  const filas = (data ?? []) as unknown as FilaCategoria[]
  return filas.map((f) => ({ id: String(f.id), nombre: f.nombre }))
}

// ════════════════════════════════════════════════════════════════
// LISTADO + BÚSQUEDA
// Devuelve dos grupos: próximos (fecha >= ahora, del más cercano al más lejano)
// y pasados (fecha < ahora, del más reciente al más antiguo).
// ════════════════════════════════════════════════════════════════
type FiltrosValidados = {
  q: string
  categoriaId: string
  rango: { desde: string; hasta: string } | null
}

async function consultar(
  supabase: SupabaseServidor,
  filtros: FiltrosValidados,
  modo: 'proximos' | 'pasados',
  ahoraISO: string
): Promise<EventoResumen[]> {
  let consulta = supabase
    .from('eventos')
    .select(CAMPOS_RESUMEN)
    .eq('estado', 'publicado') // regla de negocio: la vista pública solo muestra publicados

  if (filtros.q) consulta = consulta.ilike('titulo', `%${escaparLike(filtros.q)}%`)
  if (filtros.categoriaId) consulta = consulta.eq('categoria_id', filtros.categoriaId)
  if (filtros.rango) {
    consulta = consulta.gte('fecha_evento', filtros.rango.desde).lt('fecha_evento', filtros.rango.hasta)
  }

  consulta =
    modo === 'proximos'
      ? consulta.gte('fecha_evento', ahoraISO).order('fecha_evento', { ascending: true })
      : consulta.lt('fecha_evento', ahoraISO).order('fecha_evento', { ascending: false })

  const { data, error } = await consulta.limit(LIMITE_POR_SECCION)
  if (error) throw new Error(`No se pudieron cargar los eventos: ${error.message}`)

  return ((data ?? []) as unknown as FilaEvento[]).map(normalizarResumen)
}

export async function buscarEventos(
  filtros: FiltrosEventos,
  categorias: Categoria[]
): Promise<{ proximos: EventoResumen[]; pasados: EventoResumen[] }> {
  const supabase = await createClient()
  const ahoraISO = new Date().toISOString()

  // Solo se acepta una categoría que realmente exista (evita errores de tipo en Postgres)
  const categoriaId = categorias.some((c) => c.id === filtros.categoriaId) ? filtros.categoriaId : ''

  const validados: FiltrosValidados = {
    q: filtros.q,
    categoriaId,
    rango: diaARango(filtros.fecha),
  }

  const [proximos, pasados] = await Promise.all([
    consultar(supabase, validados, 'proximos', ahoraISO),
    consultar(supabase, validados, 'pasados', ahoraISO),
  ])
  return { proximos, pasados }
}

// ════════════════════════════════════════════════════════════════
// DETALLE
// cache() evita pedir dos veces el mismo evento en una request
// (la usan generateMetadata y la página).
// ════════════════════════════════════════════════════════════════
export const obtenerEvento = cache(async (id: string): Promise<EventoDetalle | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('eventos')
    .select(CAMPOS_DETALLE)
    .eq('id', id)
    .eq('estado', 'publicado')
    .maybeSingle()

  if (error) {
    // 22P02 = el id de la URL no tiene formato válido (ej. /eventos/abc) → es un 404, no un fallo
    if (error.code === '22P02') return null
    throw new Error(`No se pudo cargar el evento: ${error.message}`)
  }
  if (!data) return null

  const fila = data as unknown as FilaEvento
  return {
    ...normalizarResumen(fila),
    descripcion: fila.descripcion ?? null,
    mapa_url: fila.mapa_url ?? null,
    tickets: (fila.tipos_ticket ?? []).map(normalizarTicket).sort((a, b) => a.precio - b.precio),
  }
})
