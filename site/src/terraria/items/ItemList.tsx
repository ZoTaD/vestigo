/**
 * La lista de objetos de Terraria (2026-10-12): buscador, filtro por tipo y por rareza, y la grilla de casilleros
 * dibujada de a tandas (son más de seis mil). El tipo elegido viaja en el `#hash`, así un atajo de la portada o un
 * enlace compartido abren la lista ya filtrada.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../../i18n";
import { LazyRows } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { KINDS, useTerrariaCopy, type Kind } from "../../terrariaCopy";
import type { Row } from "../data";
import { itemRoute, rare, Slot, Sprite, type Nav } from "../ui";
import { normalize, RARITIES } from "./stats";

/** El alto de un casillero de la grilla, en px, medido en el navegador a 1.400 px (2026-10-12). */
const TR_CELL = 90;

const kindFromHash = (): Kind | null => {
  if (typeof window === "undefined") return null;
  const h = window.location.hash.slice(1);
  return (KINDS as string[]).includes(h) ? (h as Kind) : null;
};

export default function ItemList({ rows, route, navigate, missing }: { rows: Row[]; route: Route; navigate: Nav; missing: boolean }) {
  const t = useTerrariaCopy();
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind | null>(null);
  const [rarity, setRarity] = useState<number | null>(null);
  // El `#hash` se lee después del primer dibujo: el HTML prerenderizado es siempre la lista sin filtrar.
  useEffect(() => setKind(kindFromHash()), []);
  const pick = (k: Kind | null) => {
    setKind(k);
    window.history.replaceState(window.history.state, "", k ? `#${k}` : window.location.pathname);
  };
  const shown = useMemo(() => {
    const q = normalize(query);
    return rows.filter((r) => (!kind || r.kind === kind) && (rarity === null || r.rare === rarity) && (!q || normalize(r.name).includes(q)));
  }, [rows, query, kind, rarity]);
  return (
    <main className="tr-main tr-items">
      <div className="tr-wrap">
        <header className="tr-head">
          <h1 className="tr-h1 tr-andy">{t.items.h1}</h1>
          <p className="tr-lede">{t.items.lede(rows.length.toLocaleString(locale))}</p>
        </header>
        {missing && (
          <p className="tr-dug tr-note" role="status">
            {t.items.missing}
          </p>
        )}
        <div className="tr-dug tr-filters">
          <label className="tr-find">
            <span className="tr-label">{t.items.filterLabel}</span>
            <input type="search" value={query} placeholder={t.home.searchPlaceholder} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="tr-chips" role="group" aria-label={t.home.byKind}>
            <button type="button" className={`tr-chip${kind === null ? " is-on" : ""}`} aria-pressed={kind === null} onClick={() => pick(null)}>
              {t.items.all}
            </button>
            {KINDS.map((k) => (
              <button type="button" className={`tr-chip${kind === k ? " is-on" : ""}`} aria-pressed={kind === k} onClick={() => pick(k)} key={k}>
                {t.kinds[k]}
              </button>
            ))}
          </div>
          <label className="tr-select">
            <span className="tr-label">{t.items.stat.rarity}</span>
            <select value={rarity ?? ""} onChange={(e) => setRarity(e.target.value === "" ? null : Number(e.target.value))}>
              <option value="">{t.items.anyRarity}</option>
              {RARITIES.map((r) => (
                <option value={r} key={r}>
                  {t.rarity(r)}
                </option>
              ))}
            </select>
          </label>
          <p className="tr-count" aria-live="polite">
            {shown.length ? t.items.count(shown.length.toLocaleString(locale)) : t.items.none}
          </p>
        </div>
        <ul className="tr-grid">
          <LazyRows
            items={shown}
            rowHeight={TR_CELL}
            tag="li"
            eager
            // Las tandas se piden más cerca de la pantalla que en otras listas: con 9 columnas, el margen de siempre
            // (1.200 px) traía ~190 sprites al abrir, al borde del presupuesto de 200 imágenes.
            margin={600}
            render={(r) => (
              <li key={r.id}>
                <RouteLink className="tr-cell" to={itemRoute(route, r.slug)} onNavigate={navigate} prefetch="press">
                  <Slot>
                    <Sprite id={r.id} w={r.w} h={r.h} />
                  </Slot>
                  <span style={rare(r.rare)}>{r.name}</span>
                  {r.figure > 0 && (
                    <small>
                      {r.figure} {r.kind === "armor" || r.kind === "accessory" ? t.items.defense : t.items.damage}
                    </small>
                  )}
                </RouteLink>
              </li>
            )}
          />
        </ul>
      </div>
    </main>
  );
}
