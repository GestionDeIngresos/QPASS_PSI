'use client'

import { useEffect, useRef, useState } from 'react'
import type { IScannerControls } from '@zxing/browser'

export function LectorQr({ onCodigo, disabled = false }: { onCodigo: (codigo: string) => void; disabled?: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState('')
  const callback = useRef(onCodigo)
  useEffect(() => { callback.current = onCodigo }, [onCodigo])
  useEffect(() => {
    if (!abierto || disabled) return
    let activo = true
    let control: IScannerControls | null = null
    void (async () => {
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser')
        if (!activo || !video.current) return
        const lector = new BrowserQRCodeReader()
        const c = await lector.decodeFromConstraints({ video: { facingMode: 'environment' }, audio: false }, video.current, (resultado, _err, controles) => {
          if (resultado && activo) {
            controles.stop(); callback.current(resultado.getText()); setAbierto(false)
          }
        })
        if (!activo) c.stop()
        else control = c
      } catch { if (activo) { setError('No se pudo abrir la cámara. Permite su uso o utiliza un lector externo/código pegado.'); setAbierto(false) } }
    })()
    return () => { activo = false; control?.stop() }
  }, [abierto, disabled])
  return <div className="space-y-2"><button type="button" disabled={disabled} onClick={() => { setError(''); setAbierto(v => !v) }} className="rounded-lg border border-cyan px-4 py-2 text-sm font-bold text-cyan disabled:opacity-50">{abierto ? 'Cerrar cámara' : 'Escanear con cámara'}</button>{abierto && <video ref={video} muted playsInline className="max-h-64 w-full rounded-xl bg-black"/>}{error && <p role="alert" className="text-sm text-pink">{error}</p>}</div>
}
