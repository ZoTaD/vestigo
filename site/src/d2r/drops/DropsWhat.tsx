/**
 * "¿Qué suelta?" (2026-09-29): elegís un jefe, un superúnico o un tipo de
 * monstruo de un área, la dificultad, y ves runas, únicos y piezas con su
 * chance por muerte.
 */
import { useDeferredValue, useMemo } from "react";
import type { Route } from "../../route";
import { useD2rCopy } from "../../d2rCopy";
import { Chips } from "../ui";
import { Busy, usePainted } from "./Busy";
import { dropData } from "./data";
import DropLists, { isKnownPlace, PlaceSelect } from "./DropLists";
import { areaDropsOf, CATS, dropsOf, sourceKill, type Cat, type DropLists as Lists, type PlaceRef } from "./places";
import { placeParam, toOpts, toSettings, type DropsState } from "./state";
import type { Diff } from "./types";

type Props = { st: DropsState; set: (p: Partial<DropsState>) => void; route: Route; navigate: (r: Route) => void };

/**
 * Los tipos de monstruo que se ofrecen en un área: el Heraldo sólo aparece en las Zonas de Terror de Infierno, así que sólo en
 * un área que se puede aterrorizar (la Cima de Arreat y las de Pandemonio no), con la zona prendida y en Infierno.
 */
const offeredCats = (st: DropsState, areaId: number): Cat[] =>
  CATS.filter((c) => c !== "herald" || (st.tz > 0 && st.pdiff === 2 && !!dropData().areaById.get(areaId)?.tz));

/**
 * El lugar que se muestra. Uno que no se puede resolver (un enlace roto, un área sin monstruos) vale como no haber elegido
 * ninguno. Y de un área, el tipo elegido o, si ya no se ofrece (el Heraldo al pasar a Pesadilla, en un enlace viejo sin la
 * Zona de Terror o en un área que no se aterroriza), el común: la elección queda como está en el estado, así al volver a
 * Infierno con la zona vuelve el Heraldo.
 */
function shownPlace(st: DropsState): PlaceRef | null {
  const p = st.place;
  if (!isKnownPlace(p)) return null;
  return p.k === "a" && !offeredCats(st, p.id).includes(p.cat) ? { ...p, cat: "normal" } : p;
}

/**
 * Lo que suelta el lugar, por muerte: de un jefe, lo de su muerte; de un área, el promedio de todos sus monstruos del tipo
 * elegido, el mismo número que su fila en "¿Dónde lo farmeo?". null si ahí no muere nada (el Clon de Diablo fuera de Infierno).
 */
function listsOf(place: PlaceRef, st: DropsState): Lists | null {
  const D = dropData();
  if (place.k === "a") {
    const area = D.areaById.get(place.id);
    return area ? areaDropsOf(D, area, st.pdiff, place.cat, toOpts(st), toSettings(st)) : null;
  }
  const src = D.sourceById.get(place.id);
  const kill = src ? sourceKill(D, src, st.pdiff, toOpts(st)) : null;
  return kill ? dropsOf(D, kill, toSettings(st)) : null;
}

export default function DropsWhat({ st, set, route, navigate }: Props) {
  const td = useD2rCopy().drops;
  // Los controles responden al toque y las listas van una vuelta atrás: `dropsOf` tarda hasta ~220 ms en un jefe de Infierno
  // y, calculado en el mismo render, el selector y los botones esperaban a que terminara.
  const shown = useDeferredValue(st);
  // `useDeferredValue` no difiere el primer render: un enlace que abre con un lugar elegido (o el botón "¿Qué más suelta?")
  // calculaba ahí mismo y la página quedaba trabada. En el navegador la primera cuenta va después del primer pintado.
  const painted = usePainted();
  const place = shownPlace(st);
  const listed = shownPlace(shown);
  // El lugar es un objeto nuevo en cada vuelta: para las cuentas y para la `key` va su texto.
  const listedKey = listed ? placeParam(listed) : "";
  // null: sin lugar, o ahí no muere nada. undefined: todavía sin calcular.
  const lists = useMemo(
    () => (!listed ? null : painted ? listsOf(listed, shown) : undefined),
    // Sólo lo que cambia la cuenta: el ítem de "¿Dónde lo farmeo?", las runs o la semilla del cofre no la recalculan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [painted, listedKey, shown.pdiff, shown.tz, shown.tier, shown.quest, shown.mf, shown.players, shown.party, shown.ladder],
  );
  const busy = !!listed && (lists === undefined || st !== shown);
  return (
    <div className="d2-dr-what">
      <div className="d2-dr-place">
        <PlaceSelect value={place} onChange={(p) => set({ place: p })} />
        <Chips<number> label={td.diff} value={st.pdiff} onChange={(d) => set({ pdiff: d as Diff })} options={td.diffs.map((label, i) => ({ value: i, label }))} />
        {place?.k === "a" && (
          <Chips<string>
            label={td.monsterType}
            value={place.cat}
            onChange={(cat) => set({ place: { k: "a", id: place.id, cat: cat as Cat } })}
            options={offeredCats(st, place.id).map((c) => ({ value: c, label: td.cats[c] }))}
          />
        )}
      </div>
      {/* La `key` cierra el "Ver todo" al cambiar de lugar: otra lista no arranca con cientos de tarjetas abiertas. */}
      {!listed ? (
        <p className="d2-empty">{td.pickPlace}</p>
      ) : (
        <Busy busy={busy}>
          {lists === undefined ? null : lists ? <DropLists key={listedKey} lists={lists} route={route} navigate={navigate} /> : <p className="d2-empty">{td.noDrops}</p>}
        </Busy>
      )}
    </div>
  );
}
