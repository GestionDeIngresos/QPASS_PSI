/** Clave persistida ANTES de enviar. No almacena correos, contraseñas ni tokens. */
export async function obtenerIntentoCompra(usuarioId: string, eventoId: string, seleccion: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seleccion));
  const firma = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  const clave = `qpass:compra:${usuarioId}:${eventoId}:${firma}`;
  const anterior = sessionStorage.getItem(clave);
  if (anterior && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(anterior)) {
    throw new Error('No se pudo recuperar la solicitud de compra.');
  }
  const id = anterior ?? crypto.randomUUID();
  sessionStorage.setItem(clave, id);
  return { id, clave };
}

export function completarIntentoCompra(clave: string) {
  // Solo se retira tras recibir éxito inequívoco. Una respuesta perdida conserva
  // la misma clave al recargar y volver a enviar la misma selección normalizada.
  try { sessionStorage.removeItem(clave); } catch { /* Un reintento devolverá la compra existente. */ }
}
