/**
 * La ficha de un rasgo de Project Zomboid (2026-09-30), como una página de la libreta: la cabecera con el ícono, el
 * nombre, qué hace (la descripción del juego) y los puntos; debajo, una hoja por cada cosa que se sabe de él: las
 * habilidades que sube, las recetas que da, con qué no se combina, quién lo trae (profesiones y rasgos) y qué trae.
 *
 * Los puntos van con el signo del juego y en palabras ("−4 · Cuesta 4 puntos"), teñidos como en el juego: verde el
 * positivo, rojo lápiz el negativo. Un rasgo que no se elige (Ladrón, Sobrepeso) no tiene costo que mostrar: lo dice, y
 * si viene con una profesión, anota "sólo de profesión".
 *
 * Todo lo que es otra ficha es un enlace: rasgos, profesiones y recetas. Las habilidades van como texto hasta que su
 * pestaña se publique, y lo que el rasgo "sabe" sin ser una receta con ficha (las temporadas de cultivo, la mecánica de
 * autos) también, al final de sus recetas. Los seis rasgos gemelos (Herrería que se elige y Herrería del Herrero)
 * enlazan cada uno al otro desde la cabecera. Un rasgo que se elige al crear el personaje lleva además "Probalo en el planificador", que abre
 * la pestaña Personaje con Desempleado y ese rasgo (sólo con la pestaña publicada).
 */
import type { ReactNode } from "react";
import meta from "@zomboid/meta.json";
import RouteLink from "../../RouteLink";
import { useLang, useLocale } from "../../i18n";
import { PZ_PUBLISHED, type PzTab, type Route } from "../../route";
import PlannerLink from "../planner/link";
import { optionLabels } from "../recipes/lines";
import { Collapse, gameLines, ItemIcon, Stamp, wordFit } from "../ui";
import { useTraitsCopy } from "./copy";
import { DEFAULT_PROF, pickable, signed, traitGroup, traitPoints, traitsGranting, type Loc, type Ref, type SkillBoost, type Trait } from "./data";
import { ChangesSlot } from "../patches/changes";

type Nav = (r: Route) => void;
type Lang = "en" | "es";

export default function TraitFicha({ trait, route, navigate }: { trait: Trait; route: Route; navigate: Nav }) {
  const t = useTraitsCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const group = traitGroup(trait);
  const name = trait[lang];
  const other = trait[lang === "es" ? "en" : "es"];
  const points = traitPoints(trait);
  const byTrait = traitsGranting(trait.id);
  const toList: Route = { ...route, view: "zomboid", pzSection: "traits", detail: undefined };
  const link = (sec: PzTab) => (id: string): Route => ({ ...route, view: "zomboid", pzSection: sec, detail: id });
  // Los datos vienen ordenados por slug (el inglés): se ordenan por el nombre que se ve.
  const collator = new Intl.Collator(locale);
  const byName = (refs: Ref[]) => [...refs].sort((a, b) => collator.compare(a[lang], b[lang]));
  const refs = (list: Ref[], sec: PzTab, icons: "traits" | "professions" | null) => (
    <Links refs={byName(list)} to={link(sec)} navigate={navigate} lang={lang} icons={icons} more={t.more} />
  );
  const known = trait.known ?? [];
  const twin = trait.twin;

  return (
    <main className="pz-main pzi pzi-ficha pzt">
      <nav className="pzi-crumb">
        <RouteLink to={toList} onNavigate={navigate}>
          ← {t.backTraits}
        </RouteLink>
      </nav>

      <section className="pz-page pzi-head pzt-head">
        <span className="pz-clip" />
        <div className="pzi-headmain">
          {/* 18×18 del juego, a 4×: escalado entero, sin suavizar. */}
          <ItemIcon icon={trait.icon} dir="traits" size={72} lazy={false} />
          <div className="pzi-titles">
            <p className="pzi-kick">
              {t.kinds[group]} · Build {meta.version}
            </p>
            <h1 className="pzi-h1" style={wordFit(name)}>
              {name}
            </h1>
            {other !== name && <p className="pzi-hand">{t.otherName(other)}</p>}
          </div>
        </div>
        {/* 13 rasgos no traen descripción: el juego muestra en su lugar las habilidades, que van en su hoja. Las que
            traen `<br>` van con sus saltos de línea. */}
        {trait.desc && <p className="pzt-desc">{gameLines(trait.desc[lang])}</p>}
        <p className={`pzt-price is-${group}`}>
          {group !== "granted" && <b>{signed(points)}</b>}
          <span>{t.traitPrice(group, Math.abs(points))}</span>
          {trait.professionOnly && trait.grantedBy.length > 0 && <em className="pzi-hand">{t.profOnly}</em>}
        </p>
        {twin && (
          <p className="pzt-twin">
            {trait.professionOnly ? t.twin.toPick : t.twin.toProf}{" "}
            <RouteLink to={link("traits")(twin.id)} onNavigate={navigate}>
              <ItemIcon icon={twin.icon} dir="traits" size={36} />
              <span>{trait.professionOnly ? twin[lang] : `${twin[lang]} (${t.twinMark})`}</span>
            </RouteLink>
          </p>
        )}
        {PZ_PUBLISHED.includes("planner") && pickable(trait) && (
          <p className="pzt-plan">
            <PlannerLink className="pzt-planbtn" route={route} navigate={navigate} build={{ prof: DEFAULT_PROF, traits: [trait.id] }}>
              {t.tryPlanner}
            </PlannerLink>
          </p>
        )}
      </section>

      <Columns
        left={[
          trait.xpBoosts.length > 0 && (
            <Sheet cls="pzt-boosts" stamp="arrownorth" title={t.traitSheets.boosts} key="boosts">
              <Boosts boosts={trait.xpBoosts} lang={lang} />
            </Sheet>
          ),
          trait.recipes.length + known.length > 0 && (
            <Sheet cls="pzt-recipes" stamp="hammer" title={t.traitSheets.recipes} n={trait.recipes.length + known.length} key="recipes">
              {trait.recipes.length > 0 && refs(trait.recipes, "recipes", null)}
              <Known known={known} lang={lang} more={t.more} />
            </Sheet>
          ),
          trait.exclusive.length > 0 && (
            <Sheet cls="pzt-exclusive" stamp="x" title={t.traitSheets.exclusive} n={trait.exclusive.length} key="exclusive">
              {refs(trait.exclusive, "traits", "traits")}
            </Sheet>
          ),
        ]}
        right={[
          trait.grantedBy.length > 0 && (
            <Sheet cls="pzt-by-profession" stamp="wrench" title={t.traitSheets.professions} n={trait.grantedBy.length} key="profs">
              {refs(trait.grantedBy, "professions", "professions")}
            </Sheet>
          ),
          byTrait.length > 0 && (
            <Sheet cls="pzt-by-trait" stamp="asterisk" title={t.traitSheets.traits} n={byTrait.length} key="by-trait">
              {refs(byTrait, "traits", "traits")}
            </Sheet>
          ),
          trait.grants.length > 0 && (
            <Sheet cls="pzt-grants" stamp="checkmark" title={t.traitSheets.grants} n={trait.grants.length} key="grants">
              {refs(trait.grants, "traits", "traits")}
            </Sheet>
          ),
        ]}
      />
      <ChangesSlot kind="traits" changes={trait.changes} route={route} navigate={navigate} />
    </main>
  );
}

