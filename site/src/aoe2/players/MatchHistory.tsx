/**
 * El historial de partidas del perfil de AoE2 (2026-11-20): filtros (modo, civ, mapa, resultado) y una fila por
 * partida con resultado, fecha, modo, mapa, duración, las civs de los dos lados y el ELO de antes y después. De a 50
 * con "Ver 50 más". Cada fila lleva a la ficha de la partida (`/aoe2/matches/<id>?p=<perfil>`).
 */
import { useMemo, useState } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang, useLocale } from "../../i18n";
import { useAoe2Copy } from "../../aoe2Copy";
import { CivShield, Panel, civById, type Nav } from "../ui";
import type { Aoe2Match, MatchMode } from "../api/wel";
import { filterHistory, type HistoryFilter } from "./history";
import { mapName } from "./mapName";
import OpeningTag from "./OpeningTag";
import { tieneApertura } from "./useOpening";


const PASO = 50;

export function useModeName() {
  const t = useAoe2Copy();
  return (m: MatchMode): string => (m === "custom" ? t.hist.custom : m === "co" ? t.hist.co : m === "other" ? t.hist.otherMode : t.modes[m]);
}

export default function MatchHistory({ matches, id, route, navigate }: { matches: Aoe2Match[]; id: number; route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  const { lang } = useLang();
  const locale = useLocale();
  const modo = useModeName();
  const [f, setF] = useState<HistoryFilter>({});
  const [n, setN] = useState(PASO);
  const lista = useMemo(() => filterHistory(matches, id, f), [matches, id, f]);
  const modos = [...new Set(matches.map((m) => m.mode))];
  const civs = [...new Set(matches.map((m) => m.players.find((p) => p.profileId === id)?.civ).filter((c): c is number => c != null))];
  const mapas = [...new Set(matches.map((m) => m.map))].sort();
  const set = (k: keyof HistoryFilter, v: string) => {
    setN(PASO);
    setF((x) => ({ ...x, [k]: v === "" ? undefined : k === "civ" ? Number(v) : v }));
  };

  return (
    <Panel h={t.hist.h} sub={t.hist.sub(matches.length)}>
      <div className="a2-filters">
        <select value={f.mode ?? ""} onChange={(e) => set("mode", e.target.value)} aria-label={t.match.facts.mode}>
          <option value="">{t.hist.all}</option>
          {modos.map((m) => (
            <option key={m} value={m}>
              {modo(m)}
            </option>
          ))}
        </select>
        <select value={f.civ ?? ""} onChange={(e) => set("civ", e.target.value)} aria-label={t.pl.cols.civ}>
          <option value="">{t.hist.anyCiv}</option>
          {civs.map((c) => (
            <option key={c} value={c}>
              {civById(c)?.name[lang] ?? `#${c}`}
            </option>
          ))}
        </select>
        <select value={f.map ?? ""} onChange={(e) => set("map", e.target.value)} aria-label={t.match.facts.map}>
          <option value="">{t.hist.anyMap}</option>
          {mapas.map((m) => (
            <option key={m} value={m}>
              {mapName(m)}
            </option>
          ))}
        </select>
        <select value={f.result ?? ""} onChange={(e) => set("result", e.target.value)} aria-label={t.hist.anyResult}>
          <option value="">{t.hist.anyResult}</option>
          <option value="win">{t.hist.win}</option>
          <option value="loss">{t.hist.loss}</option>
        </select>
      </div>
      {!lista.length ? (
        <p className="a2-note">{t.hist.empty}</p>
      ) : (
        <ul className="a2-hist">
          {lista.slice(0, n).map((m) => {
            const yo = m.players.find((p) => p.profileId === id);
            const lado = (mio: boolean) => m.players.filter((p) => (yo ? (p.team === yo.team) === mio : mio ? p.team === 0 : p.team !== 0));
            const delta = yo?.oldElo != null && yo.newElo != null ? yo.newElo - yo.oldElo : null;
            return (
              <li key={m.id} className={`is-${yo?.result ?? "other"}`}>
                <RouteLink to={{ ...route, view: "aoe2", a2Section: "matches", detail: `${m.id}?p=${id}` }} onNavigate={navigate}>
                  <span className="a2-hist-res">{yo?.result === "win" ? t.pl.formWin : yo?.result === "loss" ? t.pl.formLoss : t.pl.formOther}</span>
                  <span className="a2-hist-what">
                    <b>{mapName(m.map)}</b>
                    <small>
                      {modo(m.mode)} · {new Date(m.start * 1000).toLocaleDateString(locale, { day: "numeric", month: "short" })} · {t.hist.min(m.end - m.start)}
                    </small>
                    {tieneApertura(m) && <OpeningTag match={m.id} owner={id} player={id} />}
                  </span>
                  <span className="a2-hist-civs">
                    {lado(true).map((p) => (
                      <CivShield key={p.profileId} civ={civById(p.civ)} size={26} />
                    ))}
                    <i>vs</i>
                    {lado(false).map((p) => (
                      <CivShield key={p.profileId} civ={civById(p.civ)} size={26} />
                    ))}
                  </span>
                  <span className="a2-hist-elo">
                    {yo?.newElo ?? "–"}
                    {delta != null && <small className={delta > 0 ? "a2-up" : delta < 0 ? "a2-down" : undefined}>{delta > 0 ? `+${delta}` : delta}</small>}
                  </span>
                </RouteLink>
              </li>
            );
          })}
        </ul>
      )}
      {lista.length > n && (
        <button type="button" className="a2-btn a2-more" onClick={() => setN((x) => x + PASO)}>
          {t.hist.more}
        </button>
      )}
    </Panel>
  );
}
