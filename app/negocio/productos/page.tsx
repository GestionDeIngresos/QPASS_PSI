import type { Metadata } from 'next'
import Form from 'next/form'
import Link from 'next/link'
import { BotonConfirmar } from '@/components/admin/BotonConfirmar'
import { exigirNegocio } from '@/lib/negocio/server'
import { eliminarProducto } from './actions'

export const metadata: Metadata = { title: 'Productos · QPass' }

const AVISOS: Record<string, string> = {
  creado: 'Producto agregado correctamente.',
  editado: 'Producto actualizado correctamente.',
  eliminado: 'Producto eliminado.',
}
const ERRORES: Record<string, string> = {
  con_ventas: 'Este producto tiene ventas registradas y no se puede eliminar. Puedes marcarlo como inactivo desde Editar.',
  sin_permisos: 'No tienes permiso para esta acción.',
  fallo: 'No se pudo completar la acción. Inténtalo de nuevo.',
}

function DisponibleBadge({ disponible }: { disponible: boolean }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${
        disponible ? 'border-green-400 text-green-400' : 'border-pink/70 text-pink'
      }`}
    >
      {disponible ? 'Activo' : 'Inactivo'}
    </span>
  )
}

const BTN = 'rounded-md px-3 py-1.5 text-[11px] font-bold transition'
const SELECT = 'rounded-lg border border-border bg-bg px-3 py-2 text-xs font-semibold text-white outline-none transition focus:border-pink [color-scheme:dark]'

// /negocio/productos → HU 56: catálogo de productos por negocio
export default async function ProductosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const { supabase, user } = await exigirNegocio()

  // Cargar todos los negocios del usuario
  const { data: negocios } = await supabase
    .from('negocios')
    .select('id, nombre')
    .eq('dueno_id', user.id)
    .order('creado_en', { ascending: true })
  const lista = negocios ?? []

  const aviso = typeof params.ok === 'string' ? AVISOS[params.ok] : undefined
  const error = typeof params.error === 'string' ? ERRORES[params.error] : undefined

  if (lista.length === 0) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="mb-6 text-3xl font-extrabold text-white">Productos</h1>
        <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <p className="font-semibold text-white">Todavía no tienes negocios registrados.</p>
          <p className="mt-2 text-sm text-muted">Crea un negocio primero para poder gestionar su catálogo.</p>
          <Link
            href="/negocio/negocios/nuevo"
            className="mt-6 inline-block rounded-lg bg-pink px-6 py-3 text-sm font-bold text-white transition hover:bg-pink-hover"
          >
            Crear negocio
          </Link>
        </div>
      </div>
    )
  }

  // Negocio seleccionado: usar ?negocio= si pertenece al usuario, si no el primero
  const paramNegocio = typeof params.negocio === 'string' && /^\d+$/.test(params.negocio)
    ? Number(params.negocio)
    : null
  const negocioActual = lista.find((n) => n.id === paramNegocio) ?? lista[0]!

  const q = typeof params.q === 'string' ? params.q.trim() : ''
  const disponibleFiltro = params.disponible === 'activo' || params.disponible === 'inactivo'
    ? params.disponible
    : ''

  // Cargar productos del negocio seleccionado
  let queryProductos = supabase
    .from('productos')
    .select('id, nombre, descripcion, precio, disponible')
    .eq('negocio_id', negocioActual.id)
    .order('nombre', { ascending: true })
  if (q) queryProductos = queryProductos.ilike('nombre', `%${q}%`)
  if (disponibleFiltro === 'activo') queryProductos = queryProductos.eq('disponible', true)
  if (disponibleFiltro === 'inactivo') queryProductos = queryProductos.eq('disponible', false)

  const { data: productos, error: dbError } = await queryProductos
  if (dbError) throw new Error('No se pudieron cargar los productos.')
  const productosList = productos ?? []

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="mb-6 text-3xl font-extrabold text-white">Productos</h1>

      {/* Selector de negocio + filtros en una sola forma */}
      <div className="mb-5 flex flex-wrap items-start gap-3 rounded-2xl border border-border bg-card p-4">
        <Form action="/negocio/productos" className="flex flex-1 flex-wrap items-center gap-3">
          <select
            name="negocio"
            defaultValue={negocioActual.id}
            aria-label="Seleccionar negocio"
            className={`${SELECT} basis-48`}
          >
            {lista.map((n) => (
              <option key={n.id} value={n.id}>{n.nombre}</option>
            ))}
          </select>
          <input
            name="q"
            type="search"
            defaultValue={q}
            maxLength={120}
            placeholder="Buscar producto…"
            aria-label="Buscar productos"
            className="min-w-0 flex-1 basis-40 rounded-lg border border-border bg-bg px-4 py-2 text-sm text-white outline-none placeholder:text-muted/60 focus:border-pink"
          />
          <select name="disponible" defaultValue={disponibleFiltro} aria-label="Filtrar por estado" className={SELECT}>
            <option value="">Estado: Todos</option>
            <option value="activo">Estado: Activo</option>
            <option value="inactivo">Estado: Inactivo</option>
          </select>
          <button type="submit" className="rounded-lg border border-cyan px-5 py-2 text-xs font-bold text-cyan transition hover:bg-cyan/10">
            Filtrar
          </button>
        </Form>
        <Link
          href={`/negocio/productos/nuevo?negocio=${negocioActual.id}`}
          className="rounded-lg bg-pink px-5 py-2 text-xs font-bold text-white shadow-[0_0_20px_rgba(255,0,122,0.35)] transition hover:bg-pink-hover"
        >
          Agregar producto
        </Link>
      </div>

      {aviso && (
        <p role="status" className="mb-4 rounded-lg border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          {aviso}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-pink/50 bg-pink/10 px-4 py-3 text-sm text-pink">
          {error}
        </p>
      )}

      {productosList.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <p className="font-semibold text-white">
            {q || disponibleFiltro
              ? 'No hay productos que coincidan con los filtros.'
              : `${negocioActual.nombre} no tiene productos todavía.`}
          </p>
          {!q && !disponibleFiltro && (
            <Link
              href={`/negocio/productos/nuevo?negocio=${negocioActual.id}`}
              className="mt-6 inline-block rounded-lg bg-pink px-6 py-3 text-sm font-bold text-white transition hover:bg-pink-hover"
            >
              Agregar producto
            </Link>
          )}
        </div>
      ) : (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_0_40px_rgba(157,0,255,0.08)] md:p-6">
          {/* Escritorio: tabla */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="px-3 py-3 font-semibold">Nombre</th>
                  <th className="px-3 py-3 font-semibold">Descripción</th>
                  <th className="px-3 py-3 font-semibold">Precio</th>
                  <th className="px-3 py-3 font-semibold">Estado</th>
                  <th className="px-3 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productosList.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-3 font-semibold text-white">{p.nombre}</td>
                    <td className="max-w-56 truncate px-3 py-3 text-muted">{p.descripcion || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-white">
                      {Number(p.precio).toFixed(2)} pts
                    </td>
                    <td className="px-3 py-3">
                      <DisponibleBadge disponible={p.disponible} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/negocio/productos/${p.id}/editar`} className={`${BTN} bg-cyan/10 text-cyan hover:bg-cyan/20`}>
                          Editar
                        </Link>
                        <form action={eliminarProducto}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="negocio" value={negocioActual.id} />
                          <BotonConfirmar
                            mensaje={`¿Eliminar el producto "${p.nombre}"? Esta acción no se puede deshacer.`}
                            className={`${BTN} bg-red-600 text-white hover:bg-red-500`}
                          >
                            Eliminar
                          </BotonConfirmar>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Móvil: tarjetas */}
          <ul className="space-y-3 md:hidden">
            {productosList.map((p) => (
              <li key={p.id} className="rounded-xl border border-border bg-bg/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-white">{p.nombre}</p>
                    {p.descripcion && <p className="truncate text-xs text-muted">{p.descripcion}</p>}
                  </div>
                  <DisponibleBadge disponible={p.disponible} />
                </div>
                <p className="mt-1 text-xs font-semibold text-cyan">{Number(p.precio).toFixed(2)} pts</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/negocio/productos/${p.id}/editar`} className={`${BTN} bg-cyan/10 text-cyan hover:bg-cyan/20`}>
                    Editar
                  </Link>
                  <form action={eliminarProducto}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="negocio" value={negocioActual.id} />
                    <BotonConfirmar
                      mensaje={`¿Eliminar el producto "${p.nombre}"? Esta acción no se puede deshacer.`}
                      className={`${BTN} bg-red-600 text-white hover:bg-red-500`}
                    >
                      Eliminar
                    </BotonConfirmar>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
