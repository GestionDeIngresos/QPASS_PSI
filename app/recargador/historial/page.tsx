import {
  HistorialCaja,
  type ConsultaCaja
} from '@/components/saldos/HistorialCaja'
export default function Page({ searchParams }: { searchParams: ConsultaCaja }) {
  return <HistorialCaja rol="recargador" searchParams={searchParams} />
}
