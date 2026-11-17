'use client'

import { useFormStatus } from 'react-dom'

export function SubmitButton({ children, pendingText = 'Procesando…', disabled, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus()
  return <button {...props} type="submit" disabled={disabled || pending} aria-busy={pending}>{pending ? pendingText : children}</button>
}
