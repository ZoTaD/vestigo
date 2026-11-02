import { useEffect, useRef, useState } from "react";
import { useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";

/**
 * Dónde mata y dónde muere un héroe, sobre el relieve del mapa.
 *
 * El archivo del héroe (~6 KB, `killMap.ts` en el pipeline) trae dos grillas de
 * 64×64 bytes con los dos equipos plegados: la base propia queda siempre abajo.
 * Se pinta en un `<canvas>` de 64 px que el navegador agranda con suavizado, y
 * eso ya da el aspecto de mancha de calor sin calcular ningún desenfoque.
 *
 * El relieve es el mismo de la pestaña Mapa: misma imagen, mismo encuadre
 * (`map.json`, con el mundo de −10.752 a 10.752 en los dos ejes).
 */

interface KillMapFile {
  from: string;
  to: string;
  size: number;
  kills: string;
  deaths: string;
  totals: { kills: number; deaths: number };
}

/** Un archivo por héroe, con la ruta relativa: `import.meta.glob` no entiende alias. */
const FILES = import.meta.glob<{ default: KillMapFile }>("../../games/deadlock/data/kill-map/*.json");

const RELIEF = "/deadlock/game/map/relief.webp";

/**
 * La escala de cada capa, de la celda tibia a la más caliente: las kills van
 * del naranja al oro claro y las muertes del rojo oscuro al amarillo.
 */
const COLORS = {
  kills: [
    [196, 98, 30],
    [255, 226, 140],
  ],
  deaths: [
    [120, 20, 24],
    [255, 196, 90],
  ],
} as const;

/** Debajo de esto la celda no se pinta: si no, todo el mapa queda velado. */
const FLOOR = 40;

type Layer = keyof typeof COLORS;

function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export default function DeadlockKillMap({ heroId }: { heroId: number }) {
  const copy = useCopy();
  const locale = useLocale();
  const t = copy.deadlock.hero.matchups.killMap;
  const [file, setFile] = useState<KillMapFile | null>(null);
  const [layer, setLayer] = useState<Layer>("deaths");
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setFile(null);
    const load = FILES[`../../games/deadlock/data/kill-map/${heroId}.json`];
    if (!load) return;
    let vivo = true;
    load().then(
      (m) => vivo && setFile(m.default),
      () => undefined
    );
    return () => {
      vivo = false;
    };
  }, [heroId]);

  useEffect(() => {
    const c = canvas.current;
    if (!file || !c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const n = file.size;
    const data = decode(file[layer]);
    const img = ctx.createImageData(n, n);
    const [lo, hi] = COLORS[layer];
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      if (v < FLOOR) continue;
      const t = (v - FLOOR) / (255 - FLOOR);
      img.data[i * 4] = Math.round(lo[0] + (hi[0] - lo[0]) * t);
      img.data[i * 4 + 1] = Math.round(lo[1] + (hi[1] - lo[1]) * t);
      img.data[i * 4 + 2] = Math.round(lo[2] + (hi[2] - lo[2]) * t);
      img.data[i * 4 + 3] = Math.round(30 + t * t * 225);
    }
    ctx.putImageData(img, 0, 0);
  }, [file, layer]);

  if (!file) return null;
  const n = (v: number) => v.toLocaleString(locale);

  return (
    <div className="dl-killmap">
      <div className="dl-killmap-head">
        <h3 className="dl-hp-lane-title">{t.title}</h3>
        <div className="seg" role="group" aria-label={t.title}>
          {(["kills", "deaths"] as Layer[]).map((l) => (
            <button key={l} type="button" aria-pressed={layer === l} onClick={() => setLayer(l)}>
              {t[l]}
            </button>
          ))}
        </div>
      </div>
      <p className="detail-note">{t.lead(n(file.totals.kills), n(file.totals.deaths))}</p>
      <figure className="dl-killmap-frame" data-layer={layer}>
        <img src={RELIEF} alt="" width={2048} height={2048} loading="lazy" decoding="async" />
        <canvas ref={canvas} width={file.size} height={file.size} role="img" aria-label={t.alt(t[layer])} />
        <figcaption>
          <span className="dl-killmap-theirs">{t.theirs}</span>
          <span className="dl-killmap-yours">{t.yours}</span>
        </figcaption>
      </figure>
    </div>
  );
}
