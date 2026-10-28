import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// "/" entra directo a Login (o a Eventos si ya hay sesión).
// En el Sprint 2 Dev D lo reemplazará por la Landing pública.
export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  redirect(user ? '/eventos' : '/login')
}
