import Form from 'next/form'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import type { Categoria, FiltrosEventos } from '@/lib/eventos/types'

/**
 * Filtros de búsqueda. Es un <Form>: al enviarlo, el navegador
 * navega sin recargar el documento a /eventos?q=...&categoria=...&fecha=...
 * y vuelve a consultar Supabase. Conserva el envío nativo si no hay JavaScript.
 */
export function EventFilters({
  categorias,
  valores,
}: {
  categorias: Categoria[]
  valores: FiltrosEventos
}) {
  const hayFiltros = Boolean(valores.q || valores.categoriaId || valores.fecha)

  return (
    <Form
      action="/eventos"
      className="rounded-2xl border border-border bg-card p-5 shadow-[0_0_40px_rgba(255,0,122,0.08)] md:p-6"
    >
      <div className="grid gap-x-4 md:grid-cols-2 lg:grid-cols-[2fr_1.3fr_1fr_auto]">
        <Input
          label="Nombre"
          name="q"
          type="search"
          defaultValue={valores.q}
          placeholder="Ej. Neon Nights"
          maxLength={80}
        />

        <Select label="Categoría" name="categoria" defaultValue={valores.categoriaId}>
          <option value="">Todas</option>
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nombre}
            </option>
          ))}
        </Select>

        <Input label="Fecha" name="fecha" type="date" defaultValue={valores.fecha} />

        {/* mb-5 iguala el margen de los campos para que los botones queden alineados */}
        <div className="mb-5 flex items-end gap-3">
          <Button type="submit" className="md:w-auto md:px-8">
            Buscar
          </Button>
          {hayFiltros && (
            <Link
              href="/eventos"
              className="rounded-lg border border-border px-4 py-3 text-sm font-semibold text-muted transition hover:border-pink hover:text-white"
            >
              Limpiar
            </Link>
          )}
        </div>
      </div>
    </Form>
  )
}
