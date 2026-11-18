import Link from 'next/link';
import { exigirAyudante } from '@/lib/ayudante/auth';
import { AccionesCuenta } from '@/components/AccionesCuenta';
import { AyudanteNav } from '@/components/ayudante/AyudanteNav';

export const metadata = { title: 'Ayudante · QPass' };
export const dynamic = 'force-dynamic';

export default async function AyudanteLayout({ children }: { children: React.ReactNode }) {
  const { user, perfil } = await exigirAyudante();
  return <div className="min-h-screen bg-bg">
    <header className="border-b border-border bg-card px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <Link href="/" className="text-xl font-extrabold">Q<span className="text-pink">Pass</span></Link>
        <span className="text-sm font-semibold text-muted">Panel Ayudante</span>
        <AccionesCuenta perfil={{ nombre: perfil?.nombre ?? '', correo: user.email ?? '', rol: 'ayudante' }} />
      </div>
    </header>
    <AyudanteNav />
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">{children}</main>
  </div>;
}
