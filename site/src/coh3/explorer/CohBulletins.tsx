/**
 * Boletines de inteligencia de CoH2 (2026-11-06): cada boletín con lo que mejora y para qué facciones sirve, con
 * buscador y filtro por facción. Son 335: la tabla se dibuja de a tandas (`LazyRows`). Datos:
 * `games/coh2/data/bulletins.json` (`games/coh2/tools/site_data.py`).
 */
import { useEffect, useState } from "react";
import type { Route } from "../../route";
import { useLang, type Lang } from "../../i18n";
import { LazyRows } from "../../LazyRows";
import { tr, type L10n } from "../data";
import { Coh3Loading, FactionTag, Icon, Panel, sortRows, useNum, useSort, type Nav } from "../ui";
import { FactionFilter } from "./Coh3Units";
import type { Faction } from "../../coh3Copy";
import "./explorer.css";

type Boletin = { slug: string; name: L10n; faction: string; factions?: string[]; icon: string | null; desc: L10n | null };
type Data = { generatedAt: string; list: Boletin[] };
type Mod<T> = { default: T };
let cache: Data | null = null;
export const loadBulletins = (): Promise<Data> =>
  cache ? Promise.resolve(cache) : (import("@coh2/bulletins.json") as Promise<Mod<unknown>>).then((m) => (cache = m.default as Data));

const EN = {
  k: "Intel bulletins",
  h1: "Intel bulletins",
  lede: "Every intel bulletin, what it boosts and which factions can equip it.",
  search: "Search bulletins",
  name: "Bulletin",
  factions: "Factions",
  results: (n: string) => `${n} bulletins`,
};
const ES: typeof EN = {
  k: "Boletines de inteligencia",
  h1: "Boletines de inteligencia",
  lede: "Cada boletín de inteligencia, qué mejora y qué facciones lo pueden equipar.",
  search: "Buscar boletines",
  name: "Boletín",
  factions: "Facciones",
  results: (n: string) => `${n} boletines`,
};
const COPY: Record<Lang, typeof EN> = { en: EN, es: ES };
type Key = "name" | "factions";

export default function CohBulletins(_: { route: Route; navigate: Nav }) {
  const { lang } = useLang();
  const t = COPY[lang];
  const num = useNum();
  const [d, setD] = useState<Data | null>(cache);
  const [q, setQ] = useState("");
  const [fac, setFac] = useState<Faction | "">("");
  const { sort, th } = useSort<Key>({ key: "name", dir: 1 }, ["name", "factions"]);
  useEffect(() => {
    if (d) return;
    let vivo = true;
    loadBulletins().then((x) => vivo && setD(x), () => undefined);
    return () => {
      vivo = false;
    };
  }, [d]);
  if (!d) return <Coh3Loading />;
  const aguja = q.trim().toLowerCase();
  const de = (b: Boletin) => b.factions ?? [b.faction];
  const rows = d.list.filter(
    (b) => (!fac || de(b).includes(fac)) && (!aguja || `${tr(b.name, lang)} ${tr(b.desc, lang)} ${b.name.en}`.toLowerCase().includes(aguja)),
  );
  const cols: Record<Key, (b: Boletin) => string> = { name: (b) => tr(b.name, lang), factions: (b) => de(b).join(",") };
  const sorted = sortRows(rows, cols, sort);
  return (
    <main className="c3-main c3-bulletins">
      <header className="c3-head">
        <div className="c3-k">{t.k}</div>
        <h1 className="c3-h1">{t.h1}</h1>
        <p className="c3-lede">{t.lede}</p>
      </header>
      <div className="c3-filters">
        <input type="search" value={q} placeholder={t.search} aria-label={t.search} onChange={(e) => setQ(e.target.value)} />
        <FactionFilter value={fac} onChange={setFac} />
      </div>
      <p className="c3-note">{t.results(num(rows.length))}</p>
      <Panel className="c3-tablepanel">
        <table className="c3-table is-stack">
          <thead>
            <tr>
              {th("name", t.name)}
              {th("factions", t.factions)}
            </tr>
          </thead>
          <tbody>
            <LazyRows
              items={sorted}
              tag="tr"
              rowHeight={65}
              eager
              render={(b) => (
                <tr key={b.slug}>
                  <td>
                    <span className="c3-nm">
                      <Icon path={b.icon} size={48} />
                      <span className="c3-nm-t">
                        <strong>{tr(b.name, lang)}</strong>
                        {b.desc && <small>{tr(b.desc, lang)}</small>}
                      </span>
                    </span>
                  </td>
                  <td data-l={t.factions}>
                    <span className="c3-facs-in">
                      {de(b).map((f) => (
                        <FactionTag key={f} f={f} size={18} name={false} />
                      ))}
                    </span>
                  </td>
                </tr>
              )}
            />
          </tbody>
        </table>
      </Panel>
    </main>
  );
}
