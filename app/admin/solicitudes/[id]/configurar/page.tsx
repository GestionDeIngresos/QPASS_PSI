import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { EventoWizard } from '@/components/eventos/wizard/EventoWizard'
import { exigirAdmin } from '@/lib/admin/auth'
import { obtenerSolicitud } from '@/lib/admin/solicitudes'
import { listarCategorias } from '@/lib/eventos/queries'
import { cargarBorrador } from '@/lib/eventos/guardar'
import { guardarComoAdmin } from './actions'

export const metadata: Metadata = { title: 'Editar evento solicitado · Admin · QPass' }

// /admin/solicitudes/[id]/configurar → HU 31 (+ HU 22 en el paso 3)
export default async function ConfigurarEventoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await exigirAdmin()

  const solicitud = await obtenerSolicitud(id)
  if (!solicitud || !solicitud.eventoId) notFound()
  if (solicitud.estado !== 'aprobada') redirect('/admin/solicitudes?error=no_aprobada')

  const [borrador, categorias] = await Promise.all([cargarBorrador(supabase, solicitud.eventoId), listarCategorias()])
  if (!borrador) notFound()

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="mb-6 text-3xl font-extrabold text-white">Editar Evento Solicitado</h1>
      <EventoWizard
        modo="admin"
        inicial={borrador}
        categorias={categorias}
        accion={guardarComoAdmin}
        volverHref="/admin/solicitudes"
        volverTexto="Volver a Solicitudes"
        redirigirA="/admin/solicitudes"
      />
    </div>
  )
}
