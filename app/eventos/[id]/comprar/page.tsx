import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { CompraEntradas } from '@/components/compras/CompraEntradas'
import { eventoFinalizado } from '@/lib/eventos/format'
import { obtenerEvento } from '@/lib/eventos/queries'
import { createClient } from '@/lib/supabase/server'

type Props = {
  params: Promise<{ id: string }>
  // ?para=otros → abre el formulario en modo "comprar para otra persona"
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const evento = await obtenerEvento(id) // cache(): no repite la consulta de la página
  return { title: evento ? `Comprar entrada · ${evento.titulo} · QPass` : 'Comprar entrada · QPass' }
}

// ════════════════════════════════════════════════════════════════
// /eventos/[id]/comprar  →  compra de entradas (Historias 3 y 4 · Dev C)
// ════════════════════════════════════════════════════════════════
export default async function ComprarPage({ params, searchParams }: Props) {
  const { id } = await params
  const { para } = await searchParams

  const evento = await obtenerEvento(id) // solo eventos publicados (RLS + .eq)
  if (!evento) notFound()

  // Comprar exige sesión. (La función SQL vuelve a comprobarlo: esto es solo UX.)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sinVenta = eventoFinalizado(evento.fecha_evento) || !evento.tickets.some((t) => t.cantidad_disponible > 0)
  if (sinVenta) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center px-6 py-24 text-center">
        <h1 className="mb-3 text-2xl font-extrabold text-white">Venta no disponible</h1>
        <p className="mb-8 text-sm text-muted">
          {eventoFinalizado(evento.fecha_evento)
            ? 'Este evento ya finalizó.'
            : 'Las entradas de este evento están agotadas.'}
        </p>
        <Link
          href={`/eventos/${evento.id}`}
          className="rounded-lg bg-pink px-6 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-[0_0_25px_rgba(255,0,122,0.35)] transition hover:bg-pink-hover"
        >
          Volver al evento
        </Link>
      </div>
    )
  }

  return <CompraEntradas evento={evento} paraOtrosInicial={para === 'otros'} />
}