// ════════════════════════════════════════════════════════════════
// Consultas de la Landing y del panel admin de Landing/Categorías (Sprint 2 · Dev D).
// Solo servidor. La seguridad real la da RLS (supabase/sprint2_devD_landing_categorias.sql).
// ════════════════════════════════════════════════════════════════
import { createClient } from '@/lib/supabase/server'
import type { EventoResumen, TipoAcceso } from '@/lib/eventos/types'

const CAMPOS =
  'id, titulo, foto_url, ubicacion, fecha_evento, tipo_acceso, destacado_carrusel, categorias_evento ( id, nombre )'
const LIMITE_CARRUSEL = 12
const LIMITE_PASADOS = 12

type FilaCat = { id: string | number; nombre: string }
type Fila = {
  id: string | number
  titulo: string
  foto_url: string | null
  ubicacion: string | null
  fecha_evento: string
  tipo_acceso: TipoAcceso
  destacado_carrusel: boolean | null
  categorias_evento: FilaCat | FilaCat[] | null
}

function aResumen(f: Fila): EventoResumen {
  const c = Array.isArray(f.categorias_evento) ? f.categorias_evento[0] : f.categorias_evento
  return {
    id: String(f.id),
    titulo: f.titulo,
    foto_url: f.foto_url,
    ubicacion: f.ubicacion,
    fecha_evento: f.fecha_evento,
    tipo_acceso: f.tipo_acceso,
    destacado_carrusel: Boolean(f.destacado_carrusel),
    categoria: c ? { id: String(c.id), nombre: c.nombre } : null,
  }
}

/** Carrusel: eventos PUBLICADOS con destacado_carrusel = true (del más cercano al más lejano) */
export async function listarCarrusel(): Promise<EventoResumen[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('eventos')
    .select(CAMPOS)
    .eq('estado', 'publicado')
    .eq('destacado_carrusel', true)
    .order('fecha_evento', { ascending: true })
    .limit(LIMITE_CARRUSEL)
  if (error) return []
  return ((data ?? []) as unknown as Fila[]).map(aResumen)
}

/** Eventos pasados: PUBLICADOS con fecha anterior a hoy (el más reciente primero) */
export async function listarPasados(): Promise<EventoResumen[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('eventos')
    .select(CAMPOS)
    .eq('estado', 'publicado')
    .lt('fecha_evento', new Date().toISOString())
    .order('fecha_evento', { ascending: false })
    .limit(LIMITE_PASADOS)
  if (error) return []
  return ((data ?? []) as unknown as Fila[]).map(aResumen)
}

// ─── Panel admin: Landing ────────────────────────────────────────
export type EventoAdminLanding = EventoResumen & { descripcion: string | null }

/** Todos los eventos publicados (próximos primero) para elegir cuáles van al carrusel */
export async function listarPublicadosAdmin(): Promise<EventoAdminLanding[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('eventos')
    .select(`${CAMPOS}, descripcion`)
    .eq('estado', 'publicado')
    .order('fecha_evento', { ascending: false })
    .limit(200)
  if (error) throw new Error(`No se pudieron cargar los eventos: ${error.message}`)
  const filas = (data ?? []) as unknown as (Fila & { descripcion: string | null })[]
  const ahora = Date.now()
  const lista = filas.map((f) => ({ ...aResumen(f), descripcion: f.descripcion ?? null }))
  // próximos primero (ascendente), luego pasados (más reciente primero)
  const prox = lista.filter((e) => new Date(e.fecha_evento).getTime() >= ahora).reverse()
  const pas = lista.filter((e) => new Date(e.fecha_evento).getTime() < ahora)
  return [...prox, ...pas]
}

// ─── Panel admin: Categorías ─────────────────────────────────────
export type CategoriaAdmin = { id: string; nombre: string; descripcion: string | null; activa: boolean }

export async function listarCategoriasAdmin(q: string, estado: 'todos' | 'activas' | 'inactivas'): Promise<CategoriaAdmin[]> {
  const supabase = await createClient()
  let consulta = supabase.from('categorias_evento').select('id, nombre, descripcion, estado').order('nombre')
  if (q) consulta = consulta.ilike('nombre', `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
  if (estado === 'activas') consulta = consulta.eq('estado', true)
  if (estado === 'inactivas') consulta = consulta.eq('estado', false)
  const { data, error } = await consulta
  if (error) throw new Error(`No se pudieron cargar las categorías: ${error.message}`)
  return ((data ?? []) as unknown as { id: string | number; nombre: string; descripcion: string | null; estado: boolean }[]).map(
    (c) => ({ id: String(c.id), nombre: c.nombre, descripcion: c.descripcion, activa: Boolean(c.estado) })
  )
}
