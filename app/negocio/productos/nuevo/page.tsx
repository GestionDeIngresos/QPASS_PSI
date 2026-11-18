import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { exigirNegocio } from '@/lib/negocio/server'
import { crearProducto } from '../actions'

export const metadata: Metadata = { title: 'Agregar Producto · QPass' }

const ERRORES: Record<string, string> = {
  datos_invalidos: 'Revisa los datos ingresados.',
  sin_permisos: 'No tienes permiso para esta acción.',
  fallo: 'No se pudo agregar el producto. Inténtalo de nuevo.',
}

const INPUT = 'w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-muted/60 focus:border-pink'
const LABEL = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted'

// /negocio/productos/nuevo?negocio=ID → HU 55: agregar un producto al negocio
export default async function NuevoProductoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const { supabase, user } = await exigirNegocio()

  const negocioStr = typeof params.negocio === 'string' ? params.negocio : ''
  if (!/^\d+$/.test(negocioStr)) notFound()
  const negocioId = Number(negocioStr)

  // Verificar que el negocio pertenece al usuario
  const { data: negocio } = await supabase
    .from('negocios')
    .select('id, nombre')
    .eq('id', negocioId)
    .eq('dueno_id', user.id)
    .maybeSingle()
  if (!negocio) notFound()

  const error = typeof params.error === 'string' ? ERRORES[params.error] : undefined

  return (
    <div className="mx-auto w-full max-w-xl">
      <Link
        href={`/negocio/productos?negocio=${negocio.id}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted transition hover:text-white"
      >
        ← Volver a Productos
      </Link>

      <h1 className="mb-1 text-3xl font-extrabold text-white">Agregar Producto</h1>
      <p className="mb-6 text-sm text-muted">{negocio.nombre}</p>

      {error && (
        <p role="alert" className="mb-5 rounded-lg border border-pink/50 bg-pink/10 px-4 py-3 text-sm text-pink">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-border bg-card p-6 shadow-[0_0_40px_rgba(157,0,255,0.08)]">
        <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-muted">Detalles del Nuevo Producto</h2>
        <form action={crearProducto} className="flex flex-col gap-5">
          <input type="hidden" name="negocio" value={negocio.id} />

          <div>
            <label htmlFor="nombre" className={LABEL}>
              Nombre <span className="text-pink">*</span>
            </label>
            <input
              id="nombre"
              name="nombre"
              type="text"
              required
              maxLength={120}
              placeholder="Nombre del producto"
              className={INPUT}
            />
          </div>

          <div>
            <label htmlFor="descripcion" className={LABEL}>
              Descripción
            </label>
            <textarea
              id="descripcion"
              name="descripcion"
              rows={3}
              placeholder="Descripción opcional"
              className={`${INPUT} resize-none`}
            />
          </div>

          <div>
            <label htmlFor="precio" className={LABEL}>
              Precio (puntos) <span className="text-pink">*</span>
            </label>
            <input
              id="precio"
              name="precio"
              type="number"
              required
              min="0"
              step="0.01"
              placeholder="0.00"
              className={INPUT}
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              id="disponible"
              name="disponible"
              type="checkbox"
              value="true"
              defaultChecked
              className="h-4 w-4 rounded accent-pink"
            />
            <label htmlFor="disponible" className="text-sm font-semibold text-white">
              Producto disponible para la venta
            </label>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <SubmitButton
              pendingText="Guardando…"
              className="rounded-lg bg-pink px-6 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(255,0,122,0.35)] transition hover:bg-pink-hover disabled:opacity-60"
            >
              Guardar
            </SubmitButton>
            <Link
              href={`/negocio/productos?negocio=${negocio.id}`}
              className="rounded-lg border border-border px-6 py-2.5 text-sm font-bold text-white transition hover:border-pink"
            >
              Cancelar
            </Link>
          </div>
        </form>
      </section>
    </div>
  )
}
