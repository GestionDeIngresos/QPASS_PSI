# EventoWizard — contrato para Dev B, C y D (Sprint 2 · Dev A)

Formulario por pasos (Información · Ubicación · Tickets y QR · Cronograma). Un solo componente, tres modos.

```tsx
<EventoWizard
  modo="solicitud" | "admin" | "organizador"
  inicial={borrador}          // opcional; para editar usa cargarBorrador()
  categorias={categorias}     // listarCategorias() de lib/eventos/queries
  accion={miServerAction}     // (datos: EventoBorrador, accionFinal: 'guardar' | 'publicar') => Promise<ResultadoGuardado>
  volverHref="/ruta" volverTexto="Volver"   // opcionales
  redirigirA="/ruta"          // opcional; navega tras guardar
/>
```

## Tu server action (ejemplo para Dev B, modo solicitud)
```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { crearSolicitudDeEvento } from '@/lib/eventos/guardar'

export async function enviarSolicitud(datos: EventoBorrador): Promise<ResultadoGuardado> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Inicia sesión para continuar.' }
  return crearSolicitudDeEvento(supabase, datos, user.id)   // evento 'pendiente_aprobacion' + solicitud 'en_revision'
}
```
Editar un evento propio (modo organizador): `guardarEventoCompleto(supabase, datos)` sin `estado` (no cambia el estado).
Tus políticas RLS (organizador) deben impedir que cambie `estado` a 'publicado' o edite eventos ajenos.

## Funciones compartidas (`lib/eventos/guardar.ts`, solo servidor)
- `guardarEventoCompleto(supabase, datos, { estado?, organizadorId? })` — evento + tickets, atómico (RPC `guardar_evento_completo`).
- `crearSolicitudDeEvento(supabase, datos, userId)`
- `cargarBorrador(supabase, eventoId)` → `EventoBorrador | null`
Tipos y validación (cliente y servidor): `lib/eventos/wizard-types.ts`.

## Sprint 3: concurrencia y cupos

Aplicar `supabase/sprint3_devA_edicion_segura.sql` después del SQL de Dev A Sprint 2. `cargarBorrador` incluye `versionEdicion` del evento y de cada ticket; conservar esas propiedades al editar y usar `guardarEventoCompleto`. Crear un evento/ticket nuevo no requiere versiones. La RPC de guardado sigue siendo SECURITY INVOKER y respeta las políticas existentes.

Cualquier venta o cambio en un ticket incrementa su versión. Guardar datos antiguos se rechaza con un mensaje de recarga, sin reponer el cupo vendido. También se rechaza una edición de evento que quedó antigua por otra edición. No volver a ejecutar el SQL viejo de Sprint 2 después de esta migración, pues restauraría la función anterior.

## Datos
- Cronograma = `eventos.fecha_evento` (inicio) + `eventos.fecha_fin` (fin), hora de Bolivia.
- Imágenes: bucket público `eventos`, ruta `<user-id>/<uuid>.<ext>` (5 MB, JPG/PNG/WEBP).
- Estados: solicitud → evento `pendiente_aprobacion` · admin acepta → `aprobado` · admin publica → `publicado` · denegada → `borrador`.
