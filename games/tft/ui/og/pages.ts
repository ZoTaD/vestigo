import { COPY, type Lang } from "../src/i18n";
import { LANGS } from "../src/route";
import { deadlockDetailSlugs, type SitemapData } from "../src/sitemap";
import { NEWS_COPY, headlineBank, pickFrom, stableVariant } from "../src/newsCopy";
import type { OgSpec } from "./og";

/**
 * Qué imagen de vista previa lleva cada página, y con qué texto.
 *
 * Separado de `og.ts` (que dibuja) y de `vite.config.ts` (que emite) para que
 * la lista se pueda leer de corrido: héroes con su carta y sus números, objetos
 * con su ícono y su precio, ediciones de Vestigo News con su titular y las
 * cartas de los más golpeados. Las secciones y la portada siguen con `og.jpg`.
 *
 * Las claves son la ruta de la página; `prerender.ts` arma la misma URL con
 * `ogImagePath`, así que las dos partes coinciden por construcción.
 */

export interface OgData extends SitemapData {
  /** La banda publicada por defecto, con sus números por héroe. */
  dlHeroStats: { band: string; heroes: { heroId: number; winRate: number; matches: number }[] };
  /** Por edición: los héroes nerfeados (los primeros son los más tocados) y los totales. */
  dlEditions: Record<string, { nerfed: number[]; totals: { items: number; heroLines: number; itemLines: number; general: number } }>;
}

type HeroCatalog = Record<string, { name: { en: string; es?: string }; card?: string; img?: string; color?: string }>;
type ItemCatalog = Record<string, { name: { en: string; es?: string }; img?: string; slot?: string; cost?: number; tier?: number }>;

const SLOT_COLOR: Record<string, string> = { weapon: "#d08a3a", vitality: "#6fae4a", spirit: "#9a6fd0" };

const TXT = {
  en: {
    hero: "Deadlock · Hero",
    heroSub: (wr: string, games: string, band: string) => `${wr} win rate · ${games} games · ${band}`,
    item: (slot: string) => `Deadlock · ${{ weapon: "Weapon", vitality: "Vitality", spirit: "Spirit" }[slot] ?? ""} item`,
    itemSub: (tier: number, cost: string) => `Tier ${tier} · ${cost} souls`,
    news: (title: string) => `Vestigo News · ${title}`,
    newsSub: (nerf: number, buff: number, items: number, changes: number) => `${nerf} nerfs · ${buff} buffs · ${items} items · ${changes} changes`,
  },
  es: {
    hero: "Deadlock · Héroe",
    heroSub: (wr: string, games: string, band: string) => `${wr} de victorias · ${games} partidas · ${band}`,
    item: (slot: string) => `Deadlock · Objeto de ${{ weapon: "arma", vitality: "vitalidad", spirit: "espíritu" }[slot] ?? ""}`,
    itemSub: (tier: number, cost: string) => `Tier ${tier} · ${cost} almas`,
    news: (title: string) => `Vestigo News · ${title}`,
    newsSub: (nerf: number, buff: number, items: number, changes: number) => `${nerf} nerfs · ${buff} buffs · ${items} objetos · ${changes} cambios`,
  },
} satisfies Record<Lang, unknown>;

const say = (loc: { en: string; es?: string }, lang: Lang) => (lang === "es" && loc.es) || loc.en;

/** Todas las imágenes a dibujar: la ruta de su página y qué mostrar. */
export function ogSpecs(data: OgData): { path: string; spec: OgSpec }[] {
  const out: { path: string; spec: OgSpec }[] = [];
  const heroes = data.dlHeroes as HeroCatalog;
  const items = data.dlItems as ItemCatalog;
  const slugs = deadlockDetailSlugs(data);
  const stats = new Map(data.dlHeroStats.heroes.map((h) => [String(h.heroId), h]));

  for (const lang of LANGS) {
    const t = TXT[lang];
    const locale = lang === "es" ? "es-AR" : "en-US";
    const pct = (n: number) => `${(n * 100).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    const int = (n: number) => n.toLocaleString(locale);
    const band = (COPY[lang].deadlock.bands as Record<string, string>)[data.dlHeroStats.band] ?? data.dlHeroStats.band;

    slugs.heroes.forEach((slug, i) => {
      const id = data.dlHeroIds[i];
      const hero = heroes[id];
      const s = stats.get(id);
      if (!hero) return;
      out.push({
        path: `/${lang}/deadlock/${slug}`,
        spec: {
          kicker: t.hero,
          title: say(hero.name, lang),
          subtitle: s ? t.heroSub(pct(s.winRate), int(s.matches), band) : undefined,
          footer: "vestigo.gg",
          cards: hero.card ? [hero.card] : [],
          accent: hero.color,
        },
      });
    });

    slugs.items.forEach((slug, i) => {
      const id = data.dlItemIds[i];
      const item = items[id];
      if (!item) return;
      out.push({
        path: `/${lang}/deadlock/items/${slug}`,
        spec: {
          kicker: t.item(item.slot ?? ""),
          title: say(item.name, lang),
          subtitle: item.tier && item.cost ? t.itemSub(item.tier, int(item.cost)) : undefined,
          footer: "vestigo.gg",
          icon: item.img,
          accent: SLOT_COLOR[item.slot ?? ""],
        },
      });
    });

    for (const e of data.dlNews ?? []) {
      const detail = data.dlEditions[e.slug];
      const copy = NEWS_COPY[lang];
      const headline = e.headline ?? pickFrom(copy.headlines[headlineBank(e.score)], stableVariant(e.slug, 97));
      out.push({
        path: `/${lang}/deadlock/patches/${e.slug}`,
        spec: {
          kicker: t.news(e.title),
          title: headline,
          subtitle: detail ? t.newsSub(e.score.nerf, e.score.buff, detail.totals.items, detail.totals.heroLines + detail.totals.itemLines + detail.totals.general) : undefined,
          footer: "vestigo.gg/deadlock/patches",
          cards: (detail?.nerfed ?? []).slice(0, 4).map((id) => heroes[String(id)]?.card).filter((c): c is string => !!c),
          accent: "#c79a4e",
        },
      });
    }
  }
  return out;
}
