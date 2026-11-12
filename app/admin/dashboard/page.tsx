import { exigirAdmin } from '@/lib/admin/auth'
import { ResumenDashboard, type DatosDashboard } from '@/components/admin/ResumenDashboard'
export default async function DashboardAdmin() {
  const { supabase } = await exigirAdmin()
  const { data, error } = await supabase.rpc('resumen_dashboard', { p_evento: null })
  if (error) throw new Error('No se pudo consultar el resumen.')
  return <div className="mx-auto max-w-6xl space-y-6"><h1 className="text-3xl font-extrabold">Dashboard</h1><ResumenDashboard datos={data as DatosDashboard} global/></div>
}
