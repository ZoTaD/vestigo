import { describe, expect, it } from "vitest";
import index from "@zomboid/index.json";
import itemsFile from "@zomboid/items.json";
import meta from "@zomboid/meta.json";
import { buildEsSlugs } from "../src/esSlugs";
import { slugify, type PzTab } from "../src/route";

/**
 * El índice de fichas de Project Zomboid (2026-09-30), el que escribe `extract.py` y del que salen las direcciones, el
 * sitemap y el `<head>` de cada ficha. Se prueba con el índice real: si un parche trae un nombre que rompe una regla,
 * salta acá antes de publicar.
 */
type Entry = { sec: PzTab; id: string; en: string; es: string; ref: string[] };
const INDEX = index as Entry[];
// "server" son las dos subpáginas de la pestaña Servidor (presets y cortes de agua y luz), escritas a mano en
// `extract.py` (`SERVER_PAGES`).
const SECS: PzTab[] = ["items", "recipes", "traits", "professions", "skills", "moodles", "server"];
const SLUGS = buildEsSlugs(INDEX, []);

const bySec = (sec: PzTab) => INDEX.filter((e) => e.sec === sec);

describe("el índice de fichas de Project Zomboid", () => {
  it("trae las siete secciones con fichas, en orden: por sección y después por id", () => {
    expect(new Set(INDEX.map((e) => e.sec))).toEqual(new Set(SECS));
    const key = (e: Entry) => [SECS.indexOf(e.sec), e.id] as const;
    for (let i = 1; i < INDEX.length; i++) {
      const [a, b] = [key(INDEX[i - 1]), key(INDEX[i])];
      expect(a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]), `${INDEX[i - 1].id} → ${INDEX[i].id}`).toBe(true);
    }
  });

  it("cada id es el slug del nombre en inglés, o, si chocaba con otra ficha, ese slug con el del id del juego", () => {
    // La regla de `site_index()` en `extract.py`: el sufijo no es cualquiera, es el slug del primer `ref` (o del nombre),
    // y sólo va si otra ficha de la misma sección da el mismo slug.
    const uses = new Map<string, number>();
    for (const e of INDEX) uses.set(`${e.sec}/${slugify(e.en)}`, (uses.get(`${e.sec}/${slugify(e.en)}`) ?? 0) + 1);
    for (const e of INDEX) {
      const base = slugify(e.en);
      expect(base, `${e.sec}/${e.id}`).not.toBe("");
      const want = uses.get(`${e.sec}/${base}`) === 1 ? base : `${base}-${slugify(e.ref[0] ?? e.en)}`;
      expect(e.id, `${e.sec}/${e.id} ← "${e.en}"`).toBe(want);
    }
  });

  it("no hay ids repetidos dentro de una sección", () => {
    for (const sec of SECS) {
      const ids = bySec(sec).map((e) => e.id);
      expect(new Set(ids).size, sec).toBe(ids.length);
    }
  });

  it("cada objeto del juego está en una sola ficha, y hay una ficha por nombre en inglés", () => {
    const refs = bySec("items").flatMap((e) => e.ref);
    const all = itemsFile.items.map((i) => i.id);
    expect(refs.length).toBe(all.length);
    expect(new Set(refs)).toEqual(new Set(all));
    expect(bySec("items").length).toBe(new Set(itemsFile.items.map((i) => i.name.en)).size);
    // 55 "Paperback" distintos son una sola ficha.
    expect(bySec("items").find((e) => e.id === "paperback")?.ref.length).toBeGreaterThan(1);
  });

  // El extractor saca los objetos de prueba del desarrollo por el nombre del script y por cómo los rotula el juego:
  // FISH_DEV_ITEM no dice "debug" en ningún lado, y Animal_Item_Dummy sólo lo dice en su nombre visible.
  it("ningún objeto de prueba del desarrollo llega a una ficha (ni FISH_DEV_ITEM ni DEBUG DUMMY ITEM)", () => {
    expect(meta.excluded.debugItems).toEqual(expect.arrayContaining(["Base.FISH_DEV_ITEM", "Base.Animal_Item_Dummy"]));
    const refs = new Set(bySec("items").flatMap((e) => e.ref));
    for (const id of meta.excluded.debugItems) expect(refs.has(id), id).toBe(false);
    for (const e of bySec("items")) {
      expect(e.en, `${e.id}: ${e.en}`).not.toMatch(/\bdebug\b|\bnot spawn\b|\bdev item\b/i);
      expect(e.ref.every((r) => !/(?:^|[._])dev(?:_|$)/i.test(r)), `${e.id}: ${e.ref}`).toBe(true);
    }
    expect(bySec("items").some((e) => e.id === "fish-dev-item-not-spawn")).toBe(false);
  });

  it("la palanca es `crowbar` en inglés y `palanca` en español", () => {
    const crowbar = bySec("items").find((e) => e.ref.includes("Base.Crowbar"));
    expect(crowbar?.id).toBe("crowbar");
    expect(SLUGS.items?.crowbar).toBe("palanca");
  });

  it("cada dirección en español abre una sola ficha: sin repetidos y sin chocar con el slug inglés de otra", () => {
    // `parseRoute` traduce el slug en los dos idiomas: un español igual al inglés de otra ficha abriría la equivocada.
    for (const sec of SECS) {
      const ids = bySec(sec).map((e) => e.id);
      const idSet = new Set(ids);
      const es = ids.map((id) => SLUGS[sec]?.[id] ?? id);
      expect(new Set(es).size, sec).toBe(ids.length);
      for (const [i, slug] of es.entries()) if (slug !== ids[i]) expect(idSet.has(slug), `${sec}/${slug}`).toBe(false);
    }
  });
});
