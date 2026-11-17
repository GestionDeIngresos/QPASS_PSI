// Cliente con la SERVICE ROLE KEY (Sprint 2 · Dev C). Salta RLS: SOLO servidor y SOLO tras validar admin.
// La variable NO lleva NEXT_PUBLIC_ (nunca llega al navegador) y NO se sube al repo.
import 'server-only'
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!clave) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en .env.local (Supabase → Project Settings → API).')
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, clave, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
