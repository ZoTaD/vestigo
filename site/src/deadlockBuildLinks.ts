import { GUIDE_DEFAULT_HEIGHT, GUIDE_MAX_CATEGORIES, GUIDE_MAX_ITEMS, GUIDE_NAME_MAX, GUIDE_DESC_MAX, encodeAbilityPath, encodeGuide, type GuideCategory } from "./deadlockBuildGuide";
import { BUILD_SLOTS, encodeBuild } from "./deadlockBuilder";

/**
 * De una build de la biblioteca al Editor (2026-11-15): las categorías van a
 * la guía (`g`), los primeros 12 objetos a las casillas (`b`) y el orden de
 * habilidades a `a`. Es el mismo formato de link que el Editor ya entendía,
 * así que un link armado acá se puede compartir tal cual.
 */
export function editorSearch(
  heroId: number,
  build: { cats: { name: string; desc: string; items: number[] }[]; path: number[] },
  catName: (name: string, i: number) => string,
  slotOf: (abilityId: number) => number | undefined,
  name = "",
): string {
  const guide: GuideCategory[] = build.cats.slice(0, GUIDE_MAX_CATEGORIES).map((c, i) => ({
    id: `c${i}`,
    name: catName(c.name, i).slice(0, GUIDE_NAME_MAX),
    desc: c.desc.slice(0, GUIDE_DESC_MAX),
    width: 12,
    height: GUIDE_DEFAULT_HEIGHT,
    items: c.items.slice(0, GUIDE_MAX_ITEMS),
  }));
  const items = [...new Set(build.cats.flatMap((c) => c.items))].slice(0, BUILD_SLOTS);
  const q = new URLSearchParams({ b: encodeBuild(heroId, items), g: encodeGuide(guide) });
  const a = encodeAbilityPath(build.path, slotOf);
  if (a) q.set("a", a);
  if (name) q.set("n", name.slice(0, 80));
  return `?${q.toString()}`;
}

/** Copia texto al portapapeles; si el navegador no deja, con un `textarea` como antes. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const t = document.createElement("textarea");
      t.value = text;
      t.setAttribute("readonly", "");
      t.style.position = "fixed";
      t.style.opacity = "0";
      document.body.append(t);
      t.select();
      const ok = document.execCommand("copy");
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
