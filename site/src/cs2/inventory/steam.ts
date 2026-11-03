/**
 * Leer inventarios de CS2 de Steam (2026-11-03, etapa 3). Puro y sin red: lo usan el intermediario de Netlify
 * (`netlify/functions/cs2-inventory.mts`), el middleware de `npm run dev` y la página cuando el jugador pega el
 * inventario a mano. No importa nada del sitio, así la función de Netlify sale chica.
 *
 * Steam: `https://steamcommunity.com/inventory/<steamid64>/730/2?l=english&count=2000` (público sin sesión; 403 si es
 * privado; paginado con `more_items` y `last_assetid`). Un nombre de perfil se resuelve con `/id/<nombre>?xml=1`.
 */

export interface InvItem {
  /** El `market_hash_name`: la clave de los precios de Skinport. */
  name: string;
  n: number;
  /** `icon_url` del CDN de Steam (`https://community.akamai.steamstatic.com/economy/image/<icon>/…`). */
  icon: string;
  /** La categoría "Type" de Steam en inglés (Container, Key, Rifle, Sticker…). */
  type: string;
  /** La categoría "Rarity" de Steam en inglés (Mil-Spec Grade, Covert…), o "". */
  rarity: string;
  tradable: boolean;
}
export type InvError = "bad" | "private" | "notfound" | "busy";

const STEAMID = /^7656119\d{10}$/;
const VANITY = /^[A-Za-z0-9_-]{2,32}$/;

/** Lo que pega el jugador: un SteamID64, la URL de su perfil (o de su inventario) o su nombre de perfil. */
export function parseProfile(input: string): { kind: "id" | "vanity"; value: string } | null {
  const s = input.trim();
  if (STEAMID.test(s)) return { kind: "id", value: s };
  const url = s.match(/^(?:https?:\/\/)?(?:www\.)?steamcommunity\.com\/(profiles|id)\/([^/?#]+)/i);
  if (url) {
    const v = decodeURIComponent(url[2]);
    if (url[1].toLowerCase() === "profiles") return STEAMID.test(v) ? { kind: "id", value: v } : null;
    return VANITY.test(v) ? { kind: "vanity", value: v } : null;
  }
  if (/^\d+$/.test(s)) return null;
  return VANITY.test(s) ? { kind: "vanity", value: s } : null;
}

export const vanityUrl = (name: string): string => `https://steamcommunity.com/id/${encodeURIComponent(name)}?xml=1`;
export const inventoryUrl = (id: string, start?: string): string =>
  `https://steamcommunity.com/inventory/${id}/730/2?l=english&count=2000${start ? `&start_assetid=${start}` : ""}`;

/** El SteamID64 del XML de un perfil, o null si Steam dice que no existe. */
export function parseVanityXml(xml: string): string | null {
  const m = xml.match(/<steamID64>(\d+)<\/steamID64>/);
  return m && STEAMID.test(m[1]) ? m[1] : null;
}

type Raw = {
  assets?: { classid: string; instanceid: string; amount?: string }[];
  descriptions?: { classid: string; instanceid: string; market_hash_name: string; icon_url: string; tradable?: number; tags?: { category: string; internal_name?: string; localized_tag_name?: string }[] }[];
  more_items?: number;
  last_assetid?: string;
  success?: number | boolean;
  total_inventory_count?: number;
};

/** Una página de Steam → la lista, con los objetos iguales juntos. Lo que no es un inventario da `bad`. */
export function compact(json: unknown): { items: InvItem[]; more: boolean; lastAssetId: string | null } | { error: InvError } {
  if (!json || typeof json !== "object") return { error: "bad" };
  const r = json as Raw;
  if (!r.success) return { error: "bad" };
  const descs = new Map((r.descriptions ?? []).map((d) => [`${d.classid}_${d.instanceid}`, d]));
  const byName = new Map<string, InvItem>();
  for (const a of r.assets ?? []) {
    const d = descs.get(`${a.classid}_${a.instanceid}`);
    if (!d) continue;
    const tag = (cat: string) => d.tags?.find((t) => t.category === cat)?.localized_tag_name ?? "";
    const it = byName.get(d.market_hash_name) ?? { name: d.market_hash_name, n: 0, icon: d.icon_url, type: tag("Type"), rarity: tag("Rarity"), tradable: !!d.tradable };
    it.n += Number(a.amount ?? 1) || 1;
    byName.set(d.market_hash_name, it);
  }
  return { items: [...byName.values()], more: !!r.more_items, lastAssetId: r.last_assetid ?? null };
}

/** Varias páginas en una lista, sumando los repetidos. */
export function merge(pages: InvItem[][]): InvItem[] {
  const byName = new Map<string, InvItem>();
  for (const p of pages)
    for (const it of p) {
      const prev = byName.get(it.name);
      byName.set(it.name, prev ? { ...prev, n: prev.n + it.n } : { ...it });
    }
  return [...byName.values()];
}

/**
 * De un `market_hash_name` al slug de nuestra ficha (skin o caja): sin StatTrak™, Souvenir, ★ ni el desgaste. El mismo
 * `slugify` de `site/src/route.ts`, copiado para no traer el sitio a la función de Netlify.
 */
export function skinSlugOf(name: string): string {
  const base = name
    .replace(/StatTrak™ |Souvenir /g, "")
    .replace(/ \((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/, "");
  return base
    .normalize("NFD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/['.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
