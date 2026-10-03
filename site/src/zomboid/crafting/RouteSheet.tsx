/**
 * La hoja de ruta del Planificador de fabricación (2026-10-02): lo que se lleva al juego. Va primero, antes que el
 * árbol: qué juntar (con dónde aparece más y cuánto ya tenés), las herramientas (con "la tengo"), los líquidos, las
 * estaciones, las habilidades, los pasos en orden, lo que sobra y la experiencia que deja. Lo que hay que aprender va en
 * su propia hoja (`LearnSheet.tsx`). Todo sale de `totals` (`engine.ts`), en unidades: acá se muestran en objetos
 * (`asItems`), y en usos si el objeto se gasta de a poco (el cordel: 5 usos por cordel).
 *
 * Reglas de la casa: sin bordes de color (las filas alternan con tinte), cada nombre con su link a la ficha, y las notas
 * dicen qué significa cada cosa, nunca de dónde sale.
 */
import { useEffect, useMemo, useReducer, type ReactNode } from "react";
import RouteLink from "../../RouteLink";
import { useLang, useLocale, type Lang } from "../../i18n";
import { routePath, SITE_ORIGIN, type Route } from "../../route";
import { useZomboidCopy } from "../../zomboidCopy";
import { pct } from "../loot/chance";
import { CopyButton, ItemIcon, Stamp } from "../ui";
import { useCraftCopy, type CraftCopy } from "./copy";
import { own, type CraftData } from "./data";
import { asItems, context, outUnits, totals as totalsOf, unitsPer, type Totals } from "./engine";
import { addTarget, BUILD, encodeState, isBuild, setHave, type CraftState } from "./state";

type Nav = (r: Route) => void;
type Namer = (raw: string, lang: Lang) => string;

/** Cuántos nombres de una línea de herramientas se ven de entrada; el resto, en un desplegable. */
const TOOLS_SHOWN = 3;

/**
 * Los nombres de los cuartos donde aparece cada cosa ("Taller de carpintería"). Son los del Mapa más los que sólo llenan
 * botín, y viajan aparte (~10 KB): la hoja de ruta sólo existe en el navegador (el prerender no tiene nada elegido), así
 * que se piden al montarse y el "dónde" aparece cuando llegan.
 */
let namer: Namer | null = null;
let pending: Promise<Namer> | null = null;
/** Exportado para los tests: el render estático no corre efectos, así que los nombres se piden antes de dibujar. */
export function loadRoomNamer(): Promise<Namer> {
  pending ??= Promise.all([import("../map/rooms"), import("../map/lootRoomNames")]).then(
    ([rooms, names]) => (namer = (raw, lang) => rooms.roomName(raw, lang, names.default)),
    (err) => {
      pending = null;
      throw err;
    },
  );
  return pending;
}
function useRoomNamer(): Namer | null {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!namer) loadRoomNamer().then(bump, () => undefined);
  }, []);
  return namer;
}

/** Los links de la pestaña a las fichas de las otras: Objetos, Recetas y Habilidades. */
export function linksOf(route: Route) {
  const to = (pzSection: "items" | "recipes" | "skills" | "traits" | "professions") => (detail: string): Route => ({
    ...route,
    view: "zomboid",
    pzSection,
    detail,
  });
  return { item: to("items"), recipe: to("recipes"), skill: to("skills"), trait: to("traits"), prof: to("professions") };
}

/** El link que se copia: el de este sitio (en local, el local) con lo que elegiste. */
export const shareLink = (route: Route, st: CraftState): string =>
  (typeof window === "undefined" ? SITE_ORIGIN : window.location.origin) + routePath(route) + "?" + encodeState(st);

/**
 * Dónde aparece más un objeto: "Más fácil: Cocina · 3,9 % · en 12 lugares" y "Dónde aparece →" a su ficha de Objetos,
 * que tiene la hoja entera del botín. Sin botín (`w`), nada. `_all` es cualquier lugar sin botín propio: ahí no se dice
 * en cuántos lugares, que sería uno solo y confunde.
 */
