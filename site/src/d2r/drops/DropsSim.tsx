/**
 * El simulador (2026-09-29): un jefe o superúnico, cuántas runs y "Abrir el
 * cofre". El botín sale como en el piso del juego, con sus etiquetas y sus
 * colores: lo notable arriba y el resto contado. La semilla va en el enlace,
 * así el mismo enlace abre el mismo cofre.
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import { useD2rCopy } from "../../d2rCopy";
import { Chips } from "../ui";
import { tr } from "../wiki";
import { dropData } from "./data";
import { PlaceSelect } from "./DropLists";
import NumField from "./NumField";
import { sourceKill } from "./places";
import { isRune, simulateRuns, summarize, type Loot } from "./simulate";
import { MAX_RUNS, MAX_SEED, toOpts, toSettings, type DropsState } from "./state";
import type { Diff } from "./types";

export default function DropsSim({ st, set }: { st: DropsState; set: (p: Partial<DropsState>) => void }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const locale = useLocale();
  const D = dropData();
  // Los controles responden al toque y el cofre va una vuelta atrás, como en DropsFarm y DropsWhat: sortear 1.000 runs y dibujar
  // ~350 etiquetas tarda 35 a 80 ms en escritorio y varias veces eso en un celular, y calculado en el mismo render cada tecla
  // del hallazgo mágico o de los jugadores esperaba a que terminara. Lo que se elige va de `st`; lo que se sortea, de `shown`.
  const shown = useDeferredValue(st);
  const src = shown.place?.k === "s" ? D.sourceById.get(shown.place.id) : undefined;
  // Cómo muere el jefe sólo cambia con el lugar, la dificultad y la Zona de Terror o la misión (el nivel del Heraldo no
  // lo usa ningún jefe); el resto de las opciones cambia lo que suelta, no cómo muere.
  const kill = useMemo(
    () => (src ? sourceKill(D, src, shown.pdiff, toOpts(shown)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [src, shown.pdiff, shown.tz, shown.quest],
  );
  // Sin semilla el cofre está cerrado y no se sortea nada. Con ella, cada cambio del hallazgo mágico o de los jugadores
  // vuelve a sortear con la misma semilla: se ve cómo habría salido ese mismo cofre con esas opciones.
  const sum = useMemo(
    () => (kill && shown.seed ? summarize(D, simulateRuns(D, kill, toSettings(shown), shown.runs, shown.seed)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kill, shown.seed, shown.runs, shown.mf, shown.players, shown.party, shown.ladder],
  );
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  // "Enlace copiado" es de este cofre y de esta visita: al abrir otro cofre (o cerrarlo) y al irse de la página se apaga con su
  // reloj, así no queda un aviso viejo sobre un cofre nuevo ni un reloj que despierte a un componente que ya no está.
  useEffect(() => {
    setCopied(false);
    return () => window.clearTimeout(timer.current);
  }, [st.seed]);
  const share = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Sin portapapeles o sin permiso (un panel embebido, una página sin https): el enlace se ofrece para copiarlo a mano.
      window.prompt(td.share, url);
    }
  };
  // Un único o una pieza sale con la base de la que es (para el sorteo) y su id: el nombre es el del id, no el de la base.
  const name = (l: Loot) =>
    tr(l.id ? (l.q === "set" ? D.setById.get(l.id)?.n : D.uniqueById.get(l.id)?.n) : D.bases[l.code]?.n, lang);
  const num = (n: number) => n.toLocaleString(locale);

  return (
    <div className="d2-dr-sim">
      <div className="d2-dr-place">
        {/* Cambiar el lugar, la dificultad o las runs cierra el cofre (seed 0): es otro cofre y se abre a propósito. Tocar lo que ya
            está elegido no cambia nada y no lo cierra: `Chips` avisa también de la opción activa, y escribir de más sobre el tope
            de runs deja el mismo número. */}
        <PlaceSelect value={st.place?.k === "s" ? st.place : null} onChange={(place) => set({ place, seed: 0 })} sourcesOnly />
        <Chips<number>
          label={td.diff}
          value={st.pdiff}
          onChange={(d) => {
            if (d !== st.pdiff) set({ pdiff: d as Diff, seed: 0 });
          }}
          options={td.diffs.map((label, i) => ({ value: i, label }))}
        />
        {/* El campo pasa cada número que se puede leer, ya acotado (ver NumField): uno distinto es otro cofre. */}
        <NumField
          label={td.runs}
          value={st.runs}
          min={1}
          max={MAX_RUNS}
          onChange={(runs) => {
            if (runs !== st.runs) set({ runs, seed: 0 });
          }}
        />
      </div>
      {!src || !kill ? (
        // Sin jefe elegido se pide uno; con uno que en esa dificultad no suelta nada (el Clon de Diablo fuera de Infierno) se avisa.
        <p className="d2-empty">{src ? td.noDrops : td.simEmpty}</p>
      ) : (
        <>
          <div className="d2-dr-sim-actions">
            {/* La semilla va de 1 a MAX_SEED: el 0 es "cerrado" y la dirección no guarda una más alta. */}
            <button type="button" className="d2-dr-open-btn" onClick={() => set({ seed: 1 + Math.floor(Math.random() * MAX_SEED) })}>
              {st.seed ? td.again : td.open}
            </button>
            {sum && (
              <button type="button" className="d2-chip" onClick={share}>
                {copied ? td.copied : td.share}
              </button>
            )}
          </div>
          {sum && (
            <>
              <p className="d2-dr-note">{td.simLede(num(shown.runs), tr(src.n, lang))}</p>
              <div className="d2-dr-ground">
                {sum.notable.length === 0 ? (
                  <span className="d2-dr-note">{td.simNothing}</span>
                ) : (
                  sum.notable.map(({ loot, count }) => (
                    <span key={`${loot.q}|${loot.id ?? loot.code}`} className={`d2-dr-loot is-${isRune(loot.code) ? "rune" : loot.q}`}>
                      {name(loot)}
                      {count > 1 && <small>×{count}</small>}
                    </span>
                  ))
                )}
              </div>
            </>
          )}
          {/* La región viva está siempre, vacía hasta que hay cofre: un lector de pantalla no avisa de una región que nace con su
              contenido. Anuncia el resumen de cada cofre nuevo (y de cada nueva tirada con otro hallazgo mágico) y el "Enlace copiado",
              sin leer las cientos de etiquetas del piso. */}
          <div aria-live="polite">
            {copied && <span className="visually-hidden">{td.copied}</span>}
            {sum && (
              <p className="d2-dr-sum">
                <span className="is-rare">{td.rares(num(sum.rare))}</span>
                <span className="is-magic">{td.magics(num(sum.magic))}</span>
                <span>{td.normals(num(sum.normal))}</span>
                <span>{td.gold(num(sum.gold))}</span>
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
