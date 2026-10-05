export function Footer() {
  return (
    <footer className="border-t border-border bg-card px-6 py-8 text-center md:px-10">
      <p className="mb-1 font-bold text-white">QPass Inc.</p>
      <p className="text-xs text-muted">
        © {new Date().getFullYear()} QPass. La plataforma definitiva de accesos y administración de eventos.
      </p>
    </footer>
  )
}