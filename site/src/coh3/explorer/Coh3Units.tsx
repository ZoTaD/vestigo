/**
 * Unidades de CoH3 (2026-11-04): la lista (filtros por facción y tipo, buscador, tabla ordenable) y la ficha de cada
 * unidad, indexable: vida, blindaje por lado, costo, producción, armas, mejoras, habilidades y veteranía, más lo que
 * coh3stats no tiene: qué le entra a ese blindaje y qué penetra su cañón (con el motor de `combat/`).
 */
import { useEffect, useMemo, useState } from "react";
import RouteLink from "../../RouteLink";
import { LazyRows } from "../../LazyRows";
import { routePath, type Route } from "../../route";
import { useLang } from "../../i18n";
import { FACTIONS, SIDE, useCoh3Copy, type Faction } from "../../coh3Copy";
import { loadFicha, loadList, peekFicha, peekList, tr, type L10n, type UnitRow, type WeaponRow } from "../data";
import { Coh3Loading, Cost, FactionTag, Icon, Panel, sortRows, useNum, useSort, type Nav } from "../ui";
import { hit } from "../combat/engine";
import { isAbilityShot, isAntiTank, isArmored, isVehicle, targetStats, weaponStats, type WeaponData } from "../combat/weapons";
import { useWeaponName } from "../combat/parts";
import { useExplorerCopy } from "./copy";
import "./explorer.css";

type Upg = { slug: string; name: L10n | null; icon: string | null; desc: L10n | null; cost: { mp?: number; mu?: number; fu?: number } | null };
export interface UnitFicha extends UnitRow {
  role?: L10n | null;
  desc?: L10n | null;
  speed?: number | null;
  sight?: number | null;
  targetSize?: number | null;
  upkeep?: number | null;
  loadout?: { slug: string; num: number; hp: number | null; armor: number[] | null }[];
  upgrades?: Upg[];
  abilities?: Upg[];
  vet?: { xp: number; desc: L10n | null }[] | null;
  bg?: string | null;
  builtIn?: string[] | string | null;
  weapons?: { slug: string; name: L10n | null; count: number }[];
}

const KINDS = ["infantry", "team_weapons", "vehicles", "emplacements"];
/** El nombre de una clase de arma, para las que no tienen nombre propio ("Cañón", "Ametralladora"…). */
const CLS: Record<string, [string, string]> = {
  cannon: ["Main gun", "Cañón principal"], cannon_burst: ["Autocannon", "Cañón automático"], cannon_small: ["Light gun", "Cañón ligero"], at_gun: ["Anti-tank gun", "Cañón antitanque"],
  hmg: ["Heavy machine gun", "Ametralladora pesada"], lmg: ["Machine gun", "Ametralladora"], smg: ["Submachine gun", "Subfusil"], rifle: ["Rifle", "Fusil"],
  pistol: ["Pistol", "Pistola"], sniper: ["Sniper rifle", "Fusil de francotirador"], flame: ["Flamethrower", "Lanzallamas"], mortar: ["Mortar", "Mortero"],
  grenade: ["Grenade", "Granada"], rifle_grenade: ["Rifle grenade", "Granada de fusil"], bazooka: ["Rocket launcher", "Lanzacohetes"], smoke: ["Smoke", "Humo"],
  panzerbuchse: ["Anti-tank rifle", "Fusil antitanque"], nebelwerfer: ["Rocket artillery", "Artillería de cohetes"],
};
let clsLang: "en" | "es" = "en";
const clsName = (cls: string | undefined, slug: string) => (cls && CLS[cls] ? CLS[cls][clsLang === "es" ? 1 : 0] : slug.replace(/_/g, " "));
const DIST = 30;

export default function Coh3Units({ route, navigate }: { route: Route; navigate: Nav }) {
  return route.detail ? <UnitPage key={route.detail} slug={route.detail} route={route} navigate={navigate} /> : <UnitList route={route} navigate={navigate} />;
}

