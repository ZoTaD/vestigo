/**
 * Lo que comparten Penetración y DPS (2026-11-04): las listas de unidades y armas, las fichas que se piden al elegir,
 * el estado en la dirección (para compartir el enlace), el gráfico de líneas y el selector de veteranía.
 */
import { useEffect, useMemo, useState } from "react";
import { loadFicha, loadList, peekFicha, peekList, tr, type UnitRow, type WeaponRow } from "../data";
import { useLang } from "../../i18n";
import { useCohGame } from "../ui";
import { GAMES, factionLabel } from "../games";
import { useCombatCopy } from "./copy";
import type { WeaponData } from "./weapons";

/** Las listas de unidades y armas (o null mientras llegan). */
export function useLists(): { units: UnitRow[]; weapons: WeaponRow[] } | null {
  const game = useCohGame();
  const [v, setV] = useState(() => {
    const u = peekList("units", game), w = peekList("weapons", game);
    return u && w ? { units: u, weapons: w } : null;
  });
  useEffect(() => {
    if (v) return;
    let vivo = true;
    Promise.all([loadList("units", game), loadList("weapons", game)]).then(([units, weapons]) => vivo && setV({ units, weapons }), () => undefined);
    return () => {
      vivo = false;
    };
  }, [v]);
  return v;
}

/** Una ficha (unidad o arma) que se pide cuando cambia el slug. `undefined` mientras llega. */
export function useFicha<F>(tab: "units" | "weapons", slug: string | null | undefined): F | null | undefined {
  const game = useCohGame();
  const [f, setF] = useState<F | null | undefined>(() => (slug ? peekFicha<F>(tab, slug, game) : null));
  useEffect(() => {
    if (!slug) return setF(null);
    const now = peekFicha<F>(tab, slug, game);
    if (now !== undefined) return setF(now);
    setF(undefined);
    let vivo = true;
    loadFicha<F>(tab, slug, game).then((x) => vivo && setF(x), () => vivo && setF(null));
    return () => {
      vivo = false;
    };
  }, [tab, slug]);
  return f;
}

/** Un estado guardado en la dirección (`?k=v`), con su valor por defecto. Se lee al montar y se escribe al cambiar. */
export function useQueryState(defaults: Record<string, string>) {
  const [state, setState] = useState(defaults);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const read: Record<string, string> = {};
    for (const k of Object.keys(defaults)) {
      const v = p.get(k);
      if (v != null) read[k] = v;
    }
    if (Object.keys(read).length) setState((s) => ({ ...s, ...read }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = (patch: Record<string, string>) =>
    setState((s) => {
      const next = { ...s, ...patch };
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(next)) if (v !== defaults[k]) p.set(k, v);
      const q = p.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
      return next;
    });
  return [state, set] as const;
}

/** El nombre de un arma: el propio, o el de la primera unidad que la usa con el tipo. */
export function useWeaponName(units: UnitRow[] | undefined) {
  const { lang } = useLang();
  const bySlug = useMemo(() => new Map((units ?? []).map((u) => [u.slug, u])), [units]);
  return (w: Pick<WeaponData, "slug" | "name" | "usedBy" | "cls">): string => {
    if (w.name) return tr(w.name, lang);
    const u = w.usedBy?.[0] ? bySlug.get(w.usedBy[0]) : undefined;
    return u ? `${tr(u.name, lang)} · ${w.cls ?? ""}`.replace(/ · $/, "") : w.slug.replace(/_/g, " ");
  };
}

/** Las opciones de un `<select>` agrupadas por facción. */
export function FactionOptions<T extends { slug: string; faction: string | null }>({ rows, label }: { rows: T[]; label: (r: T) => string }) {
  const game = useCohGame();
  const { lang } = useLang();
  return (
    <>
      {GAMES[game].factions.map((f) => {
        const mine = rows.filter((r) => r.faction === f).sort((a, b) => label(a).localeCompare(label(b)));
        if (!mine.length) return null;
        return (
          <optgroup key={f} label={factionLabel(game, lang, f, false)}>
            {mine.map((r) => (
              <option key={r.slug} value={r.slug}>
                {label(r)}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}

/** Veteranía 0–3. */
export function VetPicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const t = useCombatCopy();
  return (
    <div className="c3-seg c3-vet" role="group" aria-label={label}>
      {[0, 1, 2, 3].map((n) => (
        <button key={n} type="button" aria-pressed={n === value} onClick={() => onChange(n)}>
          {t.vetN(n)}
        </button>
      ))}
    </div>
  );
}

export type Series = { pts: [number, number][]; cls: string; label: string };

/** Un gráfico de líneas propio (SVG, sin librerías): eje x en metros, eje y con su formato. */
export function LineChart({ series, xMax, yMax, yTicks, yFmt, cursor, label }: { series: Series[]; xMax: number; yMax: number; yTicks: number[]; yFmt: (v: number) => string; cursor?: number; label: string }) {
  const W = 560, H = 220, pl = 48, pr = 12, pt = 12, pb = 28;
  const x = (d: number) => pl + (d / (xMax || 1)) * (W - pl - pr);
  const y = (v: number) => pt + (1 - Math.min(v, yMax) / (yMax || 1)) * (H - pt - pb);
  const xs: number[] = [];
  const step = xMax > 60 ? 20 : 10;
  for (let d = 0; d <= xMax + 1e-9; d += step) xs.push(d);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="c3-chart" role="img" aria-label={label}>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} className="c3-chart-grid" />
          <text x={pl - 6} y={y(v) + 4} textAnchor="end" className="c3-chart-ax">
            {yFmt(v)}
          </text>
        </g>
      ))}
      {xs.map((d) => (
        <text key={d} x={x(d)} y={H - 8} textAnchor="middle" className="c3-chart-ax">
          {d} m
        </text>
      ))}
      {series.map((s) => (
        <path key={s.label} className={`c3-chart-line ${s.cls}`} d={s.pts.map(([d, v], i) => `${i ? "L" : "M"}${x(d).toFixed(1)},${y(v).toFixed(1)}`).join("")} />
      ))}
      {cursor != null && <line className="c3-chart-cursor" x1={x(cursor)} x2={x(cursor)} y1={pt} y2={H - pb} />}
    </svg>
  );
}
