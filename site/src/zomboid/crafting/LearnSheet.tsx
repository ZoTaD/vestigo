/**
 * "Para aprender" en el Planificador de fabricación (2026-10-02): una hoja propia, entre la hoja de ruta y el árbol, con
 * cada receta que tu plan usa y no sabés todavía (`totals.learn`), y con qué se aprende: un libro o una revista (con
 * dónde aparece más), llegar a un nivel de una habilidad, desarmar o estudiar ciertos objetos, o un rasgo o una
 * profesión que ya la sabe. Alcanza con cualquiera de esas cosas.
 *
 * Lo que se aprende sólo por nivel nunca cuenta como sabido de entrada: el plan no sabe qué niveles tiene tu personaje,
 * así que la receta aparece acá aunque ya tengas el nivel. La nota no promete otra cosa.
 *
 * Sin bordes de color: cada receta es un renglón con tinte, como el resto de la libreta.
 */
import type { ReactNode } from "react";
import RouteLink from "../../RouteLink";
import { useLang } from "../../i18n";
import type { Route } from "../../route";
import { ItemIcon, Stamp } from "../ui";
import { useCraftCopy } from "./copy";
import { own, type CraftData } from "./data";
import type { Totals } from "./engine";
import { joinWith, linksOf, WhereHint } from "./RouteSheet";
import type { CraftState } from "./state";

type Nav = (r: Route) => void;

/** Cuántos objetos para investigar se ven de entrada; el resto (los clavos traen 21), en un desplegable. */
const RESEARCH_SHOWN = 4;

export default function LearnSheet({
  data,
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
  const go = linksOf(route);
  if (!totals.learn.length) return null;

  const item = (id: string, icon = true) => (
    <RouteLink className="pzc-item" to={go.item(id)} onNavigate={navigate}>
      {icon && <ItemIcon icon={own(data.items, id)?.icon} size={32} />}
      <span>{own(data.items, id)?.[lang] ?? id}</span>
    </RouteLink>
  );
  const list = (ids: string[]): ReactNode[] =>
    ids.map((id, i) => (
      <span key={id}>
        {i > 0 && ", "}
        {item(id, false)}
      </span>
    ));

  return (
    <section className="pz-page pzc-sheet pzc-learn" aria-labelledby="pzc-learn-title">
      <h2 className="pzi-h2" id="pzc-learn-title">
        <Stamp name="book" />
        {t.learnTitle}
        <span className="pzi-hand">{t.learnNote}</span>
      </h2>
      {totals.learn.map((rid) => {
        const r = data.recipes[rid];
        const l = r.learn;
        if (!l) return null;
        const head = l.research.slice(0, RESEARCH_SHOWN);
        const rest = l.research.slice(RESEARCH_SHOWN);
        const ways = l.books.length + l.lv.length + l.research.length + l.traits.length + l.profs.length;
        return (
          <div className="pzc-lrecipe" key={rid}>
            <h3 className="pzc-h3">
              <RouteLink className="pzc-item" to={go.recipe(rid)} onNavigate={navigate}>
                <ItemIcon icon={r.icon} dir={r.kind === "build" ? "build" : "items"} size={32} />
                <span>{r[lang]}</span>
              </RouteLink>
            </h3>
            {ways > 0 && <p className="pzc-why pzc-lwith">{t.learnWith}</p>}
            <ul className="pzc-rows">
              {l.books.map((b) => (
                <li key={b}>
                  <span className="pzc-what">
                    <em className="pzc-why">{t.learnBooks}</em>
                    {item(b)}
                    <WhereHint data={data} id={b} route={route} navigate={navigate} />
                  </span>
                </li>
              ))}
              {l.lv.length > 0 && (
                <li>
                  <span className="pzc-plain">
                    {joinWith(
                      l.anyLv ? t.orWord : t.and,
                      l.lv.map(([s, n]) => (
                        <RouteLink className="pzc-item" to={go.skill(s)} onNavigate={navigate} key={s}>
                          <span>{t.reach(n, own(data.skills, s)?.[lang] ?? s)}</span>
                        </RouteLink>
                      )),
                    )}
                    {l.anyLv && l.lv.length > 1 && <em className="pzc-why">{t.anyOfLv}</em>}
                  </span>
                </li>
              )}
              {l.research.length > 0 && (
                <li>
                  <span className="pzc-what">
                    <em className="pzc-why">{t.research}</em>
                    <span className="pzc-alts">
                      {list(head)}
                      {rest.length > 0 && (
                        <details className="pzc-moretools">
                          <summary>{t.andMore(rest.length)}</summary>
                          {list(rest)}
                        </details>
                      )}
                    </span>
                  </span>
                </li>
              )}
              {l.traits.length + l.profs.length > 0 && (
                <li>
                  <span className="pzc-what">
                    <em className="pzc-why">{t.traitsProfs}</em>
                    {l.traits.map((x) => (
                      <RouteLink className="pzc-item" to={go.trait(x)} onNavigate={navigate} key={`t${x}`}>
                        <ItemIcon icon={own(data.traits, x)?.icon} dir="traits" size={32} />
                        <span>{own(data.traits, x)?.[lang] ?? x}</span>
                      </RouteLink>
                    ))}
                    {l.profs.map((x) => (
                      <RouteLink className="pzc-item" to={go.prof(x)} onNavigate={navigate} key={`p${x}`}>
                        <ItemIcon icon={own(data.profs, x)?.icon} dir="professions" size={32} />
                        <span>{own(data.profs, x)?.[lang] ?? x}</span>
                      </RouteLink>
                    ))}
                  </span>
                </li>
              )}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
