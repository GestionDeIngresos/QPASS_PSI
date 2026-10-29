const PREGUNTAS = [
  {
    p: '¿Cómo compro mi entrada?',
    r: 'Explora los eventos, elige el que te guste, selecciona el tipo y la cantidad de tickets y confirma tu compra. Recibirás tu comprobante y tus QR en "Mis compras".',
  },
  {
    p: '¿Puedo pedir reembolso?',
    r: 'Si tuviste un problema con una entrada puedes reportarlo desde "Mis compras". El equipo revisará tu caso según las condiciones de cada evento.',
  },
  {
    p: '¿Cómo creo un evento?',
    r: 'Crea una cuenta y envía una solicitud para ser organizador. Cuando el administrador la apruebe podrás configurar tu evento (fotos, tickets, fecha y tipo de acceso).',
  },
  {
    p: '¿Es seguro pagar aquí?',
    r: 'Sí. Cada entrada tiene un código QR único y verificable, por lo que no se puede duplicar ni falsificar.',
  },
]

/** Acordeón sin JavaScript (<details>), accesible con teclado */
export function Faq() {
  return (
    <section id="faq" className="mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-14 md:px-10">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-pink">Ayuda &amp; soporte</p>
      <h2 className="mb-6 text-2xl font-extrabold text-white md:text-3xl">Preguntas Frecuentes</h2>
      <div className="max-w-2xl space-y-3">
        {PREGUNTAS.map(({ p, r }) => (
          <details key={p} className="group rounded-xl border border-border bg-card px-5 py-4 open:border-pink/50">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-white [&::-webkit-details-marker]:hidden">
              {p}
              <span aria-hidden="true" className="text-muted transition group-open:rotate-180">⌄</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted">{r}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
