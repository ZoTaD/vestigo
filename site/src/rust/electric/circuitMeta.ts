/**
 * Nombre y explicación de cada circuito listo, por slug (2026-10-09), para el `<head>`. Vive aparte de `circuits.ts`
 * para que `prerender.ts` (que también usa `PageMeta`) no arrastre los circuitos: los anota `circuits.ts` al cargarse
 * (en el build lo importa `vite.config.ts`; en el navegador, la pestaña o `PageMeta` cuando hace falta).
 */
type Meta = { name: { en: string; es: string }; about: { en: string; es: string } };

const meta = new Map<string, Meta>();

export function registerCircuitMeta(list: ({ slug: string } & Meta)[]): void {
  for (const c of list) meta.set(c.slug, { name: c.name, about: c.about });
}

export const circuitMeta = (slug: string | undefined): Meta | undefined => (slug ? meta.get(slug) : undefined);
