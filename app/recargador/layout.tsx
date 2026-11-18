import { PanelCaja } from '@/components/saldos/PanelCaja'
export const metadata = { title: 'Recargador · QPass' }
export const dynamic = 'force-dynamic'
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PanelCaja rol="recargador">{children}</PanelCaja>
}