function useList<T>(tab: "units" | "weapons"): T[] | null {
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

/** Filtros leídos de la dirección (`?f=german&k=vehicles&q=tiger`) al montar; se escriben con `replaceState`. */
function useFilters() {
  const [f, setF] = useState<{ f: Faction | ""; k: string; q: string }>({ f: "", k: "", q: "" });
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const fac = p.get("f") as Faction | null;
    setF({ f: fac && FACTIONS.includes(fac) ? fac : "", k: p.get("k") ?? "", q: p.get("q") ?? "" });
  }, []);
  const set = (patch: Partial<typeof f>) =>
    setF((s) => {
      const n = { ...s, ...patch };
      const p = new URLSearchParams();
      if (n.f) p.set("f", n.f);
      if (n.k) p.set("k", n.k);
      if (n.q) p.set("q", n.q);
      const q = p.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
      return n;
    });
  return [f, set] as const;
}

export function FactionFilter({ value, onChange }: { value: Faction | ""; onChange: (f: Faction | "") => void }) {
  const t = useExplorerCopy();
  const c = useCoh3Copy();
  return (
    <div className="c3-seg" role="group" aria-label={t.faction}>
      <button type="button" aria-pressed={value === ""} onClick={() => onChange("")}>
        {t.all}
      </button>
      {FACTIONS.map((f) => (
        <button key={f} type="button" aria-pressed={value === f} onClick={() => onChange(f)} title={c.faction[f]}>
          <FactionTag f={f} size={20} />
        </button>
      ))}
    </div>
  );
}

type Key = "name" | "faction" | "hp" | "armor" | "mp" | "mu" | "fu" | "pop";

