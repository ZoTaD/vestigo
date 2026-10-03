/**
 * La query de una pestaña sin perder lo que no es suyo (`?utm_source=`, `?ref=`…), 2026-10-02. Fabricación y Servidor
 * reescribían la dirección entera con lo suyo y lo demás se perdía en el primer cambio; el Mapa (`mergeMapQuery`) y
 * Personaje ya lo conservaban. Primero lo de la pestaña, tal cual lo escribe ella, y después lo demás como vino.
 *
 * `own` es la query de la pestaña sin `?` (o vacía); `keys`, todas las claves que son de la pestaña. Devuelve la query
 * con `?` adelante, o `""` si no queda nada.
 */
export function withForeign(search: string, keys: readonly string[], own: string): string {
  const rest = new URLSearchParams(search);
  for (const k of keys) rest.delete(k);
  const tail = rest.toString();
  const qs = [own, tail].filter(Boolean).join("&");
  return qs ? `?${qs}` : "";
}
