/**
 * La pestaña Miras de CS2 (2026-11-04): el editor de mira y el conversor de sensibilidad de la maqueta "Miras y
 * sensibilidad". La tabla de configuración de los pros quedó afuera: la única fuente con licencia (la lista de Liquipedia)
 * tenía datos viejos en la mitad de los pros conocidos al cotejarla.
 *
 * El código de mira es el de CS2 (`CS…`, formato `cs2-v1`) con csgo-sharecode (MIT): lo arma, lo lee y da los comandos
 * de consola. Un código viejo (`CSGO-…`), que CS2 ya no importa, se pasa al formato nuevo.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { crosshairToConVars, decodeCrosshairShareCode, encodeCrosshair, type CrosshairV1 } from "csgo-sharecode";
import { useLang } from "../../i18n";
import type { Route } from "../../route";
import { cm360, convert, edpiCs2, GAMES } from "./sens";

interface Xh {
  length: number;
  gap: number;
  thickness: number;
  outline: number;
  alpha: number;
  color: [number, number, number];
  dot: boolean;
  tStyle: boolean;
  /** La altura de pantalla a la que están las medidas (las conserva el código, así un código se lee y se vuelve a armar igual). */
  sh: number;
}
const START: Xh = { length: 4, gap: -3, thickness: 1, outline: 1, alpha: 255, color: [0, 255, 0], dot: false, tStyle: false, sh: 1080 };
const COLORS: { name: [string, string]; c: [number, number, number] }[] = [
  { name: ["Green", "Verde"], c: [0, 255, 0] },
  { name: ["Yellow", "Amarillo"], c: [255, 255, 0] },
  { name: ["Cyan", "Celeste"], c: [0, 255, 255] },
  { name: ["Pink", "Rosa"], c: [255, 0, 255] },
  { name: ["White", "Blanco"], c: [255, 255, 255] },
  { name: ["Red", "Rojo"], c: [255, 40, 40] },
];
const BGS = [
  { id: "dust2", src: "/cs2/bg/dust2-1600.webp", name: ["Dust II", "Dust II"] },
  { id: "mirage", src: "/cs2/maps/mirage.webp", name: ["Mirage", "Mirage"] },
  { id: "dark", src: null, name: ["Dark", "Oscuro"] },
  { id: "light", src: null, name: ["Light", "Claro"] },
] as const;

export const toV1 = (x: Xh): CrosshairV1 => ({
  format: "cs2-v1",
  style: 4,
  followRecoil: false,
  centerDotEnabled: x.dot,
  tStyleEnabled: x.tStyle,
  outlineMode: x.outline,
  red: x.color[0],
  green: x.color[1],
  blue: x.color[2],
  alpha: x.alpha,
  outlineRed: 0,
  outlineGreen: 0,
  outlineBlue: 0,
  outlineAlpha: 255,
  gap: x.gap,
  length: x.length,
  thickness: x.thickness,
  dynamicSpreadLimit: 181,
  splitDistance: 3,
  innerSplitAlpha: 1,
  outerSplitAlpha: 0.5,
  splitSizeRatio: 1,
  screenHeight: x.sh,
  scopeDotScale: 1,
  scopeDotUseCrosshairColor: false,
});

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
/**
 * Un código a mira, con las medidas pasadas a píxeles de una pantalla de 1080. `old`: venía en el contenedor `CSGO-`,
 * que CS2 dejó de importar con el cliente 1.41.8.8 (30/9/2026), así que hay que copiar el código nuevo.
 */
export function fromCode(code: string): { xh: Xh; old: boolean; approx: boolean } | null {
  let d;
  try {
    d = decodeCrosshairShareCode(code.trim());
  } catch {
    return null;
  }
  // Los `CSGO-` de la era CS:GO (`legacy-v1`) miden en unidades de una pantalla de 480 de alto; los de CS2 (los
  // `CSGO-` de septiembre de 2026 y los `CS…`), en píxeles a su `screenHeight`.
  const old = d.format !== "cs2-v1";
  // Sólo los de CS:GO se escalan (y quedan aproximados: no hay una conversión oficial); los de CS2 pasan tal cual.
  const approx = d.format === "legacy-v1";
  const sh = !approx && "screenHeight" in d && d.screenHeight ? d.screenHeight : 1080;
  const k = approx ? 1080 / 480 : 1;
  const outline = "outlineMode" in d ? d.outlineMode : (d as { outlineEnabled?: boolean }).outlineEnabled ? 1 : 0;
  return {
    old,
    approx,
    xh: {
      sh,
      length: clamp(d.length * k, 0, 100),
      gap: clamp(d.gap * k, -50, 100),
      thickness: clamp(d.thickness * k, 0, 50),
      outline: clamp(Number(outline), 0, 2),
      alpha: clamp(d.alpha, 0, 255),
      color: [d.red, d.green, d.blue],
      dot: d.centerDotEnabled,
      tStyle: d.tStyleEnabled,
    },
  };
}

