/**
 * La hoja de un escondite del Mapa de Project Zomboid (2026-09-30, Task 3): una nota pegada con cinta sobre el mapa al
 * tocar sus anotaciones. Dice dónde es, qué mapa hay que encontrar (con enlace a su ficha de Objetos), qué esconde y
 * cómo está el lugar (zombis, barricadas, trampas, desde qué día aparece).
 *
 * Las notas escritas en el mapa del escondite no se repiten acá: se leen en el mapa, y alguna trae palabrotas del
 * juego que no pueden terminar en un texto de la página.
 *
 * En español, el enlace a la ficha lleva el slug en español: los slugs de Objetos (`itemSlugs.ts`, el mismo chunk que
 * baja la pestaña Objetos) se piden recién al abrir una hoja, no con el Mapa.
 */
import { useEffect, useReducer } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useMapCopy } from "./copy";
import type { ItemRef } from "./data";
import { loadItemSlugsEs } from "./itemSlugs";
import { humanize, stashLoot, type Stash } from "./layerMeta";

export default function StashCard({
  stash,
  items,
  route,
  navigate,
  onClose,
}: {
  stash: Stash;
  items: Record<string, ItemRef>;
  route: Route;
  navigate: (r: Route) => void;
  onClose: () => void;
}) {
  const t = useMapCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const [, refresh] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (lang !== "es") return;
    let alive = true;
    loadItemSlugsEs().then(
      () => alive && refresh(),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [lang]);

  const toItem = (id: string): Route => ({ ...route, view: "zomboid", pzSection: "items", detail: id });
  const item = (fullType: string) => {
    const ref = Object.hasOwn(items, fullType) ? items[fullType] : null;
    if (!ref) return <span>{humanize(fullType.replace(/^Base\./, ""))}</span>;
    return (
      <RouteLink to={toItem(ref.id)} onNavigate={navigate}>
        {lang === "es" ? ref.es : ref.en}
      </RouteLink>
    );
  };

  const where = stash.town ?? (stash.near ? t.stash.near(stash.near) : "");
  const loot = stashLoot(stash.spawnTable);
  const bags = [...new Set((stash.containers ?? []).map((c) => c.item).filter((i): i is string => !!i))];
  const days = stash.daysToSpawn?.match(/^(\d+)\s*-\s*(\d+)$/);
  const num = (n: number) => n.toLocaleString(locale);
  const facts: string[] = [];
  if (stash.zombies) facts.push(t.stash.zombies(stash.zombies, num(stash.zombies)));
  if (stash.barricades) facts.push(t.stash.barricades(num(stash.barricades)));
  if (stash.traps && stash.traps !== "0") facts.push(t.stash.traps);
  if (days) facts.push(t.stash.days(days[1], days[2]));
  if (stash.spawnOnlyOnZed) facts.push(t.stash.onlyZed);
  const [x, y] = stash.building;

  return (
    <aside className="pz-page pzm-stash" aria-labelledby="pzm-stash-h">
      <span className="pz-tape pzm-stash-tape" aria-hidden="true" />
      <button type="button" className="pzm-stash-close" onClick={onClose} aria-label={t.stash.close}>
        ×
      </button>
      <p className="pzm-stash-kick">{t.stash.title}</p>
      <h2 className="pzm-stash-h" id="pzm-stash-h">
        {where || t.stash.title}
      </h2>
      <dl className="pzm-stash-facts">
        <dt>{t.stash.map}</dt>
        <dd>{item(stash.item)}</dd>
        <dt>{t.stash.loot}</dt>
        <dd>{loot ? t.stash.loots[loot] : t.stash.none}</dd>
        {bags.length > 0 && (
          <>
            <dt>{t.stash.bag}</dt>
            <dd>
              {bags.map((b, i) => (
                <span key={b}>
                  {i > 0 && ", "}
                  {item(b)}
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>
      {facts.length > 0 && (
        <ul className="pzm-stash-notes">
          {facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      <p className="pzm-stash-at">
        {t.stash.spot}: {t.coords(String(x), String(y))}
        {stash.buildingRaw !== undefined && ` (${t.stash.approx})`}
      </p>
    </aside>
  );
}
