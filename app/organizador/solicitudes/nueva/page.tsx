import type { Metadata } from 'next'
import { EventoWizard } from '@/components/eventos/wizard/EventoWizard'
import { exigirSesion } from '@/lib/organizador/auth'
import { listarCategorias } from '@/lib/eventos/queries'
import { enviarSolicitud } from './actions'

export const metadata: Metadata = { title: 'Solicitar evento · QPass' }

// /organizador/solicitudes/nueva → HU 18: formulario por pasos (modo "solicitud")
export default async function NuevaSolicitudPage() {
  await exigirSesion('/organizador/solicitudes/nueva')
  const categorias = await listarCategorias()

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="mb-6 text-3xl font-extrabold text-white">Solicitar Evento</h1>
      <EventoWizard
        modo="solicitud"
        categorias={categorias}
        accion={enviarSolicitud}
        volverHref="/organizador/solicitudes"
        volverTexto="Cancelar"
        redirigirA="/organizador/solicitudes?ok=enviada"
      />
    </div>
  )
}
