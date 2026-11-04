const REDES = ['Instagram', 'TikTok', 'Twitter']

export function LandingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-6 px-6 py-10 text-center md:flex-row md:px-10 md:text-left">
        <div>
          <p className="font-bold text-white">QPass</p>
          <p className="mt-1 text-[11px] text-muted/70">© {new Date().getFullYear()} QPass Inc. Todos los derechos reservados.</p>
        </div>
        <ul className="flex gap-6 text-xs text-muted">
          {REDES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <a href="mailto:hola@qpass.live" className="text-xs font-bold text-cyan">
          hola@qpass.live
        </a>
      </div>
    </footer>
  )
}
