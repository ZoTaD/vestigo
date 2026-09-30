/**
 * La calculadora de drops (2026-09-29, pedido de ZoTaD): tres modos —¿Dónde
 * lo farmeo?, ¿Qué suelta? y el Simulador— y una ficha por jefe o superúnico
 * (`/d2r/drops/mephisto`). Diseño: docs/design/2026-09-29-d2r-calculadora-drops.md.
 *
 * El estado viaja en la dirección para compartirlo y entra en el primer render
 * (ver `Calculator`). La escritura de vuelta se salta esa primera vuelta, como
 * en el planificador: el enlace que llegó queda tal cual hasta que alguien
 * cambie algo. Al cambiar de idioma la dirección conserva la query (ver
 * `navigationPath` en `route.ts`).
 *
 * Al pie de la calculadora va el directorio de jefes (`SourceLinks`): el enlace
 * de verdad que lleva a cada ficha.
 */
import { useEffect, useRef, useState } from "react";
import type { Route } from "../route";
import { useD2rCopy } from "../d2rCopy";
import { Chips, D2Head } from "./ui";
import { dropData } from "./drops/data";
import DropsControls from "./drops/DropsControls";
import DropsFarm from "./drops/DropsFarm";
import DropsSim from "./drops/DropsSim";
import DropsWhat from "./drops/DropsWhat";
import SourceLinks from "./drops/SourceLinks";
import SourcePage from "./drops/SourcePage";
import { DEFAULT_STATE, readState, writeState, type DropsState, type Mode } from "./drops/state";
// La nota bajo cada título (`.d2-dr-note`) vive en la hoja del bloque de las fichas, que la calculadora comparte.
import "../styles/d2r-farm.css";
import "../styles/d2r-drops.css";

type Nav = (r: Route) => void;
const MODES: Mode[] = ["farm", "drops", "sim"];

export default function D2rDrops({ route, navigate }: { route: Route; navigate: Nav }) {
  const src = route.detail ? dropData().sourceById.get(route.detail) : undefined;
  // La `key` es el id del jefe: la dificultad, el hallazgo mágico y los jugadores de la ficha son estado propio de ella,
  // y sin la `key` React reusaría el componente al pasar de un jefe a otro y los dejaría como estaban.
  if (src) return <SourcePage key={src.id} src={src} route={route} navigate={navigate} />;
  return <Calculator route={route} navigate={navigate} missing={!!route.detail} initial={DEFAULT_STATE} />;
}

export function Calculator({ route, navigate, missing, initial }: { route: Route; navigate: Nav; missing: boolean; initial: DropsState }) {
  const t = useD2rCopy();
  const td = t.drops;
  // La app no hidrata (createRoot reemplaza el HTML prerenderizado), así que el estado del enlace entra en el primer
  // render: sin parpadeo con el de fábrica, y "Más opciones" se abre solo si el enlace trae algo de adentro.
  // En el prerender no hay window: ahí va el de fábrica.
  const [st, setSt] = useState<DropsState>(() => (typeof window === "undefined" ? initial : readState(window.location.search)));
  const loaded = useRef(false);
  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    window.history.replaceState(window.history.state, "", window.location.pathname + writeState(st));
  }, [st]);
  const set = (p: Partial<DropsState>) => setSt((x) => ({ ...x, ...p }));
  return (
    <>
      <D2Head as="h1" title={td.title} lede={td.lede} />
      {missing && <p className="d2-empty">{t.wiki.notFound}</p>}
      <Chips<Mode> label={td.title} value={st.m} onChange={(m) => set({ m })} options={MODES.map((m) => ({ value: m, label: td.modes[m] }))} />
      <DropsControls st={st} set={set} mode={st.m} />
      {st.m === "farm" && <DropsFarm st={st} set={set} />}
      {st.m === "drops" && <DropsWhat st={st} set={set} route={route} navigate={navigate} />}
      {st.m === "sim" && <DropsSim st={st} set={set} />}
      <section className="d2-dr-about">
        {td.about.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </section>
      {/* Un enlace de verdad a la ficha de cada jefe: sin él, el buscador las encuentra en el sitemap pero no las indexa. */}
      <SourceLinks route={route} navigate={navigate} />
    </>
  );
}
