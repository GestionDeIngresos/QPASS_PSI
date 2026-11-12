'use client'
export default function ErrorAdmin({ retry }: { retry: () => void }) {
  return <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6 text-center"><h1 className="text-xl font-bold">No pudimos cargar esta sección</h1><p className="text-sm text-muted">Intenta de nuevo en unos momentos.</p><button onClick={retry} className="rounded-lg bg-pink px-5 py-2.5 font-bold">Reintentar</button></div>
}
