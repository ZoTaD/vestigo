/**
 * Palabras rúnicas (2026-09-29): la lista completa con la calculadora "¿Qué
 * puedo armar?" arriba, y la ficha de cada una (`/d2r/runewords/enigma`).
 *
 * Una palabra rúnica da lo suyo más lo que da cada runa en el lugar donde se
 * engarza (arma, yelmo o armadura, escudo): por eso la ficha muestra una
 * variante por lugar. Espíritu en una espada y en un escudo no dan lo mismo.
 */
import { useMemo, useState } from "react";
import runesJson from "@d2r/wiki/runes.json";
import runewordsJson from "@d2r/wiki/runewords.json";
import { useLang, useLocale } from "../i18n";
import RouteLink from "../RouteLink";
import type { Route } from "../route";
import { useD2rCopy } from "../d2rCopy";
import { describe, toStats, type Lang, type Prop } from "./stats";
import { BASES, E, RUNE_SLOT_NAMES, TYPES, gameStr, tr, typeChain, type Rune, type Runeword } from "./wiki";
import { BackLink, Chips, D2Head, ItemBox, ItemIcon, SearchBox, fold } from "./ui";
import { runeShort } from "./runes";

const RUNES = runesJson as unknown as Rune[];
const RUNEWORDS = (runewordsJson as unknown as Runeword[]).slice().sort((a, b) => a.lvl - b.lvl || a.name.en.localeCompare(b.name.en));
const RUNE_BY_CODE = new Map(RUNES.map((r) => [r.code, r]));
type Nav = (r: Route) => void;

/** Las stats de una palabra rúnica engarzada en un lugar (0 arma, 1 yelmo o armadura, 2 escudo). */
export function runewordLines(rw: Runeword, slot: 0 | 1 | 2, lang: Lang): string[] {
  const props: Prop[] = [...(rw.props as Prop[])];
  for (const code of rw.runes) props.push(...((RUNE_BY_CODE.get(code)?.mods[RUNE_SLOT_NAMES[slot]] ?? []) as Prop[]));
  return describe(toStats(props, E), E, lang).map((l) => l.text);
}

/** Las stats de una palabra rúnica como props, para el planificador. */
export function runewordProps(rw: Runeword, slot: 0 | 1 | 2): Prop[] {
  const props: Prop[] = [...(rw.props as Prop[])];
  for (const code of rw.runes) props.push(...((RUNE_BY_CODE.get(code)?.mods[RUNE_SLOT_NAMES[slot]] ?? []) as Prop[]));
  return props;
}

/** Los nombres de los tipos donde entra ("Espadas, Escudos"). */
const typesText = (rw: Runeword, lang: Lang) => rw.types.map((ty) => tr(TYPES[ty]?.name, lang) || ty).join(", ");

/** Cuántas runas le faltan a alguien que tiene `owned` (con repeticiones: Infinito pide dos Ber). */
function missingRunes(rw: Runeword, owned: Record<string, number>): number {
  const need: Record<string, number> = {};
  for (const c of rw.runes) need[c] = (need[c] ?? 0) + 1;
  return Object.entries(need).reduce((n, [c, k]) => n + Math.max(0, k - (owned[c] ?? 0)), 0);
}

export default function D2rRunewords({ route, navigate }: { route: Route; navigate: Nav }) {
  const rw = route.detail ? RUNEWORDS.find((r) => r.id === route.detail) : undefined;
  if (route.detail && rw) return <RunewordDetail rw={rw} route={route} navigate={navigate} />;
  return <RunewordList route={route} navigate={navigate} missing={!!route.detail} />;
}

