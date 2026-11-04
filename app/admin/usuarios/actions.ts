'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { obtenerAdmin } from '@/lib/admin/auth'
import { esPersonal, esRol, type Rol } from '@/lib/admin/roles'
import { createAdminClient } from '@/lib/supabase/admin'

const VOLVER = '/admin/usuarios'
const BLOQUEO_INDEFINIDO = '876000h' // ~100 años: así "Inactivo" impide iniciar sesión

export type DatosUsuario = {
  nombres: string
  apellidos: string
  carnet: string
  correo: string
  rol: string
  eventoId: string | null
  // solo al crear
  password?: string
  confirmar?: string
  // solo al editar
  id?: string
  activo?: boolean
}

export type ResultadoUsuario = { ok: true; mensaje: string } | { ok: false; error: string }

type Validos = { nombre: string; carnet: string; correo: string; rol: Rol; eventoId: number | null }

function validar(d: DatosUsuario): Validos | string {
  const nombres = d.nombres?.trim() ?? ''
  const apellidos = d.apellidos?.trim() ?? ''
  const carnet = d.carnet?.trim() ?? ''
  const correo = d.correo?.trim().toLowerCase() ?? ''

  if (!nombres || !apellidos) return 'Completa nombres y apellidos.'
  if (nombres.length > 60 || apellidos.length > 60) return 'Nombres y apellidos: máximo 60 caracteres cada uno.'
  if (!/^[0-9A-Za-z-]{4,20}$/.test(carnet)) return 'El carnet de identidad no es válido.'
  if (correo.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return 'El correo electrónico no es válido.'
  if (!esRol(d.rol)) return 'Selecciona un rol válido.'

  let eventoId: number | null = null
  if (esPersonal(d.rol) && d.eventoId) {
    if (!/^\d+$/.test(d.eventoId)) return 'El evento asignado no es válido.'
    eventoId = Number(d.eventoId)
  }
  return { nombre: `${nombres} ${apellidos}`, carnet, correo, rol: d.rol, eventoId }
}

function mensajeAuth(error: { message: string; code?: string }) {
  if (error.code === 'email_exists' || /already (been )?registered/i.test(error.message)) {
    return 'Ya existe una cuenta con ese correo.'
  }
  if (error.code === 'weak_password') return 'La contraseña es muy débil.'
  return 'No se pudo completar la acción en la cuenta del usuario.'
}

/** HU 26 / HU 34: crea la cuenta (Auth + public.usuarios) y, si es personal, su evento asignado */
export async function crearUsuario(datos: DatosUsuario): Promise<ResultadoUsuario> {
  const admin = await obtenerAdmin()
  if (!admin) return { ok: false, error: 'No tienes permisos de administrador.' }

  const v = validar(datos)
  if (typeof v === 'string') return { ok: false, error: v }
  if (!datos.password || datos.password.length < 8) {
    return { ok: false, error: 'La contraseña temporal debe tener al menos 8 caracteres.' }
  }
  if (datos.password !== datos.confirmar) return { ok: false, error: 'Las contraseñas no coinciden.' }

  let servicio
  try {
    servicio = createAdminClient()
  } catch {
    return { ok: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.' }
  }

  const { data: creado, error: errorAuth } = await servicio.auth.admin.createUser({
    email: v.correo,
    password: datos.password,
    email_confirm: true, // el admin la crea: no hace falta confirmar por correo
    user_metadata: { nombre: v.nombre, carnet_identidad: v.carnet },
  })
  if (errorAuth || !creado.user) return { ok: false, error: mensajeAuth(errorAuth ?? { message: '' }) }
  const id = creado.user.id

  // El trigger de registro ya pudo crear la fila; upsert la completa con el rol elegido
  const { error: errorPerfil } = await servicio
    .from('usuarios')
    .upsert({ id, nombre: v.nombre, correo: v.correo, carnet_identidad: v.carnet, rol: v.rol, activo: true })
  if (errorPerfil) {
    await servicio.auth.admin.deleteUser(id) // sin perfil la cuenta queda inservible: se revierte
    return { ok: false, error: `No se pudo guardar el perfil: ${errorPerfil.message}` }
  }

  if (v.eventoId) {
    const { error } = await admin.supabase.from('asignaciones_staff').insert({ usuario_id: id, evento_id: v.eventoId })
    if (error) {
      revalidatePath(VOLVER)
      return { ok: false, error: 'Usuario creado, pero no se pudo asignar el evento. Edítalo para reintentar.' }
    }
  }

  revalidatePath(VOLVER)
  return { ok: true, mensaje: 'Usuario creado.' }
}

/** HU 26 / HU 34: edita datos, rol, estado y evento asignado */
export async function editarUsuario(datos: DatosUsuario): Promise<ResultadoUsuario> {
  const admin = await obtenerAdmin()
  if (!admin) return { ok: false, error: 'No tienes permisos de administrador.' }

  const id = datos.id ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: 'Usuario no válido.' }
  const v = validar(datos)
  if (typeof v === 'string') return { ok: false, error: v }
  const activo = datos.activo !== false

  if (id === admin.user.id && (v.rol !== 'admin' || !activo)) {
    return { ok: false, error: 'No puedes quitarte el rol de admin ni desactivar tu propia cuenta.' }
  }

  const { data: actual } = await admin.supabase.from('usuarios').select('correo, activo').eq('id', id).maybeSingle()
  if (!actual) return { ok: false, error: 'El usuario ya no existe.' }

  // Correo y bloqueo viven en Auth: requieren la service role
  const cambiaCorreo = (actual.correo ?? '').toLowerCase() !== v.correo
  const cambiaActivo = (actual.activo ?? true) !== activo
  if (cambiaCorreo || cambiaActivo) {
    let servicio
    try {
      servicio = createAdminClient()
    } catch {
      return { ok: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.' }
    }
    const { error } = await servicio.auth.admin.updateUserById(id, {
      ...(cambiaCorreo ? { email: v.correo, email_confirm: true } : {}),
      ...(cambiaActivo ? { ban_duration: activo ? 'none' : BLOQUEO_INDEFINIDO } : {}),
    })
    if (error) return { ok: false, error: mensajeAuth(error) }
  }

  const { data: filas, error } = await admin.supabase
    .from('usuarios')
    .update({ nombre: v.nombre, correo: v.correo, carnet_identidad: v.carnet, rol: v.rol, activo })
    .eq('id', id)
    .select('id')
  if (error || !filas?.length) return { ok: false, error: 'No se pudieron guardar los cambios.' }

  // Un evento por persona: se reemplaza la asignación anterior
  const { error: errorBorrar } = await admin.supabase.from('asignaciones_staff').delete().eq('usuario_id', id)
  if (errorBorrar) return { ok: false, error: 'Datos guardados, pero no se pudo actualizar el evento asignado.' }
  if (v.eventoId) {
    const { error: errorAsignar } = await admin.supabase
      .from('asignaciones_staff')
      .insert({ usuario_id: id, evento_id: v.eventoId })
    if (errorAsignar) return { ok: false, error: 'Datos guardados, pero no se pudo asignar el evento.' }
  }

  revalidatePath(VOLVER)
  return { ok: true, mensaje: 'Cambios guardados.' }
}

/** HU 26: elimina el perfil y la cuenta de acceso */
export async function eliminarUsuario(formData: FormData) {
  const admin = await obtenerAdmin()
  if (!admin) redirect('/login')

  const id = String(formData.get('id') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(`${VOLVER}?error=fallo`)
  if (id === admin.user.id) redirect(`${VOLVER}?error=propio`)

  let servicio
  try {
    servicio = createAdminClient()
  } catch {
    redirect(`${VOLVER}?error=sin_clave`)
  }

  await admin.supabase.from('asignaciones_staff').delete().eq('usuario_id', id)
  const { data: filas, error } = await admin.supabase.from('usuarios').delete().eq('id', id).select('id')
  // 23503 = tiene compras, eventos o solicitudes que lo referencian
  if (error) redirect(`${VOLVER}?error=${error.code === '23503' ? 'con_datos' : 'fallo'}`)
  if (!filas?.length) redirect(`${VOLVER}?error=fallo`)

  const { error: errorAuth } = await servicio.auth.admin.deleteUser(id)
  if (errorAuth && errorAuth.status !== 404) redirect(`${VOLVER}?error=fallo_auth`)

  revalidatePath(VOLVER)
  redirect(VOLVER)
}
