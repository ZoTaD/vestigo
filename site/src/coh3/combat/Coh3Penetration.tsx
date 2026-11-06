/**
 * Penetración (2026-11-04): "¿le entra o rebota?". Un arma contra un objetivo a una distancia: la probabilidad de
 * penetrar cada lado, los disparos y segundos para matarlo, con la veteranía de los dos; el gráfico por distancia; y
 * los counters: qué armas le entran a ese objetivo y contra qué vehículos sirve esa arma.
 *
 * Lo que coh3stats no tiene: los tres lados (ellos sólo usan el frente), la veteranía aplicada y disparos/segundos.
 */
import { useMemo } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang } from "../../i18n";
import { useCohGame } from "../ui";
import { sideOf } from "../games";
import { tr, type UnitRow, type WeaponRow } from "../data";
import { Coh3Loading, FactionTag, Icon, Panel, useNum, type Nav } from "../ui";
import { curve, hit, type Side } from "./engine";
import { vetAt, parseVetLines } from "./vet";
import { isAbilityShot, isAntiTank, isArmored, isVehicle, targetStats, weaponStats, type WeaponData } from "./weapons";
import { useCombatCopy } from "./copy";
import { FactionOptions, LineChart, useFicha, useLists, useQueryState, useWeaponName, VetPicker } from "./parts";
import "./combat.css";

type VetData = { vet?: { xp: number; desc: { en: string; es?: string } | null }[] | null };
type UnitFicha = UnitRow & VetData;