function UnitList({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useExplorerCopy();
  const c = useCoh3Copy();
  const { lang } = useLang();
  const num = useNum();
  const units = useList<UnitRow>("units");
  const [f, setF] = useFilters();
  const { sort, th } = useSort<Key>({ key: "name", dir: 1 }, ["name", "faction"]);
  const rows = useMemo(() => {
    if (!units) return [];
    const q = f.q.trim().toLowerCase();
    return units.filter((u) => (!f.f || u.faction === f.f) && (!f.k || u.kind === f.k) && (!q || tr(u.name, lang).toLowerCase().includes(q) || tr(u.name, "en").toLowerCase().includes(q)));
  }, [units, f, lang]);
  if (!units) return <Coh3Loading />;
  const cols: Record<Key, (u: UnitRow) => string | number | null> = {
    name: (u) => tr(u.name, lang),
    faction: (u) => c.factionShort[u.faction],
    hp: (u) => u.hp,
    armor: (u) => (u.armor ? u.armor[0] : null),
    mp: (u) => u.cost?.mp ?? null,
    mu: (u) => u.cost?.mu || null,
    fu: (u) => u.cost?.fu || null,
    pop: (u) => u.cost?.pop ?? null,
  };
  const sorted = sortRows(rows, cols, sort);
  return (
    <main className="c3-main c3-units">
      <header className="c3-head">
        <div className="c3-k">{t.units.k}</div>
        <h1 className="c3-h1">{t.units.h1}</h1>
        <p className="c3-lede">{t.units.lede}</p>
      </header>
      <div className="c3-filters">
        <FactionFilter value={f.f} onChange={(x) => setF({ f: x })} />
        <div className="c3-seg" role="group" aria-label={t.kind}>
          <button type="button" aria-pressed={f.k === ""} onClick={() => setF({ k: "" })}>
            {t.all}
          </button>
          {KINDS.map((k) => (
            <button key={k} type="button" aria-pressed={f.k === k} onClick={() => setF({ k })}>
              {t.kinds[k]}
            </button>
          ))}
        </div>
        <input type="search" value={f.q} placeholder={t.search} aria-label={t.search} onChange={(e) => setF({ q: e.target.value })} />
      </div>
      <p className="c3-note">{t.results(num(rows.length))}</p>
      <Panel className="c3-tablepanel">
        <table className="c3-table is-stack c3-unit-table">
          <thead>
            <tr>
              {th("name", t.name)}
              {th("faction", t.faction, { className: "is-l" })}
              {th("hp", t.hp)}
              {th("armor", t.armor, { title: t.armorFSR })}
              {th("mp", c.t.mp)}
              {th("mu", c.t.mu)}
              {th("fu", c.t.fu)}
              {th("pop", c.t.pop)}
            </tr>
          </thead>
          <tbody>
            <LazyRows
              tag="tr"
              eager
              rowHeight={62}
              items={sorted}
              render={(u) => (
                <tr key={u.slug} className="is-link" onClick={() => navigate({ ...route, view: "coh3", c3Section: "units", detail: u.slug })}>
                  <td>
                    <RouteLink className="c3-nm" to={{ ...route, view: "coh3", c3Section: "units", detail: u.slug }} onNavigate={navigate}>
                      <Icon path={u.icon} size={46} />
                      <span className="c3-nm-t">
                        <strong>{tr(u.name, lang)}</strong>
                        <small>{t.kinds[u.kind] ?? u.kind}</small>
                      </span>
                    </RouteLink>
                  </td>
                  <td className="is-l" data-l={t.faction}>
                    <FactionTag f={u.faction} size={20} />
                  </td>
                  <td data-l={t.hp}>{u.hp != null ? num(u.hp) : "—"}</td>
                  <td data-l={t.armorFSR}>{u.armor && isArmored(u) ? u.armor.map((a) => num(a)).join(" / ") : "—"}</td>
                  <td data-l={c.t.mp}>{u.cost?.mp ? num(u.cost.mp) : "—"}</td>
                  <td data-l={c.t.mu}>{u.cost?.mu ? num(u.cost.mu) : "—"}</td>
                  <td data-l={c.t.fu}>{u.cost?.fu ? num(u.cost.fu) : "—"}</td>
                  <td data-l={c.t.pop}>{u.cost?.pop ? num(u.cost.pop) : "—"}</td>
                </tr>
              )}
            />
          </tbody>
        </table>
        {!sorted.length && <p className="c3-dim">{t.none}</p>}
      </Panel>
    </main>
  );
}

function UnitPage({ slug, route, navigate }: { slug: string; route: Route; navigate: Nav }) {
  const t = useExplorerCopy();
  const c = useCoh3Copy();
  const { lang } = useLang();
  clsLang = lang;
  const num = useNum();
  const [u, setU] = useState<UnitFicha | null | undefined>(() => peekFicha<UnitFicha>("units", slug));
  const weapons = useList<WeaponRow>("weapons");
  const units = useList<UnitRow>("units");
  const wName = useWeaponName(units ?? undefined);
  useEffect(() => {
    if (u !== undefined) return;
    let vivo = true;
    loadFicha<UnitFicha>("units", slug).then((x) => vivo && setU(x), () => vivo && setU(null));
    return () => {
      vivo = false;
    };
  }, [slug, u]);
  if (u === undefined) return <Coh3Loading />;
  if (u === null)
    return (
      <main className="c3-main">
        <Panel>
          <p>{c.t.notFound}</p>
        </Panel>
      </main>
    );
  const toList = { ...route, view: "coh3" as const, c3Section: "units" as const, detail: undefined };
  const armored = isArmored(u);
  const byW = new Map((weapons ?? []).map((w) => [w.slug, w]));
  const main = (u.weapons ?? []).map((w) => byW.get(w.slug)).find((w) => w && isAntiTank(w as WeaponData));
  // Sólo el bando contrario: lo que le dispara y lo que tiene enfrente.
  const vehicles = (units ?? []).filter((x) => isVehicle(x) && SIDE[x.faction] !== SIDE[u.faction]);
  const prey = main
    ? vehicles
        .map((v) => {
          const ws = weaponStats(main as WeaponData), ts = targetStats(v), d = Math.min(DIST, ws.range);
          return { v, f: hit(ws, ts, 0, d).chance, r: hit(ws, ts, 2, d).chance };
        })
        // Con muchos empates en 100 %, primero los de más blindaje (lo más duro que igual atraviesa).
        .sort((a, b) => b.f - a.f || (b.v.armor?.[0] ?? 0) - (a.v.armor?.[0] ?? 0))
        .slice(0, 10)
    : [];
  const killers = armored
    ? (weapons ?? [])
        .filter((w) => w.faction && SIDE[w.faction] !== SIDE[u.faction] && isAntiTank(w as WeaponData) && !isAbilityShot(w))
        .map((w) => {
          const ws = weaponStats(w as WeaponData);
          const h = hit(ws, targetStats(u), 0, Math.min(DIST, ws.range));
          return { w, f: h.chance, pen: h.pen };
        })
        // Con empates en 100 %, primero los que menos penetran (el arma más modesta que igual le entra).
        .sort((a, b) => b.f - a.f || a.pen - b.pen)
        .slice(0, 10)
    : [];
  const calc = (q: string) => `${routePath({ ...route, view: "coh3", c3Section: "penetration", detail: undefined })}?${q}`;
  const built = Array.isArray(u.builtIn) ? u.builtIn : u.builtIn ? [u.builtIn] : [];
  return (
    <main className="c3-main c3-unit">
      <p className="c3-crumb">
        <RouteLink to={toList} onNavigate={navigate}>
          {t.units.h1}
        </RouteLink>{" "}
        › {c.factionShort[u.faction]}
      </p>
      <header className="c3-ficha-head">
        <Icon path={u.icon} size={160} lazy={false} className="c3-ficha-img" />
        <div className="c3-head">
          <FactionTag f={u.faction} size={26} short={false} />
          <h1 className="c3-h1">{tr(u.name, lang)}</h1>
          {u.role && <p className="c3-role">{tr(u.role, lang)}</p>}
          {u.desc && <p className="c3-desc">{tr(u.desc, lang)}</p>}
          <div className="c3-chips">
            <span className="c3-chip">{t.kinds[u.kind] ?? u.kind}</span>
            {u.bg ? (
              <RouteLink className="c3-chip" to={{ ...route, view: "coh3", c3Section: "battlegroups", detail: u.bg }} onNavigate={navigate}>
                {t.fromBg}: {u.bg.replace(/_/g, " ")}
              </RouteLink>
            ) : (
              <span className="c3-chip">{t.core}</span>
            )}
            {built.map((b) => (
              <span key={b} className="c3-chip">
                {t.builtIn}: {b.replace(/_(us|uk|ger|ak)$/, "").replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      </header>
      <div className="c3-facts">
        <div className="c3-fact">
          <small>{t.hp}</small>
          <b>{u.hp != null ? num(u.hp) : "—"}</b>
        </div>
        {armored && u.armor && (
          <div className="c3-fact">
            <small>{t.armorFSR}</small>
            <b>{u.armor.map((a) => num(a)).join(" / ")}</b>
          </div>
        )}
        {(u.models ?? 1) > 1 && (
          <div className="c3-fact">
            <small>{t.models}</small>
            <b>{num(u.models ?? 1)}</b>
          </div>
        )}
        <div className="c3-fact is-wide">
          <small>{t.cost}</small>
          <Cost c={u.cost} />
        </div>
        {(u.cost as { t?: number } | null)?.t ? (
          <div className="c3-fact">
            <small>{t.time}</small>
            <b>{t.secs(num((u.cost as { t: number }).t))}</b>
          </div>
        ) : null}
        {u.speed != null && (
          <div className="c3-fact">
            <small>{t.speed}</small>
            <b>{num(u.speed, 2)}</b>
          </div>
        )}
        {u.sight != null && (
          <div className="c3-fact">
            <small>{t.sight}</small>
            <b>{num(u.sight)} m</b>
          </div>
        )}
        {u.upkeep != null && (
          <div className="c3-fact">
            <small>{t.upkeep}</small>
            <b>
              {num(u.upkeep, 1)} <small>{t.perMin}</small>
            </b>
          </div>
        )}
        {u.targetSize != null && (
          <div className="c3-fact">
            <small>{t.targetSize}</small>
            <b>{num(u.targetSize)}</b>
          </div>
        )}
      </div>
      <div className="c3-grid2">
        <div className="c3-stack">
          {u.weapons && u.weapons.length > 0 && (
            <Panel k={t.units.weapons}>
              <ul className="c3-wlist">
                {u.weapons.map((w) => {
                  const row = byW.get(w.slug);
                  return (
                    <li key={w.slug}>
                      <RouteLink to={{ ...route, view: "coh3", c3Section: "weapons", detail: w.slug }} onNavigate={navigate}>
                        {t.units.count(w.count)}{" "}
                        {row && !(row as { nameFromUnit?: boolean }).nameFromUnit ? wName(row as WeaponData) : clsName(row?.cls as string | undefined, w.slug)}
                      </RouteLink>
                      {row?.dmg && (
                        <small className="c3-dim">
                          {num(row.dmg[0])}
                          {row.dmg[1] !== row.dmg[0] ? `–${num(row.dmg[1])}` : ""} · pen {row.pen ? row.pen.map((p) => num(p)).join("/") : "—"}
                        </small>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
          {u.upgrades && u.upgrades.length > 0 && <UpgList k={t.units.upgrades} items={u.upgrades} />}
          {u.abilities && u.abilities.length > 0 && <UpgList k={t.units.abilities} items={u.abilities} />}
        </div>
        <div className="c3-stack">
          {u.vet && u.vet.length > 0 && (
            <Panel k={t.units.vet}>
              <ol className="c3-vetlist">
                {u.vet.map((v, i) => (
                  <li key={i}>
                    <b>{"★".repeat(i + 1)}</b>
                    <span>
                      <small className="c3-dim">{t.units.vetXp(num(v.xp))}</small>
                      <span className="c3-pre">{tr(v.desc, lang)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
          {killers.length > 0 && (
            <Panel k={t.units.killedBy} lede={t.units.killedByLede(num(DIST))}>
              <ol className="c3-rank">
                {killers.map(({ w, f }) => (
                  <li key={w.slug}>
                    <a className="c3-rank-i" href={calc(`w=${w.slug}&t=${u.slug}&d=${DIST}`)}>
                      {w.faction && <FactionTag f={w.faction} name={false} size={20} />}
                      <span>{wName(w as WeaponData)}</span>
                      <b className={f >= 1 ? "c3-up" : f < 0.5 ? "c3-down" : ""}>{num(f * 100)} %</b>
                    </a>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
          {prey.length > 0 && main && (
            <Panel k={t.units.penVs} lede={t.units.penVsLede(num(DIST))}>
              <ol className="c3-rank">
                {prey.map(({ v, f, r }) => (
                  <li key={v.slug}>
                    <a className="c3-rank-i" href={calc(`w=${main.slug}&t=${v.slug}&d=${DIST}`)}>
                      <FactionTag f={v.faction} name={false} size={20} />
                      <span>{tr(v.name, lang)}</span>
                      <b className={f >= 1 ? "c3-up" : f < 0.5 ? "c3-down" : ""}>{num(f * 100)} %</b>
                      <small className="c3-dim">{num(r * 100)} %</small>
                    </a>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
        </div>
      </div>
    </main>
  );
}

function UpgList({ k, items }: { k: string; items: Upg[] }) {
  const { lang } = useLang();
  return (
    <Panel k={k}>
      <ul className="c3-upgs">
        {items.map((x) => (
          <li key={x.slug}>
            <Icon path={x.icon} size={40} />
            <span>
              <b>{tr(x.name, lang) || x.slug.replace(/_/g, " ")}</b>
              {x.desc && <small className="c3-dim c3-pre">{tr(x.desc, lang)}</small>}
            </span>
            <Cost c={x.cost} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
