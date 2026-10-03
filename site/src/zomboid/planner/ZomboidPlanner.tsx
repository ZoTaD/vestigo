/**
 * La pestaña Personaje de Project Zomboid (2026-09-30): el Planificador de personaje. `/en/project-zomboid/planner`,
 * `/es/project-zomboid/personaje`. Arriba del costado va tu sobreviviente con la ropa de su profesión (`Survivor.tsx`,
 * 2026-10-01): el afiche de entrada y el 3D sólo si lo pedís.
 *
 * Es la pantalla de creación del juego en una página de la libreta: la profesión (tarjetas con su ícono), los rasgos en
 * dos hojas (positivos y negativos, en el orden del juego) y, al costado, tu personaje: los puntos para gastar, los
 * rasgos que tenés (los elegidos y los gratis), las habilidades iniciales con su multiplicador de XP y el link para
 * compartirlo. Debajo, todas las habilidades y las recetas que sabés. La cuenta es de `build.ts`, que dice de dónde sale
 * cada regla.
 *
 * **Servidor y navegador.** El prerender escribe el personaje de entrada (Desempleado, sin rasgos) con el texto de la
 * página: la dirección (`?b=`) no la conoce el servidor, y la hidratación tiene que coincidir. El `?b=` se lee al
 * montarse, antes de pintar (`useLayoutEffect`, así no se ve el de entrada un instante), y cada cambio lo reescribe con
 * `history.replaceState`, sin recargar ni sumar pasos al Atrás (el mismo trato que el Mapa).
 *
 * **Reglas de la casa:** sin bordes de color (lo elegido va con tinte y una tilde, los puntos negativos con tinte rojo);
 * los títulos se achican sin cortar palabras; en el celular las profesiones se deslizan dentro de su hoja y los puntos
 * acompañan abajo mientras se eligen rasgos, sin scroll horizontal de la página.
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import meta from "@zomboid/meta.json";
import professionSlugs from "virtual:pz-slugs-es/professions";
import recipeSlugs from "virtual:pz-slugs-es/recipes";
import traitSlugs from "virtual:pz-slugs-es/traits";
import RouteLink from "../../RouteLink";
import { useLang, useLocale } from "../../i18n";
import { parseRoute, registerPzSlugs, routePath, SITE_ORIGIN, type PzTab, type Route } from "../../route";
import { CopyButton, fold, ItemIcon, Stamp, wordFit, useIsoLayoutEffect } from "../ui";
import { findProfession, findTrait, PROFESSIONS, signed, TRAITS, traitPoints, type Trait } from "../traits/data";
import { Known, Links } from "../traits/TraitFicha";
import { traitLine } from "../traits/TraitList";
import {
  B_PARAM,
  blocker,
  conflicts,
  decode,
  DEFAULT_BUILD,
  encode,
  held,
  isDefault,
  knownNotRecipes,
  pickable,
  pickProfession,
  points,
  professionOf,
  professionsInOrder,
  recipes,
  toggleTrait,
  traitPointsOf,
  type Blocker,
  type Build,
  type Origin,
} from "./build";
import { usePlannerCopy, type PzPlannerCopy } from "./copy";
import CraftLink from "../crafting/link";
import { levelOneExceptions, SKILLS, skills, type SkillRow } from "./skills";
import Survivor from "./Survivor";
// Las hojas, el buscador, los renglones y los enlaces son los de Objetos: la misma libreta. Lo propio va aparte.
import "../../styles/zomboid-items.css";
import "../../styles/zomboid-planner.css";

// Las direcciones en español de lo que enlaza: los rasgos y la profesión de tu personaje y las recetas que sabés. Al
// cargarse el módulo, como en Rasgos: `preloadRoute` baja este chunk antes de que `App` lea la dirección.
registerPzSlugs({ ...recipeSlugs, ...traitSlugs, ...professionSlugs });

type Nav = (r: Route) => void;
type Lang = "en" | "es";
type Group = "positive" | "negative";

/**
 * Los rasgos que se eligen, en sus dos listas y en el orden del juego (`CharacterCreationMain.sort` e `invertSort`):
 * los positivos del más barato al más caro y los negativos del que menos da al que más; a igual costo, por nombre.
 */
