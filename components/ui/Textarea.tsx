// Mismo estilo que components/ui/Input.tsx, pero para <textarea>
type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }

export function Textarea({ label, ...props }: TextareaProps) {
  return (
    <div className="mb-5">
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</label>
      <textarea
        rows={4}
        {...props}
        className="w-full rounded-lg border border-border bg-card px-4 py-3 text-white placeholder:text-muted/60 outline-none transition focus:border-pink"
      />
    </div>
  )
}
