/**
 * "Qué hay" en una habitación de la hoja del edificio del Mapa (2026-10-02): lo que puede aparecer en sus muebles, de lo
 * más probable a lo menos, cada objeto con su ícono, el enlace a su ficha, el mueble que más lo trae y la chance de que
 * uno de esos muebles lo traiga (con el botín en Normal; la nota va una vez, arriba de la tabla de habitaciones).
 *
 * Un cuarto sin tabla propia (un `bedroom4`, que el juego no junta con `bedroom`) trae lo de cualquier lugar: se dice
 * arriba de la lista, así no parece que el dormitorio y el pasillo tengan lo mismo por error.
 *
 * En español los enlaces llevan el slug en español: se piden los slugs (`itemSlugs.ts`) y la lista se vuelve a dibujar
 * cuando llegan, como en la hoja del escondite.
 */
import { useEffect, useReducer } from "react";
import { useLang, useLocale, type Lang } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { pct } from "../loot/chance";
import { loadRoomLoot, roomLootFor, type RoomLootRow } from "../loot/roomLoot";
import { Collapse, ItemIcon } from "../ui";
import { useMapCopy, type MapCopy } from "./copy";
import { loadItemSlugsEs } from "./itemSlugs";

/** La condición de una fila: las tres del juego como en Objetos; la de zona sin nombrarla (sus nombres no viajan acá). */
function forceText(force: string, t: MapCopy["building"]["loot"]): string {
  if (force.startsWith("z:")) return t.force.z;
  return Object.hasOwn(t.force, force) ? t.force[force as keyof typeof t.force] : force;
}

export default function RoomLoot({ raws, route, navigate }: { raws: string[]; route: Route; navigate: (r: Route) => void }) {
  const t = useMapCopy().building.loot;
  const { lang } = useLang();
  const locale = useLocale();
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const view = roomLootFor(raws);
  const missing = view === undefined;
  const key = raws.join("|");

  // La hoja ya los pide al cambiar de piso; esto cubre un pedido que falló (la próxima llamada lo repite).
  useEffect(() => {
    if (!missing) return;
    let alive = true;
    loadRoomLoot(key.split("|")).then(
      () => alive && refresh(),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [key, missing]);

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

  if (view === undefined) return <p className="pzm-loot-wait">{t.loading}</p>;
  if (view === null) return null;
  const toItem = (id: string): Route => ({ ...route, view: "zomboid", pzSection: "items", detail: id });

  return (
    <div className="pzm-loot">
      {!view.own && <p className="pzm-loot-generic">{t.generic}</p>}
      <Collapse
        items={view.top}
        shown={8}
        more={t.more}
        className="pzm-loot-list"
        render={(row) => <Row key={row.id} row={row} to={toItem(row.id)} navigate={navigate} lang={lang} locale={locale} t={t} />}
      />
    </div>
  );
}

/** Un objeto: el ícono y el nombre (el enlace) arriba; el mueble, la chance y la condición en lápiz abajo. */
function Row({
  row,
  to,
  navigate,
  lang,
  locale,
  t,
}: {
  row: RoomLootRow;
  to: Route;
  navigate: (r: Route) => void;
  lang: Lang;
  locale: string;
  t: MapCopy["building"]["loot"];
}) {
  return (
    <li>
      <RouteLink to={to} onNavigate={navigate} className="pzm-loot-item">
        <ItemIcon icon={row.icon} size={24} />
        <span>{lang === "es" ? row.es : row.en}</span>
      </RouteLink>
      <span className="pzm-loot-meta">
        <span>{row.cont[lang === "es" ? 1 : 0]}</span>
        <span className="pzm-loot-pct">{pct(row.p, locale)}</span>
        {row.force && <span>{forceText(row.force, t)}</span>}
      </span>
    </li>
  );
}
