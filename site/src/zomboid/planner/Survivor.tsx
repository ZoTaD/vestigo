/**
 * Tu sobreviviente, en el Planificador de Project Zomboid (2026-10-01): con la ropa de su profesión, hombre o mujer.
 * Va en la columna del costado, arriba de la hoja del personaje.
 *
 * **Primero el afiche.** El servidor pinta la imagen (con lo que lleva puesto como `alt`), la lista "Lleva puesto" con
 * enlaces a Objetos y los botones; nunca un "cargando". El 3D (three.js, ~170 KB) se baja sólo si tocás "Ver en 3D":
 * mientras tanto el afiche sigue a la vista, y el canvas lo reemplaza en el mismo marco, del mismo tamaño, cuando el
 * modelo está listo. Si el navegador no puede o la carga falla, queda el afiche con una nota.
 *
 * **El sexo no va en el link (`?b=`):** no cambia nada del personaje en el juego, y los links viejos siguen iguales. Es
 * estado del panel, hombre de entrada.
 *
 * Todo lo del navegador (`import()`, `matchMedia`) va en el manejador del botón y en efectos.
 */
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import outfitSlugs from "virtual:pz-slugs-es/outfit-items";
import RouteLink from "../../RouteLink";
import { useLang } from "../../i18n";
import { registerPzSlugs, type Route } from "../../route";
import { Stamp } from "../ui";
import { usePlannerCopy } from "./copy";
import { describe, outfitFor, type Sex } from "./outfit";
import { start3d, type Mode } from "./start3d";
import type { ViewerHandle } from "./viewer3d";
import { supportsWebGL } from "./webgl";

// Las direcciones en español de la ropa ("Lleva puesto" enlaza a Objetos), como las de los rasgos en el Planificador.
registerPzSlugs(outfitSlugs);

const SEXES: Sex[] = ["m", "f"];

