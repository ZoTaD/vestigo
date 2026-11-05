/**
 * Comparador de DPS (2026-11-04), a la par del "DPS compare" de coh3stats y con lo que le falta: el blanco puede ser
 * cualquier vehículo por cualquiera de sus tres lados, y la veteranía de las dos unidades entra en la cuenta.
 *
 * El DPS de una unidad es la suma de sus armas de tiro directo (granadas, humo y habilidades no), cada una por su
 * cantidad en el equipo (`weapons[].count` de la ficha).
 */
import { useMemo } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang } from "../../i18n";
import { tr, type UnitRow } from "../data";
import { Coh3Loading, Cost, FactionTag, Icon, Panel, useNum, type Nav } from "../ui";
import { INFANTRY, hit, type Side, type TargetStats, type WeaponStats } from "./engine";
import { vetAt } from "./vet";
import { isArmored, targetStats, weaponStats, type WeaponData } from "./weapons";
import { useCombatCopy } from "./copy";
import { FactionOptions, LineChart, useFicha, useLists, useQueryState, useWeaponName, VetPicker } from "./parts";
import "./combat.css";

type UnitFicha = UnitRow & {
  weapons?: { slug: string; name: unknown; count: number }[];
  vet?: { xp: number; desc: { en: string } | null }[] | null;
};
/** Lo que no es tiro directo y no suma al DPS sostenido (por nombre o por clase). */
const SKIP = /grenade|smoke|satchel|sticky|mine|flare|dummy|demolition|explosive_charge|panzerfaust|_veteran/i;
const SKIP_CLS = new Set(["grenade", "rifle_grenade", "smoke", "dummy"]);
/**
 * ¿Es un lanzamiento de habilidad? Esos traen una precisión fuera de escala (11, 15: el juego los guía por guion) o en 0,
 * y no disparan solos: no suman al DPS.
 */
const isThrown = (w: WeaponData) => !w.acc || w.acc.some((a) => a > 1) || w.acc.every((a) => a === 0);

/** Las armas de una unidad que cuentan, con sus fichas ya cargadas. */
function useUnitWeapons(u: UnitFicha | null | undefined) {
  // Las de más cantidad primero (el arma de cada soldado), hasta 4.
  const slugs = (u?.weapons ?? []).filter((w) => !SKIP.test(w.slug)).sort((x, y) => y.count - x.count).slice(0, 4);
  // Hasta 4 armas por unidad: un hook por posición, siempre los mismos (las reglas de los hooks).
  const f0 = useFicha<WeaponData>("weapons", slugs[0]?.slug);
  const f1 = useFicha<WeaponData>("weapons", slugs[1]?.slug);
  const f2 = useFicha<WeaponData>("weapons", slugs[2]?.slug);
  const f3 = useFicha<WeaponData>("weapons", slugs[3]?.slug);
  const fs = [f0, f1, f2, f3];
  return slugs
    .map((s, i) => ({ slug: s.slug, n: s.count, data: fs[i] }))
    .filter((x) => x.data && x.data.dmg && !SKIP_CLS.has(x.data.cls ?? "") && !isThrown(x.data)) as { slug: string; n: number; data: WeaponData }[];
}

export default function Coh3Dps({ route, navigate }: { route: Route; navigate: Nav }) {
  const lists = useLists();
  const [q, setQ] = useQueryState({ a: "riflemen_us", b: "grenadier_ger", t: "inf", s: "0", d: "20", va: "0", vb: "0" });
  const a = useFicha<UnitFicha>("units", q.a);
  const b = useFicha<UnitFicha>("units", q.b);
  const tf = useFicha<UnitFicha>("units", q.t === "inf" ? null : q.t);
  const wa = useUnitWeapons(a);
  const wb = useUnitWeapons(b);
  if (!lists) return <Coh3Loading />;
  return <View route={route} navigate={navigate} units={lists.units} q={q} setQ={setQ} a={a} b={b} tf={tf} wa={wa} wb={wb} />;
}

