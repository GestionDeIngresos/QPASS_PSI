import type { Metadata } from 'next'
import Form from 'next/form'
import Link from 'next/link'
import { BotonConfirmar } from '@/components/admin/BotonConfirmar'
import { exigirNegocio } from '@/lib/negocio/server'
import { eliminarNegocio } from './actions'

export const metadata: Metadata = { title: 'Mis Negocios · QPass' }

const AVISOS: Record<string, string> = {
  creado: 'Negocio creado correctamente.',
  editado: 'Negocio actualizado correctamente.',
  eliminado: 'Negocio eliminado.',
}
const ERRORES: Record<string, string> = {
  con_ventas: 'Este negocio tiene ventas registradas y no se puede eliminar. Puedes desactivarlo desde Editar.',
  sin_permisos: 'No tienes permiso para esta acción.',
  fallo: 'No se pudo completar la acción. Inténtalo de nuevo.',
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
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${
        activo
          ? 'border-green-400 text-green-400'
          : 'border-pink/70 text-pink'
      }`}
    >
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  )
}

const BTN = 'rounded-md px-3 py-1.5 text-[11px] font-bold transition'
const SELECT = 'rounded-lg border border-border bg-bg px-3 py-2 text-xs font-semibold text-white outline-none transition focus:border-pink [color-scheme:dark]'

// /negocio/negocios → HU 53/54: lista de negocios del propietario
export default async function MisNegociosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const { supabase, user } = await exigirNegocio()

  const q = typeof params.q === 'string' ? params.q.trim() : ''
  const estado = params.estado === 'activo' || params.estado === 'inactivo' ? params.estado : ''
  const aviso = typeof params.ok === 'string' ? AVISOS[params.ok] : undefined
  const error = typeof params.error === 'string' ? ERRORES[params.error] : undefined

  let query = supabase
    .from('negocios')
    .select('id, nombre, descripcion, estado, creado_en')
    .eq('dueno_id', user.id)
    .order('creado_en', { ascending: false })
  if (q) query = query.ilike('nombre', `%${q}%`)
  if (estado === 'activo') query = query.eq('estado', true)
  if (estado === 'inactivo') query = query.eq('estado', false)

  const { data: negocios, error: dbError } = await query
  if (dbError) throw new Error('No se pudieron cargar los negocios.')

  const lista = negocios ?? []

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="mb-6 text-3xl font-extrabold text-white">Mis Negocios</h1>

      {/* Filtros + botón crear */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <Form action="/negocio/negocios" className="flex flex-1 flex-wrap items-center gap-3">
          <input
            name="q"
            type="search"
            defaultValue={q}
            maxLength={120}
            placeholder="Buscar por nombre…"
            aria-label="Buscar negocios"
            className="min-w-0 flex-1 basis-48 rounded-lg border border-border bg-bg px-4 py-2 text-sm text-white outline-none placeholder:text-muted/60 focus:border-pink"
          />
          <select name="estado" defaultValue={estado} aria-label="Filtrar por estado" className={SELECT}>
            <option value="">Estado: Todos</option>
            <option value="activo">Estado: Activo</option>
            <option value="inactivo">Estado: Inactivo</option>
          </select>
          <button type="submit" className="rounded-lg border border-cyan px-5 py-2 text-xs font-bold text-cyan transition hover:bg-cyan/10">
            Filtrar
          </button>
        </Form>
        <Link
          href="/negocio/negocios/nuevo"
          className="rounded-lg bg-pink px-5 py-2 text-xs font-bold text-white shadow-[0_0_20px_rgba(255,0,122,0.35)] transition hover:bg-pink-hover"
        >
          Crear negocio
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

      {lista.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <p className="font-semibold text-white">
            {q || estado ? 'No hay negocios que coincidan con los filtros.' : 'Todavía no tienes negocios registrados.'}
          </p>
          {!q && !estado && (
            <Link
              href="/negocio/negocios/nuevo"
              className="mt-6 inline-block rounded-lg bg-pink px-6 py-3 text-sm font-bold text-white transition hover:bg-pink-hover"
            >
              Crear negocio
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
                  <th className="px-3 py-3 font-semibold">Estado</th>
                  <th className="px-3 py-3 font-semibold">Fecha creación</th>
                  <th className="px-3 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((n) => (
                  <tr key={n.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-3 font-semibold text-white">{n.nombre}</td>
                    <td className="px-3 py-3">
                      <EstadoBadge activo={n.estado} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{formatearFecha(n.creado_en)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/negocio/negocios/${n.id}`} className={`${BTN} bg-cyan/10 text-cyan hover:bg-cyan/20`}>
                          Ver
                        </Link>
                        <Link href={`/negocio/negocios/${n.id}/editar`} className={`${BTN} bg-yellow-400/10 text-yellow-300 hover:bg-yellow-400/20`}>
                          Editar
                        </Link>
                        <form action={eliminarNegocio}>
                          <input type="hidden" name="id" value={n.id} />
                          <BotonConfirmar
                            mensaje={`¿Eliminar el negocio "${n.nombre}"? Esta acción no se puede deshacer.`}
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
            {lista.map((n) => (
              <li key={n.id} className="rounded-xl border border-border bg-bg/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="truncate font-bold text-white">{n.nombre}</p>
                  <EstadoBadge activo={n.estado} />
                </div>
                <p className="mt-1 text-xs text-muted">{formatearFecha(n.creado_en)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/negocio/negocios/${n.id}`} className={`${BTN} bg-cyan/10 text-cyan hover:bg-cyan/20`}>
                    Ver
                  </Link>
                  <Link href={`/negocio/negocios/${n.id}/editar`} className={`${BTN} bg-yellow-400/10 text-yellow-300 hover:bg-yellow-400/20`}>
                    Editar
                  </Link>
                  <form action={eliminarNegocio}>
                    <input type="hidden" name="id" value={n.id} />
                    <BotonConfirmar
                      mensaje={`¿Eliminar el negocio "${n.nombre}"? Esta acción no se puede deshacer.`}
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
