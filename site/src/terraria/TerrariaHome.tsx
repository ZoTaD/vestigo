/**
 * La portada de Terraria (2026-10-12): el corte del mundo entero. Cielo con el buscador; superficie con las
 * herramientas; subsuelo con los objetos más buscados y los atajos por tipo; cavernas con las cifras; inframundo con
 * el texto de qué es esto. Todo sale de `home.json` y `meta.json`, que viajan con el área.
 */
import type { MouseEvent } from "react";
import home from "@terraria/home.json";
import meta from "@terraria/meta.json";
import { useLang, useLocale } from "../i18n";
import RouteLink from "../RouteLink";
import { routePath, type Route } from "../route";
import { KINDS, useTerrariaCopy } from "../terrariaCopy";
import type { Featured } from "./data";
import { ItemSearch, itemRoute, rare, Slot, Sprite, type Nav } from "./ui";

/** El objeto que representa a cada herramienta de la superficie, de los destacados. */
const TOOL_ICON = ["hellstone-bar", "terra-blade", "life-crystal", "mana-crystal"];

export default function TerrariaHome({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useTerrariaCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const featured = home.featured as Featured[];
  const bySlug = new Map(featured.map((f) => [f[1], f]));
  const c = meta.counts;
  return (
    <main className="tr-main tr-home">
      <section className="tr-sky">
        <div className="tr-wrap">
          <img className="tr-logo" src="/terraria/art/logo.png" alt="Terraria" width={486} height={142} />
          <h1 className="tr-h1 tr-andy">{t.home.h1}</h1>
          <p className="tr-lede">{t.home.lede(num(c.items), num(c.recipes))}</p>
          <ItemSearch label={t.home.searchLabel} placeholder={t.home.searchPlaceholder} to={(r) => itemRoute(route, r.slug)} navigate={navigate} />
        </div>
      </section>
      <div className="tr-grass" aria-hidden="true" />

      <section className="tr-band" data-layer="surface">
        <div className="tr-wrap">
          <h2 className="tr-tag tr-andy">
            {t.home.surface} <small>{t.home.surfaceTag}</small>
          </h2>
          <ul className="tr-tools">
            {t.home.tools.map((tool, i) => {
              const icon = bySlug.get(TOOL_ICON[i]);
              const body = (
                <>
                  <Slot>{icon && <Sprite id={icon[0]} w={icon[6]} h={icon[7]} />}</Slot>
                  <span>
                    <b className="tr-andy">{tool.title}</b>
                    <span>{tool.text}</span>
                    {!tool.tab && <em>{t.soon}</em>}
                  </span>
                </>
              );
              return (
                <li key={tool.title}>
                  {tool.tab ? (
                    <RouteLink className="tr-dug tr-tool" to={{ ...route, view: "terraria", trSection: tool.tab, detail: undefined }} onNavigate={navigate}>
                      {body}
                    </RouteLink>
                  ) : (
                    <span className="tr-dug tr-tool is-soon">{body}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="tr-band" data-layer="underground">
        <div className="tr-wrap">
          <h2 className="tr-tag tr-andy">
            {t.home.underground} <small>{t.home.undergroundTag(num(c.items))}</small>
          </h2>
          <div className="tr-two">
            <div className="tr-dug">
              <h3 className="tr-label">{t.home.featured}</h3>
              <ul className="tr-cells">
                {featured.map((f) => (
                  <li key={f[0]}>
                    <RouteLink className="tr-cell" to={itemRoute(route, f[1])} onNavigate={navigate}>
                      <Slot>
                        <Sprite id={f[0]} w={f[6]} h={f[7]} />
                      </Slot>
                      <span style={rare(f[5])}>{(lang === "es" && f[4]) || f[3]}</span>
                    </RouteLink>
                  </li>
                ))}
              </ul>
            </div>
            <div className="tr-dug">
              <h3 className="tr-label">{t.home.byKind}</h3>
              <ul className="tr-kinds">
                {KINDS.map((k) => (
                  <li key={k}>
                    {/* El tipo viaja en el `#hash`: es un filtro de la lista, no otra página. */}
                    <a className="tr-chip" href={`${routeHref(route)}#${k}`} onClick={(e) => plainClick(e) && (e.preventDefault(), navigate({ ...route, view: "terraria", trSection: "items", detail: undefined }), setHash(k))}>
                      {t.kinds[k]}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="tr-band" data-layer="caverns">
        <div className="tr-wrap">
          <h2 className="tr-tag tr-andy">
            {t.home.caverns} <small>{t.home.cavernsTag}</small>
          </h2>
          <dl className="tr-dug tr-figures">
            {(["items", "recipes", "craftable", "drops"] as const).map((k) => (
              <div key={k}>
                <dd className="tr-andy">{num(c[k])}</dd>
                <dt>{t.home.figures[k]}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="tr-band" data-layer="underworld">
        <div className="tr-wrap">
          <h2 className="tr-tag tr-andy">
            {t.home.underworld} <small>{t.home.underworldTag}</small>
          </h2>
          <div className="tr-dug tr-about">
            {t.home.about(num(c.items), num(c.recipes), meta.version).map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}


/** La dirección de la lista de objetos, a la que se le cuelga el tipo. */
const routeHref = (route: Route): string => routePath({ ...route, view: "terraria", trSection: "items", detail: undefined });
/** Un clic normal (sin rueda ni teclas): los demás los maneja el navegador. */
const plainClick = (e: MouseEvent): boolean => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
/** Anota el tipo elegido en la dirección sin sumar una entrada al historial; la lista lo lee al montarse. */
const setHash = (kind: string): void => window.history.replaceState(window.history.state, "", `${window.location.pathname}#${kind}`);
