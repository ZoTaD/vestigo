/**
 * Los lugares de una partida de AoE2 (`slotinfo` del historial, 2026-11-20): base64 → zlib → `"<n>,[{…}]"` con
 * `profileInfo.id` y `stationID` (el número de jugador de las grabaciones). Sólo del lado del servidor (`node:zlib`).
 */
import { inflateSync } from "node:zlib";

export function slotsOf(b64: string | null | undefined): Record<number, number> {
  try {
    const txt = inflateSync(Buffer.from(b64 ?? "", "base64")).toString("utf-8").replace(/\u0000+$/, "");
    const lista = JSON.parse(txt.slice(txt.indexOf(",") + 1)) as { "profileInfo.id": number; stationID: number }[];
    return Object.fromEntries(lista.filter((s) => s["profileInfo.id"] > 0).map((s) => [s["profileInfo.id"], s.stationID]));
  } catch {
    return {};
  }
}
