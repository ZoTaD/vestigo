/**
 * Final Stand de CoH3 (2026-11-04): el modo de oleadas. Por facción, las mejoras permanentes (perks) por nivel con el
 * costo de cada grado, y las tecnologías de la partida (unidades, habilidades y pasivas) con su costo en puntos.
 * Filtrable por categoría y con buscador.
 */
import { useEffect, useState } from "react";
import type { Route } from "../../route";
import { useLang } from "../../i18n";
import { FACTIONS, type Faction } from "../../coh3Copy";
import { tr, type L10n } from "../data";
import { Coh3Loading, FactionTag, Icon, Panel, useNum, type Nav } from "../ui";
import { useMoreCopy } from "./copy";
import "./more.css";
import "../explorer/explorer.css";

type Perk = { tier: number; unlock: number; slug: string; name: L10n; desc: L10n | null; icon: string | null; levels: { cost: number }[] };
type Tech = { slug: string; name: L10n; desc: L10n | null; icon: string | null; category: string | null; cp: number };
type Data = Record<Faction, { name: L10n; perks: Perk[]; technologies: Tech[] }>;
type Mod<T> = { default: T };
let cache: Data | null = null;
export const loadFinalStand = (): Promise<Data> => (cache ? Promise.resolve(cache) : (import("@coh3/finalstand.json") as Promise<Mod<unknown>>).then((m) => (cache = m.default as Data)));

export default function Coh3FinalStand(_: { route: Route; navigate: Nav }) {
  const t = useMoreCopy();
  const { lang } = useLang();
  const num = useNum();
  const [d, setD] = useState<Data | null>(cache);
  const [fac, setFac] = useState<Faction>("american");
  const [cat, setCat] = useState("");
  useEffect(() => {
    if (d) return;
    let vivo = true;
    loadFinalStand().then((x) => vivo && setD(x), () => undefined);
    return () => {
      vivo = false;
    };
  }, [d]);
  if (!d) return <Coh3Loading />;
  const f = d[fac];
  const tiers = [...new Set(f.perks.map((p) => p.tier))].sort((a, b) => a - b);
  const cats = [...new Set(f.technologies.map((x) => x.category).filter(Boolean) as string[])];
  const techs = f.technologies.filter((x) => !cat || x.category === cat).sort((a, b) => a.cp - b.cp || tr(a.name, lang).localeCompare(tr(b.name, lang)));
  return (
    <main className="c3-main c3-fs">
      <header className="c3-head">
        <div className="c3-k">{t.fs.k}</div>
        <h1 className="c3-h1">{t.fs.h1}</h1>
        <p className="c3-lede">{t.fs.lede}</p>
      </header>
      <div className="c3-filters">
        <div className="c3-seg" role="group">
          {FACTIONS.filter((x) => d[x]).map((x) => (
            <button key={x} type="button" aria-pressed={fac === x} onClick={() => setFac(x)}>
              <FactionTag f={x} size={20} />
            </button>
          ))}
        </div>
      </div>
      <Panel k={t.fs.perks} lede={t.fs.perksLede}>
        <div className="c3-fs-tiers">
          {tiers.map((n) => (
            <section key={n}>
              <h3 className="c3-h3">{t.fs.tier(n)}</h3>
              <ul className="c3-upgs">
                {f.perks
                  .filter((p) => p.tier === n)
                  .map((p) => (
                    <li key={p.slug}>
                      <Icon path={p.icon} size={40} />
                      <span>
                        <b>{tr(p.name, lang)}</b>
                        {p.desc && <small className="c3-dim">{tr(p.desc, lang)}</small>}
                        {p.unlock > 0 && <small className="c3-dim">{t.fs.unlock(num(p.unlock))}</small>}
                      </span>
                      <span className="c3-fs-levels" title={t.fs.levelsHint}>
                        {p.levels.map((l, i) => (
                          <i key={i}>{num(l.cost)}</i>
                        ))}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </Panel>
      <Panel k={t.fs.techs} lede={t.fs.techsLede}>
        <div className="c3-seg" role="group" style={{ marginBottom: 12 }}>
          <button type="button" aria-pressed={!cat} onClick={() => setCat("")}>
            {t.all}
          </button>
          {cats.map((k) => (
            <button key={k} type="button" aria-pressed={cat === k} onClick={() => setCat(k)}>
              {t.fs.cats[k] ?? k}
            </button>
          ))}
        </div>
        <ul className="c3-fs-techs">
          {techs.map((x) => (
            <li key={x.slug}>
              <Icon path={x.icon} size={48} />
              <span>
                <b>{tr(x.name, lang)}</b>
                {x.desc && <small className="c3-dim">{tr(x.desc, lang)}</small>}
              </span>
              <span className="c3-cp">{t.fs.cp(num(x.cp))}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </main>
  );
}
