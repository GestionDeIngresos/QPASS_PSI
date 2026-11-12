// Consultas del panel Admin para usuarios y personal (Sprint 2 · Dev C · HU 26 y 34). SOLO servidor.
import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { esRol, type Rol } from '@/lib/admin/roles'

export type UsuarioAdmin = {
  id: string
  nombre: string
  correo: string
  carnet: string
  rol: Rol
  activo: boolean
  creadoEn: string
  eventoId: string | null
  eventoTitulo: string | null
}

/** Evento que se puede asignar al personal (lo usa el selector del formulario) */
export type EventoAsignable = { id: string; titulo: string; categoria: string | null }

export type FiltrosUsuarios = { q: string; rol: Rol | ''; estado: 'activos' | 'inactivos' | '' }

type Uno<T> = T | T[] | null
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

type Fila = {
  id: string
  nombre: string | null
  correo: string | null
  carnet_identidad: string | null
  rol: string
  activo: boolean | null
  creado_en: string
  asignaciones_staff: Uno<{ evento_id: number | string | null; eventos: Uno<{ titulo: string }> }>
}

const CAMPOS =
  'id, nombre, correo, carnet_identidad, rol, activo, creado_en, asignaciones_staff ( evento_id, eventos ( titulo ) )'

function normalizar(f: Fila): UsuarioAdmin {
  const asignacion = uno(f.asignaciones_staff)
  return {
    id: f.id,
    nombre: f.nombre ?? '',
    correo: f.correo ?? '',
    carnet: f.carnet_identidad ?? '',
    rol: esRol(f.rol) ? f.rol : 'cliente',
    activo: f.activo ?? true,
    creadoEn: f.creado_en,
    eventoId: asignacion?.evento_id == null ? null : String(asignacion.evento_id),
    eventoTitulo: uno(asignacion?.eventos ?? null)?.titulo ?? null,
  }
}

type ParamsCrudos = Record<string, string | string[] | undefined>
const texto = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')

export function leerFiltrosUsuarios(params: ParamsCrudos): FiltrosUsuarios {
  const rol = texto(params.rol)
  const estado = texto(params.estado)
  return {
    q: texto(params.q).trim().slice(0, 80),
    rol: esRol(rol) ? rol : '',
    estado: estado === 'activos' || estado === 'inactivos' ? estado : '',
  }
}

export async function listarUsuarios(filtros: FiltrosUsuarios): Promise<UsuarioAdmin[]> {
  const supabase = await createClient()
  let consulta = supabase.from('usuarios').select(CAMPOS).order('creado_en', { ascending: false })
  if (filtros.rol) consulta = consulta.eq('rol', filtros.rol)
  if (filtros.estado) consulta = consulta.eq('activo', filtros.estado === 'activos')

  const { data, error } = await consulta
  if (error) throw new Error(`No se pudieron cargar los usuarios: ${error.message}`)

  const todos = ((data ?? []) as unknown as Fila[]).map(normalizar)
  const q = filtros.q.toLowerCase()
  if (!q) return todos
  return todos.filter((u) => [u.nombre, u.correo, u.carnet].some((t) => t.toLowerCase().includes(q)))
}

export async function obtenerUsuario(id: string): Promise<UsuarioAdmin | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const supabase = await createClient()
  const { data, error } = await supabase.from('usuarios').select(CAMPOS).eq('id', id).maybeSingle()
  if (error || !data) return null
  return normalizar(data as unknown as Fila)
}

export async function listarEventosAsignables(): Promise<EventoAsignable[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('eventos')
    .select('id, titulo, categorias_evento ( nombre )')
    .neq('estado', 'borrador')
    .order('fecha_evento', { ascending: false })
  if (error) throw new Error(`No se pudieron cargar los eventos: ${error.message}`)

  type FilaEvento = { id: number | string; titulo: string; categorias_evento: Uno<{ nombre: string }> }
  return ((data ?? []) as unknown as FilaEvento[]).map((e) => ({
    id: String(e.id),
    titulo: e.titulo,
    categoria: uno(e.categorias_evento)?.nombre ?? null,
  }))
}

/** "Juan Pablo Pérez" → { nombres: 'Juan', apellidos: 'Pablo Pérez' } (la tabla guarda un solo `nombre`) */
export function separarNombre(nombre: string) {
  const [nombres = '', ...resto] = nombre.trim().split(/\s+/)
  return { nombres, apellidos: resto.join(' ') }
}