export function WhereHint({ data, id, route, navigate }: { data: CraftData; id: string; route: Route; navigate: Nav }): ReactNode {
  const t = useCraftCopy();
  const anywhere = useZomboidCopy().items.where.anywhere;
  const { lang } = useLang();
  const locale = useLocale();
  const roomName = useRoomNamer();
  const w = own(data.items, id)?.w;
  if (!w || !roomName) return null;
  const chance = pct(w[2], locale);
  const text =
    w[0] === "_all"
      ? t.easiestAnywhere(anywhere.charAt(0).toLowerCase() + anywhere.slice(1), chance)
      : t.easiest(roomName(w[0], lang), chance, w[3]);
  return (
    <span className="pzc-where">
      <span>{text}</span>{" "}
      <RouteLink className="pzc-wlink" to={linksOf(route).item(id)} onNavigate={navigate}>
        {t.whereLink}
      </RouteLink>
    </span>
  );
}

/** El campo "tengo" de un objeto: lo que ya tenés se resta de lo que hay que juntar o fabricar. */
export function HaveInput({
  id,
  name,
  st,
  set,
}: {
  id: string;
  name: string;
  st: CraftState;
  set: (s: CraftState) => void;
}) {
  const t = useCraftCopy();
  return (
    <label className="pzc-have">
      <span>{t.have}</span>
      <input
        type="number"
        min={0}
        max={999}
        inputMode="numeric"
        aria-label={t.haveOne(name)}
        value={own(st.have, id) ?? 0}
        onChange={(e) => set(setHave(st, id, Number(e.target.value)))}
      />
    </label>
  );
}

/** "A, B y C" / "A, B o C". */
export const joinWith = (word: string, parts: ReactNode[]): ReactNode[] =>
  parts.flatMap((p, i) => (i === 0 ? [p] : [i === parts.length - 1 ? ` ${word} ` : ", ", p]));

