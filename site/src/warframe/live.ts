/**
 * Lo que cambia por hora en Warframe (2026-10-27): las fisuras del Vacío abiertas, Baro Ki'Teer y la incursión del
 * día, del worldstate que publica warframestat (https://api.warframestat.us, gratis y sin clave). Es el único pedido de
 * red de la sección: si falla o tarda, `fetchLive` devuelve `null` y la portada se dibuja entera sin este bloque.
 */

export type Era = "Lith" | "Meso" | "Neo" | "Axi" | "Requiem" | "Omnia";

export interface Live {
  fissures: { node: string; mission: string; era: string; endsAt: number; hard: boolean }[];
  /** Baro: `active` si ya llegó (y `endsAt` es cuándo se va) o `startsAt` si todavía no (cuándo llega). */
  baro: { active: boolean; location: string; endsAt?: number; startsAt?: number } | null;
  sortie: { boss: string; missions: { node: string; type: string; modifier: string }[] } | null;
}

export const API = "https://api.warframestat.us/pc/";
/** Más que esto sin respuesta y la portada sigue sin el bloque. */
export const TIMEOUT_MS = 6000;

type Raw = Record<string, unknown>;
// Las tres se comparten con `baroLive.ts`.
export const obj = (v: unknown): Raw | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null);
export const str = (v: unknown): string => (typeof v === "string" ? v : "");
export const time = (v: unknown): number => {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/** El worldstate de la API, ya mapeado a lo que muestra la portada; `null` si la red, la API o la forma fallan. */
export async function fetchLive(lang: "en" | "es", signal?: AbortSignal): Promise<Live | null> {
  const timer = new AbortController();
  const stop = setTimeout(() => timer.abort(), TIMEOUT_MS);
  const abort = () => timer.abort();
  signal?.addEventListener("abort", abort);
  try {
    const res = await fetch(`${API}?language=${lang}`, { signal: timer.signal });
    if (!res.ok) return null;
    return parseLive(await res.json(), Date.now());
  } catch {
    return null;
  } finally {
    clearTimeout(stop);
    signal?.removeEventListener("abort", abort);
  }
}

/** Del JSON de la API a `Live`. Lo vencido se descarta; una forma que no se entiende da `null`. */
export function parseLive(json: unknown, now: number): Live | null {
  const ws = obj(json);
  if (!ws) return null;
  const fissures: Live["fissures"] = [];
  for (const f of Array.isArray(ws.fissures) ? ws.fissures : []) {
    const o = obj(f);
    const endsAt = o ? time(o.expiry) : 0;
    // Las tormentas del Vacío (`isStorm`) son de Railjack: no son fisuras de reliquia.
    if (!o || endsAt <= now || !str(o.tier) || o.isStorm === true) continue;
    fissures.push({ node: str(o.node), mission: str(o.missionType), era: str(o.tier), endsAt, hard: o.isHard === true });
  }
  let baro: Live["baro"] = null;
  const vt = obj(ws.voidTrader);
  if (vt) {
    const startsAt = time(vt.activation);
    const endsAt = time(vt.expiry);
    if (endsAt > now) baro = now >= startsAt ? { active: true, location: str(vt.location), endsAt } : { active: false, location: str(vt.location), startsAt };
  }
  let sortie: Live["sortie"] = null;
  const so = obj(ws.sortie);
  if (so && time(so.expiry) > now && Array.isArray(so.variants) && so.variants.length) {
    sortie = {
      boss: str(so.boss),
      missions: so.variants.map((v) => {
        const o = obj(v) ?? {};
        return { node: str(o.node), type: str(o.missionType), modifier: str(o.modifier) };
      }),
    };
  }
  return { fissures, baro, sortie };
}
