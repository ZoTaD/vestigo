/**
 * La pestaña Fabricación de Project Zomboid (2026-10-02): el Planificador de fabricación. `/en/project-zomboid/crafting`,
 * `/es/project-zomboid/fabricacion`, sin fichas. Diseño: docs/design/2026-09-30-zomboid.md (Pestañas, 5): "quiero X →
 * el árbol completo, la lista de materiales, lo que hay que aprender y dónde conseguir cada cosa", con el mismo patrón
 * que el Planificador de Valheim.
 *
 * A la izquierda se elige (`Picker`); a la derecha, tu personaje (`Character`, lo que ya sabés), la hoja de ruta
 * (`RouteSheet`, lo que se lleva al juego), lo que hay que aprender (`LearnSheet`) y el árbol (`TreeSheet`, donde se
 * cambia cualquier receta o material). La cuenta es del motor (`engine.ts`): el árbol y los totales
 * salen de las mismas decisiones. Lo elegido viaja en la dirección y queda guardado en el navegador (`store.ts`).
 *
 * **Servidor y navegador.** `craft.json` (~200 KB con gzip, medido el 2026-10-02) baja aparte, por `import()`, y el
 * prerender lo espera (`preloadZomboid` en `entry-server.tsx` y `TAB_DATA` en `Zomboid.tsx`): la página nunca se
 * escribe con "cargando…".
 * El HTML trae la página sin nada elegido, con las ideas para empezar; lo del link se lee al montarse.
 */
import { useMemo } from "react";
import itemSlugs from "virtual:pz-slugs-es/craft-items";
import professionSlugs from "virtual:pz-slugs-es/professions";
import recipeSlugs from "virtual:pz-slugs-es/recipes";
import skillSlugs from "virtual:pz-slugs-es/skills";
import traitSlugs from "virtual:pz-slugs-es/traits";
import { useLocale } from "../../i18n";
import { registerPzSlugs, routePath, type Route } from "../../route";
import PzLoading from "../PzLoading";
import { Stamp, useLoad, wordFit } from "../ui";
import Character from "./Character";
import { useCraftCopy } from "./copy";
import { loadCraft, peekCraft, type CraftData } from "./data";
import { plan } from "./engine";
import LearnSheet from "./LearnSheet";
import Picker from "./Picker";
import RouteSheet from "./RouteSheet";
import { useCraft } from "./store";
import TreeSheet from "./TreeSheet";
// Las hojas, el buscador, los renglones y los enlaces son los de Objetos: la misma libreta. Lo propio va aparte.
import "../../styles/zomboid-items.css";
import "../../styles/zomboid-crafting.css";

// Las direcciones en español de lo que enlaza: los objetos del grafo (sólo ésos, no las 3.826 fichas), las recetas, las
// habilidades, y los rasgos y profesiones que enseñan recetas. Al cargarse el módulo: `preloadRoute` baja este chunk
// antes de que `App` lea la dirección.
registerPzSlugs({ ...itemSlugs, ...recipeSlugs, ...skillSlugs, ...traitSlugs, ...professionSlugs });

type Nav = (r: Route) => void;

export default function ZomboidCrafting({ route, navigate }: { route: Route; navigate: Nav }) {
  // Casi siempre ya llegó (el prerender y `TAB_DATA` lo esperan): sólo un salto sin precargar pasa por "cargando…".
  const craft = useLoad("craft", () => peekCraft() ?? undefined, loadCraft);
  if (craft.failed) return <PzLoading onRetry={craft.retry} />;
  if (!craft.value) return <PzLoading />;
  return <Planner data={craft.value} route={route} navigate={navigate} />;
}

function Planner({ data, route, navigate }: { data: CraftData; route: Route; navigate: Nav }) {
  const t = useCraftCopy();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const [st, set] = useCraft(data, routePath(route));
  const { trees, totals } = useMemo(() => plan(data, st), [data, st]);
  const c = data.counts;

  return (
    <main className="pz-main pzi pzc">
      <section className="pz-page pzi-intro">
        <span className="pz-clip" />
        <h1 className="pzi-h1" style={wordFit(t.title)}>
          {t.title}
        </h1>
        {t.intro(num(c.craftable), num(c.builds), num(c.multi), data.v).map((p) => (
          <p key={p}>{p}</p>
        ))}
        <p className="pzi-hand">{t.hand}</p>
      </section>

      <div className="pzc-layout">
        <Picker data={data} st={st} set={set} route={route} navigate={navigate} />
        <div className="pzc-out">
          <Character data={data} st={st} set={set} route={route} navigate={navigate} />
          {st.q.length ? (
            <>
              <RouteSheet data={data} st={st} set={set} totals={totals} route={route} navigate={navigate} />
              <LearnSheet data={data} st={st} set={set} totals={totals} route={route} navigate={navigate} />
              <TreeSheet data={data} st={st} set={set} trees={trees} route={route} navigate={navigate} />
            </>
          ) : (
            <section className="pz-page pzc-sheet pzc-empty" aria-label={t.routeTitle}>
              <h2 className="pzi-h2">
                <Stamp name="gears" />
                {t.routeTitle}
              </h2>
              <p className="pzi-hand">{t.empty}</p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
