/**
 * El nombre en español que va al `<head>` de una ficha de Project Zomboid (2026-10-02).
 *
 * El juego a veces le da el mismo nombre en español a dos cosas distintas: los rasgos Handy y Tinkerer son "Manitas"
 * los dos. Las direcciones ya se separan (`manitas-handy` / `manitas-tinkerer`) y dentro de la página el nombre en
 * inglés los distingue, pero dos direcciones con el mismo título y la misma descripción son duplicados para el
 * buscador. Entonces, si otra ficha de la misma sección se llama igual en español y distinto en inglés, el `<head>` en
 * español lleva el inglés entre paréntesis: "Manitas (Handy)". Los gemelos de profesión (mismo nombre en los dos
 * idiomas) no entran acá: los distingue `via` (ver `metaFor`).
 *
 * Lo usan el prerender (con el índice entero) y `PageMeta` al navegar (con el módulo de nombres de la sección), así el
 * título es el mismo en los dos lados.
 */
export function esHeadNames(rows: Iterable<{ id: string; en: string; es: string }>): Map<string, string> {
  const byEs = new Map<string, { id: string; en: string }[]>();
  for (const r of rows) {
    if (!r.es) continue;
    const list = byEs.get(r.es) ?? [];
    list.push({ id: r.id, en: r.en });
    byEs.set(r.es, list);
  }
  const out = new Map<string, string>();
  for (const [es, list] of byEs) {
    if (new Set(list.map((r) => r.en)).size < 2) continue;
    for (const r of list) if (r.en && r.en !== es) out.set(r.id, `${es} (${r.en})`);
  }
  return out;
}
