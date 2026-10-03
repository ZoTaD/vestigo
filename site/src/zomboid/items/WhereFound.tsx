/**
 * "Dónde aparece" en la ficha de un objeto (2026-10-01): las habitaciones donde sale, cada una con su mejor mueble, la
 * chance y un enlace a un edificio de ejemplo en el Mapa; después los escondites, los zombis, los vehículos y los
 * bolsos. Es lo primero que se busca de un objeto ("¿dónde consigo una palanca?"), por eso va arriba de las recetas.
 *
 * La chance es la de un mueble con el botín en Normal (×1), como porcentaje y como palabra (`loot/chance.ts`). La
 * configuración de botín de cada partida la escala, pero escala todo igual: el orden de los mejores lugares no cambia, y
 * eso es lo que la nota le dice a quien juega con otra configuración.
 *
 * Los datos son aparte de la ficha (`loot/data.ts`): el prerender y la precarga al pasar el mouse los esperan en
 * `preloadItemsRoute`, así el HTML ya los trae. Si una navegación llega sin ellos, se piden acá y la hoja aparece
 * cuando llegan, sin "cargando": el resto de la ficha ya se puede leer, y una hoja vacía que salta no aporta nada.
 */
import type { ReactNode } from "react";
import RouteLink from "../../RouteLink";
import { useLang, useLocale, type Lang } from "../../i18n";
import type { Route } from "../../route";
import { useZomboidCopy, type PzWhereCopy } from "../../zomboidCopy";
import { roomName as gameRoomName } from "../map/rooms";
import { band, pct } from "../loot/chance";
import { loadItemLoot, loadLootCommon, mapLink, peekItemLoot, peekLootCommon, peekLootRoomNames, stashesLink, type ItemLoot, type LootCommon, type LootRow } from "../loot/data";
import { Collapse, ItemIcon, Stamp, useLoad } from "../ui";

type Nav = (r: Route) => void;

/** El nombre de un cuarto: los del mapa más los que sólo llenan botín (`loot/data.ts` los trae con `common`). */
const roomName = (raw: string, lang: Lang) => gameRoomName(raw, lang, peekLootRoomNames() ?? undefined);

/** Lo que dice cada fila: su nombre (y, debajo, otros nombres) y las notas en lápiz. */
interface Row {
  key: string;
  name: ReactNode;
  sub?: string;
  /** El mueble o la parte, si hay. */
  cont?: string;
  p: number;
  /** Lo que se agrega después de la banda: la condición, cuántas hay en el mapa. */
  extra?: string[];
  href?: string;
}

export default function WhereFound({ slug, route, navigate }: { slug: string; route: Route; navigate: Nav }) {
  const copy = useZomboidCopy().items;
  const t = copy.where;
  const { lang } = useLang();
  const locale = useLocale();
  // `undefined` mientras falte cualquiera de los dos archivos: la hoja necesita los nombres de `common` para cada fila.
  const loot = useLoad(
    slug,
    () => {
      const item = peekItemLoot(slug);
      return item === undefined || !peekLootCommon() ? undefined : item;
    },
    () => Promise.all([loadItemLoot(slug), loadLootCommon()]),
  );
  const common = peekLootCommon();
  // Sin datos todavía, si fallaron o si no aparece en ningún lado (`null`): no se dibuja nada. Un error de red acá no
  // merece una hoja de error: el resto de la ficha está, y la próxima visita lo vuelve a pedir.
  if (!loot.value || !common) return null;
  const item = loot.value;
  const num = (n: number) => n.toLocaleString(locale);
  // El nombre de una clave en el idioma de la página; si faltara (no pasa: loot_names.py tiene test de cobertura), la clave.
  const named = (key: string, names: Record<string, { en: string; es: string }>) => names[key]?.[lang] ?? key;

  const rooms = item.rooms.map((r) => roomRow(r, common, t, lang, num, route));
  // Dos escondites del juego pueden llamarse igual (`SurvivorCache1` y `2` son "Escondite de sobreviviente"): van una
  // sola vez, con la chance más alta, que es la primera.
  const stashes = firstByName(
    (item.stash ?? []).map(([key, cont, p]): Row => ({ key, name: named(key, common.stashes), cont: named(cont, common.containers), p })),
  );
  const zombies = zombieRows(item, common, t, lang);
  const vehicles: Row[] = (item.vehicles ?? []).map(([group, part, p]) => ({
    key: group,
    name: `${named(group, common.vehicles)} · ${named(part, common.parts)}`,
    p,
  }));
  const toItem = (id: string): Route => ({ ...route, view: "zomboid", pzSection: "items", detail: id });
  const bags: Row[] = (item.bags ?? []).map(([bag, p]) => ({
    key: bag.id,
    name: (
      <RouteLink to={toItem(bag.id)} onNavigate={navigate}>
        <ItemIcon icon={bag.icon} />
        <span>{bag[lang]}</span>
      </RouteLink>
    ),
    p,
  }));

  const list = (rows: Row[], shown?: number) => (
    <Collapse
      items={rows}
      render={(r) => <RowItem key={r.key} row={r} t={t} locale={locale} />}
      more={copy.more}
      shown={shown}
      className="pzi-where-list"
    />
  );
  const restOutfits = (item.zombie?.nOutfits ?? 0) - (item.zombie?.outfits.length ?? 0);
  const restVehicles = (item.nVehicles ?? 0) - (item.vehicles?.length ?? 0);

  return (
    <section className="pz-page pzi-rel pzi-where">
      <h2 className="pzi-h2">
        <Stamp name="house" />
        {t.title} {item.nRooms > 0 && <small>{item.nRooms}</small>}
      </h2>
      <p className="pzi-hand pzi-where-note">{t.note}</p>
      {rooms.length > 0 && (
        <>
          <h3 className="pzi-h3">{t.rooms}</h3>
          {/* Las cinco mejores a la vista: es lo que se busca. El resto, en el desplegable (sigue en el HTML). */}
          {list(rooms, 5)}
          {item.nRooms > rooms.length && <p className="pzi-where-rest">{t.moreRooms(item.nRooms - rooms.length, num(item.nRooms - rooms.length))}</p>}
        </>
      )}
      {stashes.length > 0 && (
        <>
          <h3 className="pzi-h3">{t.stashes}</h3>
          {list(stashes)}
          {/* Un `<a>` común y no `RouteLink`: el Mapa lee la query al cargarse. */}
          <a className="pzi-where-map" href={stashesLink(route)}>
            {t.seeStashes}
          </a>
        </>
      )}
      {zombies.length > 0 && (
        <>
          <h3 className="pzi-h3">{t.zombies}</h3>
          {list(zombies)}
          {restOutfits > 0 && <p className="pzi-where-rest">{t.moreOutfits(restOutfits, num(restOutfits))}</p>}
        </>
      )}
      {vehicles.length > 0 && (
        <>
          <h3 className="pzi-h3">{t.vehicles}</h3>
          {list(vehicles)}
          {restVehicles > 0 && <p className="pzi-where-rest">{t.moreVehicles(restVehicles, num(restVehicles))}</p>}
        </>
      )}
      {bags.length > 0 && (
        <>
          <h3 className="pzi-h3">{t.bags}</h3>
          {list(bags)}
        </>
      )}
    </section>
  );
}

