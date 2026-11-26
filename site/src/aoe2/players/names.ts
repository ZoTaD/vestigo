/**
 * Buscar un jugador de AoE2 por parte del nombre (2026-11-26), en el índice que arma el colector diario
 * (`games/aoe2/tools/names.py` → `games/aoe2/stats/names/<clave>.json`). Cada archivo trae `[perfil, alias, país, elo]`
 * de los jugadores con alguna palabra que empieza con esas 2 letras; se baja sólo el de lo que se escribe.
 *
 * `palabras()` y `clave()` repiten las de `names.py`: si se cambian allá, cambiarlas acá. Tests en `test/aoe2Names.test.ts`.
 */
export type Nombre = { id: number; alias: string; country: string | null; elo: number };
type Fila = [number, string, string, number];

const plano = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "");

/** Las palabras por las que se encuentra un nombre (ver `names.py`). */
export function palabras(alias: string): Set<string> {
  const partes = plano(alias).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const out = new Set<string>();
  if (partes.length) out.add(partes.join("").toLowerCase());
  for (const p of partes) {
    out.add(p.toLowerCase());
    for (const x of p.split(/(?<=[a-z])(?=[A-Z])/)) if (x) out.add(x.toLowerCase());
  }
  return out;
}

/** Lo escrito, como se compara: minúsculas, sin acentos ni separadores. */
export const consulta = (q: string) => plano(q).split(/[^\p{L}\p{N}]+/u).join("").toLowerCase();

export function clave(palabra: string): string {
  const c = [...palabra.slice(0, 2)].map((ch) => (/[a-z0-9]/.test(ch) ? ch : "_")).join("");
  return c.padEnd(2, "_");
}

/** Filtra y ordena un archivo del índice: primero los que tienen esa palabra entera (`lucho` → "Lucho" y "wR.Lucho"),
 * después los que tienen una palabra que empieza así, y dentro de cada grupo por ELO (el archivo ya viene ordenado
 * así): el jugador conocido sale arriba de sus tocayos. */
export function filtrar(filas: readonly Fila[], q: string, max: number): Nombre[] {
  const c = consulta(q);
  if (c.length < 2) return [];
  const puntaje = (alias: string) => {
    const ps = palabras(alias);
    if (ps.has(c)) return 0;
    for (const p of ps) if (p.startsWith(c)) return 1;
    return -1;
  };
  return filas
    .map((f, i) => ({ f, i, s: puntaje(f[1]) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .slice(0, max)
    .map(({ f: [id, alias, country, elo] }) => ({ id, alias, country: country || null, elo }));
}

const ARCHIVOS = import.meta.glob<{ default: Fila[] }>("../../../../games/aoe2/stats/names/*.json");

/** Los jugadores cuyo nombre tiene una palabra que empieza con lo escrito (mínimo 2 letras). */
export async function buscarNombres(q: string, max = 20): Promise<Nombre[]> {
  const c = consulta(q);
  if (c.length < 2) return [];
  const cargar = ARCHIVOS[`../../../../games/aoe2/stats/names/${clave(c)}.json`];
  if (!cargar) return [];
  try {
    return filtrar((await cargar()).default, q, max);
  } catch {
    return [];
  }
}
