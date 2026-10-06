/**
 * Únicos (2026-09-29): los que pueden caer, agrupados por categoría como en el
 * filtro de botín del juego, y la ficha de cada uno (`/d2r/uniques/harlequin-crest`)
 * con el tooltip entero: defensa o daño ya calculados, requisitos y stats.
 */
import { useMemo, useState } from "react";
import { LazyRows } from "../LazyRows";
import uniquesJson from "@d2r/wiki/uniques.json";
import { useLang, useLocale } from "../i18n";
import type { Route } from "../route";
import { useD2rCopy } from "../d2rCopy";
import { describeProps, type Prop } from "./stats";
import { BASE_BY_CODE, E, catName, tr, type Unique } from "./wiki";
import { CATEGORY_ORDER, baseLines, groupOf } from "./items";
import { BackLink, Chips, D2Head, ItemBox, ItemCard, ItemIcon, SearchBox, fold } from "./ui";
import farmU from "@d2r/drops/computed/farm-u.json";
import FarmBlock from "./drops/FarmBlock";
import type { FarmFile } from "./drops/farm";

const UNIQUES = uniquesJson as unknown as Unique[];
/** Dónde farmear cada único (los mejores jefes y la mejor área), ya calculado: la ficha no carga el motor. */
const FARM = farmU as unknown as FarmFile;
type Nav = (r: Route) => void;
type Group = "all" | "armor" | "weapon" | "acc";

const catOf = (u: Unique) => BASE_BY_CODE.get(u.base)?.cat ?? null;


/** El alto de una tarjeta de la lista (`.d2-card`), medido en el navegador el 2026-10-06. */
const D2_CARD = 64;
export default function D2rUniques({ route, navigate }: { route: Route; navigate: Nav }) {
  const u = route.detail ? UNIQUES.find((x) => x.id === route.detail) : undefined;
  if (route.detail && u) return <UniqueDetail u={u} route={route} navigate={navigate} />;
  return <UniqueList route={route} navigate={navigate} missing={!!route.detail} />;
}

function UniqueList({ route, navigate, missing }: { route: Route; navigate: Nav; missing: boolean }) {
  const t = useD2rCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<Group>("all");

  const byCat = useMemo(() => {
    const needle = fold(q.trim());
    const hit = UNIQUES.filter((u) => (!needle || fold(u.name.en).includes(needle) || fold(u.name.es).includes(needle)) && (group === "all" || groupOf(catOf(u)) === group));
    const map = new Map<string, Unique[]>();
    for (const u of hit) {
      const c = catOf(u) ?? "misc";
      map.set(c, [...(map.get(c) ?? []), u]);
    }
    const order = (c: string) => (CATEGORY_ORDER.includes(c) ? CATEGORY_ORDER.indexOf(c) : 999);
    return [...map.entries()].sort((a, b) => order(a[0]) - order(b[0])).map(([c, us]) => [c, us.sort((a, b) => a.req - b.req)] as const);
  }, [q, group]);
  const total = byCat.reduce((n, [, us]) => n + us.length, 0);

  return (
    <>
      <D2Head as="h1" title={t.tabs.uniques} lede={t.uniquesTab.lede(UNIQUES.length.toLocaleString(locale))} />
      <div className="d2-filters">
        <SearchBox value={q} onChange={setQ} placeholder={t.wiki.search} />
        <Chips<Group>
          label={t.tabs.uniques}
          value={group}
          onChange={setGroup}
          options={[
            { value: "all", label: t.wiki.all },
            { value: "armor", label: catName("armo", lang) },
            { value: "weapon", label: catName("weap", lang) },
            { value: "acc", label: catName("acce", lang) },
          ]}
        />
      </div>
      {missing && <p className="d2-empty">{t.wiki.notFound}</p>}
      <p className="d2-count">{t.wiki.count(total.toLocaleString(locale))}</p>
      {byCat.map(([cat, us], n) => (
        <section className="d2-cat" key={cat}>
          <h2 className="d2-cat-h">{catName(cat, lang) || cat}</h2>
          <ul className="d2-cards">
            <LazyRows items={us} rowHeight={D2_CARD} tag="li" chunk={40} eager={n === 0} render={(u) => (
              <li key={u.id}>
                <ItemCard
                  to={{ ...route, detail: u.id }}
                  navigate={navigate}
                  asset={u.img}
                  name={tr(u.name, lang)}
                  tone="unique"
                  meta={`${tr(BASE_BY_CODE.get(u.base)?.name, lang)} · ${t.wiki.level} ${u.req}`}
                />
              </li>
            )} />
          </ul>
        </section>
      ))}
      {total === 0 && <p className="d2-empty">{t.wiki.noResults}</p>}
    </>
  );
}

function UniqueDetail({ u, route, navigate }: { u: Unique; route: Route; navigate: Nav }) {
  const t = useD2rCopy();
  const { lang } = useLang();
  const base = BASE_BY_CODE.get(u.base);
  const props = u.props as Prop[];
  return (
    <article className="d2-detail">
      <BackLink to={{ ...route, detail: undefined }} navigate={navigate} label={t.tabs.uniques} />
      <div className="d2-detail-top">
        <ItemIcon asset={u.img} size="lg" alt={tr(u.name, lang)} />
        <div>
          <h1 className="d2-detail-h d2-tone-unique">{tr(u.name, lang)}</h1>
          <p className="d2-detail-sub">
            {tr(base?.name, lang)} · {catName(base?.cat, lang)}
          </p>
        </div>
      </div>
      <ItemBox name={tr(u.name, lang)} tone="unique" sub={tr(base?.name, lang)} base={baseLines(base, props, lang, u.req)} lines={describeProps(props, E, lang)} />
      <FarmBlock entry={FARM[u.id]} target={{ k: "u", id: u.id }} route={route} />
    </article>
  );
}
