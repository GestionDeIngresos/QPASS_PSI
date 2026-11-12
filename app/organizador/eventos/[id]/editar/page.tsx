import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { EventoWizard } from '@/components/eventos/wizard/EventoWizard'
import { cargarBorrador } from '@/lib/eventos/guardar'
import { listarCategorias } from '@/lib/eventos/queries'
import { exigirSesion } from '@/lib/organizador/auth'
import { ESTADOS_EDITABLES, obtenerMiEvento } from '@/lib/organizador/queries'
import { guardarComoOrganizador } from './actions'

export const metadata: Metadata = { title: 'Editar evento · QPass' }

// /organizador/eventos/[id]/editar → HU 20: el organizador edita su evento (modo "organizador")
export default async function EditarEventoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user } = await exigirSesion(`/organizador/eventos/${id}/editar`)

  // solo se puede entrar a un evento PROPIO (si es ajeno o no existe → 404)
  const propio = await obtenerMiEvento(supabase, user.id, id)
  if (!propio) notFound()
  if (!ESTADOS_EDITABLES.includes(propio.estado as (typeof ESTADOS_EDITABLES)[number])) {
    redirect('/organizador/eventos?error=no_editable')
  }

  const [borrador, categorias] = await Promise.all([cargarBorrador(supabase, id), listarCategorias()])
  if (!borrador) notFound()

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="mb-6 text-3xl font-extrabold text-white">Editar Evento</h1>
      <EventoWizard
        modo="organizador"
        inicial={borrador}
        categorias={categorias}
        accion={guardarComoOrganizador}
        volverHref="/organizador/eventos"
        volverTexto="Volver a Mis Eventos"
        redirigirA="/organizador/eventos"
      />
    </div>
  )
}
