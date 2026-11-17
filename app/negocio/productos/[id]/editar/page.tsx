import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { exigirNegocio } from '@/lib/negocio/server'
import { editarProducto } from '../../actions'

export const metadata: Metadata = { title: 'Editar Producto · QPass' }

const ERRORES: Record<string, string> = {
  datos_invalidos: 'Revisa los datos ingresados.',
  sin_permisos: 'No tienes permiso para esta acción.',
  fallo: 'No se pudo guardar los cambios. Inténtalo de nuevo.',
}

const INPUT = 'w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-muted/60 focus:border-pink'
const LABEL = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted'

// /negocio/productos/[id]/editar → HU 55: editar un producto propio
export default async function EditarProductoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const { supabase } = await exigirNegocio()

  if (!/^\d+$/.test(id)) notFound()

  // La RLS devc_productos_dueno filtra los productos que no son del usuario
  const { data: producto } = await supabase
    .from('productos')
    .select('id, nombre, descripcion, precio, disponible, negocio_id')
    .eq('id', Number(id))
    .maybeSingle()
  if (!producto) notFound()

  const sp = await searchParams
  const error = typeof sp.error === 'string' ? ERRORES[sp.error] : undefined

  return (
    <div className="mx-auto w-full max-w-xl">
      <Link
        href={`/negocio/productos?negocio=${producto.negocio_id}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted transition hover:text-white"
      >
        ← Volver a Productos
      </Link>

      <h1 className="mb-6 text-3xl font-extrabold text-white">Editar Producto</h1>

      {error && (
        <p role="alert" className="mb-5 rounded-lg border border-pink/50 bg-pink/10 px-4 py-3 text-sm text-pink">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-border bg-card p-6 shadow-[0_0_40px_rgba(157,0,255,0.08)]">
        <form action={editarProducto} className="flex flex-col gap-5">
          <input type="hidden" name="id" value={producto.id} />
          <input type="hidden" name="negocio" value={producto.negocio_id} />

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
              defaultValue={producto.nombre}
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
              defaultValue={producto.descripcion ?? ''}
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
              defaultValue={Number(producto.precio).toFixed(2)}
              className={INPUT}
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              id="disponible"
              name="disponible"
              type="checkbox"
              value="true"
              defaultChecked={producto.disponible}
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
              href={`/negocio/productos?negocio=${producto.negocio_id}`}
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