function RunewordList({ route, navigate, missing }: { route: Route; navigate: Nav; missing: boolean }) {
  const t = useD2rCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [sockets, setSockets] = useState(0);
  const [kind, setKind] = useState<"all" | "0" | "1" | "2">("all");
  const [onlyNew, setOnlyNew] = useState(false);
  const [owned, setOwned] = useState<Record<string, number>>({});
  const [onlyMakeable, setOnlyMakeable] = useState(false);
  const hasOwned = Object.values(owned).some((n) => n > 0);

  // Tocar una runa: 0 → 1 → 2 → 0 (dos, para las que se repiten, como Ber en Infinito).
  const cycle = (code: string) => setOwned((o) => ({ ...o, [code]: ((o[code] ?? 0) + 1) % 3 }));

  const rows = useMemo(() => {
    const needle = fold(q.trim());
    let list = RUNEWORDS.filter(
      (r) =>
        (!needle || fold(r.name.en).includes(needle) || fold(r.name.es).includes(needle)) &&
        (!sockets || r.runes.length === sockets) &&
        (kind === "all" || r.slots.includes(Number(kind) as 0 | 1 | 2)) &&
        (!onlyNew || r.rotw),
    ).map((r) => ({ r, miss: hasOwned ? missingRunes(r, owned) : null }));
    if (hasOwned) {
      if (onlyMakeable) list = list.filter((x) => x.miss === 0);
      list = list.slice().sort((a, b) => (a.miss ?? 0) - (b.miss ?? 0) || a.r.lvl - b.r.lvl);
    }
    return list;
  }, [q, sockets, kind, onlyNew, owned, onlyMakeable, hasOwned]);

  return (
    <>
      <D2Head as="h1" title={t.tabs.runewords} lede={t.rwTab.lede(RUNEWORDS.length.toLocaleString(locale))} />

      <section className="d2-calc" aria-labelledby="d2-calc-h">
        <h2 id="d2-calc-h" className="d2-calc-h">
          {t.rwTab.calc}
        </h2>
        <p className="d2-calc-hint">{t.rwTab.calcHint}</p>
        <div className="d2-calc-runes">
          {RUNES.map((r) => {
            const n = owned[r.code] ?? 0;
            return (
              <button type="button" key={r.code} className={`d2-calc-rune${n ? " is-on" : ""}`} aria-pressed={n > 0} onClick={() => cycle(r.code)} title={tr(r.name, lang)}>
                <ItemIcon asset={r.img} size="sm" />
                <span>{runeShort(r)}</span>
                {n > 1 && <b className="d2-calc-n">×{n}</b>}
              </button>
            );
          })}
        </div>
        {hasOwned && (
          <div className="d2-calc-bar">
            <label className="d2-check">
              <input type="checkbox" checked={onlyMakeable} onChange={(e) => setOnlyMakeable(e.target.checked)} /> {t.rwTab.onlyMakeable}
            </label>
            <button type="button" className="d2-chip" onClick={() => setOwned({})}>
              {t.rwTab.clear}
            </button>
          </div>
        )}
      </section>

      <div className="d2-filters">
        <SearchBox value={q} onChange={setQ} placeholder={t.wiki.search} />
        <Chips
          label={t.rwTab.sockets}
          value={sockets}
          onChange={setSockets}
          options={[{ value: 0, label: t.wiki.all }, ...[2, 3, 4, 5, 6].map((n) => ({ value: n, label: t.wiki.sockets(n) }))]}
        />
        <Chips
          label={t.tabs.runewords}
          value={kind}
          onChange={setKind}
          options={(["all", "0", "1", "2"] as const).map((k) => ({ value: k, label: t.rwTab.kind[k] }))}
        />
        <label className="d2-check">
          <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} /> {t.rwTab.onlyNew}
        </label>
      </div>
      {missing && <p className="d2-empty">{t.wiki.notFound}</p>}
      <p className="d2-count">{t.wiki.count(rows.length.toLocaleString(locale))}</p>

      <ul className="d2-rw-list">
        {rows.map(({ r, miss }) => (
          <li key={r.id}>
            <RouteLink className={`d2-rw${miss === 0 ? " is-make" : ""}`} to={{ ...route, detail: r.id }} onNavigate={navigate}>
              <span className="d2-rw-main">
                <b className="d2-tone-unique">{tr(r.name, lang)}</b>
                <small>
                  {typesText(r, lang)} · {t.wiki.sockets(r.runes.length)}
                </small>
                <span className="d2-rw-badges">
                  {r.rotw && <em className="d2-badge is-new">{t.wiki.newRotw}</em>}
                  {r.ladder && !r.ladderEnd && <em className="d2-badge">{t.wiki.ladderOnly}</em>}
                  {miss !== null && <em className={`d2-badge${miss === 0 ? " is-ok" : ""}`}>{miss === 0 ? t.rwTab.canMake : t.rwTab.missing(miss)}</em>}
                </span>
              </span>
              <span className="d2-rw-runes">
                {r.runes.map((c, i) => {
                  const rune = RUNE_BY_CODE.get(c);
                  return (
                    <span className={`d2-rw-rune${hasOwned && !(owned[c] ?? 0) ? " is-miss" : ""}`} key={i}>
                      <ItemIcon asset={rune?.img} size="sm" />
                      <small>{rune ? runeShort(rune) : c}</small>
                    </span>
                  );
                })}
              </span>
              <span className="d2-rw-lvl">
                <small>{t.wiki.level}</small>
                <b>{r.lvl}</b>
              </span>
            </RouteLink>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="d2-empty">{t.wiki.noResults}</p>}
    </>
  );
}

function RunewordDetail({ rw, route, navigate }: { rw: Runeword; route: Route; navigate: Nav }) {
  const t = useD2rCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const reqLevel = gameStr("ItemStats1p", lang).replace("%d", String(rw.lvl));
  // Las bases que la aceptan, agrupadas por nombre de tipo, para "Entra en".
  const fits = BASES.filter(
    (b) => b.kind !== "misc" && b.spawnable && b.sockets >= rw.runes.length && rw.types.some((ty) => typeChain(b.type, b.type2).includes(ty)) && !rw.exclude.some((ty) => typeChain(b.type, b.type2).includes(ty)),
  );
  return (
    <article className="d2-detail">
      <BackLink to={{ ...route, detail: undefined }} navigate={navigate} label={t.tabs.runewords} />
      <h1 className="d2-detail-h d2-tone-unique">{tr(rw.name, lang)}</h1>
      <p className="d2-detail-sub">
        {typesText(rw, lang)} · {t.wiki.sockets(rw.runes.length)} · {reqLevel}
        {rw.rotw && <em className="d2-badge is-new">{t.wiki.newRotw}</em>}
        {rw.ladder && !rw.ladderEnd && <em className="d2-badge">{t.wiki.ladderOnly}</em>}
      </p>

      <h2 className="d2-h3">{t.rwTab.order}</h2>
      <ol className="d2-rw-order">
        {rw.runes.map((c, i) => {
          const rune = RUNE_BY_CODE.get(c);
          return (
            <li key={i}>
              {rune ? (
                <RouteLink to={{ ...route, d2Section: "runes", detail: rune.id }} onNavigate={navigate}>
                  <ItemIcon asset={rune.img} size="md" />
                  <b className="d2-tone-rune">{tr(rune.name, lang)}</b>
                  <small>{rune.lvl}</small>
                </RouteLink>
              ) : (
                c
              )}
            </li>
          );
        })}
      </ol>

      <div className="d2-variants">
        {rw.slots.map((slot) => (
          <div key={slot}>
            {rw.slots.length > 1 && <h2 className="d2-h3">{t.rwTab.variant[slot]}</h2>}
            <ItemBox
              name={tr(rw.name, lang)}
              tone="unique"
              sub={`'${rw.runes.map((c) => (RUNE_BY_CODE.get(c) ? runeShort(RUNE_BY_CODE.get(c)!) : c)).join("")}'`}
              base={[reqLevel]}
              lines={runewordLines(rw, slot, lang)}
            />
          </div>
        ))}
      </div>

      <h2 className="d2-h3">
        {t.rwTab.fitsIn} · {t.rwTab.bases(fits.length.toLocaleString(locale))}
      </h2>
      <ul className="d2-base-chips">
        {fits
          .slice()
          .sort((a, b) => a.req.lvl - b.req.lvl)
          .map((b) => (
            <li key={b.code}>
              <ItemIcon asset={b.img} size="sm" />
              <span>
                {tr(b.name, lang)}
                <small>{b.tier === "e" ? "E" : b.tier === "x" ? "X" : "N"}</small>
              </span>
            </li>
          ))}
      </ul>
    </article>
  );
}
