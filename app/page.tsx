import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { Faq } from '@/components/landing/Faq'
import { Hero } from '@/components/landing/Hero'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { LandingNav } from '@/components/landing/LandingNav'
import { QuienesSomos } from '@/components/landing/QuienesSomos'
import { SeccionEventos } from '@/components/landing/SeccionEventos'
import { listarCarrusel, listarPasados } from '@/lib/landing/queries'

export const metadata: Metadata = {
  title: 'QPass · Tu diversión empieza aquí',
  description: 'Consigue entradas seguras a los mejores eventos y gestiona los tuyos sin complicaciones.',
}
export const dynamic = 'force-dynamic'

// "/" → Landing pública (HU 1). Se ve sin iniciar sesión.
export default async function Home() {
  const supabase = await createClient()
  const [{ data: { user } }, destacados, pasados] = await Promise.all([
    supabase.auth.getUser(),
    listarCarrusel(),
    listarPasados(),
  ])

  return (
    <>
      <LandingNav />
      <Hero destacado={destacados[0] ?? null} />
      <QuienesSomos sesionIniciada={Boolean(user)} />
      <SeccionEventos
        id="eventos"
        etiqueta="Live lineup"
        titulo="Próximos Eventos Destacados"
        subtitulo="Reserva tus tickets para los eventos con mayor demanda del mes."
        vacio="Pronto verás aquí los eventos destacados."
        eventos={destacados}
      />
      <SeccionEventos
        etiqueta="Archivo"
        titulo="Eventos Pasados"
        subtitulo="Visualiza eventos anteriores."
        vacio="Aún no hay eventos pasados."
        eventos={pasados}
        atenuados
      />
      <Faq />
      <LandingFooter />
    </>
  )
}
