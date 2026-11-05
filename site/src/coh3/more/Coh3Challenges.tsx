/**
 * Desafíos de CoH3 (2026-11-04): los diarios y semanales que puede tocar, con lo que piden y los méritos que dan.
 * Tabla ordenable y buscador; los nombres y textos vienen traducidos del juego.
 */
import { useEffect, useState } from "react";
import type { Route } from "../../route";
import { useLang } from "../../i18n";
import { tr, type L10n } from "../data";
import { Coh3Loading, Panel, sortRows, useNum, useSort, type Nav } from "../ui";
import { useMoreCopy } from "./copy";
import "./more.css";

type Ch = { slug: string; name: L10n; desc: L10n | null; count: number; merits: number };
type Data = { daily: Ch[]; weekly: Ch[] };
type Mod<T> = { default: T };
let cache: Data | null = null;
export const loadChallenges = (): Promise<Data> => (cache ? Promise.resolve(cache) : (import("@coh3/challenges.json") as Promise<Mod<unknown>>).then((m) => (cache = m.default as Data)));

type Key = "name" | "count" | "merits";

export default function Coh3Challenges(_: { route: Route; navigate: Nav }) {
  const t = useMoreCopy();
  const { lang } = useLang();
  const num = useNum();
  const [d, setD] = useState<Data | null>(cache);
  const [kind, setKind] = useState<"daily" | "weekly">("daily");
  const [q, setQ] = useState("");
  const { sort, th } = useSort<Key>({ key: "merits", dir: -1 }, ["name"]);
  useEffect(() => {
    if (d) return;
    let vivo = true;
    loadChallenges().then((x) => vivo && setD(x), () => undefined);
    return () => {
      vivo = false;
    };
  }, [d]);
  if (!d) return <Coh3Loading />;
  const needle = q.trim().toLowerCase();
  const rows = d[kind].filter((c) => !needle || `${tr(c.name, lang)} ${tr(c.desc, lang)}`.toLowerCase().includes(needle));
  const cols: Record<Key, (c: Ch) => string | number> = { name: (c) => tr(c.name, lang), count: (c) => c.count, merits: (c) => c.merits };
  return (
    <main className="c3-main c3-challenges">
      <header className="c3-head">
        <div className="c3-k">{t.ch.k}</div>
        <h1 className="c3-h1">{t.ch.h1}</h1>
        <p className="c3-lede">{t.ch.lede}</p>
      </header>
      <div className="c3-filters">
        <div className="c3-seg" role="group">
          <button type="button" aria-pressed={kind === "daily"} onClick={() => setKind("daily")}>
            {t.ch.daily} ({num(d.daily.length)})
          </button>
          <button type="button" aria-pressed={kind === "weekly"} onClick={() => setKind("weekly")}>
            {t.ch.weekly} ({num(d.weekly.length)})
          </button>
        </div>
        <input type="search" value={q} placeholder={t.ch.search} aria-label={t.ch.search} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Panel className="c3-tablepanel">
        <table className="c3-table is-stack">
          <thead>
            <tr>
              {th("name", t.ch.name)}
              {th("count", t.ch.count)}
              {th("merits", t.ch.merits)}
            </tr>
          </thead>
          <tbody>
            {sortRows(rows, cols, sort).map((c) => (
              <tr key={c.slug}>
                <td>
                  <span className="c3-nm-t">
                    <strong>{tr(c.name, lang)}</strong>
                    <small>{tr(c.desc, lang)}</small>
                  </span>
                </td>
                <td data-l={t.ch.count}>{num(c.count)}</td>
                <td data-l={t.ch.merits}>
                  <b className="c3-merit">{num(c.merits)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </main>
  );
}
