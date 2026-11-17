'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { obtenerSesionNegocio } from '@/lib/negocio/server'

const LISTA = '/negocio/ayudantes'
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function mensajeAuth(error: { message?: string; code?: string }) {
  if (error.code === 'email_exists' || /already (been )?registered/i.test(error.message ?? '')) {
    return 'correo_duplicado'
  }
  if (error.code === 'weak_password') return 'password_debil'
  return 'fallo_auth'
}

export async function registrarAyudante(formData: FormData) {
  const sesion = await obtenerSesionNegocio()
  if (!sesion) redirect(`/login?next=${LISTA}`)

  const nombre = String(formData.get('nombre') ?? '').trim()
  const correo = String(formData.get('correo') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const negocioIds = formData
    .getAll('negocios')
    .map((v) => Number(String(v)))
    .filter((n) => Number.isInteger(n) && n > 0)
  const BASE = `${LISTA}/nuevo`

  if (!nombre || nombre.length > 120) redirect(`${BASE}?error=datos_invalidos`)
  if (!correo || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) redirect(`${BASE}?error=datos_invalidos`)
  if (!password || password.length < 8) redirect(`${BASE}?error=datos_invalidos`)
  if (negocioIds.length === 0) redirect(`${BASE}?error=datos_invalidos`)

  // Verificar que todos los negocios son del dueño ANTES de crear la cuenta.
  const { data: misNegocios } = await sesion.supabase
    .from('negocios')
    .select('id')
    .eq('dueno_id', sesion.user.id)
  const misIds = new Set((misNegocios ?? []).map((n: { id: number }) => n.id))
  if (negocioIds.some((id) => !misIds.has(id))) redirect(`${BASE}?error=sin_permisos`)

  let servicio
  try {
    servicio = createAdminClient()
  } catch {
    redirect(`${BASE}?error=sin_clave`)
  }

  // Crear cuenta en Auth con email ya confirmado.
  const { data: creado, error: errorAuth } = await servicio.auth.admin.createUser({
    email: correo,
    password,
    email_confirm: true,
    user_metadata: { nombre },
  })
  if (errorAuth || !creado.user) redirect(`${BASE}?error=${mensajeAuth(errorAuth ?? {})}`)
  const uid = creado.user.id

  // Upsert del perfil; rol siempre 'ayudante', nunca tomado del formulario.
  const { error: errorPerfil } = await servicio
    .from('usuarios')
    .upsert({ id: uid, nombre, correo, rol: 'ayudante', activo: true })
  if (errorPerfil) {
    await servicio.auth.admin.deleteUser(uid)
    redirect(`${BASE}?error=fallo`)
  }

  // Vincular con la sesión del dueño (auth.uid() debe ser el dueño).
  const { error: errorVincular } = await sesion.supabase.rpc('vincular_ayudante', {
    p_usuario: uid,
    p_negocios: negocioIds,
  })
  if (errorVincular) {
    await servicio.auth.admin.deleteUser(uid)
    const msg = errorVincular.message ?? ''
    if (msg.includes('SIN_EVENTO_ASIGNADO')) redirect(`${BASE}?error=sin_evento`)
    if (
      msg.includes('AYUDANTE_DE_OTRO_DUENO') ||
      msg.includes('USUARIO_NO_AYUDANTE') ||
      msg.includes('AYUDANTE_CON_OTRO_EVENTO')
    ) redirect(`${BASE}?error=no_asignable`)
    if (msg.includes('SIN_PERMISOS') || errorVincular.code === '42501') redirect(`${BASE}?error=sin_permisos`)
    redirect(`${BASE}?error=fallo`)
  }

  revalidatePath(LISTA)
  redirect(`${LISTA}?ok=creado`)
}

export async function editarAyudante(formData: FormData) {
  const sesion = await obtenerSesionNegocio()
  if (!sesion) redirect(`/login?next=${LISTA}`)

  const usuarioId = String(formData.get('usuarioId') ?? '')
  if (!RE_UUID.test(usuarioId)) redirect(`${LISTA}?error=fallo`)

  const nombre = String(formData.get('nombre') ?? '').trim()
  const negocioIds = formData
    .getAll('negocios')
    .map((v) => Number(String(v)))
    .filter((n) => Number.isInteger(n) && n > 0)
  const activo = formData.get('activo') === 'true'
  const BASE = `${LISTA}/${usuarioId}/editar`

  if (!nombre || nombre.length > 120) redirect(`${BASE}?error=datos_invalidos`)
  // p_negocios puede estar vacío solo si p_activo = false (desactivación total).
  if (negocioIds.length === 0 && activo) redirect(`${BASE}?error=datos_invalidos`)

  const { error } = await sesion.supabase.rpc('editar_ayudante', {
    p_usuario: usuarioId,
    p_nombre: nombre,
    p_negocios: negocioIds,
    p_activo: activo,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('DATOS_INVALIDOS') || error.code === '22023') redirect(`${BASE}?error=datos_invalidos`)
    if (msg.includes('SIN_PERMISOS') || error.code === '42501') redirect(`${BASE}?error=sin_permisos`)
    redirect(`${BASE}?error=fallo`)
  }

  revalidatePath(LISTA)
  redirect(`${LISTA}?ok=editado`)
}

export async function eliminarAyudante(formData: FormData) {
  const sesion = await obtenerSesionNegocio()
  if (!sesion) redirect(`/login?next=${LISTA}`)

  const usuarioId = String(formData.get('usuarioId') ?? '')
  if (!RE_UUID.test(usuarioId)) redirect(`${LISTA}?error=fallo`)

  const { error } = await sesion.supabase.rpc('eliminar_ayudante', { p_usuario: usuarioId })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('AYUDANTE_CON_VENTAS')) redirect(`${LISTA}?error=con_ventas`)
    if (msg.includes('SIN_PERMISOS') || error.code === '42501') redirect(`${LISTA}?error=sin_permisos`)
    redirect(`${LISTA}?error=fallo`)
  }

  revalidatePath(LISTA)
  redirect(`${LISTA}?ok=eliminado`)
}
