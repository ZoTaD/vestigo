/**
 * La pestaña Electricidad de Rust (2026-10-09): el editor y simulador de circuitos, y cada circuito listo en su página.
 * Plan: docs/superpowers/plans/2026-10-09-rust-electricidad.md. Diseño: docs/superpowers/specs/2026-10-09-rust-etapa-2-design.md.
 *
 * El prerender (y el primer dibujo en el navegador) sale sin el editor: título, explicación, cómo se cablea el circuito,
 * la lista de circuitos listos y el texto sobre cómo funciona la electricidad. El editor (React Flow) se arma después
 * de montar, en el mismo lugar y con el mismo alto, así la página no salta.
 *
 * Qué circuito abre: el del link (`#c=…`), si no el circuito listo de la página, si no el último que se usó en este
 * navegador, si no la torreta solar.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import data from "@rust/electricity.json";
import { useLang } from "../../i18n";
import RouteLink from "../../RouteLink";
import { registerRustSlugs, type Route } from "../../route";
import { CIRCUITS, circuitBySlug, circuitSlugsEs } from "./circuits";
import { decode, HASH_KEY, loadLocal } from "./codec";
import { ELECTRIC_COPY } from "./copy";
import { Catalog } from "./engine";
import type { Circuit, ElectricityData } from "./engine/types";
import { EditorStore } from "./editor/store";
import { iconOf } from "./editor/ctx";
import { TRY_KEY, tryCircuit } from "./trial";
import "../../styles/rust-electric.css";

registerRustSlugs({ electricity: circuitSlugsEs() });

const Editor = lazy(() => import("./editor/Editor"));
const cat = new Catalog(data as unknown as ElectricityData);

type Nav = (r: Route) => void;

/** Celular: sólo mirar y probar (decisión de ZoTaD). */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

async function initialCircuit(ready: Circuit | undefined, startHash: string): Promise<Circuit> {
  const hash = startHash.slice(1);
  if (hash.startsWith(HASH_KEY)) {
    const c = await decode(hash.slice(HASH_KEY.length));
    if (c) return c;
  }
  // "Probarlo en el simulador" desde una ficha de Objetos (`#try=autoturret`): el componente ya cableado. Va en el
  // `#hash` y no en `?try=` porque la app normaliza la dirección (y el query) al entrar. Se borra al usarlo.
  if (hash.startsWith(TRY_KEY)) {
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    const c = tryCircuit(cat, decodeURIComponent(hash.slice(TRY_KEY.length)));
    if (c) return c;
  }
  if (ready) return ready;
  const local = loadLocal();
  if (local) {
    const c = await decode(local);
    if (c) return c;
  }
  return CIRCUITS[0].circuit;
}

export default function RustElectricity({ route, navigate }: { route: Route; navigate: Nav }) {
  const { lang } = useLang();
  const t = ELECTRIC_COPY[lang];
  const ready = circuitBySlug(route.detail);
  const narrow = useNarrow();
  const [store, setStore] = useState<EditorStore | null>(null);
  // El `#hash` con el que se llegó, leído una sola vez: el efecto de abajo corre dos veces en desarrollo y el de
  // `#try=` se borra al usarse.
  const [startHash] = useState(() => (typeof window === "undefined" ? "" : window.location.hash));
  // El link vale para la página con la que se entró; al pasar a otro circuito listo manda ese circuito.
  const [firstReady] = useState(ready);

  // Al entrar (y al pasar de un circuito listo a otro), se arma el estado con el circuito que toca.
  useEffect(() => {
    let alive = true;
    // Los objetos de la red industrial (pila, fundir, recetas) van aparte: sólo los baja quien abre el editor.
    const items = import("@rust/industrial-items.json").then((m) => {
      cat.items = m.default as unknown as Catalog["items"];
    });
    void Promise.all([initialCircuit(ready?.circuit, ready === firstReady ? startHash : ""), items]).then(([c]) => {
      if (!alive) return;
      setStore((s) => {
        if (s) {
          s.load(c);
          return s;
        }
        return new EditorStore(cat, c);
      });
    });
    return () => {
      alive = false;
    };
  }, [ready, startHash, firstReady]);

  const title = ready ? t.circuitH1(ready.name[lang]) : t.h1;
  const steps = useMemo(() => (ready ? wiringSteps(ready.circuit, lang) : []), [ready, lang]);

  return (
    <main className="rs-main el-main">
      <header className="rs-title">
        <h1 className="rs-h1">{title}</h1>
        <p className="rs-lede">{ready ? ready.about[lang] : t.lede}</p>
      </header>
      <div className="el-stage">
        {store ? (
          <Suspense fallback={<div className="el-editor el-placeholder" />}>
            <Editor store={store} lang={lang} t={t} readOnly={narrow} route={route} navigate={navigate} />
          </Suspense>
        ) : (
          <div className="el-editor el-placeholder" />
        )}
      </div>

      {ready ? (
        <section className="rs-pnl el-steps">
          <h2 className="rs-hd">{t.howTo}</h2>
          <ol>
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <RouteLink className="rs-btn" to={{ ...route, view: "rust", rsSection: "electricity", detail: undefined }} onNavigate={navigate}>
            {t.openEditor}
          </RouteLink>
        </section>
      ) : null}

      <section className="rs-pnl el-ready">
        <h2 className="rs-hd">{t.ready}</h2>
        <p className="el-note">{t.readyLede}</p>
        <ul>
          {CIRCUITS.map((c) => (
            <li key={c.slug}>
              <RouteLink
                className={`el-ready-link${c.slug === route.detail ? " is-on" : ""}`}
                to={{ ...route, view: "rust", rsSection: "electricity", detail: c.slug }}
                onNavigate={navigate}
                active={c.slug === route.detail}
              >
                <span className="el-ready-icons" aria-hidden="true">
                  {[...new Set(c.circuit.parts.map((p) => p.type))].slice(0, 3).map((type) => (
                    <img key={type} src={iconOf(type)} alt="" width={28} height={28} loading="lazy" decoding="async" />
                  ))}
                </span>
                <span>{cap(c.name[lang])}</span>
              </RouteLink>
            </li>
          ))}
        </ul>
      </section>

      <section className="rs-pnl rs-about">
        <h2>{t.aboutTitle}</h2>
        {t.about.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </section>
    </main>
  );
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "Panel solar grande "Electric Output" → Combinador "Root Power 1"", cable por cable, en el orden del circuito. */
function wiringSteps(c: Circuit, lang: "en" | "es"): string[] {
  const t = ELECTRIC_COPY[lang];
  const name = (id: string) => {
    const p = c.parts.find((x) => x.id === id);
    const def = p && cat.get(p.type);
    return def ? (lang === "es" ? def.name.es ?? def.name.en : def.name.en) : id;
  };
  const slot = (id: string, i: number, out: boolean) => {
    const p = c.parts.find((x) => x.id === id);
    const def = p && cat.get(p.type);
    return (out ? def?.out[i]?.n : def?.in[i]?.n) || "—";
  };
  return c.wires.map((w) => t.steps(name(w.from[0]), slot(w.from[0], w.from[1], true), name(w.to[0]), slot(w.to[0], w.to[1], false)));
}

