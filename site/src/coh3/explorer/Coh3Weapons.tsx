/**
 * Armas de CoH3 (2026-11-04): la lista ordenable (daño, penetración corta/larga, alcance, recarga) y la ficha de cada
 * arma con sus tres distancias, quién la usa y, si es antitanque, qué le penetra a cada vehículo.
 */
import { useEffect, useMemo, useState } from "react";
import RouteLink from "../../RouteLink";
import { LazyRows } from "../../LazyRows";
import { routePath, type Route } from "../../route";
import { useLang } from "../../i18n";
import { SIDE, useCoh3Copy, type Faction } from "../../coh3Copy";
import { loadFicha, loadList, peekFicha, peekList, tr, type UnitRow, type WeaponRow } from "../data";
import { Coh3Loading, FactionTag, Icon, Panel, sortRows, useNum, useSort, type Nav } from "../ui";
import { hit } from "../combat/engine";
import { isAntiTank, isArmored, isVehicle, targetStats, weaponStats, type WeaponData } from "../combat/weapons";
import { useWeaponName } from "../combat/parts";
import { useExplorerCopy } from "./copy";
import { FactionFilter } from "./Coh3Units";
import "./explorer.css";

type WeaponFicha = WeaponData & {
  dmgType?: string;
  aoe?: { radius: number } | number | null;
  windup?: number;
  winddown?: number;
};

export default function Coh3Weapons({ route, navigate }: { route: Route; navigate: Nav }) {
  return route.detail ? <WeaponPage key={route.detail} slug={route.detail} route={route} navigate={navigate} /> : <WeaponList route={route} navigate={navigate} />;
}

function useLists() {
  const [v, setV] = useState(() => {
    const u = peekList("units"), w = peekList("weapons");
    return u && w ? { units: u, weapons: w } : null;
  });
  useEffect(() => {
    if (v) return;
    let vivo = true;
    Promise.all([loadList("units"), loadList("weapons")]).then(([units, weapons]) => vivo && setV({ units, weapons }), () => undefined);
    return () => {
      vivo = false;
    };
  }, [v]);
  return v;
}

type Key = "name" | "faction" | "cls" | "dmg" | "penN" | "penF" | "range" | "reload";