const T = {
  en: {
    h1: "Crosshair & sensitivity",
    lede: "Make your crosshair and take it to the game with a code, and convert your sensitivity to other games so your mouse travels the same.",
    editor: "Crosshair editor",
    editorLede: "Paste a crosshair code to see it, or move the controls and copy the new code. In game: Settings → Game → Crosshair → Share or import.",
    length: "Length",
    gap: "Gap",
    thickness: "Thickness",
    outline: "Outline",
    alpha: "Opacity",
    color: "Color",
    shape: "Shape",
    dot: "Center dot",
    tStyle: "T style",
    code: "Crosshair code",
    copyCode: "Copy code",
    copyCmds: "Copy console commands",
    copied: "Copied",
    hint: "It also reads CSGO- codes, which CS2 stopped importing in September 2026, and gives you the new one.",
    loaded: "Crosshair loaded.",
    converted: "CS2 no longer imports CSGO- codes: this is the same crosshair in the new format, copy it.",
    approx: "CS:GO-era code: sizes converted to CS2 pixels approximately. Check it in game before copying.",
    bad: "That isn't a crosshair code. Copy it from the game: Settings → Game → Crosshair → Share.",
    scale: "Approximate preview at 1080p",
    sens: "Sensitivity converter",
    sensLede: "Your sensitivity in other games so a full turn takes the same mouse travel. What counts is how many centimeters you move the mouse to spin 360°.",
    from: "Game",
    value: "Sensitivity",
    dpi: "Mouse DPI",
    cm: "cm per 360°",
    edpi: "CS2 eDPI",
    game: "Game",
    credit: "Crosshair codes: csgo-sharecode (MIT). Background images: Valve.",
    zoom: "Scoped (AWP, SSG 08, AUG, SG 553): CS2 multiplies your sensitivity by zoom_sensitivity_ratio, 1 by default.",
  },
  es: {
    h1: "Miras y sensibilidad",
    lede: "Armá tu mira y llevala al juego con un código, y pasá tu sensibilidad a otros juegos para que el mouse recorra lo mismo.",
    editor: "Editor de mira",
    editorLede: "Pegá un código de mira para verla, o mové los controles y copiá el código nuevo. En el juego: Configuración → Juego → Mira → Compartir o importar.",
    length: "Largo",
    gap: "Separación",
    thickness: "Grosor",
    outline: "Contorno",
    alpha: "Opacidad",
    color: "Color",
    shape: "Forma",
    dot: "Punto central",
    tStyle: "Estilo T",
    code: "Código de mira",
    copyCode: "Copiar código",
    copyCmds: "Copiar comandos de consola",
    copied: "Copiado",
    hint: "También lee los códigos CSGO-, que CS2 dejó de importar en septiembre de 2026, y te da el nuevo.",
    loaded: "Mira cargada.",
    converted: "CS2 ya no importa los códigos CSGO-: esta es la misma mira en el formato nuevo, copiala.",
    approx: "Código de la época de CS:GO: las medidas se pasaron a píxeles de CS2 de forma aproximada. Revisala en el juego antes de copiarla.",
    bad: "Ese código no es de una mira. Copialo desde el juego: Configuración → Juego → Mira → Compartir.",
    scale: "Vista aproximada a 1080p",
    sens: "Conversor de sensibilidad",
    sensLede: "Tu sensibilidad en otros juegos para que una vuelta entera lleve el mismo recorrido del mouse. Lo que cuenta son los centímetros que movés el mouse para girar 360°.",
    from: "Juego",
    value: "Sensibilidad",
    dpi: "DPI del mouse",
    cm: "cm por vuelta",
    edpi: "eDPI de CS2",
    game: "Juego",
    credit: "Códigos de mira: csgo-sharecode (MIT). Imágenes de fondo: Valve.",
    zoom: "Con mira (AWP, SSG 08, AUG, SG 553): CS2 multiplica tu sensibilidad por zoom_sensitivity_ratio, 1 por defecto.",
  },
};

