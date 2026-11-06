/**
 * Logros de CoH3 (2026-11-05): cada logro con lo que pide y qué parte de los jugadores lo tiene (porcentaje global de
 * Steam), del más común al más raro. Tabla ordenable y buscador. Datos: `games/coh3/data/achievements.json` (lo arma
 * `games/coh3/tools/achievements.py`); íconos en `public/coh3/a/`.
 */
import { useEffect, useState } from "react";
import type { Route } from "../../route";
import { useLang, type Lang } from "../../i18n";
import { SettledImg } from "../../SettledImg";
import { LazyRows } from "../../LazyRows";
import { tr, type L10n } from "../data";
import { Coh3Loading, Panel, sortRows, useCohGame, useNum, useSort, type Nav } from "../ui";
import { GAMES, type CohGame } from "../games";
import "./more.css";

type Ach = { slug: string; name: L10n; desc: L10n; icon: string | null; hidden: boolean; pct: number | null };
type Data = { generatedAt: string; list: Ach[] };
type Mod<T> = { default: T };
// Uno por juego (2026-11-06): CoH2 también los tiene; el CoH1 relanzado no tiene logros de Steam.
const cache: Partial<Record<CohGame, Data>> = {};
const FILES: Partial<Record<CohGame, () => Promise<Mod<unknown>>>> = {
  coh3: () => import("@coh3/achievements.json") as Promise<Mod<unknown>>,
  coh2: () => import("@coh2/achievements.json") as Promise<Mod<unknown>>,
};
export const loadAchievements = (game: CohGame = "coh3"): Promise<Data> => {
  const hit = cache[game];
  const file = FILES[game];
  if (hit) return Promise.resolve(hit);
  if (!file) return Promise.resolve({ generatedAt: "", list: [] });
  return file().then((m) => (cache[game] = m.default as Data));
};

const EN = {
  k: "Achievements",
  h1: "Achievements",
  lede: (game: string) => `Every ${game} achievement, what it asks and the share of all players who have unlocked it.`,
  search: "Search achievements",
  name: "Achievement",
  pct: "Players who have it",
  hidden: "Secret",
  results: (n: string) => `${n} achievements`,
  rarest: "Rarest",
  common: "Most common",
  credit: "Unlock rates: global Steam achievement stats.",
};
const ES: typeof EN = {
  k: "Logros",
  h1: "Logros",
  lede: (game: string) => `Todos los logros de ${game}, lo que piden y qué parte de los jugadores los desbloqueó.`,
  search: "Buscar logros",
  name: "Logro",
  pct: "Jugadores que lo tienen",
  hidden: "Secreto",
  results: (n: string) => `${n} logros`,
  rarest: "Más raro",
  common: "Más común",
  credit: "Porcentajes: estadísticas globales de logros de Steam.",
};
const COPY: Record<Lang, typeof EN> = { en: EN, es: ES };
type Key = "name" | "pct";

export default function Coh3Achievements(_: { route: Route; navigate: Nav }) {
  const { lang } = useLang();
  const t = COPY[lang];
  const num = useNum();
  const game = useCohGame();
  const [d, setD] = useState<Data | null>(() => cache[game] ?? null);
  const [q, setQ] = useState("");
  const { sort, th } = useSort<Key>({ key: "pct", dir: -1 }, ["name"]);
  useEffect(() => {
    if (d) return;
    let vivo = true;
    loadAchievements(game).then((x) => vivo && setD(x), () => undefined);
    return () => {
      vivo = false;
    };
  }, [d, game]);
  if (!d) return <Coh3Loading />;
  const needle = q.trim().toLowerCase();
  const rows = d.list.filter((a) => !needle || `${tr(a.name, lang)} ${tr(a.desc, lang)} ${a.name.en}`.toLowerCase().includes(needle));
  const cols: Record<Key, (a: Ach) => string | number> = { name: (a) => tr(a.name, lang), pct: (a) => a.pct ?? -1 };
  const sorted = sortRows(rows, cols, sort);
  return (
    <main className="c3-main c3-achievements">
      <header className="c3-head">
        <div className="c3-k">{t.k}</div>
        <h1 className="c3-h1">{t.h1}</h1>
        <p className="c3-lede">{t.lede(GAMES[game].name)}</p>
        <p className="c3-note">{t.credit}</p>
      </header>
      <div className="c3-filters">
        <input type="search" value={q} placeholder={t.search} aria-label={t.search} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="c3-note">{t.results(num(rows.length))}</p>
      <Panel className="c3-tablepanel">
        <table className="c3-table is-stack">
          <thead>
            <tr>
              {th("name", t.name)}
              {th("pct", t.pct)}
            </tr>
          </thead>
          <tbody>
            {/* CoH2 tiene 452 logros: de a tandas (regla de rendimiento de CLAUDE.md). */}
            <LazyRows items={sorted} tag="tr" rowHeight={65} eager render={(a) => (
                <tr key={a.slug}>
                  <td>
                    <span className="c3-nm">
                      {a.icon ? (
                        <SettledImg className="c3-ach-img" src={`/${game}/a/${a.icon}.jpg`} alt="" width={48} height={48} />
                      ) : (
                        <span className="c3-ach-img is-empty" aria-hidden="true" />
                      )}
                      <span className="c3-nm-t">
                        <strong>
                          {tr(a.name, lang)}
                          {a.hidden && <em className="c3-chip c3-ach-hidden">{t.hidden}</em>}
                        </strong>
                        <small>{tr(a.desc, lang)}</small>
                      </span>
                    </span>
                  </td>
                  <td data-l={t.pct}>
                    {a.pct == null ? (
                      "—"
                    ) : (
                      <span className="c3-share c3-ach-pct">
                        <span className="c3-share-bar" style={{ width: `${Math.min(100, a.pct)}%` }} />
                        {num(a.pct, 1)} %
                      </span>
                    )}
                  </td>
                </tr>
            )} />
          </tbody>
        </table>
      </Panel>
    </main>
  );
}
