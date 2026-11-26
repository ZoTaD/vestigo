/**
 * Piezas comunes de Civilizaciones, Matchups y Mapas de AoE2 (2026-11-20): carga del resumen, filtros (modo, banda de
 * ELO, período), nombre y escudo de una civ por slug, nombre de un mapa, y la barra de % de victorias.
 */
import { useEffect, useState } from "react";
import { useLang, type Lang } from "../../i18n";
import { useAoe2Copy } from "../../aoe2Copy";
import { CivShield, ModePicker, civBySlug } from "../ui";
import { BANDS, loadSummary, peekSummary, type BandOrAll, type StatMode, type Summary, type WindowKey } from "./data";
import maps from "@aoe2/maps.json";
import { mapName as prettify } from "../players/mapName";

const MAPAS = new Map((maps as { slug: string; name: { en: string; es: string }; icon: boolean }[]).map((m) => [m.slug, m]));
export const mapLabel = (slug: string, lang: Lang): string => MAPAS.get(slug)?.name[lang] ?? prettify(slug);
export const mapIcon = (slug: string): string => (MAPAS.get(slug)?.icon ? `/aoe2/map/${slug}.webp` : "/aoe2/map/_generic.webp");

export function useSummary(): Summary | null | undefined {
  const [s, setS] = useState<Summary | null | undefined>(peekSummary);
  useEffect(() => {
    if (s !== undefined) return;
    let vivo = true;
    void loadSummary().then((x) => vivo && setS(x));
    return () => {
      vivo = false;
    };
  }, []);
  return s;
}

export type Filters = { mode: StatMode; band: BandOrAll; window: WindowKey };
export const FILTROS_INICIALES: Filters = { mode: "rm1v1", band: "all", window: "14" };

export function StatFilters({ f, set, s, bands = true, modes = ["rm1v1", "rmteam", "ew1v1", "ewteam"] }: { f: Filters; set: (f: Filters) => void; s: Summary; bands?: boolean; modes?: StatMode[] }) {
  const t = useAoe2Copy();
  const { lang } = useLang();
  const ventanas = (["7", "14", "28", "patch"] as WindowKey[]).filter((w) => s.windows[w]);
  return (
    <>
      {modes.length > 1 && <ModePicker value={f.mode} onChange={(m) => set({ ...f, mode: m as StatMode })} modes={modes} />}
      <div className="a2-filters">
        {bands && (
          <div className="a2-chips" role="radiogroup" aria-label={t.st.band}>
            {(["all", ...BANDS] as BandOrAll[]).map((b) => (
              <button key={b} type="button" role="radio" aria-checked={f.band === b} className={f.band === b ? "is-on" : undefined} onClick={() => set({ ...f, band: b })}>
                {t.st.bands[b]}
              </button>
            ))}
          </div>
        )}
        <label>
          {t.st.window}{" "}
          <select value={f.window} onChange={(e) => set({ ...f, window: e.target.value as WindowKey })}>
            {ventanas.map((w) => (
              <option key={w} value={w}>
                {w === "patch" && s.patch ? t.st.sinceP(s.patch.name, new Date(s.patch.since).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })) : t.st.windows[w]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}

/** La civ de un slug del resumen (`civ_63` si es una que todavía no conocemos). */
export function Civ({ slug, size = 30, name = true }: { slug: string; size?: number; name?: boolean }) {
  const t = useAoe2Copy();
  const { lang } = useLang();
  const c = civBySlug(slug);
  return (
    <span className="a2-civ">
      <CivShield civ={c} size={size} />
      {name && <span>{c?.name[lang] ?? t.st.unknownCiv(slug.replace("civ_", "#"))}</span>}
    </span>
  );
}

export const pct = (x: number | null, d = 1) => (x == null ? "–" : `${(x * 100).toFixed(d)}%`);

/** La barra del % de victorias, centrada en el 50 %: verde a la derecha, roja a la izquierda. */
export function WrBar({ wr }: { wr: number }) {
  const d = Math.max(-0.1, Math.min(0.1, wr - 0.5));
  const ancho = `${(Math.abs(d) / 0.1) * 50}%`;
  return (
    <span className="a2-wrbar" aria-hidden="true">
      <i className={d >= 0 ? "is-up" : "is-down"} style={d >= 0 ? { left: "50%", width: ancho } : { right: "50%", width: ancho }} />
    </span>
  );
}
