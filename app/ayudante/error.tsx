'use client';

export default function AyudanteError({ reset }: { reset: () => void }) {
  return <div role="alert" className="rounded-xl border border-pink/40 bg-card p-6">
    <h2 className="text-lg font-bold">No se pudo cargar el panel</h2>
    <p className="mt-2 text-sm text-muted">No pudimos verificar tus datos. Inténtalo de nuevo o contacta al administrador.</p>
    <button type="button" onClick={reset} className="mt-4 rounded-lg bg-pink px-5 py-2 text-sm font-bold">Reintentar</button>
  </div>;
}
