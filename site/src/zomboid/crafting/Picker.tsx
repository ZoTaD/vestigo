/**
 * La columna de elegir del Planificador de fabricación (2026-10-02): el buscador sobre todo lo que se fabrica o se
 * construye, el selector de qué mostrar, las categorías y tu lista con sus cantidades. Mismo esquema que el paso 1 del
 * Planificador de Valheim (`ValheimPlannerPick.tsx`): hasta 60 filas y "Ver más".
 *
 * Todo con `<button>` y `<label>` de verdad: se usa con el teclado y lo lee un lector de pantalla. Las categorías bajan
 * de renglón (nada de deslizar de costado en el celular), y lo que ya está en tu lista va con tinte, no con un filo.
 */
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import RouteLink from "../../RouteLink";
import { useLang, useLocale } from "../../i18n";
import type { Route } from "../../route";
import { fold, ItemIcon, Stamp, type IconDir } from "../ui";
import { IDEAS, useCraftCopy } from "./copy";
import type { CraftData } from "./data";
import { addTarget, BUILD, EMPTY, isBuild, MAX_QTY, removeTarget, setQty, type CraftState } from "./state";

type Nav = (r: Route) => void;
type Kind = "all" | "items" | "builds";
const KINDS: Kind[] = ["all", "items", "builds"];
const PAGE = 60;

/** Una fila del catálogo: un objeto que se fabrica o una construcción (`c:` + su receta). */
export interface Entry {
  id: string;
  en: string;
  es: string;
  icon: string | null;
  dir: IconDir;
  cat: string;
  /** Cuántas recetas lo hacen (una construcción, una). */
  n: number;
}

/** Lo que se muestra de un objetivo (objeto o construcción) en cualquier lado de la pestaña. */
export function entryOf(d: CraftData, id: string): Entry | null {
  if (isBuild(id)) {
    const r = Object.hasOwn(d.recipes, id.slice(BUILD.length)) ? d.recipes[id.slice(BUILD.length)] : undefined;
    return r ? { id, en: r.en, es: r.es, icon: r.icon, dir: "build", cat: r.cat, n: 1 } : null;
  }
  const it = Object.hasOwn(d.items, id) ? d.items[id] : undefined;
  return it ? { id, en: it.en, es: it.es, icon: it.icon, dir: "items", cat: it.c, n: d.makes[id]?.length ?? 0 } : null;
}

/** La ficha de un objetivo: la de Objetos, o la de su receta si es una construcción. */
export const targetRoute = (route: Route, id: string): Route =>
  isBuild(id)
    ? { ...route, view: "zomboid", pzSection: "recipes", detail: id.slice(BUILD.length) }
    : { ...route, view: "zomboid", pzSection: "items", detail: id };

