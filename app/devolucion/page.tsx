import { eventosCaja, exigirPersonal } from '@/lib/saldos/server'
import { Caja } from '@/components/saldos/Caja'
export default async function Page() {
  const eventos = await eventosCaja('devolucion'),
    { user } = await exigirPersonal('devolucion')
  return (
    <>
      <h1 className="text-3xl font-extrabold">Devolución presencial</h1>
      <p className="text-muted">
        Consulta el saldo disponible. Los puntos reservados para solicitudes
        virtuales no pueden devolverse aquí.
      </p>
      <Caja
        key={user.id}
        rol="devolucion"
        eventos={eventos}
        cuentaId={user.id}
      />
    </>
  )
}
