/**
 * La lista de la pestaña Rasgos de Project Zomboid (2026-09-30), en sus dos páginas:
 *
 * - `/rasgos` (`view="traits"`): el texto que lee Google, el buscador y cuatro hojas: las profesiones, los rasgos
 *   positivos (cuestan puntos), los negativos (te dan puntos) y los que no se eligen al crear el personaje (vienen con
 *   una profesión, con otro rasgo o con el peso). Esa última no está en el plan, pero sin ella 16 rasgos quedaban sin
 *   un enlace desde su lista.
 * - `/profesiones` (`view="professions"`): su propio texto, el buscador y sólo la hoja de profesiones, con el enlace a
 *   los rasgos. Por qué es una página y no un canonical, en `ZomboidTraits.tsx`.
 *
 * Cada fila es un `<a href>` (el único que lleva a su ficha desde la lista), con el ícono del juego, el nombre, los
 * puntos como los muestra el juego y una línea: qué hace el rasgo, o qué habilidades sube la profesión. Buscar esconde
 * filas en el navegador; el HTML prerenderizado las tiene todas.
 *
 * Positivos y negativos se distinguen por el signo y el tinte de la cifra (verde, rojo lápiz), como en el juego, y por
 * la hoja en la que están: nada de bordes ni barras de color.
 */
import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import meta from "@zomboid/meta.json";
import RouteLink from "../../RouteLink";
import { useLang, useLocale } from "../../i18n";
import type { Route } from "../../route";
import { fold, ItemIcon, Stamp, wordFit } from "../ui";
import { useTraitsCopy, type PzTraitsCopy, type TraitGroup } from "./copy";
import { PROFESSIONS, signed, TRAITS, traitGroup, traitPoints, type Profession, type SkillBoost, type Trait } from "./data";

type Nav = (r: Route) => void;
type Lang = "en" | "es";

const GROUPS: TraitGroup[] = ["positive", "negative", "granted"];
/** El sello de cada hoja: la llave inglesa de las profesiones es la misma que en la portada. */
export const SHEET_STAMP: Record<TraitGroup | "professions", string> = {
  professions: "wrench",
  positive: "facehappy",
  negative: "facesad",
  granted: "key",
};

/** "Destreza +2 · Sigilo +2": las habilidades que sube (o baja) un rasgo o una profesión. */
export const boostsText = (boosts: SkillBoost[], lang: Lang): string => boosts.map((b) => `${b.skill[lang]} ${signed(b.lvl)}`).join(" · ");

/**
 * La línea de qué hace un rasgo en la lista: su descripción de corrido (las del juego traen `<br>` entre frases), o si
 * no tiene, las habilidades que sube, que es lo que el juego muestra en su lugar. La usa también el planificador.
 */
export const traitLine = (t: Trait, lang: Lang): string =>
  t.desc
    ? t.desc[lang]
        .split(/<br\s*\/?>/i)
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" ")
    : boostsText(t.xpBoosts, lang);

