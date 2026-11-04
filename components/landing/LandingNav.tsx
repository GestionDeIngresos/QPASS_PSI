import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CerrarSesionButton } from '@/components/CerrarSesionButton'

const ENLACES = [
  { href: '#quienes-somos', texto: 'Quiénes somos' },
  { href: '/eventos', texto: 'Eventos' },
  { href: '#faq', texto: 'FAQ' },
]

/** Barra superior de la Landing (reemplaza al Header global en "/") */
export async function LandingNav() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-4 md:px-10">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold text-white">
          <span className="h-2 w-2 rounded-full bg-pink" />
          <span className="underline decoration-pink underline-offset-4">Q</span>Pass
        </Link>

        <nav aria-label="Principal" className="order-last flex w-full justify-center gap-6 text-xs text-muted md:order-none md:w-auto">
          {ENLACES.map((l) => (
            <Link key={l.href} href={l.href} className="transition hover:text-white">
              {l.texto}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 text-xs">
          {user ? (
            <>
              <Link href="/mis-compras" className="text-muted transition hover:text-white">
                Mis compras
              </Link>
              <CerrarSesionButton />
            </>
          ) : (
            <>
              <Link href="/login" className="text-muted transition hover:text-white">
                Iniciar sesión
              </Link>
              <Link href="/register" className="rounded-lg border border-border bg-card px-4 py-2 font-bold text-white transition hover:border-pink">
                Registro
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
