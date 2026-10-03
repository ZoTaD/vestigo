/**
 * La hoja de un edificio del Mapa de Project Zomboid (2026-09-30, Task 4): una nota pegada con cinta sobre el mapa al
 * tocar un edificio. Dice qué es (el tipo del mapa de papel y el tono del juego, "Casa de campo"), cuántos pisos tiene
 * (con sótano, si tiene) y, piso por piso, sus habitaciones con su nombre y su tamaño en casillas. El piso elegido se
 * dibuja en el mapa como una planta a lápiz (`viewer.showBuilding`); pasar el mouse por una habitación la marca.
 *
 * La página la pide con `lazy()` y la deja bajando apenas se monta el visor, antes del primer toque: así las tablas de
 * nombres de habitaciones (`rooms.ts`) viajan en su chunk, y no en el de la pestaña ni en el del visor.
 *
 * El foco: al abrirse (o al cambiar de edificio) la hoja toma el foco, así el teclado y el lector de pantalla siguen
 * ahí; al cerrarla, la página lo devuelve a donde estaba (el mapa o el buscador).
 *
 * "Qué hay" (2026-10-02): cada habitación tiene un botón que despliega, debajo de su fila, lo que puede aparecer en sus
 * muebles (`RoomLoot`). Los archivos del botín de las habitaciones del piso se piden al mostrarse el piso (no al abrir
 * el Mapa): así el botón ya tiene la lista al tocarlo. Se abre una por vez, para que la hoja no se vuelva una tira.
 *
 * Los nombres de los cuartos que sólo tiene el botín (`lootRoomNames.ts`, `barkitchen` → "Cocina del bar") llegan con
 * un `import()` aparte al abrir la primera hoja: es el mismo chunk que usa "Dónde aparece" en Objetos, y en el de la
 * hoja no entra.
 */
import { Fragment, useEffect, useReducer, useState, type RefObject } from "react";
import { useLang, useLocale } from "../../i18n";
import type { Route } from "../../route";
import { loadRoomLoot, roomLootFor } from "../loot/roomLoot";
import { useMapCopy, type PaperKind } from "./copy";
import { buildingName } from "./layers";
import { defaultFloor, floorsOf, type Building } from "./buildings";
import { floorRooms, roomName, toneName } from "./rooms";
import RoomLoot from "./RoomLoot";
import { loadItemSlugsEs } from "./itemSlugs";

let lootNames: Record<string, [string, string]> | undefined;
let lootNamesPending: Promise<void> | null = null;
/** Los nombres de los cuartos del botín, una vez; con un fallo, la próxima hoja los vuelve a pedir. */
const loadLootNames = () =>
  (lootNamesPending ??= import("./lootRoomNames").then(
    (m) => {
      lootNames = m.default;
    },
    (err) => {
      lootNamesPending = null;
      throw err;
    },
  ));

