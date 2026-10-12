/**
 * El árbol de crafteo de Terraria (2026-10-12): elegís un objeto que se fabrica y se despliega hasta los materiales
 * base, con el total de cada uno y las estaciones que hacen falta. El objeto viaja en el `#hash`
 * (`/en/terraria/crafting#zenith`): es una herramienta, no una página por objeto. La cuenta vive en `tree.ts`.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import home from "@terraria/home.json";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useTerrariaCopy } from "../../terrariaCopy";
import { useLoad } from "../../useLoad";
import { loadList, loadRecipes, peekList, peekRecipes, type Featured, type RecipeDb, type Row } from "../data";
import { ItemSearch, itemRoute, rare, Slot, Sprite, TrLoading, type Nav } from "../ui";
import { expand, indexRecipes, isCraftable, size, totals, type TreeNode } from "./tree";
import "../../styles/terraria-crafting.css";

/** Con más nodos que esto, el árbol abre plegado desde el segundo nivel. */
const BIG_TREE = 40;

const readHash = (): string => (typeof window === "undefined" ? "" : decodeURIComponent(window.location.hash.slice(1)));

export default function TerrariaCrafting({ route, navigate }: { route: Route; navigate: Nav }) {
  const { lang } = useLang();
  const db = useLoad("recipes", () => peekRecipes() ?? undefined, loadRecipes);
  const list = useLoad(`list-${lang}`, () => peekList(lang) ?? undefined, () => loadList(lang));
  if (db.failed) return <TrLoading onRetry={db.retry} />;
  if (list.failed) return <TrLoading onRetry={list.retry} />;
  if (!db.value || !list.value) return <TrLoading />;
  return <Crafting db={db.value} rows={list.value} route={route} navigate={navigate} />;
}

