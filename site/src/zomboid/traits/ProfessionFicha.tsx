/**
 * La ficha de una profesión de Project Zomboid (2026-09-30), en `/profesiones/<slug>` y con la solapa de "Rasgos"
 * marcada: la cabecera con el ícono, el nombre, la descripción del juego si la tiene y los puntos que te deja; debajo,
 * las habilidades con las que arranca, los rasgos gratis, las recetas que ya sabe (y, como texto, lo que sabe sin ser
 * una receta con ficha: Generador, Mecánica básica, las temporadas de cultivo) y los pueblos donde puede aparecer.
 *
 * El botón "armar un personaje con esta profesión" abre el planificador con ella elegida (`/personaje?b=burglar`, ver
 * `planner/link.tsx`). Sale sólo con la pestaña Personaje publicada: antes no hay botón que lleve a una página que no está.
 */
import meta from "@zomboid/meta.json";
import RouteLink from "../../RouteLink";
import { useLang, useLocale } from "../../i18n";
import { PZ_PUBLISHED, type PzTab, type Route } from "../../route";
import PlannerLink from "../planner/link";
import { gameLines, ItemIcon, wordFit } from "../ui";
import { useTraitsCopy } from "./copy";
import { signed, type Profession, type Ref } from "./data";
import { Boosts, Columns, Known, Links, Sheet } from "./TraitFicha";
import { ChangesSlot } from "../patches/changes";

type Nav = (r: Route) => void;

export default function ProfessionFicha({ prof, route, navigate }: { prof: Profession; route: Route; navigate: Nav }) {
  const t = useTraitsCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const name = prof[lang];
  const other = prof[lang === "es" ? "en" : "es"];
  const toList: Route = { ...route, view: "zomboid", pzSection: "professions", detail: undefined };
  const link = (sec: PzTab) => (id: string): Route => ({ ...route, view: "zomboid", pzSection: sec, detail: id });
  const collator = new Intl.Collator(locale);
  const byName = (refs: Ref[]) => [...refs].sort((a, b) => collator.compare(a[lang], b[lang]));
  const towns = prof.spawnTowns ?? [];
  const known = prof.known ?? [];

  return (
    <main className="pz-main pzi pzi-ficha pzt">
      <nav className="pzi-crumb">
        <RouteLink to={toList} onNavigate={navigate}>
          ← {t.backProfs}
        </RouteLink>
      </nav>

      <section className="pz-page pzi-head pzt-head">
        <span className="pz-clip" />
        <div className="pzi-headmain">
          {/* 64×64 del juego, a su tamaño. Desempleado no tiene. */}
          <ItemIcon icon={prof.icon} dir="professions" size={64} lazy={false} />
          <div className="pzi-titles">
            <p className="pzi-kick">
              {t.profession} · Build {meta.version}
            </p>
            <h1 className="pzi-h1" style={wordFit(name)}>
              {name}
            </h1>
            {other !== name && <p className="pzi-hand">{t.otherName(other)}</p>}
          </div>
        </div>
        {prof.desc && <p className="pzt-desc">{gameLines(prof.desc[lang])}</p>}
        <p className="pzt-price">
          <b>{signed(prof.cost)}</b>
          <span>{t.profPrice(prof.cost)}</span>
        </p>
        {PZ_PUBLISHED.includes("planner") && (
          <p className="pzt-plan">
            <PlannerLink className="pzt-planbtn" route={route} navigate={navigate} build={{ prof: prof.id, traits: [] }}>
              {t.plannerBtn}
            </PlannerLink>
          </p>
        )}
      </section>

      <Columns
        left={[
          // Siempre, aunque no suba ninguna: "sin habilidades de más" también es un dato (Desempleado).
          <Sheet cls="pzt-boosts" stamp="arrownorth" title={t.profSheets.boosts} key="boosts">
            {prof.xpBoosts.length ? <Boosts boosts={prof.xpBoosts} lang={lang} /> : <p className="pzt-none">{t.noBoosts}</p>}
          </Sheet>,
          prof.traits.length > 0 && (
            <Sheet cls="pzt-free" stamp="heart" title={t.profSheets.traits} n={prof.traits.length} key="traits">
              <Links refs={byName(prof.traits)} to={link("traits")} navigate={navigate} lang={lang} icons="traits" more={t.more} />
            </Sheet>
          ),
          towns.length > 0 && (
            <Sheet cls="pzt-towns" stamp="house" title={t.profSheets.towns} n={towns.length} key="towns">
              <ul className="pzi-links pzt-townlist">
                {towns.map((town) => (
                  <li key={town}>{town}</li>
                ))}
              </ul>
            </Sheet>
          ),
        ]}
        right={[
          prof.recipes.length + known.length > 0 && (
            <Sheet cls="pzt-recipes" stamp="hammer" title={t.profSheets.recipes} n={prof.recipes.length + known.length} key="recipes">
              {prof.recipes.length > 0 && (
                <Links refs={byName(prof.recipes)} to={link("recipes")} navigate={navigate} lang={lang} icons={null} more={t.more} />
              )}
              <Known known={known} lang={lang} more={t.more} />
            </Sheet>
          ),
        ]}
      />
      <ChangesSlot kind="professions" changes={prof.changes} route={route} navigate={navigate} />
    </main>
  );
}
