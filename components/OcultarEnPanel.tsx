'use client'

import { usePathname } from 'next/navigation'

// Los paneles con menú lateral propio (según el mockup) no muestran el Header/Footer públicos.
// Dev B: agrega '/organizador' aquí cuando tu layout tenga su propio menú.
const PREFIJOS_CON_MENU_PROPIO = ['/admin']

export function OcultarEnPanel({ children }: { children: React.ReactNode }) {
  const ruta = usePathname()
  if (PREFIJOS_CON_MENU_PROPIO.some((p) => ruta === p || ruta.startsWith(p + '/'))) return null
  return <>{children}</>
}
