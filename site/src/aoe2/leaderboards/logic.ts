/**
 * La lógica del Ranking de AoE2 (2026-11-20), sin React: histograma de ELO, percentil, "Subieron hoy" y países.
 * Tests en `test/aoe2Leaderboards.test.ts`.
 */

/** Una foto del ranking: ELO por jugador. */
export type Snapshot = Record<number, number>;
export type Bucket = { from: number; count: number };

/** Cuántos jugadores hay en cada tramo de `bucket` puntos, del más bajo al más alto, con los tramos vacíos en cero. */
export function eloHistogram(elos: readonly number[], bucket = 100): Bucket[] {
  if (!elos.length) return [];
  const por = new Map<number, number>();
  for (const e of elos) {
    const k = Math.floor(e / bucket) * bucket;
    por.set(k, (por.get(k) ?? 0) + 1);
  }
  const min = Math.min(...por.keys());
  const max = Math.max(...por.keys());
  const out: Bucket[] = [];
  for (let k = min; k <= max; k += bucket) out.push({ from: k, count: por.get(k) ?? 0 });
  return out;
}

/** Qué porcentaje de los jugadores del histograma está en tramos más bajos que `elo` (un decimal). */
export function percentileOf(elo: number, hist: readonly Bucket[]): number {
  const total = hist.reduce((s, b) => s + b.count, 0);
  if (!total) return 0;
  const debajo = hist.filter((b) => b.from < Math.floor(elo / 100) * 100).reduce((s, b) => s + b.count, 0);
  return Math.round((debajo / total) * 1000) / 10;
}

/** Los `n` que más ELO ganaron desde ayer (sólo los que estaban en las dos fotos y subieron). */
export function climbers(today: Snapshot, yesterday: Snapshot, n = 10): { profileId: number; elo: number; delta: number }[] {
  return Object.entries(today)
    .map(([id, elo]) => ({ profileId: Number(id), elo, delta: elo - (yesterday[Number(id)] ?? elo) }))
    .filter((x) => x.delta > 0 && yesterday[x.profileId] != null)
    .sort((a, b) => b.delta - a.delta || b.elo - a.elo)
    .slice(0, n);
}

/** Los países presentes en unas filas, de más a menos jugadores. */
export function countriesOf(rows: readonly { country: string | null }[]): string[] {
  const c = new Map<string, number>();
  for (const r of rows) if (r.country) c.set(r.country, (c.get(r.country) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
}

/** La tabla del Ranking y la generación del pedido vigente (sube al cambiar de modo). */
export type Tabla<R = import("../api/wel").Aoe2Row> = { gen: number; rows: R[]; total: number };

/** Aplica una respuesta sólo si es de la generación vigente: si se cambió de modo mientras volvía, se descarta. */
export function aplicarRespuesta<R>(t: Tabla<R>, r: { gen: number; rows: R[]; total: number; append: boolean }): Tabla<R> {
  if (r.gen !== t.gen) return t;
  return { gen: t.gen, total: r.total, rows: r.append ? [...t.rows, ...r.rows] : r.rows };
}
