/**
 * La portada de Project Zomboid (2026-09-30), estética "Libreta de supervivencia": el mapa de papel de Muldraugh que
 * trae el juego, anotado con lápiz rojo y con los sellos del juego, y tres hojas de libreta: lo que hay, qué es la
 * libreta (el texto que lee Google) y las herramientas, que se enlazan a medida que se publican.
 */
import meta from "@zomboid/meta.json";
import serverSlugs from "virtual:pz-slugs-es/server";
import type { CSSProperties } from "react";
import { useLocale } from "../i18n";
import RouteLink from "../RouteLink";
import { PZ_PUBLISHED, registerPzSlugs, type PzTab, type Route } from "../route";
import { useZomboidCopy } from "../zomboidCopy";

// Las herramientas enlazan dos fichas del Servidor (los presets comparados y la calculadora de cortes): sin sus slugs en
// español, la portada, que no baja la pestaña, escribía `/es/project-zomboid/servidor/water-and-power-shutoff` (el id en
// inglés) en vez de `/servidor/cortes-de-agua-y-luz`. Son dos, y se anotan al cargarse, como en cada pestaña.
registerPzSlugs(serverSlugs);

type Nav = (r: Route) => void;

/** Un sello del juego (`LootableMaps/map_<nombre>.png`), para teñirlo con `mask` como el lápiz. */
export const stamp = (name: string): string => `/zomboid/map/stamps/map_${name}.png`;
const stampStyle = (name: string, extra: CSSProperties = {}): CSSProperties =>
  ({ "--stamp": `url(${stamp(name)})`, ...extra }) as CSSProperties;

/**
 * Las cifras de "Lo que hay" que tienen pestaña: se vuelven enlace el día que la pestaña se publica. Profesiones va a su
 * propia lista (`/profesiones`), no a la de rasgos: es la página que habla de eso. Los libros de habilidad van a
 * Habilidades, donde está cada uno con su tramo; las revistas todavía no tienen una página que las junte.
 */
const COUNT_TAB: Partial<Record<string, PzTab>> = {
  items: "items",
  recipes: "recipes",
  traits: "traits",
  professions: "professions",
  moodles: "moodles",
  skillBooks: "skills",
};

/**
 * Las herramientas que ya tienen pestaña: el renglón deja de decir "Pronto" y enlaza. Van por el sello del renglón
 * porque las herramientas de la copia no tienen id (y cada una lleva un sello distinto); si algún día lo tienen, esto
 * pasa a ir por id. `detail` es una ficha de la pestaña (Agua y luz es la calculadora de cortes, una página de
 * Servidor, no el generador). `more` es otra ficha que el renglón enlaza debajo de su texto, con el `more` de la copia
 * (los presets comparados, 2026-10-02: toda subpágina va enlazada desde la portada).
 */
const TOOL_TAB: Partial<Record<string, { tab: PzTab; detail?: string; more?: string }>> = {
  house: { tab: "map" },
  facehappy: { tab: "planner" },
  gears: { tab: "crafting" },
  satellite: { tab: "server", more: "sandbox-presets" },
  lightning: { tab: "server", detail: "water-and-power-shutoff" },
};

