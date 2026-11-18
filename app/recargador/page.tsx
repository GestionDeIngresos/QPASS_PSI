import { eventosCaja, exigirPersonal } from '@/lib/saldos/server'
import { Caja } from '@/components/saldos/Caja'
export default async function Page() {
  const eventos = await eventosCaja('recargador'),
    { user } = await exigirPersonal('recargador')
  return (
    <>
      <h1 className="text-3xl font-extrabold">Recargar puntos</h1>
      <p className="text-muted">
        Identifica al asistente y registra una recarga en su evento.
      </p>
      <Caja
        key={user.id}
        rol="recargador"
        eventos={eventos}
        cuentaId={user.id}
      />
    </>
  )
}
