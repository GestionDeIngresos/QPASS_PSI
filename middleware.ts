import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Rutas que exigen sesión (por prefijo). /admin y /organizador ya quedan cubiertas para el Sprint 2.
const RUTAS_PROTEGIDAS = ['/eventos', '/compra', '/mis-compras', '/admin', '/organizador', '/supervisor', '/mi-cuenta']
// Pantallas de acceso: con sesión iniciada no tiene sentido mostrarlas.
const RUTAS_SOLO_INVITADOS = ['/login', '/register']

const coincide = (ruta: string, base: string) => ruta === base || ruta.startsWith(base + '/')

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Verifica la firma del JWT (JWKS local cuando el proyecto lo soporta).
  // Los guards y las acciones siguen leyendo usuario/permisos actuales.
  const { data, error } = await supabase.auth.getClaims()
  const autenticado = !error && Boolean(data?.claims?.sub)

  const { pathname, search } = request.nextUrl
  // Las Server Actions deben devolver su protocolo RSC, no un POST redirigido
  // a HTML de login. Cada acción valida la sesión y sus permisos en servidor.
  const esServerAction = request.method === 'POST' && request.headers.has('next-action')

  // Redirige conservando las cookies de sesión que Supabase pudo haber refrescado
  const redirigir = (destino: string, next?: string) => {
    const url = request.nextUrl.clone()
    url.pathname = destino
    url.search = ''
    if (next) url.searchParams.set('next', next)
    const respuesta = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((c) => respuesta.cookies.set(c))
    return respuesta
  }

  if (!autenticado && !esServerAction && RUTAS_PROTEGIDAS.some((base) => coincide(pathname, base))) {
    return redirigir('/login', pathname + search)
  }
  if (autenticado && RUTAS_SOLO_INVITADOS.some((base) => coincide(pathname, base))) {
    return redirigir('/eventos')
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