/** Dibuja la mira en el lienzo, a escala 2 para que se lea (las medidas son píxeles a 1080 de alto). */
function draw(cv: HTMLCanvasElement, x: Xh) {
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const S = 2 * (1080 / (x.sh || 1080)), c = cv.width / 2;
  ctx.clearRect(0, 0, cv.width, cv.height);
  const th = Math.max(1, x.thickness) * S, len = x.length * S, gap = (x.gap + 4) * S, ol = x.outline * S * 0.5;
  const bars: [number, number, number, number][] = [];
  if (!x.tStyle) bars.push([c - th / 2, c - th / 2 - gap - len, th, len]);
  bars.push([c - th / 2, c + th / 2 + gap, th, len], [c - th / 2 - gap - len, c - th / 2, len, th], [c + th / 2 + gap, c - th / 2, len, th]);
  if (x.dot) bars.push([c - th / 2, c - th / 2, th, th]);
  ctx.globalAlpha = x.alpha / 255;
  if (ol) {
    ctx.fillStyle = "#000";
    for (const [bx, by, w, h] of bars) if (w > 0 && h > 0) ctx.fillRect(bx - ol, by - ol, w + ol * 2, h + ol * 2);
  }
  ctx.fillStyle = `rgb(${x.color.join(",")})`;
  for (const [bx, by, w, h] of bars) if (w > 0 && h > 0) ctx.fillRect(bx, by, w, h);
  ctx.globalAlpha = 1;
}