function WeaponList({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useExplorerCopy();
  const c = useCoh3Copy();
  const { lang } = useLang();
  const num = useNum();
  const lists = useLists();
  const wName = useWeaponName(lists?.units);
  const [fac, setFac] = useState<Faction | "">("");
  const [cls, setCls] = useState("");
  const [q, setQ] = useState("");
  const { sort, th } = useSort<Key>({ key: "dmg", dir: -1 }, ["name", "faction", "cls"]);
  const units = useMemo(() => new Map((lists?.units ?? []).map((u) => [u.slug, u])), [lists]);
  const classes = useMemo(() => [...new Set((lists?.weapons ?? []).map((w) => w.cls as string).filter(Boolean))].sort(), [lists]);
  if (!lists) return <Coh3Loading />;
  const needle = q.trim().toLowerCase();
  const rows = lists.weapons.filter(
    (w) => w.faction && w.dmg && (!fac || w.faction === fac) && (!cls || w.cls === cls) && (!needle || wName(w as WeaponData).toLowerCase().includes(needle)),
  );
  const cols: Record<Key, (w: WeaponRow) => string | number | null> = {
    name: (w) => wName(w as WeaponData),
    faction: (w) => (w.faction ? c.factionShort[w.faction] : null),
    cls: (w) => (w.cls as string) ?? null,
    dmg: (w) => (w.dmg ? (w.dmg[0] + w.dmg[1]) / 2 : null),
    penN: (w) => w.pen?.[0] ?? null,
    penF: (w) => w.pen?.[2] ?? null,
    range: (w) => (w.range as number[] | undefined)?.[1] ?? null,
    reload: (w) => {
      const r = w.reload as number[] | undefined;
      return r ? (r[0] + r[1]) / 2 : null;
    },
  };
  const sorted = sortRows(rows, cols, sort);
  return (
    <main className="c3-main c3-weapons">
      <header className="c3-head">
        <div className="c3-k">{t.weapons.k}</div>
        <h1 className="c3-h1">{t.weapons.h1}</h1>
        <p className="c3-lede">{t.weapons.lede}</p>
      </header>
      <div className="c3-filters">
        <FactionFilter value={fac} onChange={setFac} />
        <label>
          {t.weapons.cls}
          <select value={cls} onChange={(e) => setCls(e.target.value)}>
            <option value="">{t.all}</option>
            {classes.map((k) => (
              <option key={k} value={k}>
                {k.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <input type="search" value={q} placeholder={t.search} aria-label={t.search} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="c3-note">{t.results(num(rows.length))}</p>
      <Panel className="c3-tablepanel">
        <table className="c3-table is-stack">
          <thead>
            <tr>
              {th("name", t.name)}
              {th("faction", t.faction, { className: "is-l" })}
              {th("cls", t.weapons.cls, { className: "is-l" })}
              {th("dmg", t.weapons.dmg)}
              {th("penN", `${t.weapons.pen} · ${t.weapons.near}`)}
              {th("penF", `${t.weapons.pen} · ${t.weapons.far}`)}
              {th("range", `${t.weapons.range} (m)`)}
              {th("reload", `${t.weapons.reload} (s)`)}
            </tr>
          </thead>
          <tbody>
            <LazyRows
              tag="tr"
              eager
              rowHeight={58}
              items={sorted}
              render={(w) => {
                const u = units.get(((w as unknown as WeaponData).usedBy ?? [])[0] ?? "");
                const to: Route = { ...route, view: "coh3", c3Section: "weapons", detail: w.slug };
                const r = w.reload as number[] | undefined;
                return (
                  <tr key={w.slug} className="is-link" onClick={() => navigate(to)}>
                    <td>
                      <RouteLink className="c3-nm" to={to} onNavigate={navigate}>
                        <Icon path={u?.icon} size={40} />
                        <span className="c3-nm-t">
                          <strong>{wName(w as WeaponData)}</strong>
                          {u && <small>{tr(u.name, lang)}</small>}
                        </span>
                      </RouteLink>
                    </td>
                    <td className="is-l" data-l={t.faction}>
                      {w.faction && <FactionTag f={w.faction} size={20} />}
                    </td>
                    <td className="is-l" data-l={t.weapons.cls}>
                      {((w.cls as string) ?? "").replace(/_/g, " ")}
                    </td>
                    <td data-l={t.weapons.dmg}>{w.dmg ? num((w.dmg[0] + w.dmg[1]) / 2, w.dmg[0] < 10 ? 1 : 0) : "—"}</td>
                    <td data-l={`${t.weapons.pen} · ${t.weapons.near}`}>{w.pen ? num(w.pen[0], w.pen[0] < 10 ? 1 : 0) : "—"}</td>
                    <td data-l={`${t.weapons.pen} · ${t.weapons.far}`}>{w.pen ? num(w.pen[2], w.pen[2] < 10 ? 1 : 0) : "—"}</td>
                    <td data-l={`${t.weapons.range} (m)`}>{(w.range as number[] | undefined)?.[1] ? num((w.range as number[])[1]) : "—"}</td>
                    <td data-l={`${t.weapons.reload} (s)`}>{r ? num((r[0] + r[1]) / 2, 2) : "—"}</td>
                  </tr>
                );
              }}
            />
          </tbody>
        </table>
        {!sorted.length && <p className="c3-dim">{t.none}</p>}
      </Panel>
    </main>
  );
}

function WeaponPage({ slug, route, navigate }: { slug: string; route: Route; navigate: Nav }) {
  const t = useExplorerCopy();
  const c = useCoh3Copy();
  const { lang } = useLang();
  const num = useNum();
  const lists = useLists();
  const wName = useWeaponName(lists?.units);
  const [w, setW] = useState<WeaponFicha | null | undefined>(() => peekFicha<WeaponFicha>("weapons", slug));
  useEffect(() => {
    if (w !== undefined) return;
    let vivo = true;
    loadFicha<WeaponFicha>("weapons", slug).then((x) => vivo && setW(x), () => vivo && setW(null));
    return () => {
      vivo = false;
    };
  }, [slug, w]);
  if (w === undefined) return <Coh3Loading />;
  if (w === null)
    return (
      <main className="c3-main">
        <Panel>
          <p>{c.t.notFound}</p>
        </Panel>
      </main>
    );
  const units = new Map<string, UnitRow>((lists?.units ?? []).map((u) => [u.slug, u]));
  const users = (w.usedBy ?? []).map((s) => units.get(s)).filter(Boolean) as UnitRow[];
  const ws = weaponStats(w);
  const fmt = (v: number) => num(v, v < 10 && v % 1 ? 2 : 0);
  const trio = (v: number[] | null | undefined) => (v ? v.map((x) => fmt(x)) : ["—", "—", "—"]);
  const pair = (v: number[] | null | undefined) => (v ? (v[0] === v[1] ? fmt(v[0]) : `${fmt(v[0])}–${fmt(v[1])}`) : "—");
  const aoe = typeof w.aoe === "number" ? w.aoe : w.aoe?.radius;
  const at = isAntiTank(w);
  const vehicles = (lists?.units ?? []).filter((u) => isVehicle(u) && (!w.faction || SIDE[u.faction] !== SIDE[w.faction]));
  const d = Math.min(30, ws.range);
  const prey = at
    ? vehicles
        .map((v) => ({ v, f: hit(ws, targetStats(v), 0, d).chance, r: hit(ws, targetStats(v), 2, d).chance }))
        .sort((a, b) => b.f - a.f || b.r - a.r)
    : [];
  const calc = (target: string) => `${routePath({ ...route, view: "coh3", c3Section: "penetration", detail: undefined })}?w=${w.slug}&t=${target}&d=${Math.round(d)}`;
  return (
    <main className="c3-main c3-weapon">
      <p className="c3-crumb">
        <RouteLink to={{ ...route, view: "coh3", c3Section: "weapons", detail: undefined }} onNavigate={navigate}>
          {t.weapons.h1}
        </RouteLink>{" "}
        › {w.faction ? c.factionShort[w.faction] : ""}
      </p>
      <header className="c3-ficha-head">
        <Icon path={users[0]?.icon} size={140} lazy={false} className="c3-ficha-img" />
        <div className="c3-head">
          {w.faction && <FactionTag f={w.faction} size={26} short={false} />}
          <h1 className="c3-h1">{wName(w)}</h1>
          <div className="c3-chips">
            {w.cls && <span className="c3-chip">{w.cls.replace(/_/g, " ")}</span>}
            {w.dmgType && <span className="c3-chip">{t.weapons.dmgType}: {w.dmgType}</span>}
          </div>
        </div>
      </header>
      <div className="c3-facts">
        <div className="c3-fact">
          <small>{t.weapons.dmg} · {t.weapons.perShot}</small>
          <b>{pair(w.dmg)}</b>
        </div>
        <div className="c3-fact">
          <small>{t.weapons.range}</small>
          <b>{num(ws.range)} m</b>
        </div>
        <div className="c3-fact">
          <small>{t.weapons.reload}</small>
          <b>{pair(w.reload)} s</b>
        </div>
        {w.cooldown && w.cooldown[1] > 0 && (
          <div className="c3-fact">
            <small>{t.weapons.cooldown}</small>
            <b>{pair(w.cooldown)} s</b>
          </div>
        )}
        {w.aim?.fire && (
          <div className="c3-fact">
            <small>{t.weapons.aim}</small>
            <b>{pair(w.aim.fire)} s</b>
          </div>
        )}
        {aoe ? (
          <div className="c3-fact">
            <small>{t.weapons.aoe}</small>
            <b>{fmt(aoe)} m</b>
          </div>
        ) : null}
        {w.moving != null && (
          <div className="c3-fact">
            <small>{t.weapons.moving}</small>
            <b>×{num(w.moving, 2)}</b>
          </div>
        )}
      </div>
      <div className="c3-grid2">
        <Panel k={t.weapons.range}>
          <table className="c3-table c3-trio">
            <thead>
              <tr>
                <th>
                  <span />
                </th>
                <th>
                  <span>{t.weapons.near}</span>
                </th>
                <th>
                  <span>{t.weapons.mid}</span>
                </th>
                <th>
                  <span>{t.weapons.far}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t.weapons.range} (m)</td>
                {ws.dist.map((x, i) => (
                  <td key={i}>{fmt(x)}</td>
                ))}
              </tr>
              <tr>
                <td>{t.weapons.pen}</td>
                {trio(w.pen).map((x, i) => (
                  <td key={i}>{x}</td>
                ))}
              </tr>
              <tr>
                <td>{t.weapons.acc}</td>
                {(w.acc ?? [0, 0, 0]).map((x, i) => (
                  <td key={i}>{num(x * 100, 1)} %</td>
                ))}
              </tr>
            </tbody>
          </table>
          {users.length > 0 && (
            <>
              <h3 className="c3-h3 c3-mt">{t.weapons.usedBy}</h3>
              <div className="c3-chips">
                {users.map((u) => (
                  <RouteLink key={u.slug} className="c3-chip" to={{ ...route, view: "coh3", c3Section: "units", detail: u.slug }} onNavigate={navigate}>
                    <Icon path={u.icon} size={28} />
                    {tr(u.name, lang)}
                  </RouteLink>
                ))}
              </div>
            </>
          )}
        </Panel>
        {prey.length > 0 && (
          <Panel k={t.units.penVs} lede={t.units.penVsLede(num(d))}>
            <ol className="c3-rank">
              {prey.slice(0, 14).map(({ v, f, r }) => (
                <li key={v.slug}>
                  <a className="c3-rank-i" href={calc(v.slug)}>
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
    </main>
  );
}
