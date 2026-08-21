import itemsJson from "@data/items.json";
import { catalog, text, byLang, useByLang } from "./catalog";
import type { Lang } from "./i18n";

/**
 * The Items page's data layer. Reads items.json and resolves item and champion
 * ids to names and images, the same way unitsData does for the Units page.
 */

interface RawCarrier {
  id: string;
  games: number;
  avgPlacement: number;
}

interface RawItem {
  id: string;
  games: number;
  playRate: number;
  avgPlacement: number;
  avgPlacementWithout: number;
  delta: number;
  bestUnits: RawCarrier[];
}

interface ItemsFile {
  generatedAt: string;
  sampleSize: number;
  items: RawItem[];
}

const file = itemsJson as unknown as ItemsFile;

const stripSet = (id: string) => id.replace(/^TFT\d*_Item_/, "").replace(/^TFT\d+_/, "");

export interface ItemComponent {
  id: string;
  name: string;
  img: string;
}

export interface ItemCarrier {
  id: string;
  name: string;
  img: string;
  cost: number;
  games: number;
  avgPlacement: number;
}

export interface Item {
  id: string;
  name: string;
  img: string;
  games: number;
  playRate: number;
  avgPlacement: number;
  /** with − without; negative means boards place better holding it. */
  delta: number;
  components: ItemComponent[];
  bestUnits: ItemCarrier[];
}

function toComponent(id: string, lang: Lang): ItemComponent {
  const entry = catalog.items[id];
  return { id, name: text(entry?.name, lang, stripSet(id)), img: entry?.img ?? "" };
}

function toCarrier(raw: RawCarrier, lang: Lang): ItemCarrier {
  const champ = catalog.champions[raw.id];
  return {
    id: raw.id,
    name: text(champ?.name, lang, stripSet(raw.id)),
    img: champ?.img ?? "",
    cost: champ?.cost ?? 0,
    games: raw.games,
    avgPlacement: raw.avgPlacement,
  };
}

/** Every item, named in one language. Built once per language and cached. */
export const buildItems = byLang((lang: Lang): Item[] =>
  file.items.map((it) => {
    const entry = catalog.items[it.id];
    return {
      id: it.id,
      name: text(entry?.name, lang, stripSet(it.id)),
      img: entry?.img ?? "",
      games: it.games,
      playRate: it.playRate,
      avgPlacement: it.avgPlacement,
      delta: it.delta,
      components: (entry?.composition ?? []).map((cid) => toComponent(cid, lang)),
      bestUnits: it.bestUnits.map((c) => toCarrier(c, lang)),
    };
  })
);

/** Every item in the language the page is in. */
export const useItems = (): Item[] => useByLang(buildItems);

export const itemsDataset = {
  generatedAt: file.generatedAt,
  sampleSize: file.sampleSize,
};