export default function Picker({
  data,
  st,
  set,
  route,
  navigate,
}: {
  data: CraftData;
  st: CraftState;
  set: (s: CraftState) => void;
  route: Route;
  navigate: Nav;
}) {
  const t = useCraftCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [cat, setCat] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const needle = fold(useDeferredValue(q).trim());
  useEffect(() => setShown(PAGE), [needle, kind, cat]);

  const collator = useMemo(() => new Intl.Collator(locale), [locale]);
  // Todo lo que se fabrica y todo lo que se construye, por nombre en el idioma de la página.
  const catalog = useMemo(() => {
    const out: Entry[] = [];
    for (const id of Object.keys(data.makes)) {
      const e = entryOf(data, id);
      if (e) out.push(e);
    }
    for (const [rid, r] of Object.entries(data.recipes)) if (r.kind === "build") out.push(entryOf(data, BUILD + rid)!);
    return out.sort((a, b) => collator.compare(a[lang], b[lang]));
  }, [data, lang, collator]);
  const ofKind = useMemo(
    () => catalog.filter((e) => kind === "all" || (kind === "builds") === isBuild(e.id)),
    [catalog, kind],
  );
  // Las categorías que tienen algo en lo que se muestra, en el orden de los datos.
  const cats = useMemo(() => {
    const n = new Map<string, number>();
    for (const e of ofKind) if (Object.hasOwn(data.cats, e.cat)) n.set(e.cat, (n.get(e.cat) ?? 0) + 1);
    return Object.keys(data.cats)
      .filter((c) => n.has(c))
      .map((c) => ({ id: c, name: data.cats[c][lang], n: n.get(c)! }))
      .sort((a, b) => collator.compare(a.name, b.name));
  }, [ofKind, data, lang, collator]);
  // Si la categoría elegida no tiene nada en lo que se muestra ahora, vuelve a todas.
  const activeCat = cat && cats.some((c) => c.id === cat) ? cat : null;
  const hits = useMemo(() => {
    const rows = ofKind.filter((e) => (!activeCat || e.cat === activeCat) && (!needle || fold(`${e.en} ${e.es}`).includes(needle)));
    if (!needle) return rows;
    // Lo que empieza con lo que buscaste, primero: "tabla" encuentra la Tabla antes que la Mesa de tablas.
    const starts = (e: Entry) => fold(e[lang]).startsWith(needle);
    return [...rows.filter(starts), ...rows.filter((e) => !starts(e))];
  }, [ofKind, activeCat, needle, lang]);

  const browsing = !!needle || kind !== "all" || !!activeCat;
  const ideas = useMemo(() => IDEAS.map((id) => entryOf(data, id)).filter((e): e is Entry => !!e), [data]);
  const qtyOf = (id: string) => st.q.find((x) => x.id === id)?.qty ?? 0;
  const list = browsing ? hits.slice(0, shown) : ideas;

  return (
    <aside className="pzc-pick" aria-label={t.pickTitle}>
      <section className="pz-page pzc-sheet">
        <h2 className="pzi-h2">
          <Stamp name="hammer" />
          {t.pickTitle}
        </h2>
        <label className="pzi-search">
          <span className="visually-hidden">{t.search}</span>
          <Stamp name="eye" />
          <input type="search" value={q} placeholder={t.searchHint} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="pzc-kinds" role="group" aria-label={t.kindLabel}>
          {KINDS.map((k) => (
            <button type="button" className="pzi-chip" aria-pressed={kind === k} onClick={() => setKind(k)} key={k}>
              {t.kinds[k]}
            </button>
          ))}
        </div>
        <div className="pzc-cats" role="group" aria-label={t.catLabel}>
          <button type="button" className="pzi-chip" aria-pressed={!activeCat} onClick={() => setCat(null)}>
            {t.allCats}
          </button>
          {cats.map((c) => (
            <button type="button" className="pzi-chip" aria-pressed={activeCat === c.id} onClick={() => setCat(activeCat === c.id ? null : c.id)} key={c.id}>
              {c.name}
              <small>{c.n.toLocaleString(locale)}</small>
            </button>
          ))}
        </div>

        {!browsing && <h3 className="pzc-h3">{t.ideas}</h3>}
        {list.length ? (
          <ul className="pzc-catalog">
            {list.map((e) => {
              const n = qtyOf(e.id);
              return (
                <li className={n ? "is-on" : undefined} key={e.id}>
                  <ItemIcon icon={e.icon} dir={e.dir} size={32} />
                  <span className="pzc-cname">
                    {e[lang]}
                    {e.n > 1 && <small>{t.recipes(e.n)}</small>}
                    {n > 0 && <em className="pzc-inlist">{t.inList(n)}</em>}
                  </span>
                  <button type="button" className="pzc-add" aria-label={t.addOne(e[lang])} onClick={() => set(addTarget(st, e.id))}>
                    {t.add}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="pzc-none">{t.none}</p>
        )}
        {browsing && hits.length > shown && (
          <button type="button" className="pzc-more" onClick={() => setShown((s) => s + PAGE)}>
            {t.more} <small>({(hits.length - shown).toLocaleString(locale)})</small>
          </button>
        )}
      </section>

      <section className="pz-page pzc-sheet pzc-list" aria-label={t.listTitle}>
        <h2 className="pzi-h2">
          <Stamp name="checkmark" />
          {t.listTitle}
          {st.q.length > 0 && <small>{st.q.length.toLocaleString(locale)}</small>}
        </h2>
        {st.q.length ? (
          <ul className="pzc-targets">
            {st.q.map((x) => {
              const e = entryOf(data, x.id);
              if (!e) return null;
              const name = e[lang];
              return (
                <li key={x.id}>
                  <RouteLink className="pzc-tname" to={targetRoute(route, x.id)} onNavigate={navigate}>
                    <ItemIcon icon={e.icon} dir={e.dir} size={32} />
                    <span>{name}</span>
                  </RouteLink>
                  <span className="pzc-qty">
                    <button type="button" aria-label={t.less(name)} onClick={() => set(setQty(st, x.id, x.qty - 1))}>
                      −
                    </button>
                    <label>
                      <span className="visually-hidden">{t.qty(name)}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={MAX_QTY}
                        value={x.qty}
                        onChange={(ev) => {
                          const v = Number(ev.target.value);
                          // Borrar el número para escribir otro no saca el objetivo: sólo un número de verdad cuenta.
                          if (ev.target.value !== "" && Number.isFinite(v) && v >= 1) set(setQty(st, x.id, v));
                        }}
                      />
                    </label>
                    <button type="button" aria-label={t.plus(name)} onClick={() => set(setQty(st, x.id, x.qty + 1))} disabled={x.qty >= MAX_QTY}>
                      +
                    </button>
                  </span>
                  <button type="button" className="pzc-remove" aria-label={t.removeOne(name)} onClick={() => set(removeTarget(st, x.id))}>
                    {t.remove}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="pzc-none">{t.listEmpty}</p>
        )}
        {st.q.length > 1 && (
          <button type="button" className="pzc-more" onClick={() => set({ ...EMPTY, b: st.b })}>
            {t.clear}
          </button>
        )}
      </section>
    </aside>
  );
}
