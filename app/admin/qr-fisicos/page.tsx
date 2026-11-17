import Link from 'next/link'
import { exigirAdmin } from '@/lib/admin/auth'
import { QrFisicosPanel } from '@/components/admin/QrFisicosPanel'
import type { LoteQr } from '@/lib/qr/types'

export default async function QrFisicosPage({ searchParams }: { searchParams: Promise<{ lote?: string }> }) {
  const { supabase } = await exigirAdmin()
  const { lote: raw } = await searchParams
  const id = typeof raw === 'string' && /^\d{1,9}$/.test(raw) ? Number(raw) : null
  const [eventos, lote] = await Promise.all([
    supabase.from('eventos').select('id, titulo').eq('tipo_acceso', 'qr_fisico').order('fecha_evento', { ascending: false }),
    id ? supabase.rpc('consultar_lote_qr', { p_lote: id }) : Promise.resolve({ data: null, error: null }),
  ])
  if (eventos.error || lote.error) throw new Error('No se pudieron cargar los QR físicos.')
  return <div className="mx-auto max-w-6xl space-y-6"><h1 className="text-3xl font-extrabold">QR Físicos</h1><p className="text-sm text-muted">Genera manillas y vincúlalas a las entradas del evento.</p>{id && <Link href="/admin/qr-fisicos" className="inline-block text-sm text-cyan underline">Preparar otro lote</Link>}<QrFisicosPanel key={id ?? 'nuevo'} eventos={eventos.data ?? []} lote={lote.data as LoteQr | null}/></div>
}
