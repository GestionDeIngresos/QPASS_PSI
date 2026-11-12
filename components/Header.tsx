import Link from 'next/link'
import { obtenerSesionActual } from '@/lib/auth/sesion'
import { AccionesCuenta } from '@/components/AccionesCuenta'

const NAV = [
  { href: '/eventos', etiqueta: 'Explorar Eventos' },
  { href: '/mis-compras', etiqueta: 'Mis Compras' },
]

export async function Header() {
  const sesion = await obtenerSesionActual()
  const user = sesion?.user
  const perfil = sesion?.perfil

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card px-6 py-4 md:px-10">
      <Link href="/" className="flex items-center gap-2 text-xl font-bold text-white">
        <span className="h-2 w-2 rounded-full bg-pink" />
        <span className="underline decoration-pink underline-offset-4">Q</span>Pass
      </Link>

      {user && (
        <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="transition hover:text-white">
              {n.etiqueta}
            </Link>
          ))}
        </nav>
      )}

      {user ? (
        <AccionesCuenta
          perfil={{
            nombre: perfil?.nombre ?? '',
            correo: perfil?.correo ?? user.email ?? '',
            rol: perfil?.rol ?? 'cliente',
          }}
        />
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