/**
 * Una habitación: su nombre (la tabla del juego, que casi siempre es también un cuarto del mapa), los otros cuartos con
 * el mismo botín, el mueble, la condición si hay y el edificio de ejemplo. `_all` es todo lugar sin botín propio: no
 * tiene edificio de ejemplo (sería cualquiera).
 */
function roomRow(
  [key, cont, p, force]: LootRow,
  common: LootCommon,
  t: PzWhereCopy,
  lang: Lang,
  num: (n: number) => string,
  route: Route,
): Row {
  const name = key === "_all" ? t.anywhere : roomName(key, lang);
  // Los otros nombres sin repetir el principal: `dining` y `diningroom` se llaman los dos "Comedor".
  const others = [...new Set((common.aliases[key] ?? []).map((a) => roomName(a, lang)))].filter((o) => o !== name);
  const spot = Object.hasOwn(common.spots, key) ? common.spots[key] : undefined;
  const extra: string[] = [];
  if (force) extra.push(forceText(force, common, t, lang));
  if (spot && spot.n > 0) extra.push(t.onMap(num(spot.n)));
  return {
    key,
    name,
    sub: others.length ? t.alsoAs(others.join(", ")) : undefined,
    cont: common.containers[cont]?.[lang] ?? cont,
    p,
    extra,
    href: spot?.at ? mapLink(route, spot.at) : undefined,
  };
}

/** La condición de una fila forzada: una zona del mapa (`z:Rich`) o una de las tres del juego. */
function forceText(force: string, common: LootCommon, t: PzWhereCopy, lang: Lang): string {
  if (force.startsWith("z:")) {
    const zone = force.slice(2);
    return common.zones[zone]?.[lang] ?? zone;
  }
  return t.force[force as keyof PzWhereCopy["force"]] ?? force;
}

/**
 * Los zombis: cualquiera (si hombres y mujeres lo traen igual) o uno por cada uno, y después los atuendos. Dos atuendos
 * del juego pueden llamarse igual en un idioma (dos de policía, de distinto uniforme): van una sola vez, con la chance
 * más alta, que es la primera porque vienen ordenados de mayor a menor.
 */
function zombieRows(item: ItemLoot, common: LootCommon, t: PzWhereCopy, lang: Lang): Row[] {
  const z = item.zombie;
  if (!z) return [];
  const rows: Row[] = [];
  if (z.m === z.f) {
    if (z.m > 0) rows.push({ key: "any", name: t.anyZombie, p: z.m });
  } else {
    if (z.m > 0) rows.push({ key: "male", name: t.maleZombie, p: z.m });
    if (z.f > 0) rows.push({ key: "female", name: t.femaleZombie, p: z.f });
  }
  const outfits = z.outfits.map(([outfit, p]): Row => ({ key: `o-${outfit}`, name: t.outfit(common.outfits[outfit]?.[lang] ?? outfit), p }));
  return [...rows, ...firstByName(outfits)];
}

/** Las filas sin repetir un nombre de texto: queda la primera, que es la de chance más alta porque vienen ordenadas. */
function firstByName(rows: Row[]): Row[] {
  const seen = new Set<unknown>();
  return rows.filter((r) => !seen.has(r.name) && !!seen.add(r.name));
}

/** Una fila: el nombre arriba y las notas en lápiz abajo, que bajan de renglón en el celular. Nada de tablas. */
function RowItem({ row, t, locale }: { row: Row; t: PzWhereCopy; locale: string }) {
  const b = band(row.p);
  return (
    <li>
      <span className="pzi-where-name">{row.name}</span>
      {row.sub && <span className="pzi-where-sub">{row.sub}</span>}
      <span className="pzi-meta">
        {row.cont && <span>{row.cont}</span>}
        <span className="pzi-where-pct">{pct(row.p, locale)}</span>
        {/* La rareza va por texto y un tinte suave, nunca por un filo de color. */}
        <span className={`pzi-band is-${b}`}>{t.bands[b]}</span>
        {row.extra?.map((e) => <span key={e}>{e}</span>)}
        {row.href && (
          <a className="pzi-where-map" href={row.href}>
            {t.seeOne}
          </a>
        )}
      </span>
    </li>
  );
}
