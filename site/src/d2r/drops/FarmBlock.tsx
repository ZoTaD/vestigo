/**
 * "Dónde farmearlo" en las fichas de la wiki (2026-09-29): los mejores jefes y
 * la mejor área para ese ítem con 1 jugador y 300% de hallazgo mágico, ya
 * calculados por `scripts/d2-drops.ts`, y un enlace a la calculadora con el
 * ítem. La ficha no carga el motor de la calculadora, pero sí sus datos ya
 * calculados: unos 10 kB gzip en la ficha de un único (4 en la de un conjunto,
 * 1 en la de una runa), más los nombres de los lugares que nombran los bloques
 * (1,4 kB gzip; sólo esos) y el código del bloque, que comparten las tres.
 */
import { useId } from "react";
import places from "@d2r/drops/computed/places.json";
import { useLang, useLocale } from "../../i18n";
import { routePath, type Route } from "../../route";
import { useD2rCopy } from "../../d2rCopy";
import type { Loc } from "../stats";
import { tr } from "../wiki";
import { parsePlaceKey, targetParam, type FarmEntry, type FarmFile, type PlaceNames } from "./farm";
import { odds } from "./format";
import type { Target } from "./types";
import "../../styles/d2r-farm.css";

const NAMES = places as unknown as PlaceNames;

/**
 * El enlace a la calculadora con el ítem elegido. Lo que esta temporada sólo cae en
 * Clasificación se calculó con Clasificación prendida, y la calculadora sólo la prende con
 * `l=1`: sin él abría en "Con estas opciones no lo suelta nadie."
 */
const calcHref = (route: Route, target: Target, ladder: boolean): string =>
  `${routePath({ ...route, d2Section: "drops", detail: undefined })}?i=${targetParam(target)}${ladder ? "&l=1" : ""}`;

export default function FarmBlock({ entry, target, route }: { entry: FarmEntry | undefined; target: Target; route: Route }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const locale = useLocale();
  const titleId = useId();
  if (!entry || (!entry.b.length && !entry.a.length)) return null;
  const ladder = !!entry.l;
  const area = entry.a.length > 0;
  return (
    <section className="d2-dr-block" aria-labelledby={titleId}>
      <h2 className="d2-h3" id={titleId}>
        {td.farmTitle}
      </h2>
      <p className="d2-dr-note">{ladder ? td.farmNoteLadder(area) : td.farmNote(area)}</p>
      <ol className="d2-dr-mini">
        {entry.b.map(([key, p]) => {
          const k = parsePlaceKey(key);
          return (
            <li key={key}>
              <b>{tr(NAMES.s[k.id], lang)}</b>
              <small>{td.diffs[k.diff]}</small>
              <span>{odds(p, locale, td)}</span>
            </li>
          );
        })}
        {entry.a.map(([key, cat, p]) => {
          // El tipo de monstruo viene con la fila (el primero que suelta el ítem, como en la calculadora): acá no se vuelve a elegir.
          const k = parsePlaceKey(key);
          return (
            <li key={key}>
              <b>{tr(NAMES.a[k.id], lang)}</b>
              <small>
                {td.bestArea} · {td.diffs[k.diff]} · {td.cats[cat]}
              </small>
              <span>{odds(p, locale, td)}</span>
            </li>
          );
        })}
      </ol>
      <a className="d2-chip" href={calcHref(route, target, ladder)}>
        {td.openCalc}
      </a>
    </section>
  );
}

/**
 * En la ficha de un conjunto: la mejor fuente de cada pieza, en una sola lista (sin área: sólo jefes).
 *
 * El aviso de Clasificación va en la nota de la lista sólo si TODAS las piezas que se muestran son de
 * Clasificación. Si son unas sí y otras no (esta temporada no hay un conjunto así), la nota queda la de
 * siempre y cada pieza de Clasificación lo dice en su fila y lleva `l=1` en su enlace.
 */
export function FarmPieces({ pieces, file, route }: { pieces: { id: string; name: Loc }[]; file: FarmFile; route: Route }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const locale = useLocale();
  const titleId = useId();
  const rows = pieces.flatMap((x) => {
    const best = file[x.id]?.b[0];
    return best ? [{ ...x, best, ladder: !!file[x.id].l }] : [];
  });
  if (!rows.length) return null;
  const allLadder = rows.every((x) => x.ladder);
  return (
    <section className="d2-dr-block" aria-labelledby={titleId}>
      <h2 className="d2-h3" id={titleId}>
        {td.farmPieces}
      </h2>
      <p className="d2-dr-note">{allLadder ? td.farmNoteLadder(false) : td.farmNote(false)}</p>
      <ol className="d2-dr-mini">
        {rows.map((x) => {
          const k = parsePlaceKey(x.best[0]);
          return (
            <li key={x.id}>
              <a className="d2-tone-set" href={calcHref(route, { k: "s", id: x.id }, x.ladder)}>
                {tr(x.name, lang)}
              </a>
              <small>
                {tr(NAMES.s[k.id], lang)} · {td.diffs[k.diff]}
                {x.ladder && !allLadder && ` · ${td.ladder}`}
              </small>
              <span>{odds(x.best[1], locale, td)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
