/**
 * Battlegroups de CoH3 (2026-11-04): las tarjetas por facción y la ficha de cada uno con sus dos ramas, nivel por
 * nivel (las mejoras "a" y "b" de un mismo nivel se eligen una u otra), con su costo en puntos de mando, las
 * habilidades que dan (con costo y recarga) y las unidades que desbloquean.
 */
import { useEffect, useMemo, useState } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang } from "../../i18n";
import { useCoh3Copy, type Faction } from "../../coh3Copy";
import { loadFicha, loadList, peekFicha, peekList, tr, type BattlegroupRow, type L10n, type UnitRow } from "../data";
import { Coh3Loading, Cost, FactionTag, Icon, Panel, useNum, type Nav } from "../ui";
import { useExplorerCopy } from "./copy";
import { FactionFilter } from "./Coh3Units";
import "./explorer.css";

type Ability = { slug: string; name: L10n | null; icon: string | null; desc: L10n | null; cost?: { mp?: number; mu?: number; fu?: number } | null; recharge?: number | null };
type Upgrade = { slug: string; name: L10n | null; icon: string | null; desc: L10n | null; cp: number; abilities?: Ability[]; unlocks?: string[] };
interface BgFicha extends BattlegroupRow {
  image?: string | null;
  desc?: L10n | null;
  branches: { name: L10n; upgrades: Upgrade[] }[];
}

export default function Coh3Battlegroups({ route, navigate }: { route: Route; navigate: Nav }) {
  return route.detail ? <BgPage key={route.detail} slug={route.detail} route={route} navigate={navigate} /> : <BgList route={route} navigate={navigate} />;
}

function useRows<T>(tab: "battlegroups" | "units"): T[] | null {
  const [v, setV] = useState<T[] | null>(() => peekList(tab) as T[] | null);
  useEffect(() => {
    if (v) return;
    let vivo = true;
    loadList(tab).then((x) => vivo && setV(x as T[]), () => undefined);
    return () => {
      vivo = false;
    };
  }, [tab, v]);
  return v;
}

function BgList({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useExplorerCopy();
  const { lang } = useLang();
  const rows = useRows<BattlegroupRow & { image?: string | null }>("battlegroups");
  const [fac, setFac] = useState<Faction | "">("");
  if (!rows) return <Coh3Loading />;
  const shown = rows.filter((b) => !fac || b.faction === fac).sort((a, b) => a.faction.localeCompare(b.faction) || tr(a.name, lang).localeCompare(tr(b.name, lang)));
  return (
    <main className="c3-main c3-bgs">
      <header className="c3-head">
        <div className="c3-k">{t.bgs.k}</div>
        <h1 className="c3-h1">{t.bgs.h1}</h1>
        <p className="c3-lede">{t.bgs.lede}</p>
      </header>
      <div className="c3-filters">
        <FactionFilter value={fac} onChange={setFac} />
      </div>
      <ul className="c3-bggrid">
        {shown.map((b) => (
          <li key={b.slug}>
            <RouteLink className="c3-bgcard" to={{ ...route, view: "coh3", c3Section: "battlegroups", detail: b.slug }} onNavigate={navigate}>
              <Icon path={b.icon} size={64} />
              <span>
                <b>{tr(b.name, lang)}</b>
                <FactionTag f={b.faction} size={18} />
              </span>
            </RouteLink>
          </li>
        ))}
      </ul>
    </main>
  );
}

/** "airborne_left_2b_supply_drop_us" → nivel 2. Sin número, nivel 0 (va primero). */
const tierOf = (slug: string): number => Number(slug.match(/_(?:left|right|center|middle)_(\d)/)?.[1] ?? slug.match(/_(\d)[ab]?_/)?.[1] ?? 0);

function BgPage({ slug, route, navigate }: { slug: string; route: Route; navigate: Nav }) {
  const t = useExplorerCopy();
  const c = useCoh3Copy();
  const { lang } = useLang();
  const num = useNum();
  const units = useRows<UnitRow>("units");
  const byUnit = useMemo(() => new Map((units ?? []).map((u) => [u.slug, u])), [units]);
  const [b, setB] = useState<BgFicha | null | undefined>(() => peekFicha<BgFicha>("battlegroups", slug));
  useEffect(() => {
    if (b !== undefined) return;
    let vivo = true;
    loadFicha<BgFicha>("battlegroups", slug).then((x) => vivo && setB(x), () => vivo && setB(null));
    return () => {
      vivo = false;
    };
  }, [slug, b]);
  if (b === undefined) return <Coh3Loading />;
  if (b === null)
    return (
      <main className="c3-main">
        <Panel>
          <p>{c.t.notFound}</p>
        </Panel>
      </main>
    );
  return (
    <main className="c3-main c3-bg">
      <p className="c3-crumb">
        <RouteLink to={{ ...route, view: "coh3", c3Section: "battlegroups", detail: undefined }} onNavigate={navigate}>
          {t.bgs.h1}
        </RouteLink>{" "}
        › {c.factionShort[b.faction]}
      </p>
      <header className="c3-ficha-head">
        <Icon path={b.icon} size={140} lazy={false} className="c3-ficha-img" />
        <div className="c3-head">
          <FactionTag f={b.faction} size={26} short={false} />
          <h1 className="c3-h1">{tr(b.name, lang)}</h1>
          {b.desc && <p className="c3-desc">{tr(b.desc, lang)}</p>}
        </div>
      </header>
      <div className="c3-grid2 is-even">
        {b.branches.map((br, i) => {
          const tiers = new Map<number, Upgrade[]>();
          for (const u of br.upgrades) tiers.set(tierOf(u.slug), [...(tiers.get(tierOf(u.slug)) ?? []), u]);
          return (
            <Panel key={i} k={`${t.bgs.branch} ${i + 1}`} h={tr(br.name, lang)}>
              <ol className="c3-tiers">
                {[...tiers.entries()]
                  .sort((x, y) => x[0] - y[0])
                  .map(([n, ups]) => (
                    <li key={n} className="c3-tierlvl">
                      <span className="c3-tiernum">{n || "·"}</span>
                      <div className="c3-tierups">
                        {ups.map((u) => (
                          <div key={u.slug} className="c3-bgup">
                            <Icon path={u.icon} size={48} />
                            <div>
                              <b>{tr(u.name, lang)}</b> <span className="c3-cp">{t.bgs.cp(num(u.cp))}</span>
                              {u.desc && <p className="c3-dim c3-pre">{tr(u.desc, lang)}</p>}
                              {(u.abilities ?? []).map((a) => (
                                <p key={a.slug} className="c3-bgab">
                                  <Cost c={a.cost} />
                                  {a.recharge ? <small className="c3-dim"> · ↻ {num(a.recharge)} s</small> : null}
                                </p>
                              ))}
                              {(u.unlocks ?? []).length > 0 && (
                                <div className="c3-chips">
                                  <small className="c3-dim">{t.bgs.unlocks}:</small>
                                  {u.unlocks!.map((s) => {
                                    const unit = byUnit.get(s);
                                    return unit ? (
                                      <RouteLink key={s} className="c3-chip" to={{ ...route, view: "coh3", c3Section: "units", detail: s }} onNavigate={navigate}>
                                        <Icon path={unit.icon} size={24} />
                                        {tr(unit.name, lang)}
                                      </RouteLink>
                                    ) : (
                                      <span key={s} className="c3-chip">
                                        {s.replace(/_/g, " ")}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </li>
                  ))}
              </ol>
            </Panel>
          );
        })}
      </div>
    </main>
  );
}
