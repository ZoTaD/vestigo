/**
 * La ficha de un jefe o superúnico (2026-09-29, `/d2r/drops/mephisto`): todo lo
 * que puede soltar en cada dificultad, con su chance por muerte. Sale
 * prerenderizada en Infierno con 1 jugador y 300% de hallazgo mágico, y esas
 * listas quedan también escritas como datos (ver `island.ts`): el navegador
 * arranca con ellas sin recalcular. Al cambiar algo se recalcula ahí.
 */
import { useDeferredValue, useMemo, useState } from "react";
import { useLang } from "../../i18n";
import { routePath, type Route } from "../../route";
import { useD2rCopy } from "../../d2rCopy";
import { SEASON } from "../season";
import { BackLink, Chips } from "../ui";
import { tr } from "../wiki";
import { Busy, usePainted } from "./Busy";
import { dropData } from "./data";
import DropLists from "./DropLists";
import { ISLAND_ID, islandText, readIsland } from "./island";
import NumField from "./NumField";
import { dropsOf, NO_TZ, sourceKill } from "./places";
import { DEFAULT_STATE } from "./state";
import type { Diff, DropSource } from "./types";

/** Con lo que abre la ficha, y con lo que el prerender escribe su isla: Infierno y el hallazgo mágico y los jugadores de siempre. */
const START = { diff: 2 as Diff, mf: DEFAULT_STATE.mf, players: DEFAULT_STATE.players };

/**
 * El enlace a la calculadora o al simulador con este jefe. Lleva la dificultad de la ficha siempre y el hallazgo mágico y los
 * jugadores sólo si no son los de siempre (como en la dirección de la calculadora, que no repite lo que es el valor por defecto):
 * así quien cambió algo acá lo encuentra igual allá, y con los valores de siempre la dirección queda corta.
 */
export function calcHref(calc: string, mode: "sim" | "drops", id: string, diff: Diff, mf: number, players: number): string {
  const extra = `${mf !== DEFAULT_STATE.mf ? `&mf=${mf}` : ""}${players !== DEFAULT_STATE.players ? `&p=${players}` : ""}`;
  return `${calc}?m=${mode}&src=s.${id}&pd=${diff}${extra}`;
}

export default function SourcePage({ src, route, navigate }: { src: DropSource; route: Route; navigate: (r: Route) => void }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const [diff, setDiff] = useState<Diff>(START.diff);
  const [mf, setMf] = useState(START.mf);
  const [players, setPlayers] = useState(START.players);
  // Las listas de arranque que dejó el prerender. Se leen una sola vez, en el primer render del navegador, que es cuando el HTML
  // prerenderizado todavía está en el documento: al abrir la ficha no se calcula nada (en un celular eran de medio segundo a uno).
  const [island] = useState(() => readIsland(src.id));
  const painted = usePainted();
  // Los controles responden al toque y las listas van una vuelta atrás: `dropsOf` tarda hasta ~220 ms en un jefe de Infierno y,
  // calculado en el mismo render, cada tecla del hallazgo mágico esperaba a que terminara. Cada valor por separado: son números,
  // y uno compuesto sería un objeto nuevo en cada vuelta.
  const listedDiff = useDeferredValue(diff);
  const listedMf = useDeferredValue(mf);
  const listedPlayers = useDeferredValue(players);
  const D = dropData();
  const kill = useMemo(() => sourceKill(D, src, listedDiff, NO_TZ), [D, src, listedDiff]);
  const atStart = listedDiff === START.diff && listedMf === START.mf && listedPlayers === START.players;
  // null: acá no suelta nada. undefined: todavía sin calcular, en el navegador sin isla (se llegó navegando desde otra página):
  // la cuenta va después del primer pintado, así la ficha aparece enseguida con "calculando…".
  const lists = useMemo(() => {
    if (!kill) return null;
    if (atStart && island) return island;
    if (!painted) return undefined;
    return dropsOf(D, kill, { mf: listedMf, players: listedPlayers, party: 1, ladder: false, season: SEASON });
  }, [D, kill, listedMf, listedPlayers, atStart, island, painted]);
  const busy = lists === undefined || diff !== listedDiff || mf !== listedMf || players !== listedPlayers;
  const area = src.area !== null ? D.areaById.get(src.area) : undefined;
  const name = tr(src.n, lang);
  const calc = routePath({ ...route, detail: undefined });
  const sub = [src.kind === "boss" ? td.kindBoss : td.kindSuper, area ? `${tr(area.n, lang)} · ${td.act(area.act)}` : null, kill ? td.level(kill.mlvl) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <article className="d2-detail d2-dr-src">
      <BackLink to={{ ...route, detail: undefined }} navigate={navigate} label={td.back} />
      <h1 className="d2-detail-h">{td.sourceTitle(name)}</h1>
      <p className="d2-detail-sub">{sub}</p>
      <p className="d2-dr-note">{td.sourceLede(name)}</p>
      <div className="d2-dr-controls">
        <Chips<number> label={td.diff} value={diff} onChange={(d) => setDiff(d as Diff)} options={td.diffs.map((label, i) => ({ value: i, label }))} />
        <NumField label={td.mf} value={mf} min={0} max={9999} onChange={setMf} />
        <label className="d2-dr-field">
          <span>{td.players}</span>
          <select value={players} onChange={(e) => setPlayers(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Busy busy={busy}>{lists === undefined ? null : lists ? <DropLists lists={lists} route={route} navigate={navigate} /> : <p className="d2-empty">{td.noDrops}</p>}</Busy>
      {/* Sólo en el prerender: las listas de arranque, como datos para el primer render del navegador (ver island.ts). */}
      {typeof window === "undefined" && atStart && lists && (
        <script type="application/json" id={ISLAND_ID} data-key={src.id} dangerouslySetInnerHTML={{ __html: islandText(lists) }} />
      )}
      <p className="d2-dr-links">
        <a className="d2-chip" href={calcHref(calc, "sim", src.id, diff, mf, players)}>
          {td.openSim}
        </a>
        <a className="d2-chip" href={calcHref(calc, "drops", src.id, diff, mf, players)}>
          {td.openCalc}
        </a>
      </p>
    </article>
  );
}
