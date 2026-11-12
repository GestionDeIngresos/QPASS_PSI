'use client'
export default function ErrorQr({ retry }: { retry: () => void }) { return <div className="space-y-4 rounded-2xl border border-border bg-card p-6"><h1 className="text-xl font-bold">No pudimos cargar las manillas</h1><button onClick={retry} className="rounded-lg bg-pink px-5 py-2">Reintentar</button></div> }
