import Form from 'next/form'
import { listarReportes, type FiltrosReportes } from '@/lib/admin/reportes'
import { resolverReporte } from './actions'

const campo = 'rounded-lg border border-border bg-bg px-4 py-2 text-sm text-white [color-scheme:dark]'

export default async function ReportesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const tipo = typeof params.tipo === 'string' ? params.tipo : ''
  const estado = typeof params.estado === 'string' ? params.estado : ''
  const filtros: FiltrosReportes = {
    tipo: tipo === 'entrada' || tipo === 'recarga' || tipo === 'acceso' ? tipo : '',
    estado: estado === 'pendiente' || estado === 'solucionado' ? estado : '',
    q: typeof params.q === 'string' ? params.q.trim().slice(0, 80) : '',
  }
  const reportes = await listarReportes(filtros)
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div><h1 className="text-3xl font-extrabold">Reportes</h1><p className="mt-2 text-sm text-muted">Revisa los problemas de entradas, recargas y accesos.</p></div>
      <Form action="/admin/reportes" className="flex flex-wrap gap-3 rounded-2xl border border-border bg-card p-4">
        <input key={`busqueda:${filtros.q}`} className={`${campo} min-w-0 flex-1`} name="q" defaultValue={filtros.q} placeholder="Buscar reporte, persona o evento" aria-label="Buscar reportes" maxLength={80} />
        <select key={`tipo:${filtros.tipo}`} className={campo} name="tipo" defaultValue={filtros.tipo} aria-label="Tipo de reporte"><option value="">Todos los tipos</option><option value="entrada">Entradas</option><option value="recarga">Recargas</option><option value="acceso">Accesos</option></select>
        <select key={`estado:${filtros.estado}`} className={campo} name="estado" defaultValue={filtros.estado} aria-label="Estado"><option value="">Todos los estados</option><option value="pendiente">Pendiente</option><option value="solucionado">Solucionado</option></select>
        <button className="rounded-lg bg-pink px-5 py-2 text-sm font-bold hover:bg-pink-hover">Filtrar</button>
      </Form>
      {params.error && <p role="alert" className="text-pink">No se pudo resolver el reporte. Intenta de nuevo.</p>}
      {params.ok && <p role="status" className="text-cyan">Reporte marcado como solucionado.</p>}
      {reportes.length === 0 && <p className="rounded-2xl border border-border bg-card p-8 text-center text-muted">No hay reportes que coincidan con los filtros.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {reportes.map(r => (
          <article key={`${r.tipo}-${r.id}`} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap justify-between gap-2"><span className="text-xs font-bold uppercase text-cyan">{r.tipo} · #{r.id}</span><span className={r.estado === 'pendiente' ? 'text-pink' : 'text-cyan'}>{r.estado === 'pendiente' ? 'Pendiente' : 'Solucionado'}</span></div>
            <h2 className="mt-3 font-bold">{r.evento}</h2>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{r.descripcion}</p>
            <p className="mt-4 break-words text-xs text-muted">{r.usuario} · {r.correo}</p>
            <p className="mt-1 text-xs text-muted">{new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(r.creado_en))}</p>
            {r.estado === 'pendiente' && <Form action={resolverReporte} className="mt-4"><input type="hidden" name="id" value={r.id}/><input type="hidden" name="tipo" value={r.tipo}/><button className="rounded-lg border border-cyan px-4 py-2 text-sm font-semibold text-cyan hover:bg-cyan/10">Marcar como solucionado</button></Form>}
          </article>
        ))}
      </div>
      {reportes.length === 100 && <p className="text-xs text-muted">Se muestran los 100 reportes más recientes. Usa los filtros para acotar la búsqueda.</p>}
    </div>
  )
}