/**
 * Las hojas en dos columnas (lo de este rasgo a la izquierda, lo que lo relaciona con otros a la derecha). Si un lado
 * queda vacío (Ladrón sólo tiene "Profesiones que lo traen"), las que hay van a lo ancho en vez de dejar media página
 * en blanco. La usa también la ficha de profesión.
 */
export function Columns({ left, right }: { left: ReactNode[]; right: ReactNode[] }) {
  const l = left.filter(Boolean);
  const r = right.filter(Boolean);
  if (!l.length && !r.length) return null;
  if (!l.length || !r.length) {
    return (
      <div className="pzi-sheets is-wide">
        <div className="pzi-relcol">{[...l, ...r]}</div>
      </div>
    );
  }
  return (
    <div className="pzi-sheets">
      <div className="pzi-relcol">{l}</div>
      <div className="pzi-relcol">{r}</div>
    </div>
  );
}

/** Una hoja de la ficha con su sello y, si es una lista, cuántos tiene. La usa también la ficha de profesión. */
export function Sheet({ cls, stamp, title, n, children }: { cls: string; stamp: string; title: string; n?: number; children: ReactNode }) {
  return (
    <section className={`pz-page pzi-rel ${cls}`}>
      <h2 className="pzi-h2">
        <Stamp name={stamp} />
        {title}
        {n !== undefined && <small>{n}</small>}
      </h2>
      {children}
    </section>
  );
}

/** Las habilidades en renglones: el nombre a la izquierda, los niveles con su signo a la derecha. */
export function Boosts({ boosts, lang }: { boosts: SkillBoost[]; lang: Lang }) {
  return (
    <dl className="pzi-lines">
      {boosts.map((b) => (
        <div key={b.skill.id}>
          <dt>{b.skill[lang]}</dt>
          <dd>{signed(b.lvl)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Lo que un rasgo o una profesión sabe y no es una receta con ficha ("Temporada de cultivo de zanahoria", "Mecánica
 * básica", "Generador"): el nombre del juego, como texto. Va debajo de las recetas, en la misma hoja: el juego las da
 * juntas (GrantedRecipes). La usa también la ficha de profesión (Granjero sabe 55 temporadas).
 */
export function Known({ known, lang, more }: { known: Loc[]; lang: Lang; more: (n: number) => string }) {
  if (!known.length) return null;
  return <Collapse items={known} more={more} className="pzi-links pzt-known" render={(k, i) => <li key={i}>{k[lang]}</li>} />;
}

/**
 * Enlaces a otras fichas, con su ícono si lo tienen (rasgos a 36, el doble de su tamaño; profesiones achicadas a 36).
 * Los primeros a la vista y el resto en un desplegable: las recetas de un rasgo pueden ser 87. Dos que se llaman igual
 * en el idioma de la página llevan el otro idioma entre paréntesis y un `title` con el id, como en la ficha de receta
 * (`optionLabels`).
 */
export function Links({
  refs,
  to,
  navigate,
  lang,
  icons,
  more,
}: {
  refs: Ref[];
  to: (id: string) => Route;
  navigate: Nav;
  lang: Lang;
  icons: "traits" | "professions" | null;
  more: (n: number) => string;
}) {
  const names = optionLabels(refs, lang);
  return (
    <Collapse
      items={refs}
      more={more}
      render={(r, i) => (
        <li key={r.id}>
          <RouteLink to={to(r.id)} onNavigate={navigate} title={names[i].title}>
            {icons && <ItemIcon icon={r.icon} dir={icons} size={36} />}
            <span>{names[i].label}</span>
          </RouteLink>
        </li>
      )}
    />
  );
}
