'use client'

import { useEffect, useRef, useState } from 'react'

const boton = 'rounded-lg border border-border px-4 py-2 text-sm font-semibold text-white transition hover:border-pink disabled:opacity-40'

export function FotoAcceso({ onFoto, onPreparando, disabled = false }: { onFoto: (foto: File) => void; onPreparando?: (valor: boolean) => void; disabled?: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const archivo = useRef<HTMLInputElement>(null)
  const [camara, setCamara] = useState(false)
  const [lista, setLista] = useState(false)
  const [capturando, setCapturando] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<{ url: string; nombre: string } | null>(null)
  const montado = useRef(false)

  useEffect(() => { montado.current = true; return () => { montado.current = false } }, [])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url) }, [preview])
  useEffect(() => {
    if (!camara || disabled) return
    let activo = true
    let stream: MediaStream | null = null
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('CAMARA_NO_DISPONIBLE')
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
        if (!activo || !video.current) { stream.getTracks().forEach(t => t.stop()); return }
        video.current.srcObject = stream
        await video.current.play()
      } catch {
        stream?.getTracks().forEach(t => t.stop())
        if (activo) {
          setError('No se pudo abrir la cámara. Revisa el permiso del navegador o elige una foto existente.')
          setCamara(false); setLista(false)
        }
      }
    })()
    return () => { activo = false; stream?.getTracks().forEach(t => t.stop()) }
  }, [camara, disabled])

  function elegir(foto: File) {
    if (foto.size === 0 || foto.size > 5242880 || !['image/jpeg', 'image/png', 'image/webp'].includes(foto.type)) {
      setError('Elige una imagen JPG, PNG o WEBP de hasta 5 MB.'); return
    }
    setError(''); setPreview({ url: URL.createObjectURL(foto), nombre: foto.name })
    setCamara(false); setLista(false); onFoto(foto)
  }

  function capturar() {
    const elemento = video.current
    if (!elemento || !lista || disabled || capturando || !elemento.videoWidth) return
    setCapturando(true); setError('')
    onPreparando?.(true)
    const canvas = document.createElement('canvas')
    const escala = Math.min(1, 1600 / Math.max(elemento.videoWidth, elemento.videoHeight))
    canvas.width = Math.round(elemento.videoWidth * escala)
    canvas.height = Math.round(elemento.videoHeight * escala)
    const contexto = canvas.getContext('2d')
    if (!contexto) { setCapturando(false); onPreparando?.(false); setError('No se pudo tomar la foto. Intenta de nuevo.'); return }
    try {
      contexto.drawImage(elemento, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => {
      if (!montado.current) return
      setCapturando(false)
      onPreparando?.(false)
      if (!blob) { setError('No se pudo tomar la foto. Intenta de nuevo.'); return }
      elegir(new File([blob], `acceso-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      }, 'image/jpeg', 0.85)
    } catch {
      setCapturando(false); onPreparando?.(false)
      setError('No se pudo tomar la foto. Intenta de nuevo o elige una existente.')
    }
  }

  return <div className="space-y-3 rounded-xl border border-border bg-bg/50 p-4">
    <p className="text-sm font-semibold">Foto del momento</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={disabled || capturando} onClick={() => { setError(''); setLista(false); setCamara(v => !v) }} className={boton}>{camara ? 'Cerrar cámara' : preview ? 'Tomar otra foto' : 'Abrir cámara'}</button>
      <button type="button" disabled={disabled || capturando} onClick={() => archivo.current?.click()} className={boton}>Elegir foto existente</button>
    </div>
    <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || capturando} className="hidden" aria-label="Elegir foto existente" onChange={e => { const f = e.target.files?.[0]; if (f) elegir(f); e.target.value = '' }}/>
    {camara && !disabled && <div className="space-y-3"><video ref={video} muted playsInline onLoadedData={() => setLista(true)} className="max-h-80 w-full rounded-lg bg-black" aria-label="Vista de cámara para foto del acceso"/><button type="button" disabled={!lista || capturando} onClick={capturar} className="rounded-lg bg-pink px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{capturando ? 'Capturando…' : 'Tomar foto'}</button></div>}
    {preview && <div className="space-y-2">
      {/* La URL es local al navegador; la imagen se sube al confirmar el acceso. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview.url} alt="Foto seleccionada para registrar el acceso" className="max-h-64 w-full rounded-lg object-contain"/>
      <p className="break-all text-xs text-muted">{preview.nombre}</p>
    </div>}
    {error && <p role="alert" className="text-sm text-pink">{error}</p>}
    <p className="text-xs text-muted">JPG, PNG o WEBP · máximo 5 MB. Puedes reemplazarla antes de confirmar el acceso.</p>
  </div>
}
