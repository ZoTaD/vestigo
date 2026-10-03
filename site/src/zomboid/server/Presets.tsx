/**
 * Los presets de sandbox comparados (2026-10-02), `/servidor/presets-de-sandbox`: los cinco presets del juego, como los
 * carga el juego (Apocalipsis ⊕ el archivo del preset), lado a lado, opción por opción.
 *
 * - Arriba, cada preset con su descripción del juego, cuántas opciones cambia respecto de Apocalipsis (la base: la del
 *   juego y la de un servidor nuevo) y "Usarlo en el generador", que abre `/servidor?p=<id>`.
 * - Debajo, una tabla por hoja del juego: opción × 5 presets, con la etiqueta del enum, sí/no o el número. Lo que difiere
 *   de Apocalipsis va con tinte de fondo, nunca con un borde. "Sólo las que cambian" viene prendido (las 153 de
 *   `presetRows`); apagado, las 269.
 * - En el celular la tabla se vuelve una tarjeta por opción, con un renglón por preset: sin tabla ancha ni scroll
 *   horizontal.
 *
 * Los datos viajan en el chunk de la pestaña (`data.ts`): el prerender escribe la página entera, sin "cargando…".
 */
import { Fragment, useEffect, useState } from "react";
import meta from "@zomboid/meta.json";
import RouteLink from "../../RouteLink";
import { useLang, useLocale } from "../../i18n";
import { routePath, type Route } from "../../route";
import QueryLink from "../QueryLink";
import { Stamp, wordFit } from "../ui";
import { fromPreset, presetRows } from "./config";
import { usePzServerCopy } from "./copy";
import { fullPreset, PAGE_STAMP, SERVER, type PresetId, type SandboxOption } from "./data";
import { encodeConfig } from "./link";
import { KeyBreaks, keyFit, SoftBreaks, useShowValue } from "./OptionRow";
// Las hojas y los títulos son los de Objetos; el tinte y la clave, los del generador.
import "../../styles/zomboid-items.css";
import "../../styles/zomboid-server.css";

type Nav = (r: Route) => void;

/** La pestaña Servidor (el generador), en el idioma de `route`. */
const serverRoute = (route: Route): Route => ({ ...route, view: "zomboid", pzSection: "server", detail: undefined });
/** Esta página, en el idioma de `route`. */
export const presetsRoute = (route: Route): Route => ({ ...route, view: "zomboid", pzSection: "server", detail: "sandbox-presets" });
/** El id del preset en esta página, para llegar a él con `#` desde el generador. */
export const presetAnchor = (id: PresetId): string => `preset-${id}`;

