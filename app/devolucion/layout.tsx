import { PanelCaja } from '@/components/saldos/PanelCaja'
export const metadata = { title: 'Devoluciones · QPass' }
export const dynamic = 'force-dynamic'
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PanelCaja rol="devolucion">{children}</PanelCaja>
}
