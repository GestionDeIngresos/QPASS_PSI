'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const TIPOS = ['image/jpeg', 'image/png', 'image/webp']
const MAX_MB = 5

/** Sube una imagen al bucket público "eventos" (carpeta del usuario) y devuelve su URL pública */
export function SubidaImagen({
  etiqueta,
  valor,
  onCambio,
}: {
  etiqueta: string
  valor: string
  onCambio: (url: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')

  async function subir(archivo: File) {
    setError('')
    if (!TIPOS.includes(archivo.type)) return setError('Solo se aceptan imágenes JPG, PNG o WEBP.')
    if (archivo.size > MAX_MB * 1024 * 1024) return setError(`La imagen no puede pesar más de ${MAX_MB} MB.`)

    setSubiendo(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setSubiendo(false)
      return setError('Tu sesión expiró. Vuelve a iniciar sesión.')
    }

    const ext = archivo.type === 'image/png' ? 'png' : archivo.type === 'image/webp' ? 'webp' : 'jpg'
    const ruta = `${user.id}/${crypto.randomUUID()}.${ext}`
    const { error: errorSubida } = await supabase.storage
      .from('eventos')
      .upload(ruta, archivo, { contentType: archivo.type })
    setSubiendo(false)
    if (errorSubida) return setError('No se pudo subir la imagen. Intenta de nuevo.')

    onCambio(supabase.storage.from('eventos').getPublicUrl(ruta).data.publicUrl)
  }

  const nombre = valor ? decodeURIComponent(valor.split('/').pop() ?? '') : ''

  return (
    <div className="mb-5">
      <p className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">{etiqueta}</p>
      <div className="flex items-center gap-4 rounded-lg border border-border bg-bg/60 p-4">
        {valor ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={valor} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-cyan/10 text-xl text-cyan">
            ⬆
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{nombre || 'Sin imagen'}</p>
          <p className="text-xs text-muted">
            {subiendo ? 'Subiendo…' : valor ? 'Lista' : 'JPG, PNG o WEBP · máx. 5 MB'}
          </p>
        </div>
        <button
          type="button"
          disabled={subiendo}
          onClick={() => input.current?.click()}
          className="shrink-0 rounded-lg border border-border px-4 py-2 text-xs font-bold text-white transition hover:border-pink disabled:opacity-50"
        >
          {valor ? 'Cambiar' : 'Subir'}
        </button>
        <input
          ref={input}
          type="file"
          accept={TIPOS.join(',')}
          className="hidden"
          onChange={(e) => {
            const archivo = e.target.files?.[0]
            if (archivo) void subir(archivo)
            e.target.value = ''
          }}
        />
      </div>
      {error && <p className="mt-2 text-sm text-pink">{error}</p>}
    </div>
  )
}
