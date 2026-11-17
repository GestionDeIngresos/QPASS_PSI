'use client'
export default function ErrorCaja({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="space-y-4 rounded-xl border border-pink p-6">
      <h2 className="text-xl font-bold">No se pudo cargar el módulo</h2>
      <p>
        Comprueba la conexión, tus permisos y que las migraciones de Dev B estén
        aplicadas. No se muestran saldos ficticios.
      </p>
      <button
        className="rounded-lg bg-pink px-4 py-2 font-bold"
        onClick={reset}
      >
        Reintentar
      </button>
    </div>
  )
}
