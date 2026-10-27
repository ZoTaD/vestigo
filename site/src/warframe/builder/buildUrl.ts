/**
 * La build en la dirección (2026-10-27): `?i=<slug del Arsenal>&m=<casillero>.<slug del mod>.<rango>,…&p=<casillero>.<polaridad>,…&o=1`.
 *
 * `o=1` es el potenciador o catalizador Orokin. Los casilleros se escriben `aura`, `stance`, `exilus` o 0–7. Se lee
 * con tolerancia, porque una dirección compartida puede ser vieja: un mod que ya no existe o no entra en ese casillero,
 * una polaridad desconocida o un casillero repetido se descartan; un rango fuera de 0..máximo se recorta. Sólo devuelve
 * `null` si el objeto no existe.
 */
import { POLS, type BuildItem, type BuildMod, type Pol } from "../data";
import { emptyBuild, modFits, slotIds, type Build, type SlotId } from "./calc";

const slotTxt = (id: SlotId): string => String(id);
function leerSlot(txt: string, valid: readonly SlotId[]): SlotId | null {
  const id: SlotId | undefined = valid.find((v) => String(v) === txt);
  return id ?? null;
}

/** El `search` sin "?". Casilleros en orden; sólo los que tienen algo. */
export function encodeBuild(b: Build): string {
  const m = b.slots.filter((s) => s.mod).map((s) => `${slotTxt(s.id)}.${s.mod!.slug}.${s.rank}`);
  const p = b.slots.filter((s) => s.pol).map((s) => `${slotTxt(s.id)}.${s.pol}`);
  const partes = [`i=${b.item.slug}`];
  if (m.length) partes.push(`m=${m.join(",")}`);
  if (p.length) partes.push(`p=${p.join(",")}`);
  if (b.reactor) partes.push("o=1");
  return partes.join("&");
}

export function decodeBuild(search: string, items: BuildItem[], mods: BuildMod[]): Build | null {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const item = items.find((x) => x.slug === q.get("i"));
  if (!item) return null;
  const b = emptyBuild(item);
  const valid = slotIds(item.kind);
  const slot = (id: SlotId) => b.slots.find((s) => s.id === id)!;
  const porSlug = new Map(mods.map((m) => [m.slug, m]));
  const puestos = new Set<string>();

  for (const parte of (q.get("m") ?? "").split(",")) {
    const [st, slug, rk] = parte.split(".");
    const id = leerSlot(st ?? "", valid);
    const mod = porSlug.get(slug ?? "");
    if (id === null || !mod || !modFits(mod, item, id)) continue;
    const s = slot(id);
    // El juego no deja poner dos veces el mismo mod (ni dos versiones con el mismo nombre).
    if (s.mod || puestos.has(mod.name[0])) continue;
    const n = Number.parseInt(rk ?? "", 10);
    s.mod = mod;
    s.rank = Number.isFinite(n) ? Math.max(0, Math.min(n, mod.max)) : mod.max;
    puestos.add(mod.name[0]);
  }
  for (const parte of (q.get("p") ?? "").split(",")) {
    const [st, pol] = parte.split(".");
    const id = leerSlot(st ?? "", valid);
    if (id === null || !POLS.includes(pol as Pol)) continue;
    const s = slot(id);
    if (!s.pol) s.pol = pol as Pol;
  }
  b.reactor = q.get("o") === "1";
  return b;
}
