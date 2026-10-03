/**
 * La lista de recetas de Project Zomboid (2026-09-30): una hoja con el texto que lee Google, el buscador y los filtros
 * (fabricación o construcción, y las categorías del juego), y después una hoja por categoría con sus recetas. Cada fila
 * lleva el ícono de lo que da: el objeto, o el mueble si es de construcción.
 *
 * **Todas las filas van en el HTML**, sin paginar, igual que en Objetos: cada una es el único `<a href>` que lleva a su
 * ficha desde la pestaña. Buscar y filtrar esconden filas en el navegador; el HTML prerenderizado las tiene todas.
 */
import { useDeferredValue, useMemo, useState } from "react";
import meta from "@zomboid/meta.json";
import RouteLink from "../../RouteLink";
import { useLang, useLocale } from "../../i18n";
import type { Route } from "../../route";
import { useZomboidCopy } from "../../zomboidCopy";
import { fold, ItemIcon, Stamp } from "../ui";
import type { RecipeKind, RecipeRow, RecipesList } from "./data";

type Nav = (r: Route) => void;
const KINDS: RecipeKind[] = ["craft", "build"];

export default function RecipeList({ list, route, navigate, missing }: { list: RecipesList; route: Route; navigate: Nav; missing: boolean }) {
  const t = useZomboidCopy().recipes;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<RecipeKind | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const needle = fold(useDeferredValue(q).trim());

  const name = (r: { en: string; es: string }) => (lang === "es" ? r.es : r.en);
  // Las categorías y sus filas por el nombre en el idioma de la página, con un solo `Collator` (son 1.170 filas).
  const collator = useMemo(() => new Intl.Collator(locale), [locale]);
  const cats = useMemo(() => Object.entries(list.cats).sort(([, a], [, b]) => collator.compare(name(a), name(b))), [list, lang, collator]);
  const byCat = useMemo(() => {
    const out = new Map<string, RecipeRow[]>();
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
  const kindN = useMemo(() => {
    const n: Record<RecipeKind, number> = { craft: 0, build: 0 };
    for (const r of list.rows) n[r.kind]++;
    return n;
  }, [list]);
  // Las cifras de las categorías siguen al tipo elegido: con "Construcción", Cocina no tiene ninguna y no se ofrece.
  const catN = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of list.rows) if (!kind || r.kind === kind) n.set(r.cat, (n.get(r.cat) ?? 0) + 1);
    return n;
  }, [list, kind]);
  const shows = (r: RecipeRow) => (!kind || r.kind === kind) && (!cat || r.cat === cat) && (!needle || hay.get(r.id)!.includes(needle));

  const visible = cats.map(([key]) => [key, (byCat.get(key) ?? []).filter(shows)] as const).filter(([, rows]) => rows.length);
  const shown = visible.reduce((sum, [, rows]) => sum + rows.length, 0);
  const toRecipe = (id: string): Route => ({ ...route, view: "zomboid", pzSection: "recipes", detail: id });

  return (
    <main className="pz-main pzi pzr">
      <section className="pz-page pzi-intro">
        <span className="pz-clip" />
        {missing && <p className="pzi-missing" role="status">{t.notFound}</p>}
        <h1 className="pzi-h1">{t.title}</h1>
        {t.intro(num(list.rows.length), num(kindN.craft), num(kindN.build), num(cats.length), meta.version).map((p) => (
          <p key={p}>{p}</p>
        ))}
        <p className="pzi-hand">{t.hand}</p>
      </section>

      <section className="pz-page pzi-filters" aria-label={t.filters}>
        <label className="pzi-search">
          <span className="visually-hidden">{t.search}</span>
          <Stamp name="eye" />
          <input type="search" value={q} placeholder={t.searchHint} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="pzi-chips">
          {/* "Todas" saca los dos filtros; el tipo y la categoría se combinan. */}
          <div className="pzi-chiprow">
            <button
              type="button"
              className="pzi-chip"
              aria-pressed={kind === null && cat === null}
              onClick={() => {
                setKind(null);
                setCat(null);
              }}
            >
              {t.all} <small>{num(list.rows.length)}</small>
            </button>
            {KINDS.map((k) => (
              <button type="button" className="pzi-chip" aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)} key={k}>
                {t.kinds[k]} <small>{num(kindN[k])}</small>
              </button>
            ))}
          </div>
          <div className="pzi-chipgroup">
            <span className="pzi-chiphead">{t.catsHead}</span>
            <div className="pzi-chiprow">
              {cats.map(([key, info]) =>
                catN.get(key) || cat === key ? (
                  <button type="button" className="pzi-chip" aria-pressed={cat === key} onClick={() => setCat(cat === key ? null : key)} key={key}>
                    {name(info)} <small>{num(catN.get(key) ?? 0)}</small>
                  </button>
                ) : null,
              )}
            </div>
          </div>
        </div>
      </section>

      <p className="pzi-count" aria-live="polite">
        {t.showing(num(shown), num(list.rows.length))}
      </p>
      {!shown && <p className="pzi-empty">{t.empty}</p>}

      {visible.map(([key, rows]) => (
        <section className="pz-page pzi-cat" key={key}>
          <h2 className="pzi-h2">
            {name(list.cats[key])} <small>{num(rows.length)}</small>
          </h2>
          <div className="pzi-rows">
            {/* `press`, como en Objetos: la ficha baja al apretar la fila y no al pasar el mouse. Con `hover`, cruzar una
                lista de 1.170 filas bajaba un archivo de fichas (~6 KB) por cada fila tocada. */}
            {rows.map((r) => (
              <RouteLink className="pzi-row" to={toRecipe(r.id)} onNavigate={navigate} prefetch="press" key={r.id}>
                <ItemIcon icon={r.icon} dir={r.kind === "build" ? "build" : "items"} />
                <span className="pzi-name">{name(r)}</span>
                {r.kind === "build" && <em className="pzi-var">{t.buildMark}</em>}
              </RouteLink>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