export default function Cs2Crosshairs({ route }: { route: Route; navigate: (r: Route) => void }) {
  const { lang } = useLang();
  const t = T[lang === "es" ? "es" : "en"];
  const [xh, setXh] = useState<Xh>(START);
  const [bg, setBg] = useState<(typeof BGS)[number]["id"]>("dust2");
  const [draft, setDraft] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>(t.hint);
  const [copied, setCopied] = useState<string | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const code = useMemo(() => {
    try {
      return encodeCrosshair(toV1(xh));
    } catch {
      return "";
    }
  }, [xh]);
  useEffect(() => {
    if (cv.current) draw(cv.current, xh);
  }, [xh]);
  const set = <K extends keyof Xh>(k: K, v: Xh[K]) => {
    setDraft(null);
    setXh((p) => ({ ...p, [k]: v }));
  };
  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400);
  };
  const load = (v: string) => {
    const r = fromCode(v);
    if (!r) return setMsg(t.bad);
    setXh(r.xh);
    setDraft(null);
    setMsg(r.approx ? t.approx : r.old ? t.converted : t.loaded);
  };

  // Conversor.
  const [game, setGame] = useState(0);
  const [sens, setSens] = useState("1.25");
  const [dpi, setDpi] = useState("800");
  const s = Number(sens.replace(",", ".")), d = Number(dpi);
  const ok = s > 0 && d > 0;
  const num = (v: number, k: number) => v.toLocaleString(lang === "es" ? "es-AR" : "en-US", { minimumFractionDigits: k, maximumFractionDigits: k });
  const from = GAMES[game];
  const sliders: { k: "length" | "gap" | "thickness" | "outline" | "alpha"; min: number; max: number }[] = [
    { k: "length", min: 0, max: 20 },
    { k: "gap", min: -10, max: 10 },
    { k: "thickness", min: 0, max: 6 },
    { k: "outline", min: 0, max: 2 },
    { k: "alpha", min: 0, max: 255 },
  ];
  const back = BGS.find((b) => b.id === bg)!;

  return (
    <main className="c2-main c2-xh" data-lang={route.lang}>
      <header className="c2-head">
        <h1 className="c2-h1">{t.h1}</h1>
        <p className="c2-lede">{t.lede}</p>
      </header>

      <section aria-labelledby="xh-ed">
        <h2 className="c2-h2" id="xh-ed">
          {t.editor}
        </h2>
        <p className="c2-dim c2-xh-lede">{t.editorLede}</p>
        <div className="c2-xh-box">
          <div className={`c2-xh-stage is-${bg}`}>
            {back.src && <img key={back.id} src={back.src} srcSet={back.id === "dust2" ? "/cs2/bg/dust2-800.webp 800w, /cs2/bg/dust2-1600.webp 1600w" : undefined} sizes="(max-width: 900px) 100vw, 60vw" alt="" width={1600} height={900} decoding="async" />}
            <canvas ref={cv} width={160} height={160} aria-hidden="true" />
            <div className="c2-xh-bgs">
              {BGS.map((b) => (
                <button type="button" key={b.id} aria-pressed={bg === b.id} className={bg === b.id ? "is-on" : ""} onClick={() => setBg(b.id)}>
                  {b.name[lang === "es" ? 1 : 0]}
                </button>
              ))}
            </div>
            <span className="c2-xh-scale">{t.scale}</span>
          </div>
          <div className="c2-xh-ctrl">
            {sliders.map(({ k, min, max }) => (
              <label key={k}>
                <span>{t[k]}</span>
                <input type="range" min={min} max={max} step={1} value={xh[k]} onChange={(e) => set(k, Number(e.target.value))} />
                <output>{xh[k]}</output>
              </label>
            ))}
            <div className="c2-xh-row">
              <span>{t.color}</span>
              <span className="c2-xh-sw">
                {COLORS.map((c) => {
                  const on = c.c.join() === xh.color.join();
                  return <button type="button" key={c.name[0]} title={c.name[lang === "es" ? 1 : 0]} aria-label={c.name[lang === "es" ? 1 : 0]} aria-pressed={on} className={on ? "is-on" : ""} style={{ background: `rgb(${c.c.join(",")})` }} onClick={() => set("color", c.c)} />;
                })}
              </span>
            </div>
            <div className="c2-xh-row">
              <span>{t.shape}</span>
              <span className="c2-xh-tog">
                <button type="button" aria-pressed={xh.dot} className={xh.dot ? "is-on" : ""} onClick={() => set("dot", !xh.dot)}>
                  {t.dot}
                </button>
                <button type="button" aria-pressed={xh.tStyle} className={xh.tStyle ? "is-on" : ""} onClick={() => set("tStyle", !xh.tStyle)}>
                  {t.tStyle}
                </button>
              </span>
            </div>
            <div className="c2-xh-code">
              <label>
                <span className="c2-xh-sr">{t.code}</span>
                <input
                  value={draft ?? code}
                  spellCheck={false}
                  aria-label={t.code}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => draft != null && draft.trim() !== code && load(draft)}
                  onKeyDown={(e) => e.key === "Enter" && draft != null && load(draft)}
                  onPaste={(e) => {
                    const v = e.clipboardData.getData("text");
                    if (v) {
                      e.preventDefault();
                      load(v);
                    }
                  }}
                />
              </label>
              <div className="c2-xh-btns">
                <button type="button" className="c2-btn c2-xh-gold" onClick={() => copy("code", code)}>
                  {copied === "code" ? t.copied : t.copyCode}
                </button>
                <button type="button" className="c2-btn is-ghost c2-xh-ghost" onClick={() => copy("cmds", crosshairToConVars(toV1(xh)).trim().split(/\s*\n/).join("; "))}>
                  {copied === "cmds" ? t.copied : t.copyCmds}
                </button>
              </div>
              <small aria-live="polite">{msg}</small>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="xh-sens">
        <h2 className="c2-h2" id="xh-sens">
          {t.sens}
        </h2>
        <p className="c2-dim c2-xh-lede">{t.sensLede}</p>
        <div className="c2-panel c2-xh-sens">
          <div className="c2-xh-form">
            <label>
              {t.from}
              <select value={game} onChange={(e) => setGame(Number(e.target.value))}>
                {GAMES.map((g, i) => (
                  <option key={g.id} value={i}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.value}
              <input inputMode="decimal" value={sens} onChange={(e) => setSens(e.target.value)} />
            </label>
            <label>
              {t.dpi}
              <input inputMode="numeric" value={dpi} onChange={(e) => setDpi(e.target.value)} />
            </label>
            <p className="c2-note">{t.zoom}</p>
          </div>
          <div>
            <div className="c2-xh-big">
              <div>
                <b>{ok ? num(cm360(s, d, from.yaw), 1) : "—"}</b>
                <span>{t.cm}</span>
              </div>
              <div>
                <b>{ok ? Math.round(edpiCs2(s, d, from)).toLocaleString(lang === "es" ? "es-AR" : "en-US") : "—"}</b>
                <span>{t.edpi}</span>
              </div>
            </div>
            <table className="c2-table c2-xh-table">
              <thead>
                <tr>
                  <th><span>{t.game}</span></th>
                  <th><span>{t.value}</span></th>
                </tr>
              </thead>
              <tbody>
                {GAMES.filter((g) => g !== from).map((g) => (
                  <tr key={g.id}>
                    <td data-l={t.game}>{g.name}</td>
                    <td data-l={t.value}>
                      <b>{ok ? num(convert(s, from, g), 3) : "—"}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <p className="c2-note">{t.credit}</p>
    </main>
  );
}
