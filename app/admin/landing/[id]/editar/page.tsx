import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EventoWizard } from '@/components/eventos/wizard/EventoWizard'
import { exigirAdmin } from '@/lib/admin/auth'
import { cargarBorrador } from '@/lib/eventos/guardar'
import { listarCategorias } from '@/lib/eventos/queries'
import { guardarEventoPublicado } from '../../actions'

export const metadata: Metadata = { title: 'Editar evento · Admin · QPass' }

// /admin/landing/[id]/editar → HU 25: información COMPLETA con el formulario por pasos de Dev A
export default async function EditarEventoLandingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) notFound()
  const { supabase } = await exigirAdmin()
  const [borrador, categorias] = await Promise.all([cargarBorrador(supabase, id), listarCategorias()])
  if (!borrador) notFound()

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="mb-6 text-3xl font-extrabold text-white">Editar Evento</h1>
      <EventoWizard
        modo="admin"
        inicial={borrador}
        categorias={categorias}
        accion={guardarEventoPublicado}
        volverHref={`/admin/landing?id=${id}`}
        volverTexto="Volver a Landing"
        redirigirA={`/admin/landing?id=${id}&ok=1`}
      />
    </div>
  )
}
