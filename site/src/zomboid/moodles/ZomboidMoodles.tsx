/**
 * La pestaña Moodles de Project Zomboid (2026-09-30): la lista de los 26 (`/project-zomboid/moodles`, igual en español)
 * y la ficha de cada uno (`/es/project-zomboid/moodles/sangrado`). Diseño: docs/design/2026-09-30-zomboid.md. Es el
 * mismo armado que Rasgos, con su estética: los datos viajan en el chunk (ver `data.ts`), así que no hay "cargando…".
 *
 * La lista va en hojas por tipo (necesidades, cuerpo, ánimo, heridas, temperatura y al morir; el reparto es nuestro,
 * ver `MOODLE_GROUPS`). Cada fila es un `<a href>` con el moodle como se ve en la partida (el círculo teñido y el ícono
 * encima), su nombre y los nombres de sus niveles, que es lo que se lee en el juego: quien vio "Náuseas" lo encuentra.
 * Buscar esconde filas en el navegador; el HTML prerenderizado las tiene todas.
 */
import { useDeferredValue, useState } from "react";
import meta from "@zomboid/meta.json";
import moodleSlugs from "virtual:pz-slugs-es/moodles";
import traitSlugs from "virtual:pz-slugs-es/traits";
import RouteLink from "../../RouteLink";
import { useLang, useLocale } from "../../i18n";
import { registerPzSlugs, type Route } from "../../route";
import { Stamp, wordFit } from "../ui";
import { ADVICE_ITEM_SLUGS_ES } from "./advice";
import { useMoodlesCopy } from "./copy";
import { findMoodle, MOODLE_GROUPS, moodleMatches, MOODLES, moodlesIn, type MoodleGroup } from "./data";
import MoodleFicha, { MoodleBadge } from "./MoodleFicha";
import { registerChangesLookup } from "../patches/boxLoader";
// Las hojas, el buscador y la cabecera de la ficha son los de Objetos: la misma libreta. Lo propio va aparte.
import "../../styles/zomboid-items.css";
import "../../styles/zomboid-moodles.css";

// Las direcciones en español de lo que esta pestaña enlaza: sus moodles, los rasgos de los consejos y los 30
// objetos de los consejos (sólo esos: ver `ADVICE_ITEM_SLUGS_ES`). Al cargarse el módulo y no en un efecto:
// `preloadRoute` baja este chunk antes de que `App` lea la dirección, así `/es/project-zomboid/moodles/sangrado` ya
// llega traducida a `bleeding`.
registerPzSlugs({ ...moodleSlugs, ...traitSlugs, items: ADVICE_ITEM_SLUGS_ES });
// Para que `preloadTab` sepa si la ficha de la ruta trae "Qué cambió" y lo baje antes del primer render.
registerChangesLookup("moodles", findMoodle);

type Nav = (r: Route) => void;

/** El sello de cada hoja de la lista. */
const GROUP_STAMP: Record<MoodleGroup, string> = {
  needs: "knifefork",
  body: "lightning",
  mood: "facesad",
  health: "medcross",
  weather: "snowflake",
  death: "skull",
};

export default function ZomboidMoodles({ route, navigate }: { route: Route; navigate: Nav }) {
  const moodle = findMoodle(route.detail);
  if (moodle) return <MoodleFicha moodle={moodle} route={route} navigate={navigate} key={moodle.id} />;
  return <MoodleList route={route} navigate={navigate} missing={!!route.detail} />;
}

function MoodleList({ route, navigate, missing }: { route: Route; navigate: Nav; missing: boolean }) {
  const t = useMoodlesCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const [q, setQ] = useState("");
  const query = useDeferredValue(q);

  const groups = MOODLE_GROUPS.map(({ group }) => [group, moodlesIn(group).filter((m) => moodleMatches(m, query))] as const);
  const shown = groups.reduce((sum, [, rows]) => sum + rows.length, 0);
  const toMoodle = (id: string): Route => ({ ...route, view: "zomboid", pzSection: "moodles", detail: id });

  return (
    <main className="pz-main pzi pzmo">
      <section className="pz-page pzi-intro">
        <span className="pz-clip" />
        {missing && (
          <p className="pzi-missing" role="status">
            {t.notFound}
          </p>
        )}
        <h1 className="pzi-h1" style={wordFit(t.title)}>
          {t.title}
        </h1>
        {t.intro(num(MOODLES.length), meta.version).map((p) => (
          <p key={p}>{p}</p>
        ))}
        <p className="pzi-hand">{t.hand}</p>
      </section>

      <section className="pz-page pzi-filters" aria-label={t.search}>
        <label className="pzi-search">
          <span className="visually-hidden">{t.search}</span>
          <Stamp name="eye" />
          <input type="search" value={q} placeholder={t.searchHint} onChange={(e) => setQ(e.target.value)} />
        </label>
      </section>

      <p className="pzi-count" aria-live="polite">
        {t.showing(num(shown), num(MOODLES.length))}
      </p>
      {!shown && <p className="pzi-empty">{t.empty}</p>}

      {groups.map(([g, rows]) =>
        rows.length ? (
          <section className={`pz-page pzmo-sheet pzmo-${g}`} key={g}>
            <h2 className="pzi-h2">
              <Stamp name={GROUP_STAMP[g]} />
              {t.groups[g]} <small>{num(rows.length)}</small>
              {t.groupNotes[g] && <span className="pzi-hand">{t.groupNotes[g]}</span>}
            </h2>
            <div className="pzmo-rows">
              {rows.map((m) => (
                <RouteLink className="pzmo-row" to={toMoodle(m.id)} onNavigate={navigate} key={m.id}>
                  {/* Como aparece primero en la partida: con el tinte de su nivel más bajo. */}
                  <MoodleBadge moodle={m} level={m.levels[0]?.level ?? 1} size={48} />
                  <span className="pzmo-name">{m[lang]}</span>
                  <span className="pzmo-line">{m.levels.map((l) => l.name[lang]).join(" · ")}</span>
                </RouteLink>
              ))}
            </div>
          </section>
        ) : null,
      )}
    </main>
  );
}
