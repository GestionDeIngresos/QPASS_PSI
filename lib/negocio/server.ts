import 'server-only'
import { redirect } from 'next/navigation'
import { obtenerSesionActual } from '@/lib/auth/sesion'

/** Para layouts y páginas: sin sesión → /login; rol distinto de 'negocio' o inactivo → /eventos. */
export async function exigirNegocio() {
  const sesion = await obtenerSesionActual()
  if (!sesion) redirect('/login?next=/negocio')
  if (sesion.perfil?.rol !== 'negocio' || sesion.perfil.activo === false) redirect('/eventos')
  return sesion
}

/** Para server actions: devuelve la sesión o null (sin redirigir). */
export async function obtenerSesionNegocio() {
  const sesion = await obtenerSesionActual()
  if (!sesion) return null
  if (sesion.perfil?.rol !== 'negocio' || sesion.perfil?.activo === false) return null
  return sesion
}
