'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { exigirAdmin } from '@/lib/admin/auth'

export async function resolverReporte(form: FormData) {
  const { supabase } = await exigirAdmin()
  const tipo = String(form.get('tipo') ?? '')
  const raw = String(form.get('id') ?? '')
  if (!['entrada', 'recarga', 'acceso'].includes(tipo) || !/^\d{1,10}$/.test(raw) || Number(raw) < 1 || Number(raw) > 2147483647) {
    redirect('/admin/reportes?error=1')
  }
  const { error, data } = await supabase.rpc('resolver_reporte_admin', { p_tipo: tipo, p_id: Number(raw) })
  if (error || !data) redirect('/admin/reportes?error=1')
  revalidatePath('/admin/reportes')
  redirect('/admin/reportes?ok=1')
}
