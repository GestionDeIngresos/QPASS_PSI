import { exigirSesion } from '@/lib/organizador/auth'
import { ResumenDashboard, type DatosDashboard } from '@/components/admin/ResumenDashboard'
export default async function DashboardOrganizador({ searchParams }: { searchParams: Promise<{ evento?: string }> }) {
  const { supabase, user } = await exigirSesion('/organizador/dashboard')
  const params = await searchParams
  const { data: eventos, error } = await supabase.from('eventos').select('id,titulo').eq('organizador_id', user.id).order('fecha_evento', { ascending: false })
  if (error) throw new Error('No se pudieron consultar tus eventos.')
  const seleccionado = eventos?.find(e => String(e.id) === params.evento) ?? eventos?.[0]
  const resultado = seleccionado ? await supabase.rpc('resumen_dashboard', { p_evento: seleccionado.id }) : null
  if (resultado?.error) throw new Error('No se pudo consultar el resumen del evento.')
  return <div className="mx-auto max-w-6xl space-y-6"><h1 className="text-3xl font-extrabold">Resumen de mi evento</h1>{seleccionado ? <><form action="/organizador/dashboard" className="flex flex-wrap gap-3"><select aria-label="Evento" key={seleccionado.id} name="evento" defaultValue={seleccionado.id} className="max-w-full rounded-lg border border-border bg-card px-4 py-2">{eventos?.map(e => <option key={e.id} value={e.id}>{e.titulo}</option>)}</select><button className="rounded-lg bg-pink px-5 py-2 font-bold">Ver resumen</button></form><ResumenDashboard datos={resultado?.data as DatosDashboard}/></> : <p className="text-muted">Todavía no tienes eventos para consultar.</p>}</div>
}
