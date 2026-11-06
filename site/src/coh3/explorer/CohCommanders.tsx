/**
 * Comandantes de CoH2 (2026-11-06): las tarjetas por facción y la ficha de cada uno, con sus cinco habilidades y la
 * unidad que habilita cada una (si trae una). Datos: `games/coh2/data/commanders/` (`games/coh2/tools/site_data.py`).
 */
import { useEffect, useState } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang, type Lang } from "../../i18n";
import { loadFicha, loadList, peekFicha, peekList, tr, type BattlegroupRow, type L10n, type UnitRow } from "../data";
import { Coh3Loading, FactionTag, Icon, Panel, useCohGame, type Nav } from "../ui";
import { FactionFilter } from "./Coh3Units";
import type { Faction } from "../../coh3Copy";
import "./explorer.css";

type Habilidad = { slug: string; name: L10n; icon: string | null; desc: L10n | null; unit: string | null };
interface CommanderFicha extends BattlegroupRow {
  desc: L10n | null;
  short: L10n | null;
  abilities: Habilidad[];
}

const EN = {
  k: "Commanders",
  h1: "Commanders",
  lede: "Every commander of each faction with its five abilities and the units they unlock.",
  abilities: "Abilities",
  unit: "Unlocks",
  back: "All commanders",
  notFound: "That commander doesn't exist.",
};
const ES: typeof EN = {
  k: "Comandantes",
  h1: "Comandantes",
  lede: "Cada comandante de cada facción con sus cinco habilidades y las unidades que habilitan.",
  abilities: "Habilidades",
  unit: "Habilita",
  back: "Todos los comandantes",
  notFound: "Ese comandante no existe.",
};
const COPY: Record<Lang, typeof EN> = { en: EN, es: ES };

export default function CohCommanders({ route, navigate }: { route: Route; navigate: Nav }) {
  return route.detail ? <Ficha key={route.detail} slug={route.detail} route={route} navigate={navigate} /> : <Lista route={route} navigate={navigate} />;
}

function useRows<T>(tab: "commanders" | "units"): T[] | null {
  const game = useCohGame();
  const [v, setV] = useState<T[] | null>(() => peekList(tab, game) as T[] | null);
  useEffect(() => {
    if (v) return;
    let vivo = true;
    loadList(tab, game).then((x) => vivo && setV(x as T[]), () => undefined);
    return () => {
      vivo = false;
    };
  }, [tab, v, game]);
  return v;
}

function Lista({ route, navigate }: { route: Route; navigate: Nav }) {
  const { lang } = useLang();
  const t = COPY[lang];
  const rows = useRows<BattlegroupRow>("commanders");
  const [fac, setFac] = useState<Faction | "">("");
  if (!rows) return <Coh3Loading />;
  const shown = rows.filter((c) => !fac || c.faction === fac).sort((a, b) => a.faction.localeCompare(b.faction) || tr(a.name, lang).localeCompare(tr(b.name, lang)));
  return (
    <main className="c3-main c3-bgs">
      <header className="c3-head">
        <div className="c3-k">{t.k}</div>
        <h1 className="c3-h1">{t.h1}</h1>
        <p className="c3-lede">{t.lede}</p>
      </header>
      <div className="c3-filters">
        <FactionFilter value={fac} onChange={setFac} />
      </div>
      <ul className="c3-cmdgrid">
        {shown.map((c) => (
          <li key={c.slug}>
            <RouteLink className="c3-cmd" to={{ ...route, view: "coh3", c3Section: "commanders", detail: c.slug }} onNavigate={navigate}>
              <Icon path={c.icon} size={64} />
              <span className="c3-cmd-t">
                <b>{tr(c.name, lang)}</b>
                <FactionTag f={c.faction} size={16} />
              </span>
            </RouteLink>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Ficha({ slug, route, navigate }: { slug: string; route: Route; navigate: Nav }) {
  const { lang } = useLang();
  const t = COPY[lang];
  const game = useCohGame();
  const units = useRows<UnitRow>("units");
  const [c, setC] = useState<CommanderFicha | null | undefined>(() => peekFicha<CommanderFicha>("commanders", slug, game));
  useEffect(() => {
    if (c !== undefined) return;
    let vivo = true;
    loadFicha<CommanderFicha>("commanders", slug, game).then((x) => vivo && setC(x), () => vivo && setC(null));
    return () => {
      vivo = false;
    };
  }, [c, slug, game]);
  if (c === undefined) return <Coh3Loading />;
  const volver = (
    <p className="c3-crumb">
      <RouteLink to={{ ...route, view: "coh3", c3Section: "commanders", detail: undefined }} onNavigate={navigate}>
        ← {t.back}
      </RouteLink>
    </p>
  );
  if (!c)
    return (
      <main className="c3-main">
        <Panel>
          {volver}
          <p role="alert">{t.notFound}</p>
        </Panel>
      </main>
    );
  const unidad = (s: string | null) => (s ? units?.find((u) => u.slug === s) : undefined);
  return (
    <main className="c3-main">
      <Panel>
        {volver}
        <div className="c3-cmd-head">
          <Icon path={c.icon} size={128} lazy={false} />
          <div>
            <FactionTag f={c.faction} size={22} short={false} />
            <h1 className="c3-h1">{tr(c.name, lang)}</h1>
            {c.desc && <p className="c3-lede">{tr(c.desc, lang)}</p>}
          </div>
        </div>
      </Panel>
      <Panel k={t.abilities}>
        <ul className="c3-cmd-abils">
          {c.abilities.map((h) => {
            const u = unidad(h.unit);
            return (
              <li key={h.slug}>
                <Icon path={h.icon} size={56} />
                <div>
                  <b>{tr(h.name, lang)}</b>
                  {h.desc && <p className="c3-dim">{tr(h.desc, lang)}</p>}
                  {u && (
                    <p>
                      {t.unit}:{" "}
                      <RouteLink to={{ ...route, view: "coh3", c3Section: "units", detail: u.slug }} onNavigate={navigate}>
                        {tr(u.name, lang)}
                      </RouteLink>
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </main>
  );
}
