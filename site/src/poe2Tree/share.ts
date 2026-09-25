/**
 * La build en el link (`?b=`), sin cuentas.
 *
 * Formato: `<árbol>~<gemas>`.
 * - Árbol: bytes en base64url. [versión=1, clase, ascendencia (0 = ninguna,
 *   si no su posición + 1), cantidad del árbol (u16), cantidad de ascendencia (u8),
 *   después cada nodo del árbol como u16, los sets de armas (2 bits por nodo) y los
 *   nodos de la ascendencia como u16]. Los ids de nodo del export entran en 16 bits.
 * - Gemas: texto, porque los slugs de la enciclopedia no cambian aunque se sumen
 *   gemas: `1-23:habilidad.soporte.soporte,otra;24-30:…`.
 */
import type { WeaponSet } from "./planner";

export interface GemSkill {
  slug: string;
  sup: string[];
}
export interface GemStage {
  from: number;
  to: number;
  skills: GemSkill[];
}

export interface Shared {
  ci: number;
  asc: number; // posición en la lista de ascendencias de la clase, -1 = ninguna
  route: { id: string; ws: WeaponSet }[];
  ascRoute: string[];
  gems: GemStage[];
}

const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64 = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export function encode(b: Shared): string {
  const n = b.route.length, m = b.ascRoute.length;
  const wsBytes = Math.ceil(n / 4);
  const out = new Uint8Array(6 + n * 2 + wsBytes + m * 2);
  const dv = new DataView(out.buffer);
  out[0] = 1;
  out[1] = b.ci;
  out[2] = b.asc + 1;
  dv.setUint16(3, n);
  out[5] = m;
  let o = 6;
  for (const e of b.route) { dv.setUint16(o, Number(e.id)); o += 2; }
  b.route.forEach((e, i) => { out[o + (i >> 2)] |= (e.ws & 3) << ((i & 3) * 2); });
  o += wsBytes;
  for (const id of b.ascRoute) { dv.setUint16(o, Number(id)); o += 2; }
  const gems = b.gems
    .filter((g) => g.skills.length)
    .map((g) => `${g.from}-${g.to}:${g.skills.map((s) => [s.slug, ...s.sup].join(".")).join(",")}`)
    .join(";");
  return gems ? `${b64(out)}~${gems}` : b64(out);
}

export function decode(code: string): Shared | null {
  try {
    const [tree, gems = ""] = code.split("~");
    const buf = unb64(tree);
    if (buf[0] !== 1 || buf.length < 6) return null;
    const dv = new DataView(buf.buffer);
    const n = dv.getUint16(3), m = buf[5];
    const wsOff = 6 + n * 2, ascOff = wsOff + Math.ceil(n / 4);
    if (buf.length < ascOff + m * 2) return null;
    const route = Array.from({ length: n }, (_, i) => ({
      id: String(dv.getUint16(6 + i * 2)),
      ws: ((buf[wsOff + (i >> 2)] >> ((i & 3) * 2)) & 3) as WeaponSet,
    }));
    const ascRoute = Array.from({ length: m }, (_, i) => String(dv.getUint16(ascOff + i * 2)));
    const stages: GemStage[] = gems
      ? gems.split(";").map((st) => {
          const [range, list = ""] = st.split(":");
          const [from, to] = range.split("-").map(Number);
          const skills = list.split(",").filter(Boolean).map((s) => {
            const [slug, ...sup] = s.split(".");
            return { slug, sup };
          });
          return { from, to, skills };
        }).filter((g) => g.from >= 1 && g.to <= 100 && g.from <= g.to)
      : [];
    return { ci: buf[1], asc: buf[2] - 1, route, ascRoute, gems: stages };
  } catch {
    return null;
  }
}
