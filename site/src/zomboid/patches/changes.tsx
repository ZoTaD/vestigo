/**
 * El lugar del "Qué cambió" en cada ficha de Project Zomboid (2026-10-02). Es diminuto a propósito: el recuadro de
 * verdad (`ChangesBox`, con los renglones, las etiquetas de los campos y la copia de Parches, ~7 KB con gzip) baja en su
 * propio chunk y sólo si la ficha trae `changes`. Hasta la 42.22 ninguna trae, y ninguna pestaña lo paga.
 *
 * Para que el prerender y la primera carga lo dibujen sin esperar, `preloadChanges` (`preloadChanges.ts`) lo pide junto
 * con la pestaña cuando la ficha de la ruta tiene cambios. Al navegar dentro del sitio a una ficha con cambios, el
 * recuadro aparece un instante después, abajo de todo.
 */
import { useLoad } from "../ui";
import { loadChangesBox, peekChangesBox, type Box } from "./boxLoader";

export function ChangesSlot(props: Parameters<Box>[0]) {
  const Loaded = useLoad(props.changes?.length ? "box" : null, () => peekChangesBox() ?? undefined, loadChangesBox).value;
  return Loaded ? <Loaded {...props} /> : null;
}
