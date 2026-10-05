export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-[calc(100vh-160px)] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-[0_0_40px_rgba(255,0,122,0.12)]">
        <h1 className="mb-2 text-center text-2xl font-bold text-white">{title}</h1>
        <p className="mb-8 text-center text-sm text-muted">{subtitle}</p>
        {children}
      </div>
    </div>
  )
}