import { eventosSupervisor } from '@/lib/supervisor/server'
import { EscanearAcceso } from '@/components/supervisor/EscanearAcceso'
export default async function SupervisorPage() {
  const eventos = await eventosSupervisor()
  return <div className="space-y-6"><h1 className="text-3xl font-extrabold">Control de acceso</h1><p className="text-sm text-muted">Verifica la entrada y registra tu decisión con una foto del momento.</p><EscanearAcceso eventos={eventos}/></div>
}