export default function RouteSheet({
  data,
  st,
  set,
  totals,
  route,
  navigate,
}: {
  data: CraftData;
  st: CraftState;
  set: (s: CraftState) => void;
  totals: Totals;
  route: Route;
  navigate: Nav;
}) {
  const t = useCraftCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const go = linksOf(route);
  const collator = useMemo(() => new Intl.Collator(locale), [locale]);
  const nameOf = (id: string) => own(data.items, id)?.[lang] ?? id;

  /** Un objeto con su ícono y su link a Objetos. */
  const item = (id: string, icon = true) => (
    <RouteLink className="pzc-item" to={go.item(id)} onNavigate={navigate}>
      {icon && <ItemIcon icon={own(data.items, id)?.icon} size={32} />}
      <span>{nameOf(id)}</span>
    </RouteLink>
  );
  /** Cuántos objetos son `units` unidades, y en un objeto que se gasta de a poco también los usos. En 0 (lo que ya
   * tenés entero) `asItems` da -0, que se escribiría "-0". */
  const amount = (id: string, units: number) => (
    <>
      <b className="pzc-n">{num(Math.max(0, asItems(data, id, units)))}</b>
      {unitsPer(data, id) > 1 && <small className="pzc-uses">({t.uses(Math.round(units * 100) / 100)})</small>}
    </>
  );
  // Lo que ya tenés entero no queda en `totals.raw` (no hay nada que juntar), pero su fila sigue, en 0 y con su "tengo":
  // si no, el campo desaparecería con el número y no habría forma de volver atrás. Se busca en los totales sin lo que
  // tenés (las decisiones del árbol no dependen de eso, sólo las cantidades).
  const covered = useMemo(() => {
    if (!Object.keys(st.have).length) return [];
    const left = new Set(totals.raw.map((r) => r.id));
    return totalsOf(data, { ...st, have: {} }, context(data, st))
      .raw.filter((r) => !left.has(r.id) && own(st.have, r.id))
      .map((r) => ({ ...r, units: 0 }));
  }, [data, st, totals]);
  const raw = [...totals.raw, ...covered]
    .filter((r) => !isBuild(r.id))
    .sort((a, b) => collator.compare(nameOf(a.id), nameOf(b.id)));
  const inList = new Set(st.q.map((x) => x.id));

  return (
    <section className="pz-page pzc-sheet pzc-route" aria-labelledby="pzc-route-title">
      <h2 className="pzi-h2" id="pzc-route-title">
        <Stamp name="checkmark" />
        {t.routeTitle}
        <span className="pzi-hand">{t.routeNote}</span>
      </h2>

      {raw.length > 0 && (
        <>
          <h3 className="pzc-h3">{t.raw}</h3>
          <ul className="pzc-rows">
            {raw.map((r) => {
              const label = r.why === "raw" || r.why === "undo" ? null : t.why[r.why];
              return (
                <li key={r.id}>
                  <span className="pzc-qtycol">{amount(r.id, r.units)}</span>
                  <span className="pzc-what">
                    {item(r.id)}
                    {label && (
                      <span className="pzc-notes">
                        <em className={`pzc-why is-${r.why}`}>{label}</em>
                      </span>
                    )}
                    <WhereHint data={data} id={r.id} route={route} navigate={navigate} />
                  </span>
                  <HaveInput id={r.id} name={nameOf(r.id)} st={st} set={set} />
                </li>
              );
            })}
          </ul>
        </>
      )}

      {totals.tools.length > 0 && (
        <>
          <h3 className="pzc-h3">{t.tools}</h3>
          <ul className="pzc-rows">
            {totals.tools.map((tool) => {
              // "la tengo": la herramienta elegida ya está en tu mochila. Si además la ibas a fabricar, deja de pedirla.
              const has = (own(st.have, tool.pick) ?? 0) > 0;
              return (
                <li key={tool.opts.join("|")} className={has ? "is-have" : undefined}>
                  <span className="pzc-what">
                    <ToolLine opts={tool.opts} pick={tool.pick} item={item} t={t} />
                    <WhereHint data={data} id={tool.pick} route={route} navigate={navigate} />
                  </span>
                  <label className="pzc-havetool">
                    <input
                      type="checkbox"
                      checked={has}
                      aria-label={`${t.haveTool}: ${nameOf(tool.pick)}`}
                      onChange={(e) => set(setHave(st, tool.pick, e.target.checked ? 1 : 0))}
                    />
                    <span>{has ? t.youHaveIt : t.haveTool}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {totals.fluids.length > 0 && (
        <>
          <h3 className="pzc-h3">{t.fluids}</h3>
          <ul className="pzc-rows">
            {totals.fluids.map((f) => (
              <li key={f.name.en}>
                <span className="pzc-plain">{t.liters(num(Math.round(f.liters * 100) / 100), f.name[lang])}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {totals.stations.length > 0 && (
        <>
          <h3 className="pzc-h3">{t.stations}</h3>
          <ul className="pzc-rows">
            {totals.stations.map((s) => {
              const station = own(data.stations, s);
              const build = station?.builds[0];
              const r = build ? own(data.recipes, build) : undefined;
              return (
                <li key={s}>
                  <span className="pzc-what">
                    <b className="pzc-sname">{station?.[lang] ?? s}</b>
                    {r && build ? (
                      <span className="pzc-notes">
                        <em className="pzc-why">{t.buildIt}</em>
                        <RouteLink className="pzc-item" to={go.recipe(build)} onNavigate={navigate}>
                          <span>{r[lang]}</span>
                        </RouteLink>
                        {!inList.has(BUILD + build) && (
                          <button type="button" className="pzc-act" onClick={() => set(addTarget(st, BUILD + build))}>
                            {t.addToList}
                          </button>
                        )}
                      </span>
                    ) : (
                      <span className="pzc-notes">
                        <em className="pzc-why is-found">{t.stationFound}</em>
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {totals.skills.length > 0 && (
        <>
          <h3 className="pzc-h3">{t.skills}</h3>
          <ul className="pzc-rows">
            {totals.skills.map(([s, lvl]) => (
              <li key={s}>
                <span className="pzc-plain">
                  <RouteLink className="pzc-item" to={go.skill(s)} onNavigate={navigate}>
                    <span>{own(data.skills, s)?.[lang] ?? s}</span>
                  </RouteLink>{" "}
                  {t.level(lvl)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {totals.steps.length > 0 && (
        <>
          <h3 className="pzc-h3">{t.steps}</h3>
          <ol className="pzc-rows pzc-steps">
            {totals.steps.map((s) => {
              const r = data.recipes[s.recipe];
              const made = isBuild(s.id) ? null : asItems(data, s.id, s.crafts * outUnits(data, r, s.id));
              return (
                <li key={`${s.id}~${s.recipe}`}>
                  <span className="pzc-plain">
                    <b className="pzc-n">{num(s.crafts)} ×</b>{" "}
                    <RouteLink className="pzc-item" to={go.recipe(s.recipe)} onNavigate={navigate}>
                      <span>{r[lang]}</span>
                    </RouteLink>
                    {made !== null && (
                      <span className="pzc-gives">
                        <span className="pzc-arrow" aria-hidden="true">
                          →
                        </span>{" "}
                        <b className="pzc-n">{num(made)}</b> {item(s.id, false)}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}

      {totals.left.length > 0 && (
        <>
          <h3 className="pzc-h3">{t.left}</h3>
          <ul className="pzc-rows">
            {totals.left.map((l) => (
              <li key={l.id}>
                <span className="pzc-qtycol">
                  {unitsPer(data, l.id) > 1 ? (
                    <b className="pzc-n">{t.uses(Math.round(l.units * 100) / 100)}</b>
                  ) : (
                    <b className="pzc-n">{num(Math.round(l.units))}</b>
                  )}
                </span>
                <span className="pzc-what">{item(l.id)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {totals.xp.length > 0 && (
        <>
          <h3 className="pzc-h3">{t.xpTitle}</h3>
          <ul className="pzc-rows">
            {totals.xp.map(([s, n]) => (
              <li key={s}>
                <span className="pzc-plain">
                  <RouteLink className="pzc-item" to={go.skill(s)} onNavigate={navigate}>
                    <span>{own(data.skills, s)?.[lang] ?? s}</span>
                  </RouteLink>{" "}
                  <b className="pzc-n">{t.xp(num(Math.round(n * 10) / 10))}</b>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="pzc-share">
        <CopyButton text={shareLink(route, st)} label={t.share} done={t.copied} what={t.shareWhat} />
      </div>
    </section>
  );
}

/** "una de: X, Y, Z" con la elegida primero; si son muchas (el cuchillo de tallar trae 28), el resto en un desplegable. */
function ToolLine({
  opts,
  pick,
  item,
  t,
}: {
  opts: string[];
  pick: string;
  item: (id: string, icon?: boolean) => ReactNode;
  t: CraftCopy;
}) {
  const order = [pick, ...opts.filter((o) => o !== pick)];
  if (order.length === 1) return <span className="pzc-what">{item(pick)}</span>;
  const head = order.slice(0, TOOLS_SHOWN);
  const rest = order.slice(TOOLS_SHOWN);
  return (
    <span className="pzc-what">
      <span className="pzc-oneof">
        <em className="pzc-why">{t.oneOf}:</em> {item(pick)}
      </span>
      <span className="pzc-alts">
        <span className="pzc-or">{t.orWord}</span>{" "}
        {head.slice(1).map((o, i) => (
          <span key={o}>
            {i > 0 && ", "}
            {item(o, false)}
          </span>
        ))}
        {rest.length > 0 && (
          <details className="pzc-moretools">
            <summary>{t.andMore(rest.length)}</summary>
            {rest.map((o, i) => (
              <span key={o}>
                {i > 0 && ", "}
                {item(o, false)}
              </span>
            ))}
          </details>
        )}
      </span>
    </span>
  );
}
