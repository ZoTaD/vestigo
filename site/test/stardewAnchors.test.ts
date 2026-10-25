/**
 * Las anclas de las pestañas de la etapa 4 (Granja, Museo, Isla, Misiones): cada fila lleva un `id` para enlazarla con
 * `#`, y una vista se elige por el ancla cuando la dirección no trae `?v=`. Un `id` repetido (en una vista o entre las
 * vistas de una pestaña) lleva a la fila equivocada: acá se dibujan todas, como en el prerender, y no se repite ninguno.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import farmRaw from "../../games/stardew/data/farm.json";
import islandRaw from "../../games/stardew/data/island.json";
import museumRaw from "../../games/stardew/data/museum.json";
import questsRaw from "../../games/stardew/data/quests.json";
import { LangContext } from "../src/i18n";
import type { Route, StardewTab } from "../src/route";
import { loadFarm, loadIsland, loadMuseum, loadQuests } from "../src/stardew/data";
import { FarmBook } from "../src/stardew/farm/StardewFarm";
import { FARM_VIEWS, type FarmData } from "../src/stardew/farm/state";
import { IslandBook } from "../src/stardew/island/StardewIsland";
import { ISLAND_VIEWS, type IslandData } from "../src/stardew/island/state";
import { MuseumBook } from "../src/stardew/museum/StardewMuseum";
import { MUSEUM_VIEWS, type MuseumData } from "../src/stardew/museum/state";
import { QuestBook } from "../src/stardew/quests/StardewQuests";
import { QUEST_VIEWS, type QuestsData } from "../src/stardew/quests/state";

beforeAll(() => Promise.all([loadFarm(), loadMuseum(), loadIsland(), loadQuests()]));

const inLang = (lang: "en" | "es", el: ReactElement) => renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, el));
const route = (lang: "en" | "es", sdSection: StardewTab) => ({ lang, view: "stardew", sdSection }) as Route;
const ids = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const repeated = (list: string[]) => [...new Set(list.filter((x, i) => list.indexOf(x) !== i))];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Book = (props: any) => ReactElement;
const TABS: [tab: StardewTab, book: Book, data: unknown, views: readonly string[]][] = [
  ["farm", FarmBook as Book, farmRaw as unknown as FarmData, FARM_VIEWS],
  ["museum", MuseumBook as Book, museumRaw as unknown as MuseumData, MUSEUM_VIEWS],
  ["island", IslandBook as Book, islandRaw as unknown as IslandData, ISLAND_VIEWS],
  ["quests", QuestBook as Book, questsRaw as unknown as QuestsData, QUEST_VIEWS],
];

describe("los id de las pestañas de la etapa 4 no se repiten", () => {
  for (const [tab, book, data, views] of TABS)
    for (const lang of ["en", "es"] as const)
      it(`${tab} (${lang}): en cada vista y entre todas sus vistas`, () => {
        const all: string[] = [];
        for (const initial of views) {
          const list = ids(inLang(lang, createElement(book, { data, route: route(lang, tab), navigate: () => undefined, initial })));
          expect(list.length, `${tab} ${initial}`).toBeGreaterThan(0);
          expect(repeated(list), `${tab} ${initial}`).toEqual([]);
          all.push(...new Set(list));
        }
        // Los de la cabecera (lo que no es una fila) se dibujan en todas las vistas: se cuentan una vez.
        const perView = views.length;
        const counts = new Map<string, number>();
        for (const x of all) counts.set(x, (counts.get(x) ?? 0) + 1);
        const twice = [...counts].filter(([, n]) => n > 1 && n < perView).map(([x]) => x);
        expect(twice).toEqual([]);
      });
});
