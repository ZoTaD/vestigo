/**
 * Lo que comparten Estadísticas y Tier list (2026-11-04): el modo y la banda de ELO elegidos (en la dirección, `?m=&b=`,
 * para poder compartir el enlace), los botones que los cambian, el resumen cargado y el nombre de cada mapa.
 */
import { useEffect, useState } from "react";
import { useLang } from "../../i18n";
import { BANDS, MODES, loadSummary, peekSummary, prettyMap, type Band, type Mode, type Summary } from "./data";
import { useStatsCopy } from "./copy";
import { useNum } from "../ui";

/** El modo y la banda, leídos de la dirección al montar y escritos con `replaceState` al cambiar. */
export function useModeBand(defMode: Mode = "1v1") {
  const [mode, setMode] = useState<Mode>(defMode);
  const [band, setBand] = useState<Band>("all");
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const m = p.get("m") as Mode | null, b = p.get("b") as Band | null;
    if (m && MODES.includes(m)) setMode(m);
    if (b && BANDS.includes(b)) setBand(b);
  }, []);
  const write = (m: Mode, b: Band) => {
    const p = new URLSearchParams(window.location.search);
    p.set("m", m);
    if (b === "all") p.delete("b");
    else p.set("b", b);
    const q = p.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  };
  return {
    mode,
    band,
    setMode: (m: Mode) => (setMode(m), write(m, band)),
    setBand: (b: Band) => (setBand(b), write(mode, b)),
  };
}

export function ModeBandPicker({ mode, band, setMode, setBand, modes = MODES }: { mode: Mode; band: Band; setMode: (m: Mode) => void; setBand: (b: Band) => void; modes?: Mode[] }) {
  const t = useStatsCopy();
  return (
    <div className="c3-filters c3-mb">
      <div className="c3-seg" role="group" aria-label={t.mode}>
        {modes.map((m) => (
          <button key={m} type="button" aria-pressed={m === mode} onClick={() => setMode(m)}>
            {m}
          </button>
        ))}
      </div>
      <label>
        {t.elo}
        <select value={band} onChange={(e) => setBand(e.target.value as Band)}>
          {BANDS.map((b) => (
            <option key={b} value={b}>
              {t.band[b]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** El resumen de partidas: lo que ya llegó (prerender) o lo que se pide al montar. */
export function useSummary(): Summary | null | "error" {
  const [s, setS] = useState<Summary | null | "error">(() => peekSummary());
  useEffect(() => {
    if (s) return;
    let vivo = true;
    loadSummary().then((v) => vivo && setS(v), () => vivo && setS("error"));
    return () => {
      vivo = false;
    };
  }, [s]);
  return s;
}

/** La línea que dice de cuántas partidas y qué fechas sale todo. */
export function WindowLine({ s }: { s: Summary }) {
  const t = useStatsCopy();
  const num = useNum();
  const { lang } = useLang();
  const fmt = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString(lang === "es" ? "es-AR" : "en-US", { day: "numeric", month: "short" }) : "—");
  return (
    <p className="c3-note">
      {t.window(fmt(s.from), fmt(s.to), s.days, num(s.matches))} {t.credit}
    </p>
  );
}

let mapNames: Record<string, { en: string; es?: string | null }> | null = null;
/** El nombre de un mapa por su id de partida (`pachino_2p`): de `maps.json` si lo tiene, si no, el id prolijo. */
export function useMapName() {
  const { lang } = useLang();
  const [names, setNames] = useState(mapNames);
  useEffect(() => {
    if (names) return;
    import("@coh3/maps.json").then(
      (m) => {
        const rows = (m.default as unknown as { id?: string; slug: string; name: { en: string; es?: string | null } }[]) ?? [];
        mapNames = Object.fromEntries(rows.flatMap((r) => [[r.slug, r.name], ...(r.id ? [[r.id, r.name] as const] : [])]));
        setNames(mapNames);
      },
      () => undefined,
    );
  }, [names]);
  return (id: string) => {
    const n = names?.[id] ?? names?.[id.toLowerCase()];
    return n ? (lang === "es" && n.es) || n.en : prettyMap(id);
  };
}
