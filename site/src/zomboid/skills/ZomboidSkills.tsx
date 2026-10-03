/**
 * La pestaña Habilidades y libros de Project Zomboid (2026-09-30): la lista de las 35 habilidades
 * (`/project-zomboid/skills`, `/es/project-zomboid/habilidades`) y la ficha de cada una con su calculadora
 * (`/es/project-zomboid/habilidades/carpinteria`). Diseño: docs/design/2026-09-30-zomboid.md. Es el mismo armado que
 * Rasgos y Moodles, con su estética: los datos viajan en el chunk (ver `data.ts`), así que no hay "cargando…".
 *
 * La lista va en hojas por categoría, las del juego y en su orden (Combate: Cuerpo a cuerpo, Armas de fuego,
 * Elaboración…). Cada fila es un `<a href>` con el sello de su categoría, el nombre y "de 0 a 10: N XP", y cuántos
 * libros tiene. Buscar esconde filas en el navegador; el HTML prerenderizado las tiene todas.
 */
import { useDeferredValue, useState } from "react";
import meta from "@zomboid/meta.json";
import professionSlugs from "virtual:pz-slugs-es/professions";
import skillItemSlugs from "virtual:pz-slugs-es/skill-items";
import skillSlugs from "virtual:pz-slugs-es/skills";
import traitSlugs from "virtual:pz-slugs-es/traits";
import RouteLink from "../../RouteLink";
import { useLang, useLocale } from "../../i18n";
import { registerPzSlugs, type Route } from "../../route";
import { Stamp, wordFit } from "../ui";
import { xpNeeded } from "./calc";
import { useSkillsCopy } from "./copy";
import { ALL_SKILLS, catStamp, findSkill, SKILL_CATS, skillMatches, skillsIn, startLevel } from "./data";
import SkillFicha from "./SkillFicha";
import { registerChangesLookup } from "../patches/boxLoader";
// Las hojas, el buscador, la cabecera de la ficha y los enlaces son los de Objetos: la misma libreta. Lo propio va aparte.
import "../../styles/zomboid-items.css";
import "../../styles/zomboid-skills.css";

// Las direcciones en español de lo que esta pestaña enlaza: sus habilidades, los rasgos y las profesiones que las
// suben, y los libros y revistas (sólo esos: ver `pzSkillItemSlugsModule` en vite.config.ts). Al cargarse el módulo y
// no en un efecto: `preloadRoute` baja este chunk antes de que `App` lea la dirección, así
// `/es/project-zomboid/habilidades/carpinteria` ya llega traducida a `carpentry`.
registerPzSlugs({ ...skillSlugs, ...traitSlugs, ...professionSlugs, ...skillItemSlugs });
// Para que `preloadTab` sepa si la ficha de la ruta trae "Qué cambió" y lo baje antes del primer render.
registerChangesLookup("skills", findSkill);

type Nav = (r: Route) => void;

export default function ZomboidSkills({ route, navigate }: { route: Route; navigate: Nav }) {
  const skill = findSkill(route.detail);
  if (skill) return <SkillFicha skill={skill} route={route} navigate={navigate} key={skill.id} />;
  return <SkillList route={route} navigate={navigate} missing={!!route.detail} />;
}

function SkillList({ route, navigate, missing }: { route: Route; navigate: Nav; missing: boolean }) {
  const t = useSkillsCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const [q, setQ] = useState("");
  const query = useDeferredValue(q);

  const sheets = SKILL_CATS.map((cat) => [cat, skillsIn(cat.id).filter((s) => skillMatches(s, query))] as const);
  const shown = sheets.reduce((sum, [, rows]) => sum + rows.length, 0);
  const books = ALL_SKILLS.reduce((sum, s) => sum + s.books.length, 0);
  const toSkill = (id: string): Route => ({ ...route, view: "zomboid", pzSection: "skills", detail: id });

  return (
    <main className="pz-main pzi pzs">
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
        {t.intro(num(ALL_SKILLS.length), num(books), meta.version).map((p) => (
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
        {t.showing(num(shown), num(ALL_SKILLS.length))}
      </p>
      {!shown && <p className="pzi-empty">{t.empty}</p>}

      {sheets.map(([cat, rows]) =>
        rows.length ? (
          <section className="pz-page pzs-sheet" key={cat.id}>
            <h2 className="pzi-h2">
              <Stamp name={catStamp(cat.id)} />
              {cat[lang]} <small>{num(rows.length)}</small>
            </h2>
            <div className="pzs-rows">
              {rows.map((s) => (
                <RouteLink className="pzs-row" to={toSkill(s.id)} onNavigate={navigate} key={s.id}>
                  <span className="pzs-name">{s[lang]}</span>
                  <span className="pzs-line">
                    {t.zeroToTen(num(xpNeeded(s, 0, 10)))}
                    {startLevel(s) > 0 && ` · ${t.startsAt(startLevel(s))}`}
                  </span>
                  {s.books.length > 0 && <span className="pzs-nbooks">{t.bookCount(s.books.length)}</span>}
                </RouteLink>
              ))}
            </div>
          </section>
        ) : null,
      )}
    </main>
  );
}
