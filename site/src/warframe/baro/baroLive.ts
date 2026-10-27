/**
 * Baro Ki'Teer en vivo (2026-10-27): la visita en curso o la próxima, de `voidTrader` en warframestat. Igual que
 * `live.ts`: se pide después de montar, con tope de 6 s, y si algo falla da `null` y la página queda con el historial.
 */
import { API, obj, str, time, TIMEOUT_MS } from "../live";

export interface BaroLive {
  /** Ya llegó: `endsAt` es cuándo se va. Si no, `startsAt` es cuándo llega. */
  active: boolean;
  location: string;
  startsAt: number;
  endsAt: number;
  /** Lo que vende (vacío si todavía no llegó). `unique` es el `uniqueName` de la API, la clave del historial. */
  items: { unique: string; name: string; ducats: number; credits: number }[];
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** De la respuesta de `voidTrader` a `BaroLive`. Una visita ya vencida o una forma que no se entiende dan `null`. */
export function parseBaro(json: unknown, now: number): BaroLive | null {
  const vt = obj(json);
  if (!vt) return null;
  const startsAt = time(vt.activation);
  const endsAt = time(vt.expiry);
  if (!startsAt || !endsAt || endsAt <= now) return null;
  const active = now >= startsAt;
  const items: BaroLive["items"] = [];
  if (active && Array.isArray(vt.inventory)) {
    for (const it of vt.inventory) {
      const o = obj(it);
      if (!o || !str(o.item)) continue;
      items.push({ unique: str(o.uniqueName), name: str(o.item), ducats: num(o.ducats), credits: num(o.credits) });
    }
  }
  return { active, location: str(vt.location), startsAt, endsAt, items };
}

/** La visita de Baro en el idioma pedido; `null` si la red, la API o la forma fallan. */
export async function fetchBaro(lang: "en" | "es", signal?: AbortSignal): Promise<BaroLive | null> {
  const timer = new AbortController();
  const stop = setTimeout(() => timer.abort(), TIMEOUT_MS);
  const abort = () => timer.abort();
  signal?.addEventListener("abort", abort);
  try {
    const res = await fetch(`${API}voidTrader?language=${lang}`, { signal: timer.signal });
    if (!res.ok) return null;
    return parseBaro(await res.json(), Date.now());
  } catch {
    return null;
  } finally {
    clearTimeout(stop);
    signal?.removeEventListener("abort", abort);
  }
}
