import Form from 'next/form'
import { eventosSupervisor, historialSupervisor } from '@/lib/supervisor/server'
import { HistorialAccesos } from '@/components/supervisor/HistorialAccesos'
export default async function HistorialPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const [params, eventos] = await Promise.all([searchParams, eventosSupervisor()])
  const evento = eventos.find(e => String(e.id) === params.evento) ?? eventos[0]
  const resultado = params.resultado === 'permitido' || params.resultado === 'denegado' ? params.resultado : ''
  const raw = typeof params.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.fecha) ? params.fecha : ''
  const fecha = raw && Number.isFinite(Date.parse(raw)) && new Date(raw).toISOString().slice(0,10) === raw ? raw : ''
  const eliminados = params.eliminados === '1'
  const filas = evento ? await historialSupervisor(evento.id,resultado,fecha,eliminados) : []
  return <div className="space-y-6"><h1 className="text-3xl font-extrabold">Historial de accesos</h1>{evento ? <><Form action="/supervisor/historial" className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-4"><select aria-label="Evento" className="rounded-lg bg-bg px-3 py-2" name="evento" key={`evento:${evento.id}`} defaultValue={evento.id}>{eventos.map(e => <option key={e.id} value={e.id}>{e.titulo}</option>)}</select><select aria-label="Resultado" className="rounded-lg bg-bg px-3 py-2" name="resultado" key={`resultado:${resultado}`} defaultValue={resultado}><option value="">Todos los resultados</option><option value="permitido">Permitido</option><option value="denegado">Denegado</option></select><input name="fecha" key={`fecha:${fecha}`} aria-label="Fecha en Bolivia" type="date" defaultValue={fecha} className="rounded-lg bg-bg px-3 py-2 [color-scheme:dark]"/><label className="flex items-center gap-2 text-sm"><input key={`eliminados:${eliminados}`} type="checkbox" name="eliminados" value="1" defaultChecked={eliminados}/>Incluir eliminados</label><button className="rounded-lg bg-pink px-4 py-2 font-bold">Filtrar</button></Form><HistorialAccesos registros={filas}/>{filas.length === 100 && <p className="text-xs text-muted">Se muestran los últimos 100 registros. Acota la búsqueda por fecha.</p>}</> : <p className="text-muted">No tienes eventos publicados asignados.</p>}</div>
}
