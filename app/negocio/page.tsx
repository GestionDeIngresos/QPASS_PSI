import type { Metadata } from 'next'
import Link from 'next/link'
import { exigirNegocio } from '@/lib/negocio/server'

export const metadata: Metadata = { title: 'Dashboard · QPass' }

type Negocio = { id: number; nombre: string; estado: boolean }
type AyudanteInfo = { activo: boolean }

function EstadoBadge({ activo }: { activo: boolean }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${
        activo ? 'border-green-400 text-green-400' : 'border-pink/70 text-pink'
      }`}
    >
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  )
}

// /negocio → HU 52: dashboard del propietario de negocio
export default async function NegocioDashboardPage() {
  const { supabase, user } = await exigirNegocio()

  // Negocios del dueño (necesarios para las demás consultas)
  const { data: negociosData } = await supabase
    .from('negocios')
    .select('id, nombre, estado')
    .eq('dueno_id', user.id)
    .order('nombre')
  const negocios = (negociosData ?? []) as Negocio[]
  const negocioIds = negocios.map((n) => n.id)

  // Productos y ayudantes en paralelo
  const [productosResult, ayudantesResult] = await Promise.all([
    negocioIds.length > 0
      ? supabase
          .from('productos')
          .select('*', { count: 'exact', head: true })
          .in('negocio_id', negocioIds)
      : Promise.resolve({ count: 0, error: null }),
    supabase.rpc('listar_ayudantes_dueno'),
  ])

  const totalNegocios = negocios.length
  const negociosActivos = negocios.filter((n) => n.estado).length
  const totalProductos = productosResult.count ?? 0
  const ayudantesActivos = ((ayudantesResult.data ?? []) as AyudanteInfo[]).filter(
    (a) => a.activo
  ).length

  const tarjetas = [
    {
      titulo: 'Total Negocios',
      valor: String(totalNegocios),
      subtitulo: `${negociosActivos} ${negociosActivos === 1 ? 'activo' : 'activos'}`,
      borde: 'border-[#9D00FF]/50',
      sombra: 'shadow-[0_0_30px_rgba(157,0,255,0.15)]',
      acento: 'text-[#9D00FF]',
    },
    {
      titulo: 'Total Productos',
      valor: String(totalProductos),
      subtitulo: null,
      borde: 'border-cyan/50',
      sombra: 'shadow-[0_0_30px_rgba(0,229,255,0.12)]',
      acento: 'text-cyan',
    },
    {
      titulo: 'Ayudantes Activos',
      valor: String(ayudantesActivos),
      subtitulo: null,
      borde: 'border-pink/50',
      sombra: 'shadow-[0_0_30px_rgba(255,0,122,0.15)]',
      acento: 'text-pink',
    },
    {
      // Pendiente: conectar con la consulta de ventas por negocio de Dev D
      titulo: 'Ventas del Mes',
      valor: '—',
      subtitulo: 'Pendiente de integración de ventas',
      borde: 'border-yellow-400/50',
      sombra: 'shadow-[0_0_30px_rgba(250,204,21,0.12)]',
      acento: 'text-yellow-400',
    },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="mb-6 text-3xl font-extrabold text-white">Dashboard</h1>

      {/* Tarjetas de resumen */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tarjetas.map((t) => (
          <div
            key={t.titulo}
            className={`rounded-2xl border bg-card p-5 ${t.borde} ${t.sombra}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t.titulo}</p>
            <p className={`mt-2 text-4xl font-extrabold ${t.acento}`}>{t.valor}</p>
            {t.subtitulo && (
              <p className="mt-1 text-xs text-muted">{t.subtitulo}</p>
            )}
          </div>
        ))}
      </div>

      {/* Sección Mis Negocios */}
      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-white">Mis Negocios</h2>
          <Link
            href="/negocio/negocios/nuevo"
            className="rounded-lg bg-pink px-5 py-2 text-xs font-bold text-white shadow-[0_0_20px_rgba(255,0,122,0.35)] transition hover:bg-pink-hover"
          >
            Crear negocio
          </Link>
        </div>

        {negocios.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
            <p className="font-semibold text-white">Todavía no tienes negocios registrados.</p>
            <Link
              href="/negocio/negocios/nuevo"
              className="mt-6 inline-block rounded-lg bg-pink px-6 py-3 text-sm font-bold text-white transition hover:bg-pink-hover"
            >
              Crear negocio
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {negocios.map((n) => (
              <div
                key={n.id}
                className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-[0_0_30px_rgba(157,0,255,0.06)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-bold text-white">{n.nombre}</p>
                  <EstadoBadge activo={n.estado} />
                </div>
                <div className="mt-4">
                  <Link
                    href={`/negocio/negocios/${n.id}`}
                    className="text-sm font-semibold text-cyan transition hover:text-white"
                  >
                    Gestionar →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
