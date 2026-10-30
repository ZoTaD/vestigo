/** Piezas que comparten las calculadoras: el selector con buscador, los números y el estado en la dirección. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLang } from "../i18n";
import { LazyRows } from "../LazyRows";
import { useValheimCopy } from "../valheimCopy";
import { BIOME_IDS, fold, tx, type BiomeId, type Txt } from "../valheimData";
import { Slot } from "../ValheimParts";

/** Lo mínimo que necesita una fila para el selector. */
export interface Pickable { id: string; name: Txt; icon: string | null; tier?: BiomeId | null }

/**
 * Un botón con lo elegido que abre una lista con buscador y bioma. La lista se dibuja recién al abrirse (no va al
 * prerender) y de a tandas si es larga.
 */
export function Picker<T extends Pickable>({ rows, value, onPick, label, placeholder, extra, allowNone, noneText, biomes = true }: {
  rows: T[];
  value: T | null;
  onPick: (row: T | null) => void;
  label?: string;
  placeholder: string;
  /** Lo que se ve a la derecha del nombre (cifras). */
  extra?: (row: T) => ReactNode;
  allowNone?: boolean;
  noneText?: string;
  biomes?: boolean;
}) {
  const v = useValheimCopy();
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [biome, setBiome] = useState<BiomeId | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const tiers = useMemo(() => BIOME_IDS.filter((b) => rows.some((r) => r.tier === b)), [rows]);
  const shown = useMemo(() => {
    const f = fold(q.trim());
    return rows.filter((r) => (!biome || r.tier === biome) && (!f || fold(r.name.en).includes(f) || fold(r.name.es).includes(f)));
  }, [rows, q, biome]);
  const pick = (r: T | null) => { onPick(r); setOpen(false); setQ(""); };
  return (
    <div className="vc-picker" ref={box}>
      {label && <span className="vc-label">{label}</span>}
      <button type="button" className="vc-pick" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Slot icon={value?.icon} size="sm" />
        <span className={value ? "" : "vh-dim"}>{value ? tx(value.name, lang) : placeholder}</span>
        {value && extra && <span className="vc-pick-x">{extra(value)}</span>}
        <span className="vc-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="vc-drop vh-box">
          <input className="vh-input" type="search" autoFocus value={q} placeholder={v.searchTab} aria-label={v.searchTab} onChange={(e) => setQ(e.target.value)} />
          {biomes && tiers.length > 1 && (
            <div className="vh-opts vc-biomes">
              <button type="button" className="vh-chip" aria-pressed={!biome} onClick={() => setBiome(null)}>{v.filters.all}</button>
              {tiers.map((b) => (
                <button key={b} type="button" className="vh-chip" aria-pressed={biome === b} data-biome={b} onClick={() => setBiome(biome === b ? null : b)}>
                  <span className="vh-dot" />{v.biomes[b]}
                </button>
              ))}
            </div>
          )}
          <div className="vc-list" role="listbox">
            {allowNone && (
              <button type="button" className="vc-row" role="option" aria-selected={!value} onClick={() => pick(null)}>
                <Slot icon={null} size="sm" /><span className="vh-dim">{noneText}</span>
              </button>
            )}
            <LazyRows items={shown} rowHeight={44} chunk={40} render={(r) => (
              <button key={r.id} type="button" className="vc-row" role="option" aria-selected={value?.id === r.id} onClick={() => pick(r)}>
                <Slot icon={r.icon} size="sm" />
                <span>{tx(r.name, lang)}</span>
                {extra && <span className="vc-row-x">{extra(r)}</span>}
              </button>
            )} />
            {!shown.length && <p className="vh-dim vc-none">{v.noResults}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Un número redondeado para leer: sin decimales desde 100, uno debajo. */
export const num = (n: number, lang: string): string =>
  n.toLocaleString(lang === "es" ? "es" : "en", { maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 1 });

/**
 * Estado en la dirección (`?a=…&b=…`), sin sumar entradas al historial. Se lee una vez al montar; en el prerender
 * no hay dirección y queda lo de por defecto.
 */
export function useQueryState(): [URLSearchParams, (patch: Record<string, string | number | null | undefined>) => void] {
  const [q, setQ] = useState(() => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search));
  const set = (patch: Record<string, string | number | null | undefined>) => {
    setQ((old) => {
      const n = new URLSearchParams(old);
      for (const [k, val] of Object.entries(patch)) {
        if (val == null || val === "") n.delete(k);
        else n.set(k, String(val));
      }
      if (typeof window !== "undefined") {
        const s = n.toString();
        window.history.replaceState(window.history.state, "", window.location.pathname + (s ? `?${s}` : ""));
      }
      return n;
    });
  };
  return [q, set];
}

/** Un entero de la dirección, recortado al rango. */
export const intParam = (q: URLSearchParams, k: string, def: number, min: number, max: number): number => {
  const n = Number(q.get(k));
  return q.has(k) && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};
