'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
export function SupervisorNav() {
  const ruta = usePathname()
  return <nav className="flex flex-wrap gap-3 border-b border-border px-6 py-4">{[['/supervisor','Escanear entrada'],['/supervisor/historial','Historial y reportes']].map(([href, text]) => <Link key={href} href={href} aria-current={ruta === href ? 'page' : undefined} className={`rounded-lg border px-4 py-2 text-sm font-bold ${ruta === href ? 'border-pink bg-pink/10 text-white' : 'border-border text-muted hover:text-white'}`}>{text}</Link>)}</nav>
}