function View({ route, navigate, units, q, setQ, a, b, tf, wa, wb }: {
  route: Route; navigate: Nav; units: UnitRow[]; q: Record<string, string>; setQ: (p: Record<string, string>) => void;
  a: UnitFicha | null | undefined; b: UnitFicha | null | undefined; tf: UnitFicha | null | undefined;
  wa: { slug: string; n: number; data: WeaponData }[]; wb: { slug: string; n: number; data: WeaponData }[];
}) {
  const t = useCombatCopy();
  const { lang } = useLang();
  const num = useNum();
  const wName = useWeaponName(units);
  const fighters = useMemo(() => units.filter((u) => u.kind !== "buildings"), [units]);
  const armored = useMemo(() => units.filter((u) => isArmored(u)), [units]);
  const side = (Number(q.s) || 0) as Side;
  const target: TargetStats = q.t === "inf" || !tf ? INFANTRY() : targetStats(tf);
  const stats = (ws: { n: number; data: WeaponData }[], vet: number, u: UnitFicha | null | undefined) =>
    ws.map((w) => ({ n: w.n, w: weaponStats(w.data, vetAt(u?.vet ?? null, vet)), data: w.data }));
  const sa = stats(wa, Number(q.va) || 0, a);
  const sb = stats(wb, Number(q.vb) || 0, b);
  const maxRange = Math.max(10, ...sa.map((x) => x.w.range), ...sb.map((x) => x.w.range));
  const d = Math.min(Number(q.d) || 0, maxRange);
  const dpsAt = (s: { n: number; w: WeaponStats }[], x: number) => s.reduce((acc, { n, w }) => acc + n * hit(w, target, side, x).dps, 0);
  const series = (s: { n: number; w: WeaponStats }[]) => {
    const pts: [number, number][] = [];
    for (let x = 0; x <= maxRange; x += 1) pts.push([x, dpsAt(s, x)]);
    return pts;
  };
  const pa = series(sa), pb = series(sb);
  const yMax = Math.max(1, ...pa.map((p) => p[1]), ...pb.map((p) => p[1])) * 1.1;
  const ticks = [0, yMax / 4, yMax / 2, (3 * yMax) / 4].map((v) => Math.round(v * 10) / 10);
  const card = (u: UnitFicha | null | undefined, s: typeof sa, key: "a" | "b") => {
    const now = dpsAt(s, d);
    const mp = u?.cost?.mp ?? 0;
    return (
      <Panel className={`c3-dpscard is-${key}`}>
        <div className="c3-pick">
          <span>{key === "a" ? t.dps.a : t.dps.b}</span>
          <select className="c3-input" value={key === "a" ? q.a : q.b} onChange={(e) => setQ({ [key]: e.target.value, [`v${key}`]: "0" })}>
            <FactionOptions rows={fighters} label={(r) => tr(r.name, lang)} />
          </select>
        </div>
        <VetPicker value={Number(q[`v${key}`]) || 0} onChange={(n) => setQ({ [`v${key}`]: String(n) })} label={t.vet} />
        {u && (
          <div className="c3-dpshead">
            <Icon path={u.icon} size={72} lazy={false} />
            <div>
              <RouteLink to={{ ...route, view: "coh3", c3Section: "units", detail: u.slug }} onNavigate={navigate} className="c3-dpsname">
                {tr(u.name, lang)}
              </RouteLink>
              <FactionTag f={u.faction} size={18} />
              <Cost c={u.cost} />
            </div>
          </div>
        )}
        <div className="c3-facts">
          <div className="c3-fact">
            <small>{t.dps.dps} · {t.dps.atD(num(d))}</small>
            <b>{num(now, 1)}</b>
          </div>
          {mp > 0 && (
            <div className="c3-fact">
              <small>{t.dps.perCost}</small>
              <b>{num((now / mp) * 100, 2)}</b>
            </div>
          )}
        </div>
        <p className="c3-note">{t.dps.weapons}</p>
        {s.length ? (
          <ul className="c3-wlist">
            {s.map((x) => (
              <li key={x.data.slug}>
                <span>
                  {x.n}× {wName(x.data)}
                </span>
                <b>{num(x.n * hit(x.w, target, side, d).dps, 1)}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="c3-dim">{t.dps.noWeapons}</p>
        )}
      </Panel>
    );
  };
  return (
    <main className="c3-main c3-dps">
      <header className="c3-head">
        <div className="c3-k">{t.dps.k}</div>
        <h1 className="c3-h1">{t.dps.h1}</h1>
        <p className="c3-lede">{t.dps.lede}</p>
      </header>
      <Panel>
        <div className="c3-picks">
          <label className="c3-pick">
            <span>{t.target}</span>
            <select className="c3-input" value={q.t} onChange={(e) => setQ({ t: e.target.value })}>
              <option value="inf">{t.dps.infantry}</option>
              <FactionOptions rows={armored} label={(r) => tr(r.name, lang)} />
            </select>
          </label>
          {q.t !== "inf" && (
            <div className="c3-pick">
              <span>{t.dps.side}</span>
              <div className="c3-seg">
                {[0, 1, 2].map((s) => (
                  <button key={s} type="button" aria-pressed={s === side} onClick={() => setQ({ s: String(s) })}>
                    {t.side[s]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="c3-pick is-wide">
            <span>
              {t.distance} <b className="c3-dval">{num(d)} {t.m}</b>
            </span>
            <input type="range" min={0} max={maxRange} value={d} onChange={(e) => setQ({ d: e.target.value })} />
          </label>
        </div>
        <LineChart
          label={t.dps.legend}
          xMax={maxRange}
          yMax={yMax}
          yTicks={ticks}
          yFmt={(v) => num(v, 1)}
          cursor={d}
          series={[
            { pts: pa, cls: "is-a", label: "A" },
            { pts: pb, cls: "is-b", label: "B" },
          ]}
        />
        <p className="c3-legend">
          <i className="is-a" />
          {a ? tr(a.name, lang) : t.dps.a} <i className="is-b" />
          {b ? tr(b.name, lang) : t.dps.b} · {t.dps.legend}
        </p>
        <p className="c3-note">{t.dps.model}</p>
      </Panel>
      <div className="c3-grid2 is-even">
        {card(a, sa, "a")}
        {card(b, sb, "b")}
      </div>
    </main>
  );
}

