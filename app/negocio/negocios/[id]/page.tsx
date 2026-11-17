import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { exigirNegocio } from '@/lib/negocio/server'

export const metadata: Metadata = { title: 'Detalle de Negocio · QPass' }

type AyudanteInfo = {
  usuarioId: string
  activo: boolean
  negocios: { id: number; nombre: string; activo: boolean }[]
}

function formatearFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-BO', {
    timeZone: 'America/La_Paz',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function EstadoBadge({ activo }: { activo: boolean }) {
  return (
    <span
      className={`inline-block rounded-full border px-3 py-0.5 text-xs font-bold uppercase ${
        activo ? 'border-green-400 text-green-400' : 'border-pink/70 text-pink'
      }`}
    >
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  )
}

// /negocio/negocios/[id] → HU 53: detalle de un negocio propio
export default async function DetalleNegocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user } = await exigirNegocio()

  if (!/^\d+$/.test(id)) notFound()

  const [{ data: negocio }, { count: totalProductos }, rpcResult] = await Promise.all([
    supabase
      .from('negocios')
      .select('id, nombre, descripcion, estado, creado_en')
      .eq('id', Number(id))
      .eq('dueno_id', user.id)
      .maybeSingle(),
    supabase
      .from('productos')
      .select('*', { count: 'exact', head: true })
      .eq('negocio_id', Number(id)),
    supabase.rpc('listar_ayudantes_dueno'),
  ])

  const negocioId = Number(id)
  const todosAyudantes = (rpcResult.data ?? []) as AyudanteInfo[]
  const ayudantesActivos = todosAyudantes.filter((a) =>
    a.activo && a.negocios.some((n) => n.id === negocioId && n.activo)
  ).length

  if (!negocio) notFound()

  return (
    <div className="mx-auto w-full max-w-xl">
      <Link href="/negocio/negocios" className="mb-6 inline-flex items-center gap-1 text-sm text-muted transition hover:text-white">
        ← Volver a Mis Negocios
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold text-white">{negocio.nombre}</h1>
        <EstadoBadge activo={negocio.estado} />
      </div>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-[0_0_40px_rgba(157,0,255,0.08)]">
        <dl className="flex flex-col gap-5">
          <div>
            <dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Fecha de creación</dt>
            <dd className="text-sm text-white">{formatearFecha(negocio.creado_en)}</dd>
          </div>
          <div>
            <dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Descripción</dt>
            <dd className="text-sm text-white">
              {negocio.descripcion?.trim() ? negocio.descripcion : <span className="text-muted">Sin descripción.</span>}
            </dd>
          </div>
        </dl>

        <div className="mt-6">
          <Link
            href={`/negocio/negocios/${negocio.id}/editar`}
            className="rounded-lg bg-yellow-400/10 px-5 py-2.5 text-sm font-bold text-yellow-300 transition hover:bg-yellow-400/20"
          >
            Editar negocio
          </Link>
        </div>
      </section>

      {/* Tarjeta de productos */}
      <section className="mt-5 rounded-2xl border border-border bg-card p-6 shadow-[0_0_40px_rgba(157,0,255,0.08)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Gestionar Productos</h2>
            <p className="mt-1 text-2xl font-extrabold text-white">{totalProductos ?? 0}</p>
            <p className="text-xs text-muted">{totalProductos === 1 ? 'producto' : 'productos'} en el catálogo</p>
          </div>
          <Link
            href={`/negocio/productos?negocio=${negocio.id}`}
            className="rounded-lg bg-cyan/10 px-5 py-2.5 text-sm font-bold text-cyan transition hover:bg-cyan/20"
          >
            Ver catálogo
          </Link>
        </div>
      </section>

      {/* Tarjeta de ayudantes */}
      <section className="mt-5 rounded-2xl border border-border bg-card p-6 shadow-[0_0_40px_rgba(157,0,255,0.08)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Gestionar Ayudantes</h2>
            <p className="mt-1 text-2xl font-extrabold text-white">{ayudantesActivos}</p>
            <p className="text-xs text-muted">{ayudantesActivos === 1 ? 'ayudante activo' : 'ayudantes activos'}</p>
          </div>
          <Link
            href={`/negocio/ayudantes?negocio=${negocio.id}`}
            className="rounded-lg bg-cyan/10 px-5 py-2.5 text-sm font-bold text-cyan transition hover:bg-cyan/20"
          >
            Ver ayudantes
          </Link>
        </div>
      </section>
    </div>
  )
}
