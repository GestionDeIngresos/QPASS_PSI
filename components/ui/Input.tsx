type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string }

export function Input({ label, ...props }: InputProps) {
  return (
    <div className="mb-5">
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </label>
      <input
        {...props}
        className="w-full rounded-lg border border-border bg-card px-4 py-3 text-white placeholder:text-muted/60 outline-none transition focus:border-pink"
      />
    </div>
  )
}