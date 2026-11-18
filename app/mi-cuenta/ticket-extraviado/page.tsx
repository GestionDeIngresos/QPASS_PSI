import { exigirCuenta } from '@/lib/saldos/server'
import { TicketExtraviado } from '@/components/saldos/TicketExtraviado'
export const metadata = { title: 'Ticket extraviado · QPass' }
export default async function Page() {
  await exigirCuenta()
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-extrabold">Ticket físico extraviado</h1>
      <TicketExtraviado />
    </div>
  )
}
