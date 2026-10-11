// Mismo estilo que components/ui/Input.tsx, pero para <select>
type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }

export function Select({ label, children, ...props }: SelectProps) {
  return (
    <div className="mb-5">
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </label>
      <select
        {...props}
        className="w-full rounded-lg border border-border bg-card px-4 py-3 text-white outline-none transition [color-scheme:dark] focus:border-pink"
      >
        {children}
      </select>
    </div>
  )
}
