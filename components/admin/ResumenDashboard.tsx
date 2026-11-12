export type DatosDashboard = { entradas: number; compras: number; ingresos: number; usuarios: number; eventos: number; historial: { id: number; total: number; creado_en: string }[] }
const bs = (n: number) => new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }).format(n)
export function ResumenDashboard({ datos, global = false }: { datos: DatosDashboard; global?: boolean }) {
  const cards = [
    ['Entradas vigentes vendidas', datos.entradas], ['Compras confirmadas', datos.compras],
    ['Importe confirmado', bs(datos.ingresos)], [global ? 'Usuarios registrados' : 'Asistentes con entrada', datos.usuarios],
    ...(global ? [['Próximos eventos publicados', datos.eventos]] : []),
  ]
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([label, value]) => <article key={label} className="rounded-2xl border border-border bg-card p-6"><p className="text-sm text-muted">{label}</p><p className="mt-3 text-3xl font-extrabold text-cyan">{value}</p></article>)}</div>
    <p className="text-xs text-muted">Importes de compras confirmadas, incluidos cargos de servicio. Las compras históricas simuladas también figuran mientras permanezcan confirmadas.</p>
    <section className="rounded-2xl border border-border bg-card p-6"><h2 className="mb-4 text-xl font-bold">Últimas compras confirmadas</h2>{datos.historial.length === 0 ? <p className="text-sm text-muted">Todavía no hay compras.</p> : <ul className="divide-y divide-border">{datos.historial.map(c => <li key={c.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>Compra #{c.id} · {new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'medium' }).format(new Date(c.creado_en))}</span><span className="font-bold text-cyan">{bs(c.total)}</span></li>)}</ul>}</section>
  </div>
}
