/**
 * Conjuntos (2026-09-29): los 34 que caen, con sus piezas, y la ficha de cada uno
 * (`/d2r/sets/tal-rashas-wrappings`) con el tooltip de cada pieza —sus stats en
 * azul y sus bonificaciones por piezas puestas en verde, como en el juego— y
 * las bonificaciones del conjunto parcial y completo.
 */
import { useMemo, useState } from "react";
import { useLang, useLocale } from "../i18n";
import RouteLink from "../RouteLink";
import type { Route } from "../route";
import { useD2rCopy } from "../d2rCopy";
import { describeProps, type Prop } from "./stats";
import { BASE_BY_CODE, E, tr, type GameSet } from "./wiki";
import { baseLines } from "./items";
import { SETS, maxReq } from "./sets";
import { BackLink, D2Head, ItemBox, ItemIcon, SearchBox, fold } from "./ui";
import farmS from "@d2r/drops/computed/farm-s.json";
import { FarmPieces } from "./drops/FarmBlock";
import type { FarmFile } from "./drops/farm";

type Nav = (r: Route) => void;
/** Dónde farmear cada pieza (su mejor jefe), ya calculado: la ficha no carga el motor. */
const FARM = farmS as unknown as FarmFile;

export default function D2rSets({ route, navigate }: { route: Route; navigate: Nav }) {
  const s = route.detail ? SETS.find((x) => x.id === route.detail) : undefined;
  if (route.detail && s) return <SetDetail set={s} route={route} navigate={navigate} />;
  return <SetList route={route} navigate={navigate} missing={!!route.detail} />;
}

function SetList({ route, navigate, missing }: { route: Route; navigate: Nav; missing: boolean }) {
  const t = useD2rCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const [q, setQ] = useState("");
  const pieces = SETS.reduce((n, s) => n + s.items.length, 0);
  const shown = useMemo(() => {
    const needle = fold(q.trim());
    return SETS.filter(
      (s) => !needle || [s.name, ...s.items.map((i) => i.name)].some((n) => fold(n.en).includes(needle) || fold(n.es).includes(needle)),
    );
  }, [q]);
  return (
    <>
      <D2Head as="h1" title={t.tabs.sets} lede={t.setsTab.lede(SETS.length.toLocaleString(locale), pieces.toLocaleString(locale))} />
      <div className="d2-filters">
        <SearchBox value={q} onChange={setQ} placeholder={t.wiki.search} />
      </div>
      {missing && <p className="d2-empty">{t.wiki.notFound}</p>}
      <ul className="d2-sets">
        {shown.map((s) => (
          <li key={s.id}>
            <RouteLink className="d2-set" to={{ ...route, detail: s.id }} onNavigate={navigate}>
              <span className="d2-set-head">
                <b className="d2-tone-set">{tr(s.name, lang)}</b>
                <small>
                  {t.setsTab.partial(s.items.length)} · {t.wiki.level} {maxReq(s)}
                </small>
              </span>
              <span className="d2-set-items">
                {s.items.map((it) => (
                  <span className="d2-set-item" key={it.id}>
                    <ItemIcon asset={it.img} size="sm" />
                    <small>{tr(it.name, lang)}</small>
                  </span>
                ))}
              </span>
            </RouteLink>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="d2-empty">{t.wiki.noResults}</p>}
    </>
  );
}

function SetDetail({ set, route, navigate }: { set: GameSet; route: Route; navigate: Nav }) {
  const t = useD2rCopy();
  const { lang } = useLang();
  return (
    <article className="d2-detail">
      <BackLink to={{ ...route, detail: undefined }} navigate={navigate} label={t.tabs.sets} />
      <h1 className="d2-detail-h d2-tone-set">{tr(set.name, lang)}</h1>
      <p className="d2-detail-sub">
        {t.setsTab.partial(set.items.length)} · {t.wiki.level} {maxReq(set)}
      </p>

      <h2 className="d2-h3">{t.setsTab.items}</h2>
      <div className="d2-set-pieces">
        {set.items.map((it) => {
          const base = BASE_BY_CODE.get(it.base);
          return (
            <section className="d2-set-piece" id={it.id} key={it.id}>
              <ItemIcon asset={it.img} size="md" alt={tr(it.name, lang)} />
              <ItemBox
                name={tr(it.name, lang)}
                tone="set"
                sub={tr(base?.name, lang)}
                base={baseLines(base, it.props as Prop[], lang, it.req)}
                lines={describeProps(it.props as Prop[], E, lang)}
                groups={it.bonus.map((b) => ({
                  lines: describeProps(b.props as Prop[], E, lang).map((l) => `${l} ${t.setsTab.itemBonus(b.n)}`),
                  tone: "set" as const,
                }))}
              />
            </section>
          );
        })}
      </div>

      <FarmPieces pieces={set.items.map((it) => ({ id: it.id, name: it.name }))} file={FARM} route={route} />

      <h2 className="d2-h3">{t.setsTab.setBonus}</h2>
      <ItemBox
        name={tr(set.name, lang)}
        tone="set"
        groups={[
          ...set.partial.map((p) => ({ title: t.setsTab.partial(p.n), tone: "set" as const, lines: describeProps(p.props as Prop[], E, lang) })),
          { title: t.setsTab.full, tone: "unique" as const, lines: describeProps(set.full as Prop[], E, lang) },
        ]}
      />
    </article>
  );
}