export default function Presets({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = usePzServerCopy();
  const c = t.presets;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const show = useShowValue();
  const [onlyChanging, setOnlyChanging] = useState(true);

  // Desde una tarjeta del generador se llega con `#preset-<id>`. `Zomboid.tsx` sube al principio al cambiar de página, y
  // su efecto corre después de éste: el salto va en el cuadro siguiente.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id.startsWith("preset-")) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const rows = presetRows();
  const changing = new Set(rows.map((r) => r.key));
  const full = SERVER.presets.map((p) => fullPreset(p.id));
  const base = SERVER.presets[0];
  const total = SERVER.options.length;
  const diffCount = full.map((f) => SERVER.options.reduce((n, o) => n + (f[o.key] !== full[0][o.key] ? 1 : 0), 0));

  // Cada hoja con sus filas. El subtítulo del juego ("Características de zombies") va arriba de la primera fila que se
  // muestra de su parte, aunque la opción que lo trae no cambie y quede afuera con el filtro.
  const sheets = SERVER.pages.map((page) => {
    const out: { opt: SandboxOption; title?: string }[] = [];
    let title: string | undefined;
    for (const o of SERVER.options) {
      if (o.page !== page.id) continue;
      if (o.title) title = o.title[lang];
      if (onlyChanging && !changing.has(o.key)) continue;
      out.push({ opt: o, title });
      title = undefined;
    }
    return { page, rows: out };
  });
  const shown = sheets.reduce((n, s) => n + s.rows.length, 0);

  const server = serverRoute(route);

  return (
    <main className="pz-main pzi pzsv pzsp">
      <nav className="pzi-crumb" aria-label={c.crumbServer}>
        <RouteLink to={server} onNavigate={navigate}>
          {c.crumbServer}
        </RouteLink>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">{c.crumbHere}</span>
      </nav>

      <section className="pz-page pzi-intro">
        <span className="pz-clip" />
        <h1 className="pzi-h1" style={wordFit(c.title)}>
          {c.title}
        </h1>
        {c.intro(num(rows.length), num(total), num(total - rows.length), meta.version).map((p) => (
          <p key={p}>{p}</p>
        ))}
        <p className="pzi-hand">{c.hand}</p>
      </section>

      <section className="pz-page pzsv-presets" aria-labelledby="pzsp-presets-title">
        <h2 className="pzi-h2" id="pzsp-presets-title">
          <Stamp name="star" />
          {c.presetsTitle}
        </h2>
        <div className="pzsv-cards">
          {SERVER.presets.map((p, i) => (
            <article className={`pzsp-card${i === 0 ? " is-base" : ""}`} id={presetAnchor(p.id)} key={p.id}>
              <b>{p.name[lang]}</b>
              {p.desc[lang]
                .split("\n")
                .filter((line) => line.trim())
                .map((line) => (
                  <span key={line}>{line}</span>
                ))}
              <em className="pzsp-diffs">{c.diffs(num(diffCount[i]), base.name[lang])}</em>
              <QueryLink
                className="pzsp-use"
                to={server}
                href={`${routePath(server)}?${encodeConfig(fromPreset(p.id))}`}
                navigate={navigate}
              >
                {c.use}
              </QueryLink>
            </article>
          ))}
        </div>
      </section>

      <div className="pzsp-bar">
        <button type="button" className="pzi-chip pzsv-only" aria-pressed={onlyChanging} onClick={() => setOnlyChanging((v) => !v)}>
          {c.onlyChanging(num(rows.length))}
        </button>
        <span className="pzsp-legend">
          <i aria-hidden="true" />
          {c.legend(base.name[lang])}
        </span>
      </div>
      <p className="pzi-count" aria-live="polite">
        {t.showing(num(shown), num(total))}
      </p>

      {sheets.map(({ page, rows: list }) =>
        list.length ? (
          <section className="pz-page pzsp-sheet" aria-labelledby={`pzsp-${page.id}`} key={page.id}>
            <h2 className="pzi-h2" id={`pzsp-${page.id}`}>
              <Stamp name={PAGE_STAMP[page.id] ?? "gears"} />
              {page.name[lang]} <small>{num(list.length)}</small>
            </h2>
            <table className="pzsp-table">
              <thead>
                <tr>
                  <th scope="col">{c.colOption}</th>
                  {SERVER.presets.map((p) => (
                    <th scope="col" key={p.id}>
                      {p.name[lang]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(({ opt, title }) => (
                  <Fragment key={opt.key}>
                    {title && (
                      <tr className="pzsp-sub">
                        <th scope="colgroup" colSpan={SERVER.presets.length + 1}>
                          {title}
                        </th>
                      </tr>
                    )}
                    <tr className="pzsp-row" data-key={opt.key}>
                      <th scope="row" className="pzsp-opt">
                        <div className="pzsp-optin">
                          <span className="pzsv-name">{opt.name[lang]}</span>
                          <code className="pzsv-key" style={keyFit(opt.key)}>
                            <KeyBreaks k={opt.key} />
                          </code>
                        </div>
                      </th>
                      {full.map((f, i) => (
                        <td className={`pzsp-cell${i > 0 && f[opt.key] !== full[0][opt.key] ? " is-diff" : ""}`} key={SERVER.presets[i].id}>
                          {/* En el celular no hay encabezado: cada renglón dice de qué preset es. */}
                          <span className="pzsp-col">{SERVER.presets[i].name[lang]}</span>
                          {/* Las listas (`WorldItemRemovalList`, 100 letras sin espacios) bajan por sus comas. */}
                          <span className="pzsp-val">
                            <SoftBreaks text={show(opt, f[opt.key])} />
                          </span>
                        </td>
                      ))}
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </section>
        ) : null,
      )}
    </main>
  );
}
