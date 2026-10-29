import type { Metadata } from 'next'
import Link from 'next/link'
import { BotonConfirmar } from '@/components/admin/BotonConfirmar'
import { exigirAdmin } from '@/lib/admin/auth'
import { listarCategoriasAdmin, type CategoriaAdmin } from '@/lib/landing/queries'
import { alternarCategoria, crearCategoria, editarCategoria, eliminarCategoria } from './actions'

export const metadata: Metadata = { title: 'Gestión de Categorías · Admin · QPass' }

const ERRORES: Record<string, string> = {
  invalido: 'Revisa los datos: el nombre debe tener entre 2 y 80 caracteres.',
  duplicada: 'Ya existe una categoría con ese nombre.',
  en_uso: 'No se puede eliminar: hay eventos con esta categoría. Desactívala en su lugar.',
  fallo: 'No se pudo completar la acción. Intenta de nuevo.',
}
const OKS: Record<string, string> = {
  creada: 'Categoría creada.',
  editada: 'Categoría actualizada.',
  estado: 'Estado actualizado.',
  eliminada: 'Categoría eliminada.',
}
const campo =
  'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-white outline-none placeholder:text-muted/60 focus:border-pink'

function Formulario({ cat }: { cat: CategoriaAdmin | null }) {
  return (
    <form action={cat ? editarCategoria : crearCategoria} className="mb-5 rounded-2xl border border-pink/40 bg-card p-5">
      <h2 className="mb-4 font-bold text-white">{cat ? `Editar "${cat.nombre}"` : 'Nueva categoría'}</h2>
      {cat && <input type="hidden" name="id" value={cat.id} />}
      <div className="grid gap-4 md:grid-cols-[1fr_2fr_10rem]">
        <label className="text-[11px] font-bold uppercase tracking-wide text-muted">
          Nombre
          <input name="nombre" defaultValue={cat?.nombre ?? ''} required minLength={2} maxLength={80} className={`${campo} mt-1.5 normal-case`} />
        </label>
        <label className="text-[11px] font-bold uppercase tracking-wide text-muted">
          Descripción
          <input name="descripcion" defaultValue={cat?.descripcion ?? ''} maxLength={255} className={`${campo} mt-1.5 normal-case`} />
        </label>
        <label className="text-[11px] font-bold uppercase tracking-wide text-muted">
          Estado
          <select name="estado" defaultValue={cat && !cat.activa ? 'inactiva' : 'activa'} className={`${campo} mt-1.5 normal-case`}>
            <option value="activa">Activa</option>
            <option value="inactiva">Inactiva</option>
          </select>
        </label>
      </div>
      <div className="mt-4 flex gap-3">
        <button type="submit" className="rounded-lg bg-pink px-5 py-2.5 text-sm font-bold text-white transition hover:bg-pink-hover">
          {cat ? 'Guardar cambios' : 'Crear categoría'}
        </button>
        <Link href="/admin/categorias" className="rounded-lg px-5 py-2.5 text-sm font-bold text-muted transition hover:text-white">
          Cancelar
        </Link>
      </div>
    </form>
  )
}

// /admin/categorias → HU 35: crear, editar, activar/desactivar y eliminar categorías
export default async function CategoriasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAdmin()
  const p = await searchParams
  const un = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')
  const q = un(p.q).trim().slice(0, 80)
  const estado = (['activas', 'inactivas'] as const).find((e) => e === un(p.estado)) ?? 'todos'
  const categorias = await listarCategoriasAdmin(q, estado)
  const enEdicion = categorias.find((c) => c.id === un(p.editar)) ?? null
  const mostrarNueva = un(p.nuevo) === '1'

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="mb-6 text-3xl font-extrabold text-white">Gestión de Categorías</h1>

      <form action="/admin/categorias" method="get" className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3">
        <input name="q" type="search" defaultValue={q} maxLength={80} placeholder="Buscar por nombre de categoría..." className={`${campo} min-w-48 flex-1`} />
        <select name="estado" defaultValue={estado} className={`${campo} w-auto`} aria-label="Filtrar por estado">
          <option value="todos">Estado: Todos</option>
          <option value="activas">Estado: Activas</option>
          <option value="inactivas">Estado: Inactivas</option>
        </select>
        <button type="submit" className="rounded-lg border border-border px-4 py-2.5 text-sm font-bold text-white transition hover:border-pink">
          Filtrar
        </button>
        <Link href="/admin/categorias?nuevo=1" className="rounded-lg bg-pink px-4 py-2.5 text-sm font-bold text-white transition hover:bg-pink-hover">
          + Crear Categoría
        </Link>
      </form>

      {ERRORES[un(p.error)] && (
        <p role="alert" className="mb-4 rounded-lg border border-pink/50 bg-pink/10 px-4 py-3 text-sm text-pink">
          {ERRORES[un(p.error)]}
        </p>
      )}
      {OKS[un(p.ok)] && (
        <p role="status" className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {OKS[un(p.ok)]}
        </p>
      )}

      {enEdicion ? <Formulario cat={enEdicion} /> : mostrarNueva ? <Formulario cat={null} /> : null}

      <section className="overflow-x-auto rounded-2xl border border-border bg-card p-2 md:p-4">
        {categorias.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            {q || estado !== 'todos' ? 'No hay categorías que coincidan.' : 'Todavía no hay categorías. Crea la primera.'}
          </p>
        ) : (
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-muted/70">
                <th className="px-3 py-3 font-bold">Nombre</th>
                <th className="px-3 py-3 font-bold">Descripción</th>
                <th className="px-3 py-3 font-bold">Estado</th>
                <th className="px-3 py-3 text-right font-bold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {categorias.map((c) => (
                <tr key={c.id} className="border-t border-border/60">
                  <td className="px-3 py-3 font-bold text-white">{c.nombre}</td>
                  <td className="px-3 py-3 text-muted">{c.descripcion ?? '—'}</td>
                  <td className="px-3 py-3">
                    <form action={alternarCategoria}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="activar" value={String(!c.activa)} />
                      <button
                        type="submit"
                        title={c.activa ? 'Clic para desactivar' : 'Clic para activar'}
                        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                          c.activa ? 'border-emerald-400 text-emerald-400' : 'border-red-500 text-red-500'
                        }`}
                      >
                        {c.activa ? 'Activo' : 'Inactivo'}
                      </button>
                    </form>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-2">
                      <Link href={`/admin/categorias?editar=${c.id}`} className="rounded-md border border-border bg-bg px-3 py-1.5 text-xs font-bold text-white transition hover:border-pink">
                        Editar
                      </Link>
                      <form action={eliminarCategoria}>
                        <input type="hidden" name="id" value={c.id} />
                        <BotonConfirmar mensaje={`¿Eliminar la categoría "${c.nombre}"?`} className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-600">
                          Eliminar
                        </BotonConfirmar>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