export default function Survivor({
  prof,
  profName,
  navigate,
  route,
}: {
  prof: string;
  profName: string;
  navigate: (r: Route) => void;
  route: Route;
}) {
  const copy = usePlannerCopy();
  const t = copy.survivor;
  const { lang } = useLang();
  const [sex, setSex] = useState<Sex>("m");
  const [mode, setMode] = useState<Mode>("poster");
  /** Cada intento de 3D lleva un canvas nuevo: uno que perdió su contexto WebGL no se puede volver a usar. */
  const [attempt, setAttempt] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const handle = useRef<ViewerHandle | null>(null);
  const alive = useRef(true);
  /** El intento de 3D que vale: uno viejo que termina de armarse se libera solo (ver `start3d.ts`). */
  const seq = useRef(0);
  /** La profesión y el sexo de ahora, para el 3D que termina de armarse después de un cambio. */
  const want = useRef({ prof, sex });
  want.current = { prof, sex };
  /** Los botones de abajo del afiche, y si el foco estaba ahí al pedir el 3D (con teclado). */
  const tools = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);

  const outfit = outfitFor(prof, sex);
  const label = describe(outfit, lang, copy.join);

  const fail = () => {
    handle.current?.dispose();
    handle.current = null;
    if (alive.current) setMode("failed");
  };

  // Al salir de la pestaña (o del Planificador) se libera el 3D. En desarrollo React monta dos veces: se vuelve a prender.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      handle.current?.dispose();
      handle.current = null;
      // Si el panel sigue (en desarrollo, Fast Refresh corre esta limpieza sin desmontar), vuelve el afiche: el canvas
      // ya no tiene contexto.
      setMode((m) => (m === "poster" || m === "nowebgl" ? m : "poster"));
    };
  }, []);

  // Con el 3D abierto, cambiar de profesión o de sexo cambia la ropa sin rearmar la escena.
  useEffect(() => {
    // Si el cambio de ropa falla tarde, sólo cuenta si el visor sigue siendo el de ahora: el de un intento viejo ya se
    // soltó y `fail` tumbaría el nuevo. `fail` no cambia nada que importe acá.
    const h = handle.current;
    h?.setOutfit(outfitFor(prof, sex), sex).catch(() => {
      if (handle.current === h) fail();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prof, sex]);

  const open3d = () => {
    refocus.current = !!tools.current?.contains(document.activeElement);
    // Sin WebGL no se baja three: queda el afiche con la nota.
    if (!supportsWebGL()) {
      setMode("nowebgl");
      return;
    }
    // Lo que haya de un intento anterior se suelta: éste arranca con un canvas nuevo.
    handle.current?.dispose();
    handle.current = null;
    const my = ++seq.current;
    // El canvas tiene que existir antes de armar el visor: se pinta ya, todavía tapado por el afiche.
    flushSync(() => {
      setMode("loading");
      setAttempt((n) => n + 1);
    });
    void start3d({
      load: () => import("./viewer3d"),
      canvas: () => canvas.current,
      want: () => ({ outfit: outfitFor(want.current.prof, want.current.sex), sex: want.current.sex }),
      current: () => alive.current && seq.current === my,
      reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
      setMode,
      adopt: (h) => {
        handle.current = h;
      },
      fail,
    });
  };

  // "Ver en 3D" se apaga mientras carga y después se va: el foco quedaría en la nada. Si estaba ahí, pasa al primer botón
  // que quede (girar, o "Probar de nuevo").
  useEffect(() => {
    if (!refocus.current || (mode !== "3d" && mode !== "failed")) return;
    refocus.current = false;
    tools.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [mode]);

  const in3d = mode === "3d";
  const note = mode === "loading" ? t.loading : mode === "nowebgl" ? t.noWebgl : mode === "failed" ? t.failed : "";

  return (
    <section className="pz-page pzsu" aria-labelledby="pzsu-title">
      <h2 className="pzi-h2" id="pzsu-title">
        <Stamp name="facehappy" />
        {t.title}
        <span className="pzi-hand">{t.dressedAs(profName)}</span>
      </h2>

      <div className="pzsu-sex" role="group" aria-label={t.sex}>
        {SEXES.map((s) => {
          const on = s === sex;
          return (
            <button type="button" className={on ? "is-on" : undefined} aria-pressed={on} onClick={() => setSex(s)} key={s}>
              {on && <Stamp name="checkmark" className="pzsu-check" />}
              {s === "m" ? t.male : t.female}
            </button>
          );
        })}
      </div>

      <div className={`pzsu-frame${in3d ? " is-3d" : ""}`}>
        {(mode === "loading" || in3d) && (
          <canvas ref={canvas} role="img" aria-label={label} aria-hidden={in3d ? undefined : true} key={attempt} />
        )}
        {!in3d && <img src={outfit.poster} width="360" height="480" alt={label} />}
      </div>

      <p className="pzsu-note" role="status">
        {note}
      </p>

      <div className="pzsu-tools" ref={tools}>
        {in3d ? (
          <>
            <button type="button" aria-label={t.turnLeft} title={t.turnLeft} onClick={() => handle.current?.turn(30)}>
              ↺
            </button>
            <button type="button" aria-label={t.turnRight} title={t.turnRight} onClick={() => handle.current?.turn(-30)}>
              ↻
            </button>
            <button type="button" onClick={() => handle.current?.reset()}>
              {t.front}
            </button>
          </>
        ) : (
          <button type="button" className="pzsu-go" onClick={open3d} disabled={mode === "loading" || mode === "nowebgl"}>
            {mode === "failed" ? t.retry : t.view3d}
          </button>
        )}
      </div>

      <h3 className="pzb-h3">{t.wearing}</h3>
      <ul className="pzsu-wear">
        {outfit.wear.map((w) => (
          <li key={w.ref}>
            {w.slug ? (
              <RouteLink to={{ ...route, view: "zomboid", pzSection: "items", detail: w.slug }} onNavigate={navigate}>
                {w[lang]}
              </RouteLink>
            ) : (
              w[lang]
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
