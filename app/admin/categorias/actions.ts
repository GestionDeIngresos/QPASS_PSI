'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { obtenerAdmin } from '@/lib/admin/auth'

function refrescar() {
  revalidatePath('/admin/categorias')
  revalidatePath('/eventos')
  revalidatePath('/')
}

function leer(formData: FormData) {
  return {
    nombre: String(formData.get('nombre') ?? '').trim(),
    descripcion: String(formData.get('descripcion') ?? '').trim(),
    estado: formData.get('estado') !== 'inactiva',
  }
}

const validar = (n: string, d: string) => n.length < 2 || n.length > 80 || d.length > 255

/** HU 35: crear categoría */
export async function crearCategoria(formData: FormData) {
  const admin = await obtenerAdmin()
  if (!admin) redirect('/eventos')
  const { nombre, descripcion, estado } = leer(formData)
  if (validar(nombre, descripcion)) redirect('/admin/categorias?nuevo=1&error=invalido')

  const { error } = await admin.supabase.from('categorias_evento').insert({ nombre, descripcion: descripcion || null, estado })
  if (error) redirect(`/admin/categorias?nuevo=1&error=${error.code === '23505' ? 'duplicada' : 'fallo'}`)
  refrescar()
  redirect('/admin/categorias?ok=creada')
}

/** HU 35: editar nombre, descripción y estado */
export async function editarCategoria(formData: FormData) {
  const admin = await obtenerAdmin()
  if (!admin) redirect('/eventos')
  const id = Number(formData.get('id'))
  const { nombre, descripcion, estado } = leer(formData)
  if (!Number.isInteger(id)) redirect('/admin/categorias?error=fallo')
  if (validar(nombre, descripcion)) redirect(`/admin/categorias?editar=${id}&error=invalido`)

  const { error } = await admin.supabase
    .from('categorias_evento')
    .update({ nombre, descripcion: descripcion || null, estado })
    .eq('id', id)
  if (error) redirect(`/admin/categorias?editar=${id}&error=${error.code === '23505' ? 'duplicada' : 'fallo'}`)
  refrescar()
  redirect('/admin/categorias?ok=editada')
}

/** HU 35: activar / desactivar (una categoría inactiva deja de salir en el filtro de eventos) */
export async function alternarCategoria(formData: FormData) {
  const admin = await obtenerAdmin()
  if (!admin) redirect('/eventos')
  const id = Number(formData.get('id'))
  if (!Number.isInteger(id)) redirect('/admin/categorias?error=fallo')
  const { error } = await admin.supabase
    .from('categorias_evento')
    .update({ estado: formData.get('activar') === 'true' })
    .eq('id', id)
  if (error) redirect('/admin/categorias?error=fallo')
  refrescar()
  redirect('/admin/categorias?ok=estado')
}

/** HU 35: eliminar (solo si ningún evento la usa; si no, hay que desactivarla) */
export async function eliminarCategoria(formData: FormData) {
  const admin = await obtenerAdmin()
  if (!admin) redirect('/eventos')
  const id = Number(formData.get('id'))
  if (!Number.isInteger(id)) redirect('/admin/categorias?error=fallo')

  const { count } = await admin.supabase.from('eventos').select('id', { count: 'exact', head: true }).eq('categoria_id', id)
  if ((count ?? 0) > 0) redirect('/admin/categorias?error=en_uso')

  const { error } = await admin.supabase.from('categorias_evento').delete().eq('id', id)
  if (error) redirect(`/admin/categorias?error=${error.code === '23503' ? 'en_uso' : 'fallo'}`)
  refrescar()
  redirect('/admin/categorias?ok=eliminada')
}
