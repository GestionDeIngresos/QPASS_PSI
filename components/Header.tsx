import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CerrarSesionButton } from '@/components/CerrarSesionButton'

export async function Header() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-6 py-4 md:px-10">
      <Link href="/" className="flex items-center gap-2 text-xl font-bold text-white">
        <span className="h-2 w-2 rounded-full bg-pink" />
        <span className="underline decoration-pink underline-offset-4">Q</span>Pass
      </Link>
      {user ? (
        <CerrarSesionButton />
      ) : (
        <Link
          href="/login"
          className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-sm text-white"
        >
          <span className="h-5 w-5 rounded-full bg-white/20" />
          Mi Cuenta
        </Link>
      )}
    </header>
  )
}
