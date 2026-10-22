/**
 * La lista de aldeanos de Stardew Valley (2026-10-22): los 34 retratos en una caja del menú, con el nombre y el
 * cumpleaños, y dos filtros: los que se pueden cortejar y la estación del cumpleaños. Son pocos (34), no necesitan
 * `LazyRows`; los retratos van `lazy` y con tamaño fijo.
 *
 * Los filtros van en la dirección (`?romance=1&season=2`), así se pueden compartir. Se leen después del primer dibujo:
 * el HTML prerenderizado es siempre la lista sin filtrar.
 */
import { useEffect, useMemo, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useStardewCopy } from "../../stardewCopy";
import { filterVillagers, readVillagerFilters, say, writeVillagerFilters, type Villager, type VillagerFilters } from "../data";
import { Box, type Nav } from "../ui";

export default function VillagerList({ villagers, route, navigate, missing }: { villagers: Villager[]; route: Route; navigate: Nav; missing: boolean }) {
  const t = useStardewCopy();
  const c = t.villagers;
  const { lang } = useLang();
  const locale = useLocale();
  const [filters, setFilters] = useState<VillagerFilters>({ romance: false, season: null });
  useEffect(() => setFilters(readVillagerFilters(window.location.search)), []);
  // Sobre el estado de ese momento (no el del último dibujo), y la dirección al día con lo elegido.
  const pick = (patch: Partial<VillagerFilters>) =>
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${writeVillagerFilters(next)}`);
      return next;
    });
  // Por nombre en el idioma que se lee.
  const sorted = useMemo(() => [...villagers].sort((a, b) => say(a.name, lang).localeCompare(say(b.name, lang), lang)), [villagers, lang]);
  const shown = useMemo(() => filterVillagers(sorted, filters), [sorted, filters]);

  return (
    <main className="sd-main sd-villagers">
      <Box className="sd-intro">
        <h1 className="sd-h1">{c.h1}</h1>
        <p className="sd-lede">{c.lede(villagers.length.toLocaleString(locale))}</p>
        {missing && (
          <p className="sd-note" role="status">
            {c.missing}
          </p>
        )}
        <div className="sd-filters">
          <div className="sd-chips" role="group" aria-label={c.filterRomance}>
            <button type="button" className={`sd-pill${filters.romance ? " is-on" : ""}`} aria-pressed={filters.romance} onClick={() => pick({ romance: !filters.romance })}>
              {c.filterRomance}
            </button>
          </div>
          <div className="sd-chips" role="group" aria-label={c.filterBirthday}>
            <span className="sd-label">{c.filterBirthday}</span>
            <button type="button" className={`sd-pill${filters.season === null ? " is-on" : ""}`} aria-pressed={filters.season === null} onClick={() => pick({ season: null })}>
              {c.allSeasons}
            </button>
            {t.seasons.map((name, i) => (
              <button type="button" className={`sd-pill${filters.season === i ? " is-on" : ""}`} aria-pressed={filters.season === i} onClick={() => pick({ season: i })} key={name}>
                {name}
              </button>
            ))}
          </div>
          <p className="sd-count" aria-live="polite">
            {c.count(shown.length.toLocaleString(locale))}
          </p>
        </div>
      </Box>

      <Box className="sd-roster">
        <ul className="sd-vgrid">
          {shown.map((v) => (
            <li key={v.key}>
              <RouteLink className="sd-vcard" to={{ ...route, view: "stardew", sdSection: "villagers", detail: v.slug }} onNavigate={navigate} prefetch="press">
                <span className="sd-vframe">
                  <img className="sd-portrait" src={`/stardew/portraits/${v.key.toLowerCase()}.png`} alt="" width={64} height={64} loading="lazy" decoding="async" />
                </span>
                <span className="sd-vtext">
                  <b>{say(v.name, lang)}</b>
                  <small>{c.birthday(t.seasons[v.birthday[0]], v.birthday[1])}</small>
                </span>
              </RouteLink>
            </li>
          ))}
        </ul>
      </Box>
    </main>
  );
}
