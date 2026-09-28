/**
 * Un link que viene de un tercero, sólo si es `https:` (2026-09-28, auditoría de
 * seguridad).
 *
 * React 18 deja pasar un `href="javascript:…"` con apenas un aviso en consola, y
 * algunos links del sitio salen de datos ajenos: el perfil de Steam que devuelve
 * deadlock-api en vivo, o las notas de parche que el bot publica solo. Hoy todos
 * son `https:`, pero si un día una de esas fuentes trajera otra cosa, un clic
 * ejecutaría código en vestigo.gg. Con esto, cualquier otro esquema no se dibuja.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}