export default function BuildingSheet({
  building,
  rooms,
  floor,
  onFloor,
  onRoom,
  onShown,
  onClose,
  focusRef,
  route,
  navigate,
}: {
  building: Building;
  /** `common.rooms`: los nombres del juego de cada índice de habitación. */
  rooms: readonly string[];
  floor: string;
  onFloor: (floor: string) => void;
  /** Los rectángulos de la habitación bajo el mouse (para marcarla en el mapa), o `null`. */
  onRoom: (rects: number[][] | null) => void;
  /** La hoja ya está en pantalla con este edificio y este piso (y su tamaño real): la página corre el mapa si la hoja lo tapa. */
  onShown: () => void;
  onClose: () => void;
  focusRef: RefObject<HTMLElement>;
  /** Para los enlaces de "Qué hay" a la ficha de cada objeto, como en la hoja del escondite. */
  route: Route;
  navigate: (r: Route) => void;
}) {
  const t = useMapCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const [, refresh] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    focusRef.current?.focus({ preventScroll: true });
  }, [building.id, focusRef]);

  // En español, los slugs de las fichas se piden apenas se abre la hoja: si esperaban a "Qué hay", los enlaces salían
  // ~300 ms con el id en inglés (andan igual, pero con la dirección que no es la canónica).
  useEffect(() => {
    if (lang === "es") loadItemSlugsEs().catch(() => undefined);
  }, [lang]);

  useEffect(() => {
    if (lootNames) return;
    let alive = true;
    loadLootNames().then(
      () => alive && refresh(),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);

  const floors = floorsOf(building);
  const shown = floors.includes(floor) ? floor : defaultFloor(building);
  // De la más grande a la más chica; los empates, por el nombre que se lee (no por la clave del juego).
  const groups = floorRooms(building, shown, rooms, lootNames).sort(
    (a, c) => c.tiles - a.tiles || roomName(a.key, lang, lootNames).localeCompare(roomName(c.key, lang, lootNames), lang),
  );
  // La habitación con "Qué hay" abierto, junto con su edificio y su piso: cambiar de uno o de otro la cierra sola.
  const [open, setOpen] = useState<string | null>(null);
  const here = `${building.id}|${shown}|`;
  const openKey = open?.startsWith(here) ? open.slice(here.length) : null;
  const openGroup = groups.find((g) => g.key === openKey);
  // Si la lista abierta ya llegó: la hoja crece ahí, y hay que volver a avisar.
  const openReady = openGroup ? roomLootFor(openGroup.raws) !== undefined : false;

  // Los archivos del botín de las habitaciones del piso, al mostrarse el piso.
  const floorRaws = [...new Set(groups.flatMap((g) => g.raws))].join("|");
  useEffect(() => {
    let alive = true;
    loadRoomLoot(floorRaws ? floorRaws.split("|") : []).then(
      () => alive && refresh(),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [floorRaws]);

  // La hoja cambia de alto con cada piso (más o menos habitaciones) y al abrir o cerrar "Qué hay": se vuelve a avisar
  // para que no tape el edificio.
  useEffect(() => {
    onShown();
    // `onShown` cambia en cada render y sólo usa refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building.id, shown, openKey, openReady]);
  const kinds: Record<string, string> = t.building.kinds;
  const kind = building.type && Object.hasOwn(kinds, building.type) ? kinds[building.type as PaperKind] : null;
  const tone = building.tone ? toneName(building.tone, lang) : null;
  const title = building.name ? buildingName(building.name) : tone ?? kind ?? t.building.title;
  const roomCount = Object.values(building.floors).reduce((n, list) => n + list.length, 0);
  const basement = floors.some((f) => Number(f) < 0);
  const facts = [
    building.name && tone,
    basement ? `${t.building.floors(floors.length)}, ${t.building.withBasement}` : t.building.floors(floors.length),
    t.building.rooms(roomCount),
  ].filter((f): f is string => !!f);
  // El centro del edificio, que sirve más para ubicarlo que la esquina de su caja (semiabierta: x2 e y2 quedan afuera).
  const [x1, y1, x2, y2] = building.box;
  const [x, y] = [Math.floor((x1 + x2 - 1) / 2), Math.floor((y1 + y2 - 1) / 2)];

  return (
    <aside className="pz-page pzm-stash pzm-bld" aria-labelledby="pzm-bld-h" tabIndex={-1} ref={focusRef as RefObject<HTMLElement>}>
      <span className="pz-tape pzm-stash-tape" aria-hidden="true" />
      <button type="button" className="pzm-stash-close" onClick={onClose} aria-label={t.building.close}>
        ×
      </button>
      <p className="pzm-stash-kick">{kind ?? t.building.title}</p>
      <h2 className="pzm-stash-h" id="pzm-bld-h">
        {title}
      </h2>
      <p className="pzm-bld-facts">{facts.join(" · ")}</p>

      {floors.length > 1 && (
        <div className="pzm-bld-floors" role="radiogroup" aria-label={t.building.floorPick}>
          {[...floors].reverse().map((f) => (
            <label className={`pzm-bld-floor${f === shown ? " is-on" : ""}`} key={f}>
              <input type="radio" name="pzm-bld-floor" value={f} checked={f === shown} onChange={() => onFloor(f)} />
              {t.building.floor(f)}
            </label>
          ))}
        </div>
      )}

      {groups.length ? (
        <>
          {/* Qué quiere decir el número de cada "Qué hay": una vez, arriba de la tabla. */}
          <p className="pzm-stash-at">{t.building.loot.chance}</p>
          <table className="pzm-rooms">
            <caption className="visually-hidden">{t.building.floor(shown)}</caption>
            <thead>
              <tr>
                <th scope="col">{floors.length > 1 ? t.building.floor(shown) : t.building.room}</th>
                <th scope="col">{t.building.size}</th>
              </tr>
            </thead>
            {/* La habitación se marca en el mapa al pasar el mouse por su fila o al llegar con el teclado a su botón. */}
            <tbody
              onMouseLeave={() => onRoom(null)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onRoom(null);
              }}
            >
              {groups.map((g, i) => {
                const isOpen = g.key === openKey;
                const id = `pzm-loot-${i}`;
                return (
                  <Fragment key={g.key}>
                    <tr onMouseEnter={() => onRoom(g.rects)} onFocus={() => onRoom(g.rects)}>
                      <td>
                        {roomName(g.key, lang, lootNames)}
                        {g.count > 1 && <span className="pzm-rooms-n"> ×{num(g.count)}</span>}{" "}
                        <button
                          type="button"
                          className="pzm-loot-toggle"
                          aria-expanded={isOpen}
                          aria-controls={isOpen ? id : undefined}
                          onClick={() => setOpen(isOpen ? null : here + g.key)}
                        >
                          {isOpen ? t.building.loot.hide : t.building.loot.show}
                        </button>
                      </td>
                      <td className="pzm-rooms-size">{t.building.tiles(num(g.tiles))}</td>
                    </tr>
                    {isOpen && (
                      // Pasar el mouse por la lista sigue marcando su habitación en el mapa.
                      <tr className="pzm-loot-row" onMouseEnter={() => onRoom(g.rects)} onFocus={() => onRoom(g.rects)}>
                        <td colSpan={2} id={id}>
                          <RoomLoot raws={g.raws} route={route} navigate={navigate} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </>
      ) : (
        <p className="pzm-bld-facts">{t.building.noRooms}</p>
      )}
      <p className="pzm-stash-at">{t.coords(String(x), String(y))}</p>
    </aside>
  );
}