const GROUPS: Group[] = ["positive", "negative"];
const inGroup = (g: Group) => TRAITS.filter((t) => pickable(t) && (g === "positive" ? t.cost > 0 : t.cost < 0));
const STAMPS: Record<Group, string> = { positive: "facehappy", negative: "facesad" };

/** Un multiplicador sin el ruido de la coma flotante (1,66 × 0,75 = 1,2449999…): a tres decimales y mostrado con dos. */
const round3 = (x: number) => Math.round(x * 1000) / 1000;

export default function ZomboidPlanner({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = usePlannerCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const times = (x: number) => `×${round3(x).toLocaleString(locale, { maximumFractionDigits: 2 })}`;
  const collator = useMemo(() => new Intl.Collator(locale), [locale]);

  // El personaje de entrada en el servidor y en el primer render del navegador; el de la dirección llega en el efecto.
  const [build, setBuild] = useState<Build>(DEFAULT_BUILD);
  const [dropped, setDropped] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const needle = fold(useDeferredValue(q).trim());
  const strip = useRef<HTMLDivElement>(null);
  /** La profesión que vino en el link, hasta que su tarjeta quede a la vista en la tira del celular. */
  const centerProf = useRef<string | null>(null);

  /**
   * Escribe el personaje en la dirección, si la dirección sigue siendo la del planificador (como en el Mapa). El de
   * entrada va sin `?b=`: la página limpia es la misma que ve Google. Se conservan las otras claves y el hash.
   */
  const writeUrl = (b: Build) => {
    if (parseRoute(window.location.pathname).pzSection !== "planner") return;
    const params = new URLSearchParams(window.location.search);
    if (isDefault(b)) params.delete(B_PARAM);
    else params.set(B_PARAM, encode(b));
    const qs = params.toString();
    window.history.replaceState(window.history.state, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
  };

  useIsoLayoutEffect(() => {
    const raw = new URLSearchParams(window.location.search).get(B_PARAM);
    if (raw === null) return;
    // Un link roto (nada que reconocer) vuelve al de entrada; uno con cosas de más queda escrito sin ellas.
    const b = decode(raw) ?? DEFAULT_BUILD;
    setBuild(b);
    writeUrl(b);
    centerProf.current = b.prof;
    // Sólo al montarse: después cada cambio escribe la dirección él mismo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // En el celular las profesiones se deslizan de costado: la que vino en el link queda a la vista. Sólo se mueve la
  // tira, nunca la página. Se espera al render con esa profesión: el primero todavía tiene la de entrada.
  useEffect(() => {
    const el = strip.current;
    if (!el || centerProf.current !== build.prof) return;
    centerProf.current = null;
    const card = el.querySelector<HTMLElement>(".pzb-prof.is-on");
    if (card && el.scrollWidth > el.clientWidth) el.scrollLeft = Math.max(0, card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2);
  }, [build.prof]);

  const change = (b: Build, gone: string[] = []) => {
    setBuild(b);
    setDropped(gone);
    writeUrl(b);
  };
  const onProf = (id: string) => {
    const r = pickProfession(build, id);
    change(r.build, r.dropped);
  };
  const onTrait = (id: string) => change(toggleTrait(build, id));

  const prof = professionOf(build);
  const all = held(build);
  const pts = points(build);
  const rows = skills(build);
  const clash = conflicts(build);
  const chosen = new Set(build.traits);
  const profs = useMemo(() => professionsInOrder(lang, collator), [lang, collator]);
  const groups = useMemo(
    () =>
      GROUPS.map(
        (g) => [g, inGroup(g).sort((a, b) => Math.abs(a.cost) - Math.abs(b.cost) || collator.compare(a[lang], b[lang]))] as const,
      ),
    [lang, collator],
  );
  const matches = (x: Trait) => !needle || fold(`${x.en} ${x.es}`).includes(needle);
  const shown = groups.map(([g, list]) => [g, list.filter(matches)] as const);

  /** El nombre de donde viene un rasgo gratis (la profesión o el rasgo que lo trae). */
  const fromName = (o: Origin): string | undefined =>
    o.kind === "profession" ? findProfession(o.id)?.[lang] : o.kind === "trait" ? findTrait(o.id)?.[lang] : undefined;
  const reason = (bl: Blocker): string =>
    bl.kind === "excludes"
      ? t.excludes(bl.by[lang], fromName(bl.from))
      : bl.kind === "brings"
        ? t.brings(bl.via[lang], bl.by[lang], fromName(bl.from))
        : t.given(fromName(bl.from) ?? "");
  const link = (sec: PzTab) => (id: string): Route => ({ ...route, view: "zomboid", pzSection: sec, detail: id });
  // El link que se copia: el de este sitio (en local, el local) con el personaje.
  const shareUrl =
    (typeof window === "undefined" ? SITE_ORIGIN : window.location.origin) + routePath(route) + (isDefault(build) ? "" : `?${B_PARAM}=${encode(build)}`);

  // La explicación de la hoja de habilidades, con los números y los nombres de los datos.
  const m = ["0", "1", "2", "3"].map((k) => times((meta.boostMultipliers as Record<string, number>)[k]));
  const noLoss = t.join(SKILLS.filter((s) => s.table["0"] === 1).map((s) => s[lang]));
  const flat = t.join(SKILLS.filter((s) => Object.values(s.table).every((v) => v === 1)).map((s) => s[lang]));
  const multTraits = t.join(TRAITS.filter((x) => x.xpMult?.length).map((x) => x[lang]));
  // Las que en nivel 1 no siguen la tabla común (Carrera: ×1,25): salen de los datos, no se nombran a mano.
  const odd = t.join(levelOneExceptions().map((s) => `${s[lang]} ${times(s.table["1"])}`));
  // Las 35 habilidades por categoría, en el orden del juego.
  const cats: { id: string; name: string; rows: SkillRow[] }[] = [];
  for (const r of rows) {
    let c = cats.find((x) => x.id === r.cat.id);
    if (!c) cats.push((c = { id: r.cat.id, name: r.cat[lang], rows: [] }));
    c.rows.push(r);
  }

  return (
    <main className="pz-main pzi pzb">
      <section className="pz-page pzi-intro">
        <span className="pz-clip" />
        <h1 className="pzi-h1" style={wordFit(t.title)}>
          {t.title}
        </h1>
        {t
          .intro(num(PROFESSIONS.length), num(groups[0][1].length), num(groups[1][1].length), meta.version)
          .map((p) => (
            <p key={p}>{p}</p>
          ))}
        <p className="pzi-hand">{t.hand}</p>
      </section>

      <div className="pzb-layout">
        <div className="pzb-pick">
          <section className="pz-page pzb-sheet" aria-labelledby="pzb-prof-title">
            <h2 className="pzi-h2" id="pzb-prof-title">
              <Stamp name="wrench" />
              {t.profTitle}
              <span className="pzi-hand">{t.profNote}</span>
            </h2>
            <div className="pzb-strip" ref={strip}>
              {profs.map((p) => {
                const on = p.id === prof.id;
                return (
                  <button type="button" className={`pzb-prof${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => onProf(p.id)} key={p.id}>
                    <ItemIcon icon={p.icon} dir="professions" size={48} />
                    <b className={`pzb-cost ${tone(p.cost)}`}>{signed(p.cost)}</b>
                    <span className="pzb-name">{p[lang]}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="pz-page pzi-filters pzb-search" aria-label={t.search}>
            <label className="pzi-search">
              <span className="visually-hidden">{t.search}</span>
              <Stamp name="eye" />
              <input type="search" value={q} placeholder={t.searchHint} onChange={(e) => setQ(e.target.value)} />
            </label>
          </section>
          {shown.every(([, list]) => !list.length) && <p className="pzi-empty">{t.empty}</p>}

          {shown.map(([g, list]) =>
            list.length ? (
              <section className={`pz-page pzb-sheet pzb-tlist is-${g}`} key={g}>
                <h2 className="pzi-h2">
                  <Stamp name={STAMPS[g]} />
                  {t.groups[g]} <small>{num(list.length)}</small>
                  <span className="pzi-hand">{t.groupNotes[g]}</span>
                </h2>
                <div className="pzb-grid">
                  {list.map((x) => {
                    const on = chosen.has(x.id);
                    const bl = on ? null : blocker(build, x.id);
                    return (
                      <button
                        type="button"
                        className={`pzb-trait is-${g}${on ? " is-on" : ""}`}
                        aria-pressed={on}
                        disabled={!!bl}
                        onClick={() => onTrait(x.id)}
                        key={x.id}
                      >
                        <ItemIcon icon={x.icon} dir="traits" size={36} />
                        <span className="pzb-tname">
                          {on && <Stamp name="checkmark" className="pzb-check" />}
                          {x[lang]}
                        </span>
                        <b className="pzb-cost">{signed(traitPoints(x))}</b>
                        <span className="pzb-line">{bl ? reason(bl) : traitLine(x, lang)}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null,
          )}

          {/* En el celular, los puntos acompañan abajo mientras se eligen rasgos, hasta que llega la hoja del personaje. */}
          <p className={`pzb-bar${pts < 0 ? " is-neg" : ""}`}>
            <span>
              {t.bar.points} <b>{signed(pts)}</b>
            </span>
            <a href="#pzb-character">{t.bar.toSheet}</a>
          </p>
        </div>

        <aside className="pzb-side" aria-label={t.sheetTitle}>
          <Survivor prof={prof.id} profName={prof[lang]} route={route} navigate={navigate} />
          <section className="pz-page pzb-card" id="pzb-character">
            <h2 className="pzi-h2">
              <Stamp name="facehappy" />
              {t.sheetTitle}
            </h2>
            <p className={`pzb-points${pts < 0 ? " is-neg" : ""}`}>
              <span>{t.pointsLabel}</span>
              <b>{signed(pts)}</b>
              <small>{t.breakdown(signed(prof.cost), signed(traitPointsOf(build)))}</small>
            </p>
            {(pts < 0 || clash.length > 0 || dropped.length > 0) && (
              <div className="pzb-notes" role="status">
                {pts < 0 && <p>{t.needPoints}</p>}
                {clash.map(([a, b]) => (
                  <p key={`${a.trait.id}-${b.trait.id}`}>{t.conflict(a.trait[lang], b.trait[lang])}</p>
                ))}
                {dropped.length > 0 && <p>{t.dropped(t.join(dropped.map((id) => findTrait(id)?.[lang] ?? id)), dropped.length)}</p>}
              </div>
            )}

            <h3 className="pzb-h3">{t.profession}</h3>
            <RouteLink className="pzb-heldprof" to={link("professions")(prof.id)} onNavigate={navigate}>
              <ItemIcon icon={prof.icon} dir="professions" size={36} />
              <span>{prof[lang]}</span>
              <b className={`pzb-cost ${tone(prof.cost)}`}>{signed(prof.cost)}</b>
            </RouteLink>

            <h3 className="pzb-h3">{t.traitsHeld}</h3>
            {all.length ? (
              <ul className="pzb-held">
                {all.map(({ trait: x, from }) => (
                  <li key={x.id}>
                    <RouteLink to={link("traits")(x.id)} onNavigate={navigate}>
                      <ItemIcon icon={x.icon} dir="traits" size={36} />
                      <span>{x[lang]}</span>
                    </RouteLink>
                    {from.kind === "picked" ? (
                      <>
                        <b className={`pzb-cost ${tone(traitPoints(x))}`}>{signed(traitPoints(x))}</b>
                        <button type="button" className="pzb-x" aria-label={t.remove(x[lang])} onClick={() => onTrait(x.id)}>
                          ×
                        </button>
                      </>
                    ) : (
                      <em className="pzb-free">{t.free(fromName(from) ?? "")}</em>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pzb-none">{t.noTraits}</p>
            )}

            <h3 className="pzb-h3">
              {t.skillsTitle}
              <span className="pzi-hand">{t.skillsNote}</span>
            </h3>
            <Skills rows={rows.filter((r) => r.listed)} t={t} lang={lang} times={times} />

            <div className="pzb-actions">
              <CopyButton text={shareUrl} label={t.copy} done={t.copied} what={t.copyWhat} />
              <button type="button" className="pzb-reset" onClick={() => change(DEFAULT_BUILD)} disabled={isDefault(build)}>
                {t.reset}
              </button>
            </div>
          </section>
        </aside>
      </div>

      <div className="pzi-sheets pzb-bottom">
        <div className="pzi-relcol">
          <section className="pz-page pzi-rel pzb-all">
            <h2 className="pzi-h2">
              <Stamp name="arrownorth" />
              {t.allSkillsTitle}
            </h2>
            <p className="pzb-about">{t.allSkillsIntro(m, noLoss, flat, multTraits, odd)}</p>
            {cats.map((c) => (
              <div className="pzb-cat" key={c.id}>
                <h3 className="pzb-h3">{c.name}</h3>
                <Skills rows={c.rows} t={t} lang={lang} times={times} />
              </div>
            ))}
          </section>
        </div>
        <div className="pzi-relcol">
          <KnownRecipes build={build} route={route} navigate={navigate} />
        </div>
      </div>
    </main>
  );
}

/** El tinte de una cifra de puntos: verde si te da, rojo lápiz si te saca, como el juego. */
const tone = (n: number): string => (n > 0 ? "is-good" : n < 0 ? "is-bad" : "");

/**
 * Habilidades en renglones: el nombre, las diez rayitas del juego (las llenas son el nivel), el nivel en cifra y el
 * multiplicador de XP. Las que arrancan en 0 van más claras.
 */
function Skills({ rows, t, lang, times }: { rows: SkillRow[]; t: PzPlannerCopy; lang: Lang; times: (x: number) => string }) {
  return (
    <ul className="pzb-skills" aria-label={t.cols.skill}>
      {rows.map((r) => (
        <li className={r.level ? undefined : "is-zero"} key={r.id}>
          <span className="pzb-sname">{r[lang]}</span>
          <span className="pzb-pips" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => (
              <i className={i < r.level ? "on" : undefined} key={i} />
            ))}
          </span>
          <b className="pzb-lvl">
            <span className="visually-hidden">{t.level(r.level)}</span>
            <span aria-hidden="true">{r.level}</span>
          </b>
          <b className="pzb-mult">
            <span className="visually-hidden">{t.cols.xp} </span>
            {times(r.mult)}
          </b>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Recetas que sabés": las de la profesión y las de los rasgos, por nombre, y el link al Planificador de fabricación con
 * este personaje (ahí lo que sabe se fabrica sin pasar por "Para aprender"). El de entrada va sin `b`: la página limpia.
 * Aparte del planificador para poder probarla con un personaje (el del link llega en un efecto, que el servidor no corre).
 */
export function KnownRecipes({ build, route, navigate }: { build: Build; route: Route; navigate: Nav }) {
  const t = usePlannerCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const collator = useMemo(() => new Intl.Collator(locale), [locale]);
  const known = useMemo(() => recipes(build).sort((a, b) => collator.compare(a[lang], b[lang])), [build, lang, collator]);
  // Lo que se sabe sin ser receta (Mecánica básica, las temporadas de cultivo): como en las fichas, en texto, abajo y en
  // el orden del juego (básica, intermedia, avanzada), no por nombre.
  const knows = useMemo(() => knownNotRecipes(build), [build]);
  const empty = isDefault(build);
  const toRecipe = (id: string): Route => ({ ...route, view: "zomboid", pzSection: "recipes", detail: id });
  return (
    <section className="pz-page pzi-rel pzb-recipes">
      <h2 className="pzi-h2">
        <Stamp name="hammer" />
        {t.recipesTitle}
        <small>{(known.length + knows.length).toLocaleString(locale)}</small>
      </h2>
      <p className="pzi-hand">{t.recipesNote}</p>
      {known.length > 0 && <Links refs={known} to={toRecipe} navigate={navigate} lang={lang} icons={null} more={t.more} />}
      <Known known={knows} lang={lang} more={t.more} />
      {known.length + knows.length === 0 && <p className="pzb-none">{t.noRecipes}</p>}
      <CraftLink className="pzi-craftlink" route={route} navigate={navigate} st={empty ? {} : { b: encode(build) }}>
        {empty ? t.craftLinkEmpty : t.craftLink}
      </CraftLink>
    </section>
  );
}
