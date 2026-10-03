/**
 * El buscador del Mapa de Project Zomboid (2026-09-30, Task 4): un renglón de la libreta arriba de la hoja del mapa.
 * Se escribe una calle, un pueblo, un edificio, una historia o un escondite y, al elegir, el mapa va hasta ahí.
 *
 * Es un combobox de los de siempre (ARIA 1.2): las flechas recorren la lista, Enter elige, Escape la cierra (y otra vez
 * Escape borra lo escrito), y el lector de pantalla oye cuántos resultados hay. Va en el HTML del prerender (el renglón
 * vacío), pero `search.ts` (el orden, con `search.json` adentro) se pide recién cuando alguien entra al buscador: el
 * chunk de la pestaña tiene que llegar rápido para el primer dibujo.
 */
import { useMemo, useState, type KeyboardEvent } from "react";
import { useLang } from "../../i18n";
import { searchKindLabel, useMapCopy } from "./copy";
import type { SearchHit } from "./search";

type SearchModule = typeof import("./search");
/** Cuántos resultados muestra la lista (el `limit` de siempre de `searchMap`). */
const SHOWN = 8;
let searchModule: Promise<SearchModule> | null = null;
/** `search.ts` con su índice, una vez (y otra vez si falló la red). */
const loadSearch = () =>
  (searchModule ??= import("./search").catch((err) => {
    searchModule = null;
    throw err;
  }));

export default function MapSearch({ onPick }: { onPick: (hit: SearchHit) => void }) {
  const t = useMapCopy();
  const { lang } = useLang();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchModule | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const load = () => {
    if (!search) loadSearch().then(setSearch, () => undefined);
  };
  // Se pide uno más de los que se muestran, para saber si la lista se cortó: "8 resultados" con 40 que coinciden mentía.
  const found = useMemo(() => (search ? search.searchMap(search.SEARCH_INDEX, query, lang, SHOWN + 1) : []), [search, query, lang]);
  const hits = found.slice(0, SHOWN);
  const more = found.length > SHOWN;
  const typed = query.trim().length >= 2;
  const showList = open && typed && search !== null;
  const at = Math.min(active, Math.max(0, hits.length - 1));

  const pick = (hit: SearchHit) => {
    setQuery(hit.label);
    setOpen(false);
    onPick(hit);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!showList) return setOpen(true);
      if (!hits.length) return;
      setActive((at + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length);
    } else if (e.key === "Enter") {
      if (showList && hits[at]) {
        e.preventDefault();
        pick(hits[at]);
      }
    } else if (e.key === "Escape") {
      // Escape acá es del buscador: no cierra también la hoja abierta sobre el mapa.
      if (showList) {
        e.stopPropagation();
        setOpen(false);
      } else if (query) {
        e.stopPropagation();
        setQuery("");
      }
    }
  };

  const status = !typed || !open ? "" : search === null ? t.search.loading : hits.length ? (more ? t.search.firstResults(hits.length) : t.search.results(hits.length)) : t.search.none;
  return (
    <div className="pzm-search" role="search">
      <label className="visually-hidden" htmlFor="pzm-search-in">
        {t.search.label}
      </label>
      <input
        id="pzm-search-in"
        className="pzm-search-in"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls="pzm-search-list"
        aria-activedescendant={showList && hits.length ? `pzm-search-opt-${at}` : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder={t.search.placeholder}
        value={query}
        onFocus={() => {
          load();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          load();
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKey}
      />
      <ul id="pzm-search-list" className="pzm-search-list" role="listbox" aria-label={t.search.label} hidden={!showList || !hits.length}>
        {showList &&
          hits.map((h, i) => (
            <li
              key={`${h.k}|${h.en}|${h.x},${h.y}`}
              id={`pzm-search-opt-${i}`}
              role="option"
              aria-selected={i === at}
              className={`pzm-search-opt${i === at ? " is-on" : ""}`}
              // `mousedown` y no `click`: el clic llega después del `blur`, que ya cerró la lista.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(h);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="pzm-search-name">{h.label}</span>
              <span className="pzm-search-kind">{searchKindLabel(h, t)}</span>
            </li>
          ))}
      </ul>
      {showList && !hits.length && <p className="pzm-search-none">{t.search.none}</p>}
      <span className="visually-hidden" role="status">
        {status}
      </span>
    </div>
  );
}
