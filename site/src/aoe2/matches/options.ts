/**
 * Las opciones de una partida de AoE2 (`options` del historial, 2026-11-20). Sólo del lado del servidor (usa
 * `node:zlib`): el intermediario las decodifica y le manda al sitio lo que sirve.
 *
 * Formato (visto el 20/11): base64 → zlib → un string JSON con otro base64 → 1 byte con la cantidad de pares y después
 * cada par como `uint32` (largo) + `"clave:valor"`. Claves verificadas con partidas reales: 8 = tamaño del mapa en
 * casillas (120 en 1v1, 168 en 2v2, 200 en 3v3, 220 en 4v4) y 93 = el `matchtype_id`. La 10 NO es la build del juego
 * (cambia dentro de un mismo día). El resto no se muestra hasta verificarlo.
 */
import { inflateSync } from "node:zlib";

export function decodeOptions(b64: string): Record<number, string> {
  try {
    if (!b64) return {};
    const adentro = inflateSync(Buffer.from(b64, "base64")).toString("utf-8");
    const b = Buffer.from(JSON.parse(adentro) as string, "base64");
    const out: Record<number, string> = {};
    let i = 1;
    while (i + 4 <= b.length) {
      const largo = b.readUInt32LE(i);
      i += 4;
      const par = b.subarray(i, i + largo).toString("utf-8");
      i += largo;
      const dos = par.indexOf(":");
      if (dos > 0) out[Number(par.slice(0, dos))] = par.slice(dos + 1);
    }
    return out;
  } catch {
    return {};
  }
}

export type NamedOptions = { mapSize?: number };

export function namedOptions(o: Record<number, string>): NamedOptions {
  const n = (k: number) => (o[k] != null && /^\d+$/.test(o[k]) ? Number(o[k]) : undefined);
  const out: NamedOptions = {};
  if (n(8) != null) out.mapSize = n(8);
  return out;
}
