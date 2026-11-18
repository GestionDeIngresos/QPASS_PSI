'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { obtenerSesionNegocio } from '@/lib/negocio/server'

const LISTA = '/negocio/negocios'

export async function crearNegocio(formData: FormData) {
  const sesion = await obtenerSesionNegocio()
  if (!sesion) redirect(`/login?next=${LISTA}`)

  const nombre = String(formData.get('nombre') ?? '').trim()
  const descripcion = String(formData.get('descripcion') ?? '').trim() || null

  if (!nombre || nombre.length > 120) redirect(`${LISTA}/nuevo?error=datos_invalidos`)

  const { error } = await sesion.supabase.rpc('crear_negocio', {
    p_nombre: nombre,
    p_descripcion: descripcion,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('SIN_EVENTO_ASIGNADO')) redirect(`${LISTA}/nuevo?error=sin_evento`)
    if (msg.includes('DATOS_INVALIDOS') || error.code === '22023') redirect(`${LISTA}/nuevo?error=datos_invalidos`)
    if (msg.includes('SIN_PERMISOS') || error.code === '42501') redirect(`${LISTA}/nuevo?error=sin_permisos`)
    console.error('crearNegocio:', error)
    redirect(`${LISTA}/nuevo?error=fallo`)
  }

  revalidatePath(LISTA)
  redirect(`${LISTA}?ok=creado`)
}

export async function editarNegocio(formData: FormData) {
  const sesion = await obtenerSesionNegocio()
  if (!sesion) redirect(`/login?next=${LISTA}`)

  const id = String(formData.get('id') ?? '')
  if (!/^\d+$/.test(id)) redirect(`${LISTA}?error=fallo`)

  const nombre = String(formData.get('nombre') ?? '').trim()
  const descripcion = String(formData.get('descripcion') ?? '').trim() || null
  const estado = formData.get('estado') === 'true'
  const base = `${LISTA}/${id}/editar`

  if (!nombre || nombre.length > 120) redirect(`${base}?error=datos_invalidos`)

  const { error } = await sesion.supabase.rpc('editar_negocio', {
    p_negocio: Number(id),
    p_nombre: nombre,
    p_descripcion: descripcion,
    p_estado: estado,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('DATOS_INVALIDOS') || error.code === '22023') redirect(`${base}?error=datos_invalidos`)
    if (msg.includes('SIN_PERMISOS') || error.code === '42501') redirect(`${base}?error=sin_permisos`)
    console.error('editarNegocio:', error)
    redirect(`${base}?error=fallo`)
  }

  revalidatePath(LISTA)
  revalidatePath(`${LISTA}/${id}`)
  redirect(`${LISTA}?ok=editado`)
}

export async function eliminarNegocio(formData: FormData) {
  const sesion = await obtenerSesionNegocio()
  if (!sesion) redirect(`/login?next=${LISTA}`)

  const id = String(formData.get('id') ?? '')
  if (!/^\d+$/.test(id)) redirect(`${LISTA}?error=fallo`)

  const { error } = await sesion.supabase.rpc('eliminar_negocio', { p_negocio: Number(id) })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('NEGOCIO_CON_VENTAS')) redirect(`${LISTA}?error=con_ventas`)
    if (msg.includes('SIN_PERMISOS') || error.code === '42501') redirect(`${LISTA}?error=sin_permisos`)
    console.error('eliminarNegocio:', error)
    redirect(`${LISTA}?error=fallo`)
  }

  revalidatePath(LISTA)
  redirect(`${LISTA}?ok=eliminado`)
}