export default function ZomboidHome({ route, navigate }: { route: Route; navigate: Nav }) {
  const c = useZomboidCopy();
  const t = c.home;
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  // Recetas son todas las que lista su pestaña: las de fabricar (`recipes`, 969) y las de construir (`buildRecipes`,
  // 201). Con sólo las primeras, la portada decía 969 y la pestaña a la que lleva, 1.170.
  const n = { ...meta.counts, recipes: meta.counts.recipes + meta.counts.buildRecipes };
  return (
    <main className="pz-main">
      <section className="pz-hero">
        <div className="pz-title">
          <p className="pz-kick">{t.kicker(meta.version)}</p>
          <h1 className="pz-h1">Project Zomboid</h1>
          <p className="pz-lede">{t.lede(num(n.items), num(n.recipes))}</p>
          <p className="pz-hand">{t.hand}</p>
        </div>
        {/* El mapa de papel del juego, pegado con cinta y anotado como lo haría un jugador. Es decorado: las
            anotaciones son ejemplos, no lugares del mapa. */}
        <figure className="pz-mapwrap" aria-hidden="true">
          <div className="pz-paper" />
          <span className="pz-tape" style={{ left: -24, top: 18, transform: "rotate(-28deg)" }} />
          <span className="pz-tape" style={{ right: -20, bottom: 30, transform: "rotate(-24deg)" }} />
          <span className="pz-stamp" style={stampStyle("house", { left: "30%", top: "30%" })} />
          <span className="pz-note" style={{ left: "38%", top: "26%" }}>{t.notes.safe}</span>
          <span className="pz-stamp" style={stampStyle("skull", { left: "62%", top: "58%" })} />
          <span className="pz-note" style={{ left: "70%", top: "62%" }}>{t.notes.nope}</span>
          <span className="pz-ring" style={{ left: "6%", top: "70%", width: 92, height: 60 }} />
          <span className="pz-stamp" style={stampStyle("gun", { left: "16%", top: "74%", width: 28, height: 28 })} />
          <span className="pz-note" style={{ left: "4%", top: "84%" }}>{t.notes.guns}</span>
        </figure>
      </section>

      <section className="pz-grid">
        <div className="pz-page">
          <span className="pz-clip" />
          <h2 className="pz-h2">{t.haveTitle}</h2>
          <ul className="pz-counts">
            {t.counts.map((row) => {
              const tab = COUNT_TAB[row.key];
              const line = (
                <>
                  <span className="pz-stamp" style={stampStyle(row.stamp)} />
                  {row.label}
                  <b>{num(n[row.key])}</b>
                </>
              );
              return (
                <li key={row.key}>
                  {tab && PZ_PUBLISHED.includes(tab) ? (
                    <RouteLink className="pz-count-link" to={{ ...route, view: "zomboid", pzSection: tab, detail: undefined }} onNavigate={navigate}>
                      {line}
                    </RouteLink>
                  ) : (
                    line
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="pz-page">
          <h2 className="pz-h2">{t.aboutTitle}</h2>
          {t.about(meta.version, num(n.items), num(n.recipes), num(n.traits), num(n.professions)).map((p) => (
            <p key={p}>{p}</p>
          ))}
          {/* La versión de los datos, con el enlace a Parches: qué cambió de una versión a la otra (2026-10-02). */}
          {PZ_PUBLISHED.includes("patches") && (
            <p>
              {t.patchesLink(meta.version)[0]}
              <RouteLink className="pz-tool-link" to={{ ...route, view: "zomboid", pzSection: "patches", detail: undefined }} onNavigate={navigate}>
                {t.patchesLink(meta.version)[1]}
              </RouteLink>
            </p>
          )}
        </div>
        <div className="pz-page">
          <h2 className="pz-h2">{t.toolsTitle}</h2>
          <ul className="pz-tools">
            {t.tools.map((tool) => {
              const to = TOOL_TAB[tool.stamp];
              const live = to && PZ_PUBLISHED.includes(to.tab);
              return (
                <li key={tool.title}>
                  <span className="pz-stamp" style={stampStyle(tool.stamp)} />
                  <b>
                    {live ? (
                      <RouteLink className="pz-tool-link" to={{ ...route, view: "zomboid", pzSection: to.tab, detail: to.detail }} onNavigate={navigate}>
                        {tool.title}
                      </RouteLink>
                    ) : (
                      <>
                        {tool.title}
                        <em className="pz-soon">{c.soon}</em>
                      </>
                    )}
                  </b>
                  <span className="pz-tool-text">{tool.text}</span>
                  {live && to.more && tool.more && (
                    <RouteLink className="pz-tool-link pz-tool-more" to={{ ...route, view: "zomboid", pzSection: to.tab, detail: to.more }} onNavigate={navigate}>
                      {tool.more}
                    </RouteLink>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </main>
  );
}
