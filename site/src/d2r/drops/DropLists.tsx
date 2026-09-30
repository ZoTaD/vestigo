/**
 * Las tres listas de "¿Qué suelta?" (2026-09-29): runas en su orden, y únicos
 * y piezas de conjunto de más a menos probable, cada uno con su chance y un
 * enlace a su ficha de la wiki. También el selector de lugar, que comparten
 * "¿Qué suelta?" y el simulador.
 */
import { useState } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useD2rCopy } from "../../d2rCopy";
import { ItemIcon } from "../ui";
import { tr } from "../wiki";
import { dropData } from "./data";
import { odds } from "./format";
import type { DropLine, DropLists as Lists, PlaceRef } from "./places";
import { parsePlace, placeParam } from "./state";
import type { DropArea, DropSource } from "./types";

type Nav = (r: Route) => void;
/** Cuántos únicos o piezas se ven antes de "Ver todo". */
const FIRST = 24;

/** La ficha de una runa se llama como la primera palabra de su nombre ("Ber Rune" → "ber"). */
const runeId = (code: string) => dropData().bases[code].n.en.split(" ")[0].toLowerCase();

export default function DropLists({ lists, route, navigate }: { lists: Lists; route: Route; navigate: Nav }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const locale = useLocale();
  const D = dropData();
  if (!lists.runes.length && !lists.uniques.length && !lists.sets.length) return <p className="d2-empty">{td.noDrops}</p>;
  return (
    <>
      {lists.runes.length > 0 && (
        <section>
          <h2 className="d2-h3">{td.runes}</h2>
          <ul className="d2-dr-runes">
            {lists.runes.map((l) => {
              if (l.target.k !== "b") return null;
              const b = D.bases[l.target.code];
              return (
                <li key={l.target.code}>
                  <RouteLink className="d2-dr-rune" to={{ ...route, d2Section: "runes", detail: runeId(l.target.code) }} onNavigate={navigate}>
                    <ItemIcon asset={b.img} size="sm" />
                    <b>{tr(b.n, lang)}</b>
                    <small>{odds(l.p, locale, td)}</small>
                  </RouteLink>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <ItemList title={td.uniques} lines={lists.uniques} route={route} navigate={navigate} />
      <ItemList title={td.sets} lines={lists.sets} route={route} navigate={navigate} />
    </>
  );
}

function ItemList({ title, lines, route, navigate }: { title: string; lines: DropLine[]; route: Route; navigate: Nav }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const locale = useLocale();
  const [all, setAll] = useState(false);
  if (!lines.length) return null;
  const D = dropData();
  return (
    <section>
      <h2 className="d2-h3">{title}</h2>
      <ul className="d2-cards">
        {(all ? lines : lines.slice(0, FIRST)).map((l) => {
          if (l.target.k === "b") return null;
          const u = l.target.k === "u" ? D.uniqueById.get(l.target.id) : undefined;
          const s = l.target.k === "s" ? D.setById.get(l.target.id) : undefined;
          const x = u ?? s;
          if (!x) return null;
          // Los únicos que sólo salen por nombre (los de los Ancestros Colosales) no tienen ficha en la wiki.
          const to: Route | null = u ? (u.f ? null : { ...route, d2Section: "uniques", detail: u.id }) : { ...route, d2Section: "sets", detail: s!.set };
          const body = (
            <>
              <ItemIcon asset={x.img} size="sm" />
              <span className="d2-card-txt">
                <b className={u ? "d2-tone-unique" : "d2-tone-set"}>{tr(x.n, lang)}</b>
                <small>{odds(l.p, locale, td)}</small>
              </span>
            </>
          );
          return (
            <li key={x.id}>
              {to ? (
                <RouteLink className="d2-card" to={to} onNavigate={navigate}>
                  {body}
                </RouteLink>
              ) : (
                <span className="d2-card">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
      {!all && lines.length > FIRST && (
        <button type="button" className="d2-chip" onClick={() => setAll(true)}>
          {td.showAll(lines.length)}
        </button>
      )}
    </section>
  );
}

/**
 * ¿El lugar existe y tiene algo que mirar? Un jefe o un área que no existen (un enlace roto) y un área sin monstruos no:
 * el selector no los ofrece y no hay qué mostrar de ellos, así que "¿Qué suelta?" los trata como si no se hubiera elegido nada.
 */
export function isKnownPlace(place: PlaceRef | null): place is PlaceRef {
  const D = dropData();
  if (!place) return false;
  if (place.k === "s") return D.sourceById.has(place.id);
  const area = D.areaById.get(place.id);
  return !!area && (area.mon.length > 0 || area.nmon.length > 0);
}

/** El lugar: jefes y superúnicos por acto y, salvo en el simulador, las áreas de cada acto. */
export function PlaceSelect({ value, onChange, sourcesOnly = false }: { value: PlaceRef | null; onChange: (p: PlaceRef) => void; sourcesOnly?: boolean }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const D = dropData();
  const actOf = (s: DropSource) => (s.area !== null ? (D.areaById.get(s.area)?.act ?? 6) : 6);
  const sources = [...D.sources].sort((a, b) => actOf(a) - actOf(b) || tr(a.n, lang).localeCompare(tr(b.n, lang), lang));
  const cat = value?.k === "a" ? value.cat : "normal";
  // Las áreas que se ofrecen: las que tienen monstruos y, de las que se llaman igual, sólo la primera
  // (las siete tumbas de Tal Rasha son la misma para el cálculo: con una alcanza).
  const areaKey = (a: DropArea) => `${a.act}|${tr(a.n, lang)}`;
  const offered = new Map<string, DropArea>();
  if (!sourcesOnly) for (const a of D.areas) if ((a.mon.length || a.nmon.length) && !offered.has(areaKey(a))) offered.set(areaKey(a), a);
  // Lo que se ve elegido. Una tumba repetida (llega así desde "¿Dónde lo farmeo?" o de un enlace) se ve como la que se ofrece, y un
  // lugar que no existe se ve sin elegir: sin esto el selector saltaría al primer jefe de la lista y no diría lo que se está mirando.
  const area = value?.k === "a" ? D.areaById.get(value.id) : undefined;
  const twin = area && offered.get(areaKey(area));
  const shown = !isKnownPlace(value) ? "" : value.k === "s" ? placeParam(value) : twin ? placeParam({ k: "a", id: twin.id, cat }) : "";
  return (
    <label className="d2-dr-field">
      <span>{td.place}</span>
      <select
        value={shown}
        onChange={(e) => {
          const p = parsePlace(e.target.value);
          if (p) onChange(p);
        }}
      >
        <option value="" disabled>
          {/* En el simulador no hay áreas: el texto sólo habla de jefes y superúnicos, como su propio mensaje. */}
          {sourcesOnly ? td.pickSource : td.pickPlace}
        </option>
        <optgroup label={td.bossGroup}>
          {sources.map((s) => (
            <option key={s.id} value={placeParam({ k: "s", id: s.id })}>
              {tr(s.n, lang)}
            </option>
          ))}
        </optgroup>
        {!sourcesOnly &&
          [1, 2, 3, 4, 5].map((act) => (
            <optgroup key={act} label={td.areaGroup(act)}>
              {[...offered.values()]
                .filter((a) => a.act === act)
                .map((a) => (
                  <option key={a.id} value={placeParam({ k: "a", id: a.id, cat })}>
                    {tr(a.n, lang)}
                  </option>
                ))}
            </optgroup>
          ))}
      </select>
    </label>
  );
}