function Crafting({ db, rows, route, navigate }: { db: RecipeDb; rows: Row[]; route: Route; navigate: Nav }) {
  const t = useTerrariaCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const ix = useMemo(() => indexRecipes(db), [db]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const bySlug = useMemo(() => new Map(rows.map((r) => [r.slug, r])), [rows]);

  // El `#hash` se lee después del primer dibujo: el HTML prerenderizado es siempre el buscador con las sugerencias.
  const [slug, setSlug] = useState("");
  useEffect(() => {
    const read = () => setSlug(readHash());
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const [qty, setQty] = useState(1);
  const [choice, setChoice] = useState<Record<number, number>>({});
  const [closed, setClosed] = useState<Set<string> | null>(null);
  const pick = (r: Row) => {
    window.history.replaceState(window.history.state, "", `#${r.slug}`);
    setSlug(r.slug);
    setChoice({});
    setClosed(null);
    setQty(1);
  };

  const item = slug ? bySlug.get(slug) : undefined;
  const ok = !!item && isCraftable(ix, item.id);
  const tree = useMemo(() => (ok ? expand(ix, item!.id, qty, choice) : null), [ix, ok, item, qty, choice]);
  const sum = useMemo(() => (tree ? totals(ix, tree) : null), [ix, tree]);
  // Un árbol grande abre con el segundo nivel plegado; `closed === null` es "todavía no tocó nada".
  const shut = useMemo(() => closed ?? new Set(tree && size(tree) > BIG_TREE ? tree.children.flatMap((c, i) => (c.base ? [] : [`0.${i}`])) : []), [closed, tree]);
  const toggle = (path: string) => {
    const next = new Set(shut);
    if (!next.delete(path)) next.add(path);
    setClosed(next);
  };

  const groupName = (key: number) => {
    const g = db.groups[String(-key - 1)];
    return g ? (lang === "es" && g.es) || g.en : "";
  };
  const label = (key: number): { name: string; row?: Row } => {
    if (key < 0) {
      const g = db.groups[String(-key - 1)];
      return { name: groupName(key), row: g ? byId.get(g.items[0]) : undefined };
    }
    const row = byId.get(key);
    return { name: row?.name ?? `#${key}`, row };
  };
  const stationName = (tile: number): ReactNode => {
    const st = db.tiles[String(tile)];
    if (!st) return null;
    const row = st.item ? byId.get(st.item) : undefined;
    const name = (lang === "es" && st.es) || st.en;
    return row ? (
      <RouteLink className="tr-ref" to={itemRoute(route, row.slug)} onNavigate={navigate}>
        <Slot size={36}>
          <Sprite id={row.id} w={row.w} h={row.h} max={28} />
        </Slot>
        <span>{row.name}</span>
      </RouteLink>
    ) : (
      <b>{name}</b>
    );
  };

  const node = (n: TreeNode, path: string): ReactNode => {
    const { name, row } = label(n.key);
    const open = !shut.has(path);
    const options = n.options;
    return (
      <li key={path} className={n.base ? "is-base" : undefined}>
        <div className="tr-node">
          {n.children.length > 0 ? (
            <button type="button" className="tr-fold" aria-expanded={open} aria-label={open ? t.crafting.collapse : t.crafting.expand} onClick={() => toggle(path)}>
              {open ? "−" : "+"}
            </button>
          ) : (
            <span className="tr-fold is-leaf" aria-hidden="true" />
          )}
          <Slot size={36}>{row && <Sprite id={row.id} w={row.w} h={row.h} max={28} />}</Slot>
          {row && n.key > 0 ? (
            <RouteLink className="tr-node-name" to={itemRoute(route, row.slug)} onNavigate={navigate} title={t.crafting.openItem} style={rare(row.rare)}>
              {name}
            </RouteLink>
          ) : (
            <span className="tr-node-name">{name}</span>
          )}
          <b className="tr-node-qty">×{n.qty.toLocaleString(locale)}</b>
          {n.cycle && <small>{t.crafting.loop}</small>}
          {options.length > 1 && (
            <select
              className="tr-node-recipe"
              aria-label={t.crafting.recipeOf(options.indexOf(n.recipe!) + 1, options.length)}
              value={n.recipe ?? ""}
              onChange={(e) => setChoice({ ...choice, [n.key]: Number(e.target.value) })}
            >
              {options.map((r, i) => (
                <option value={r} key={r}>
                  {t.crafting.recipeOf(i + 1, options.length)}
                </option>
              ))}
            </select>
          )}
        </div>
        {open && n.children.length > 0 && <ul>{n.children.map((c, i) => node(c, `${path}.${i}`))}</ul>}
      </li>
    );
  };

  const featured = (home.featured as Featured[]).filter((f) => isCraftable(ix, f[0]) && bySlug.has(f[1]));

  return (
    <main className="tr-main tr-crafting">
      <div className="tr-wrap">
        <header className="tr-head">
          <h1 className="tr-h1 tr-andy">{t.crafting.h1}</h1>
          <p className="tr-lede">{t.crafting.lede}</p>
        </header>
        <div className="tr-dug tr-pick">
          <ItemSearch label={t.crafting.pick} placeholder={t.crafting.pickPlaceholder} to={() => route} navigate={() => undefined} only={(r) => r.craft && isCraftable(ix, r.id)} onPick={pick} />
          {slug && !ok && (
            <p className="tr-note" role="status">
              {t.crafting.unknown}
            </p>
          )}
          {!ok && (
            <>
              <h2 className="tr-label">{t.crafting.tryOne}</h2>
              <ul className="tr-cells">
                {featured.map((f) => (
                  <li key={f[0]}>
                    <a className="tr-cell" href={`#${f[1]}`} onClick={(e) => (e.preventDefault(), pick(bySlug.get(f[1])!))}>
                      <Slot>
                        <Sprite id={f[0]} w={f[6]} h={f[7]} />
                      </Slot>
                      <span style={rare(f[5])}>{(lang === "es" && f[4]) || f[3]}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {tree && sum && item && (
          <div className="tr-tree-cols">
            <section className="tr-dug">
              <div className="tr-tree-head">
                <h2 className="tr-h2 tr-andy" style={rare(item.rare)}>
                  {item.name}
                </h2>
                <label className="tr-qty">
                  <span className="tr-label">{t.crafting.quantity}</span>
                  <input type="number" min={1} max={9999} value={qty} onChange={(e) => setQty(Math.min(9999, Math.max(1, Math.floor(Number(e.target.value)) || 1)))} />
                </label>
              </div>
              <ul className="tr-tree">{node(tree, "0")}</ul>
            </section>
            <aside className="tr-tree-side">
              <section className="tr-dug">
                <h2 className="tr-h2 tr-andy">{t.crafting.totals}</h2>
                <ul className="tr-rows">
                  {sum.base.map(([key, n]) => {
                    const { name, row } = label(key);
                    const body = (
                      <>
                        <Slot size={36}>{row && <Sprite id={row.id} w={row.w} h={row.h} max={28} />}</Slot>
                        <span style={row && key > 0 ? rare(row.rare) : undefined}>{name}</span>
                        <small>×{n.toLocaleString(locale)}</small>
                      </>
                    );
                    return (
                      <li key={key}>
                        {row && key > 0 ? (
                          <RouteLink className="tr-ref" to={itemRoute(route, row.slug)} onNavigate={navigate}>
                            {body}
                          </RouteLink>
                        ) : (
                          <span className="tr-ref is-group">{body}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
              <section className="tr-dug">
                <h2 className="tr-h2 tr-andy">{t.crafting.stations}</h2>
                {sum.stations.length === 0 && sum.flags === 0 ? (
                  <p>{t.crafting.noStations}</p>
                ) : (
                  <ul className="tr-rows">
                    {sum.stations.map((s) => (
                      <li key={s}>{stationName(s)}</li>
                    ))}
                    {t.items.flags.map((f, i) => (sum.flags & (1 << i) ? <li key={f}>{f}</li> : null))}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
