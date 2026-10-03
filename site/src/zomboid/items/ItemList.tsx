/**
 * La lista de objetos de Project Zomboid (2026-09-30): una hoja con el texto que lee Google, el buscador y los chips de
 * las 77 categorías del juego, y después una hoja por categoría con sus objetos.
 *
 * **Todas las filas van en el HTML**, sin paginar: cada una es el único `<a href>` que lleva a su ficha desde la
 * pestaña, y una ficha sin enlace es una ficha que Google no encuentra. Buscar y filtrar esconden filas en el
 * navegador; el HTML prerenderizado (sin filtro) las tiene todas.
 */
import { useDeferredValue, useMemo, useState } from "react";
import meta from "@zomboid/meta.json";
import RouteLink from "../../RouteLink";
import { useLang, useLocale } from "../../i18n";
import type { Route } from "../../route";
import { useZomboidCopy, type PzItemGroup } from "../../zomboidCopy";
import type { ItemRow, ItemsList } from "./data";
import { weightText } from "./stats";
import { fold, ItemIcon, Stamp } from "../ui";

type Nav = (r: Route) => void;

const GROUPS: PzItemGroup[] = ["weapons", "wear", "food", "tools", "materials", "reading", "other"];
const WEAR = ["Clothing", "Accessory", "ProtectiveGear", "Appearance", "Ears", "Tail", "Bag", "Container"];
const FOOD = ["Food", "Cooking", "Water", "WaterContainer", "AnimalPart", "Corpse", "Fishing", "Trapping", "Gardening", "Animal"];
const TOOLS = [
  "Tool", "Household", "Camping", "Electronics", "Communications", "LightSource", "FireSource", "Security",
  "VehicleMaintenance", "FirstAid", "Cartography", "Paint", "Sports", "Instrument",
];
const MATERIALS = ["Material", "RecipeResource", "Junk", "Furniture"];
const READING = ["Literature", "SkillBook", "Entertainment", "Memento"];

/**
 * La familia de una categoría del juego, sólo para agrupar los chips. Las "X / Arma" (una sartén, un bate) van con las
 * armas porque es lo que se busca de ellas; lo que no encaja (los peluches con nombre de animal) va a "Otros".
 */
function groupOf(cat: string): PzItemGroup {
  if (/Weapon/.test(cat) || cat === "Ammo" || cat === "Explosives") return "weapons";
  if (WEAR.includes(cat)) return "wear";
  if (FOOD.includes(cat)) return "food";
  if (TOOLS.includes(cat)) return "tools";
  if (MATERIALS.includes(cat)) return "materials";
  if (READING.includes(cat)) return "reading";
  return "other";
}

export default function ItemList({ list, route, navigate, missing }: { list: ItemsList; route: Route; navigate: Nav; missing: boolean }) {
  const c = useZomboidCopy();
  const t = c.items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const needle = fold(useDeferredValue(q).trim());

  const name = (r: { en: string; es: string }) => (lang === "es" ? r.es : r.en);
  // Las categorías por nombre en el idioma de la página, y sus filas también: "Arma" y "Weapon" no caen en el mismo
  // lugar del abecedario.
  // Un `Collator` y no `localeCompare(…, locale)`: ése arma uno nuevo en cada comparación, y son miles.
  const collator = useMemo(() => new Intl.Collator(locale), [locale]);
  const cats = useMemo(() => Object.entries(list.cats).sort(([, a], [, b]) => collator.compare(name(a), name(b))), [list, lang, collator]);
  const byCat = useMemo(() => {
    const out = new Map<string, ItemRow[]>();
    for (const r of list.rows) {
      const rows = out.get(r.cat);
      if (rows) rows.push(r);
      else out.set(r.cat, [r]);
    }
    for (const rows of out.values()) rows.sort((a, b) => collator.compare(name(a), name(b)));
    return out;
  }, [list, lang, collator]);
  // El texto donde se busca: los dos nombres sin tildes, armado una sola vez y no en cada tecla.
  const hay = useMemo(() => new Map(list.rows.map((r) => [r.id, fold(`${r.en} ${r.es}`)])), [list]);
  const shows = (r: ItemRow) => (!cat || r.cat === cat) && (!needle || hay.get(r.id)!.includes(needle));

  const variants = list.rows.reduce((sum, r) => sum + r.n, 0);
  const visible = cats.map(([key]) => [key, (byCat.get(key) ?? []).filter(shows)] as const).filter(([, rows]) => rows.length);
  const shown = visible.reduce((sum, [, rows]) => sum + rows.length, 0);
  const toItem = (id: string): Route => ({ ...route, view: "zomboid", pzSection: "items", detail: id });

  return (
    <main className="pz-main pzi">
      <section className="pz-page pzi-intro">
        <span className="pz-clip" />
        {missing && <p className="pzi-missing" role="status">{t.notFound}</p>}
        <h1 className="pzi-h1">{t.title}</h1>
        {t.intro(num(list.rows.length), num(variants), num(cats.length), meta.version).map((p) => (
          <p key={p}>{p}</p>
        ))}
        <p className="pzi-hand">{t.hand}</p>
      </section>

      <section className="pz-page pzi-filters" aria-label={t.chips}>
        <label className="pzi-search">
          <span className="visually-hidden">{t.search}</span>
          <Stamp name="eye" />
          <input type="search" value={q} placeholder={t.searchHint} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="pzi-chips">
          <button type="button" className="pzi-chip" aria-pressed={cat === null} onClick={() => setCat(null)}>
            {t.all} <small>{num(list.rows.length)}</small>
          </button>
          {GROUPS.map((g) => {
            const mine = cats.filter(([key]) => groupOf(key) === g);
            if (!mine.length) return null;
            return (
              <div className="pzi-chipgroup" key={g}>
                <span className="pzi-chiphead">{t.groups[g]}</span>
                <div className="pzi-chiprow">
                  {mine.map(([key, info]) => (
                    <button type="button" className="pzi-chip" aria-pressed={cat === key} onClick={() => setCat(cat === key ? null : key)} key={key}>
                      {name(info)} <small>{num(info.n)}</small>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p className="pzi-count" aria-live="polite">
        {t.showing(num(shown), num(list.rows.length))}
        <span className="pzi-hand-note">{t.weightNote} →</span>
      </p>
      {!shown && <p className="pzi-empty">{t.empty}</p>}

      {visible.map(([key, rows]) => (
        <section className="pz-page pzi-cat" key={key}>
          <h2 className="pzi-h2">
            {name(list.cats[key])} <small>{num(rows.length)}</small>
          </h2>
          <div className="pzi-rows">
            {/* `press`: la ficha baja al apretar la fila, no al pasar el mouse por encima; si no, cruzar la lista bajaba
                un archivo de fichas por cada fila tocada. */}
            {rows.map((r) => (
              <RouteLink className="pzi-row" to={toItem(r.id)} onNavigate={navigate} prefetch="press" key={r.id}>
                <ItemIcon icon={r.icon} />
                <span className="pzi-name">{name(r)}</span>
                {r.n > 1 && <em className="pzi-var">{t.variantsN(r.n)}</em>}
                {r.w !== null && <b className="pzi-w">{weightText(r.w, locale)}</b>}
              </RouteLink>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
