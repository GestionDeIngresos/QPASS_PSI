import 'server-only'
import { redirect } from 'next/navigation'
import { obtenerSesionActual } from '@/lib/auth/sesion'
import type {
  RolCaja,
  EventoCaja,
  RecargaVista,
  DevolucionVista,
  ReporteRecarga,
  SaldoPropio
} from './types'

export async function exigirPersonal(rol: RolCaja) {
  const sesion = await obtenerSesionActual()
  if (!sesion) redirect(`/login?next=/${rol}`)
  if (!sesion.perfil?.activo || ![rol, 'admin'].includes(sesion.perfil.rol))
    redirect('/eventos')
  return sesion
}
export async function exigirCuenta() {
  const sesion = await obtenerSesionActual()
  if (!sesion) redirect('/login?next=/mi-cuenta/saldos')
  if (sesion.perfil?.activo !== true) redirect('/eventos')
  return sesion
}
export async function eventosCaja(rol: RolCaja): Promise<EventoCaja[]> {
  const { supabase } = await exigirPersonal(rol)
  const { data, error } = await supabase.rpc('devb_eventos', { p_rol: rol })
  if (error)
    throw new Error(
      'No se pudieron consultar los eventos asignados. Comprueba la migración de Dev B.'
    )
  return data ?? []
}
export async function leerRecargas(
  evento: number,
  antes?: number
): Promise<RecargaVista[]> {
  const { supabase } = await exigirPersonal('recargador')
  const { data, error } = await supabase.rpc('historial_recargas', {
    p_evento: evento,
    p_antes: antes ?? null
  })
  if (error) throw new Error('No se pudo cargar el historial de recargas.')
  return data ?? []
}
export async function leerReportes(antes?: number): Promise<ReporteRecarga[]> {
  const { supabase } = await exigirPersonal('recargador')
  const { data, error } = await supabase.rpc('mis_reportes_recarga', {
    p_antes: antes ?? null
  })
  if (error) throw new Error('No se pudieron consultar tus reportes.')
  return data ?? []
}
export async function leerDevoluciones(
  evento: number,
  antes?: number
): Promise<DevolucionVista[]> {
  const { supabase } = await exigirPersonal('devolucion')
  const { data, error } = await supabase.rpc('historial_devoluciones', {
    p_evento: evento,
    p_antes: antes ?? null
  })
  if (error) throw new Error('No se pudo cargar el historial de devoluciones.')
  return Promise.all(
    ((data ?? []) as DevolucionVista[]).map(async (fila) => {
      const firmar = async (ruta?: string | null) => {
        if (!ruta) return undefined
        const { data } = await supabase.storage
          .from('devb-evidencias')
          .createSignedUrl(ruta, 300)
        return data?.signedUrl
      }
      return {
        ...fila,
        comprobante: undefined,
        foto: undefined,
        comprobanteFirmado: await firmar(fila.comprobante),
        fotoFirmada: await firmar(fila.foto)
      }
    })
  )
}
export async function leerMisSaldos(): Promise<SaldoPropio[]> {
  const { supabase } = await exigirCuenta()
  const { data, error } = await supabase.rpc('consultar_mis_saldos')
  if (error)
    throw new Error(
      'No se pudieron consultar tus saldos. Comprueba la migración de Dev B.'
    )
  return data ?? []
}