export default function TraitList({ view, route, navigate, missing }: { view: "traits" | "professions"; route: Route; navigate: Nav; missing: boolean }) {
  const t = useTraitsCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const [q, setQ] = useState("");
  const needle = fold(useDeferredValue(q).trim());

  // Por el nombre que se ve, con un solo `Collator`.
  const collator = useMemo(() => new Intl.Collator(locale), [locale]);
  const profs = useMemo(() => [...PROFESSIONS].sort((a, b) => collator.compare(a[lang], b[lang])), [lang, collator]);
  const groups = useMemo(
    () => GROUPS.map((g) => [g, TRAITS.filter((x) => traitGroup(x) === g).sort((a, b) => collator.compare(a[lang], b[lang]))] as const),
    [lang, collator],
  );
  // Se busca en los dos nombres, sin tildes: "ladron" encuentra a Ladrón, y "burglar" también.
  const matches = (x: { en: string; es: string }) => !needle || fold(`${x.en} ${x.es}`).includes(needle);

  const shownProfs = profs.filter(matches);
  const shownGroups = view === "traits" ? groups.map(([g, rows]) => [g, rows.filter(matches)] as const) : [];
  const total = PROFESSIONS.length + (view === "traits" ? TRAITS.length : 0);
  const shown = shownProfs.length + shownGroups.reduce((sum, [, rows]) => sum + rows.length, 0);

  const n = (g: TraitGroup) => groups.find(([k]) => k === g)![1].length;
  const title = view === "traits" ? t.traitsTitle : t.profsTitle;
  const intro =
    view === "traits"
      ? t.traitsIntro(num(PROFESSIONS.length), num(n("positive")), num(n("negative")), num(n("granted")), meta.version)
      : t.profsIntro(num(PROFESSIONS.length), meta.version);
  const toTraits: Route = { ...route, view: "zomboid", pzSection: "traits", detail: undefined };
  const toTrait = (id: string): Route => ({ ...route, view: "zomboid", pzSection: "traits", detail: id });
  const toProf = (id: string): Route => ({ ...route, view: "zomboid", pzSection: "professions", detail: id });

  return (
    <main className="pz-main pzi pzt">
      <section className="pz-page pzi-intro">
        <span className="pz-clip" />
        {missing && (
          <p className="pzi-missing" role="status">
            {view === "traits" ? t.notFoundTrait : t.notFoundProf}
          </p>
        )}
        <h1 className="pzi-h1" style={wordFit(title)}>
          {title}
        </h1>
        {intro.map((p) => (
          <p key={p}>{p}</p>
        ))}
        {view === "professions" && (
          <p>
            <RouteLink className="pzt-totraits" to={toTraits} onNavigate={navigate}>
              {t.toTraits}
            </RouteLink>
          </p>
        )}
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
        {t.showing(num(shown), num(total))}
      </p>
      {!shown && <p className="pzi-empty">{t.empty}</p>}

      {shownProfs.length > 0 && (
        <Sheet group="professions" t={t} n={num(shownProfs.length)}>
          {shownProfs.map((p) => (
            <ProfRow p={p} to={toProf(p.id)} navigate={navigate} lang={lang} t={t} key={p.id} />
          ))}
        </Sheet>
      )}
      {shownGroups.map(([g, rows]) =>
        rows.length ? (
          <Sheet group={g} t={t} n={num(rows.length)} key={g}>
            {rows.map((x) => (
              <TraitRow x={x} group={g} to={toTrait(x.id)} navigate={navigate} lang={lang} t={t} key={x.id} />
            ))}
          </Sheet>
        ) : null,
      )}
    </main>
  );
}

/** Una hoja de la lista con su sello, cuántas filas muestra y la nota a lápiz de qué significan sus puntos. */
function Sheet({ group, t, n, children }: { group: TraitGroup | "professions"; t: PzTraitsCopy; n: string; children: ReactNode }) {
  const note = t.groupNotes[group];
  return (
    <section className={`pz-page pzt-sheet pzt-${group}`}>
      <h2 className="pzi-h2">
        <Stamp name={SHEET_STAMP[group]} />
        {t.groups[group]} <small>{n}</small>
        {note && <span className="pzi-hand">{note}</span>}
      </h2>
      <div className="pzt-rows">{children}</div>
    </section>
  );
}

type RowProps = { to: Route; navigate: Nav; lang: Lang; t: PzTraitsCopy };

/** Una profesión: ícono, nombre, los puntos que te deja y las habilidades que sube. */
function ProfRow({ p, to, navigate, lang, t }: RowProps & { p: Profession }) {
  return (
    <RouteLink className="pzt-row pzt-profrow" to={to} onNavigate={navigate}>
      <ItemIcon icon={p.icon} dir="professions" size={48} />
      <span className="pzt-name">{p[lang]}</span>
      <b className="pzt-cost">{signed(p.cost)}</b>
      <span className="pzt-line">{p.xpBoosts.length ? boostsText(p.xpBoosts, lang) : t.noBoosts}</span>
    </RouteLink>
  );
}

/**
 * Un rasgo: ícono (18×18 del juego, al doble y sin suavizar), nombre, puntos con su signo y tinte, y qué hace. Los que
 * no se eligen no tienen puntos que mostrar: si vienen con una profesión, lo dicen a lápiz.
 */
function TraitRow({ x, group, to, navigate, lang, t }: RowProps & { x: Trait; group: TraitGroup }) {
  return (
    <RouteLink className="pzt-row" to={to} onNavigate={navigate}>
      <ItemIcon icon={x.icon} dir="traits" size={36} />
      <span className="pzt-name">{x[lang]}</span>
      {group === "granted" ? (
        x.grantedBy.length > 0 && <em className="pzt-cost pzt-profonly">{t.profOnly}</em>
      ) : (
        <b className={`pzt-cost is-${group}`}>{signed(traitPoints(x))}</b>
      )}
      <span className="pzt-line">{traitLine(x, lang)}</span>
    </RouteLink>
  );
}
