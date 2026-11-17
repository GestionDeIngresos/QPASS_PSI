'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { obtenerSesionNegocio } from '@/lib/negocio/server'

const LISTA = '/negocio/productos'
const RE_PRECIO = /^\d{1,8}(\.\d{1,2})?$/

export async function crearProducto(formData: FormData) {
  const sesion = await obtenerSesionNegocio()
  if (!sesion) redirect(`/login?next=${LISTA}`)

  const negocioStr = String(formData.get('negocio') ?? '')
  if (!/^\d+$/.test(negocioStr)) redirect(`${LISTA}?error=fallo`)
  const negocio = Number(negocioStr)
  const base = `${LISTA}/nuevo?negocio=${negocio}`

  const nombre = String(formData.get('nombre') ?? '').trim()
  const descripcion = String(formData.get('descripcion') ?? '').trim() || null
  const precioStr = String(formData.get('precio') ?? '').trim()
  const disponible = formData.get('disponible') === 'true'

  if (!nombre || nombre.length > 120 || !RE_PRECIO.test(precioStr)) {
    redirect(`${base}&error=datos_invalidos`)
  }

  const { error } = await sesion.supabase.rpc('crear_producto', {
    p_negocio: negocio,
    p_nombre: nombre,
    p_descripcion: descripcion,
    p_precio: parseFloat(precioStr),
    p_disponible: disponible,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('DATOS_INVALIDOS') || error.code === '22023') redirect(`${base}&error=datos_invalidos`)
    if (msg.includes('SIN_PERMISOS') || error.code === '42501') redirect(`${base}&error=sin_permisos`)
    console.error('crearProducto:', error)
    redirect(`${base}&error=fallo`)
  }

  revalidatePath(LISTA)
  redirect(`${LISTA}?negocio=${negocio}&ok=creado`)
}

export async function editarProducto(formData: FormData) {
  const sesion = await obtenerSesionNegocio()
  if (!sesion) redirect(`/login?next=${LISTA}`)

  const idStr = String(formData.get('id') ?? '')
  const negocioStr = String(formData.get('negocio') ?? '')
  if (!/^\d+$/.test(idStr) || !/^\d+$/.test(negocioStr)) redirect(`${LISTA}?error=fallo`)
  const id = Number(idStr)
  const negocio = Number(negocioStr)
  const base = `${LISTA}/${id}/editar`

  const nombre = String(formData.get('nombre') ?? '').trim()
  const descripcion = String(formData.get('descripcion') ?? '').trim() || null
  const precioStr = String(formData.get('precio') ?? '').trim()
  const disponible = formData.get('disponible') === 'true'

  if (!nombre || nombre.length > 120 || !RE_PRECIO.test(precioStr)) {
    redirect(`${base}?error=datos_invalidos`)
  }

  const { error } = await sesion.supabase.rpc('editar_producto', {
    p_producto: id,
    p_nombre: nombre,
    p_descripcion: descripcion,
    p_precio: parseFloat(precioStr),
    p_disponible: disponible,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('DATOS_INVALIDOS') || error.code === '22023') redirect(`${base}?error=datos_invalidos`)
    if (msg.includes('SIN_PERMISOS') || error.code === '42501') redirect(`${base}?error=sin_permisos`)
    console.error('editarProducto:', error)
    redirect(`${base}?error=fallo`)
  }

  revalidatePath(LISTA)
  redirect(`${LISTA}?negocio=${negocio}&ok=editado`)
}

export async function eliminarProducto(formData: FormData) {
  const sesion = await obtenerSesionNegocio()
  if (!sesion) redirect(`/login?next=${LISTA}`)

  const idStr = String(formData.get('id') ?? '')
  const negocioStr = String(formData.get('negocio') ?? '')
  if (!/^\d+$/.test(idStr) || !/^\d+$/.test(negocioStr)) redirect(`${LISTA}?error=fallo`)
  const id = Number(idStr)
  const negocio = Number(negocioStr)

  const { error } = await sesion.supabase.rpc('eliminar_producto', { p_producto: id })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('PRODUCTO_CON_VENTAS')) redirect(`${LISTA}?negocio=${negocio}&error=con_ventas`)
    if (msg.includes('SIN_PERMISOS') || error.code === '42501') redirect(`${LISTA}?negocio=${negocio}&error=sin_permisos`)
    console.error('eliminarProducto:', error)
    redirect(`${LISTA}?negocio=${negocio}&error=fallo`)
  }

  revalidatePath(LISTA)
  redirect(`${LISTA}?negocio=${negocio}&ok=eliminado`)
}
