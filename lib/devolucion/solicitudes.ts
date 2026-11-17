import 'server-only'
import { redirect } from 'next/navigation'
import { obtenerSesionActual } from '@/lib/auth/sesion'

export async function exigirEncargadoDevolucion() {
  const sesion = await obtenerSesionActual()
  if (!sesion) redirect('/login?next=/devolucion/solicitudes')
  if (
    (sesion.perfil?.rol !== 'devolucion' && sesion.perfil?.rol !== 'admin') ||
    sesion.perfil?.activo === false
  ) {
    redirect('/eventos')
  }
  return sesion
}