export default function Coh3Penetration({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useCombatCopy();
  const lists = useLists();
  const [q, setQ] = useQueryState({ w: "57mm_at_gun_us", t: "tiger_ger", d: "30", va: "0", vt: "0", all: "0", mv: "0", ab: "0" });
  const wFicha = useFicha<WeaponData>("weapons", q.w);
  const user = wFicha?.usedBy?.[0];
  const uFicha = useFicha<UnitFicha>("units", user);
  const tFicha = useFicha<UnitFicha>("units", q.t);
  if (!lists) return <Coh3Loading />;
  return <Calc route={route} navigate={navigate} lists={lists} q={q} setQ={setQ} wFicha={wFicha} uFicha={uFicha} tFicha={tFicha} t={t} />;
}

function Calc({ route, navigate, lists, q, setQ, wFicha, uFicha, tFicha, t }: {
  route: Route; navigate: Nav; lists: { units: UnitRow[]; weapons: WeaponRow[] }; q: Record<string, string>; setQ: (p: Record<string, string>) => void;
  wFicha: WeaponData | null | undefined; uFicha: UnitFicha | null | undefined; tFicha: UnitFicha | null | undefined; t: ReturnType<typeof useCombatCopy>;
}) {
  const game = useCohGame();
  const { lang } = useLang();
  const num = useNum();
  const wName = useWeaponName(lists.units);
  const units = useMemo(() => new Map(lists.units.map((u) => [u.slug, u])), [lists.units]);
  const weapons = useMemo(() => lists.weapons.filter((w) => w.faction && w.pen && w.dmg && (q.all === "1" || isAntiTank(w as WeaponData))), [lists.weapons, q.all]);
  const targets = useMemo(() => lists.units.filter((u) => isVehicle(u)), [lists.units]);
  const wRow = lists.weapons.find((w) => w.slug === q.w) ?? weapons[0];
  const tRow = units.get(q.t) ?? targets[0];
  const wData: WeaponData = (wFicha ?? wRow) as WeaponData;
  const va = Number(q.va) || 0, vt = Number(q.vt) || 0;
  const vA = vetAt(uFicha?.vet ?? null, va);
  const vT = vetAt(tFicha?.vet ?? null, vt);
  const ws = weaponStats(wData, vA);
  const ts = targetStats(tRow, vT);
  if (q.mv === "1" && ws.moving) ts.receivedAccuracy = (ts.receivedAccuracy ?? 1) * ws.moving;
  const d = Math.min(Number(q.d) || 0, ws.range);
  // CoH2 no tiene blindaje lateral: frente y atrás.
  const lados = (game === "coh2" ? [0, 2] : [0, 1, 2]) as Side[];
  const sides = lados.map((s) => ({ s, ...hit(ws, ts, s, d) }));
  const userRow = wData.usedBy?.[0] ? units.get(wData.usedBy[0]) : undefined;
  const pct = (x: number) => `${num(x * 100)} %`;
  const unknownVet = [...(uFicha?.vet ?? []).slice(0, va), ...(tFicha?.vet ?? []).slice(0, vt)]
    .flatMap((l) => (l.desc?.en ? parseVetLines(l.desc.en).unknown : []))
    .filter((x) => !/^veteran ability/i.test(x));

  // Counters: qué armas le entran a este objetivo de frente, y contra qué vehículos sirve esta arma.
  const counters = weapons
    .filter((w) => isAntiTank(w as WeaponData) && (q.ab === "1" || !isAbilityShot(w)) && (!tRow || !w.faction || sideOf(game, w.faction) !== sideOf(game, tRow.faction)))
    .map((w) => ({ w, c: hit(weaponStats(w as WeaponData), ts, 0, Math.min(d, (w.range as number[] | undefined)?.[1] || 60)).chance }))
    .sort((a, b) => b.c - a.c)
    .slice(0, 12);
  const prey = targets
    .filter((u) => !wData.faction || sideOf(game, u.faction) !== sideOf(game, wData.faction))
    .map((u) => ({ u, c: hit(ws, targetStats(u), 0, d).chance, r: hit(ws, targetStats(u), 2, d).chance }))
    .sort((a, b) => b.c - a.c || (b.u.armor?.[0] ?? 0) - (a.u.armor?.[0] ?? 0))
    .slice(0, 12);
  const toUnit = (slug: string): Route => ({ ...route, view: "coh3", c3Section: "units", detail: slug });

  return (
    <main className="c3-main c3-pen">
      <header className="c3-head">
        <div className="c3-k">{t.pen.k}</div>
        <h1 className="c3-h1">{t.pen.h1}</h1>
        <p className="c3-lede">{t.pen.lede}</p>
      </header>
      <div className="c3-grid2">
        <Panel>
          <div className="c3-picks">
            <label className="c3-pick">
              <span>{t.weapon}</span>
              <select className="c3-input" value={wRow?.slug} onChange={(e) => setQ({ w: e.target.value, va: "0" })}>
                <FactionOptions rows={weapons} label={(w) => wName(w as WeaponData)} />
              </select>
            </label>
            <label className="c3-pick">
              <span>{t.target}</span>
              <select className="c3-input" value={tRow?.slug} onChange={(e) => setQ({ t: e.target.value, vt: "0" })}>
                <FactionOptions rows={targets} label={(u) => tr(u.name, lang)} />
              </select>
            </label>
            <div className="c3-pick">
              <span>{t.vet} · {t.weapon}</span>
              <VetPicker value={va} onChange={(n) => setQ({ va: String(n) })} label={`${t.vet} ${t.weapon}`} />
            </div>
            <div className="c3-pick">
              <span>{t.vet} · {t.target}</span>
              <VetPicker value={vt} onChange={(n) => setQ({ vt: String(n) })} label={`${t.vet} ${t.target}`} />
            </div>
            <label className="c3-pick is-wide">
              <span>
                {t.distance} <b className="c3-dval">{num(d)} {t.m}</b>
              </span>
              <input type="range" min={0} max={ws.range} value={d} onChange={(e) => setQ({ d: e.target.value })} />
            </label>
            <label className="c3-check">
              <input type="checkbox" checked={q.mv === "1"} onChange={(e) => setQ({ mv: e.target.checked ? "1" : "0" })} /> {t.moving}
            </label>
            <label className="c3-check">
              <input type="checkbox" checked={q.all === "1"} onChange={(e) => setQ({ all: e.target.checked ? "1" : "0" })} /> {t.allWeapons}
            </label>
            <label className="c3-check">
              <input type="checkbox" checked={q.ab === "1"} onChange={(e) => setQ({ ab: e.target.checked ? "1" : "0" })} /> {t.abilities}
            </label>
          </div>
          <div className="c3-duel">
            <figure>
              <Icon path={userRow?.icon} size={88} lazy={false} />
              <figcaption>
                {wName(wData)}
                <small>{t.penAt(num(sides[0].pen), num(d))}</small>
              </figcaption>
            </figure>
            <span className="c3-vs">{t.vs}</span>
            <figure>
              <Icon path={tRow?.icon} size={88} lazy={false} />
              <figcaption>
                {tr(tRow?.name, lang)}
                <small>{t.hp(num(ts.hp))}</small>
              </figcaption>
            </figure>
          </div>
          <div className="c3-sides3">
            {sides.map((h, i) => (
              <div key={i} className={`c3-side ${!h.inRange ? "is-out" : h.chance >= 1 ? "is-full" : h.chance < 0.5 ? "is-low" : ""}`}>
                <small className="c3-side-h">{t.side[h.s]}</small>
                <b className="c3-side-n">{h.inRange ? pct(h.chance) : "—"}</b>
                <small className="c3-dim">
                  {t.chance} · {num(ts.armor[i])}
                </small>
                {h.inRange ? (
                  <>
                    <span className="c3-side-l">{t.hits(num(h.shotsToKill))}</span>
                    <span className="c3-side-l">{Number.isFinite(h.expectedShots) ? t.shots(num(h.expectedShots, 1)) : t.never}</span>
                    {Number.isFinite(h.seconds) && <span className="c3-side-l">{t.secs(num(h.seconds, 1))}</span>}
                  </>
                ) : (
                  <span className="c3-side-l">{t.outOfRange}</span>
                )}
              </div>
            ))}
          </div>
          <LineChart
            label={t.legend}
            xMax={ws.range}
            yMax={1}
            yTicks={[0, 0.25, 0.5, 0.75, 1]}
            yFmt={(v) => `${v * 100}%`}
            cursor={d}
            series={lados.map((s) => ({ pts: curve(ws, ts, s, (h) => h.chance), cls: `is-s${s}`, label: t.side[s] }))}
          />
          <p className="c3-legend">
            <i className="is-s0" />
            {t.side[0]} <i className="is-s1" />
            {t.side[1]} <i className="is-s2" />
            {t.side[2]} · {t.legend}
          </p>
          {unknownVet.length > 0 && (
            <p className="c3-note">
              {t.vetUnknown} {unknownVet.join(" · ")}
            </p>
          )}
          <p className="c3-note">{t.pen.model}</p>
        </Panel>
        <div className="c3-stack">
          <Panel k={t.pen.counters} lede={t.pen.countersLede(tr(tRow?.name, lang), num(d))}>
            <ol className="c3-rank">
              {counters.map(({ w, c }) => {
                const u = units.get((w.by as string | undefined) ?? "");
                return (
                  <li key={w.slug}>
                    <button type="button" className="c3-rank-i" onClick={() => setQ({ w: w.slug, va: "0" })}>
                      {w.faction && <FactionTag f={w.faction} name={false} size={20} />}
                      <span>
                        {wName(w as WeaponData)}
                        {isAbilityShot(w) && <em className="c3-chip c3-abil">{t.abilityTag}</em>}
                      </span>
                      <b className={c >= 1 ? "c3-up" : c < 0.5 ? "c3-down" : ""}>{pct(c)}</b>
                    </button>
                    {u && (
                      <RouteLink className="c3-rank-u" to={toUnit(u.slug)} onNavigate={navigate}>
                        ↗
                      </RouteLink>
                    )}
                  </li>
                );
              })}
            </ol>
          </Panel>
          <Panel k={t.pen.prey} lede={t.pen.preyLede(wName(wData), num(d))}>
            <ol className="c3-rank">
              {prey.map(({ u, c, r }) => (
                <li key={u.slug}>
                  <button type="button" className="c3-rank-i" onClick={() => setQ({ t: u.slug, vt: "0" })}>
                    <FactionTag f={u.faction} name={false} size={20} />
                    <span>{tr(u.name, lang)}</span>
                    <b className={c >= 1 ? "c3-up" : c < 0.5 ? "c3-down" : ""} title={t.pen.front}>
                      {pct(c)}
                    </b>
                    <small className="c3-dim" title={t.pen.rear}>
                      {pct(r)}
                    </small>
                  </button>
                  <RouteLink className="c3-rank-u" to={toUnit(u.slug)} onNavigate={navigate}>
                    ↗
                  </RouteLink>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </main>
  );
}
