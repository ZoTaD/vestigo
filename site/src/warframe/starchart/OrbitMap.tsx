/**
 * El dibujo del mapa estelar (2026-10-27, maqueta A "Órbitas"): el sol, las doce órbitas en el orden del juego y cada
 * planeta sobre la suya, con un punto por nodo alrededor; las lunas (Lua, Fobos, Deimos, Europa) al lado de su planeta.
 * Los lugares fuera de órbita (Vacío, Fortaleza Kuva, Zariman…) van en botones debajo, en `StarChartList`.
 *
 * Todo es dibujo propio (el export no trae arte de planetas): una nebulosa y la franja de la galaxia de fondo, un campo
 * de estrellas, el sol con su corona y rayos que giran despacio, y cada planeta con sus colores, iluminado desde el sol
 * (Júpiter con franjas, Saturno con su anillo, la Tierra con continentes). Las animaciones se apagan con
 * `prefers-reduced-motion` (warframe.css).
 *
 * Cada planeta es un enlace de verdad (`?planet=sedna`): el dibujo sale igual en el prerender y anda sin JS. Las
 * posiciones son fijas (un ángulo de oro por órbita) y las estrellas salen de una semilla, así el servidor y el
 * navegador dibujan lo mismo.
 */
import type { ReactNode } from "react";
import { useLang } from "../../i18n";
import { say, STAR_MOONS, STAR_ORBITS, type StarPlanet } from "../data";

const C = 320;
const fix = (n: number) => Math.round(n * 10) / 10;
const ring = (i: number) => 62 + i * 21.5;

/** Colores de cada cuerpo: la cara al sol, la sombra y, si tiene, el detalle (franjas, anillo, continentes). */
type Look = { lit: string; dark: string; r: number; detail?: string; kind?: "bands" | "ring" | "land" };
const LOOK: Record<string, Look> = {
  Mercury: { lit: "#c9b8a6", dark: "#4e443d", r: 9 },
  Venus: { lit: "#f6e2ab", dark: "#8d6532", r: 13 },
  Earth: { lit: "#7cc2ff", dark: "#173d6e", r: 13, detail: "#6fb37a", kind: "land" },
  Mars: { lit: "#f0956a", dark: "#6e2a17", r: 11 },
  Ceres: { lit: "#b8b1a8", dark: "#4b4743", r: 8 },
  Jupiter: { lit: "#f1d9b2", dark: "#7a5233", r: 20, detail: "#c38f5f", kind: "bands" },
  Saturn: { lit: "#f5e3b5", dark: "#86683a", r: 16, detail: "#e3cf98", kind: "ring" },
  Uranus: { lit: "#c4f6f7", dark: "#2f7c88", r: 14 },
  Neptune: { lit: "#8aa2ff", dark: "#1b2577", r: 14 },
  Pluto: { lit: "#ecd9bf", dark: "#6b5646", r: 8 },
  Eris: { lit: "#f1f5f8", dark: "#6c7884", r: 8 },
  Sedna: { lit: "#ee8a6c", dark: "#5c2219", r: 9 },
  Lua: { lit: "#e3e3e3", dark: "#5c5c5c", r: 8 },
  Phobos: { lit: "#b39c88", dark: "#4a3c32", r: 7 },
  Deimos: { lit: "#b7a28c", dark: "#463a2f", r: 7 },
  Europa: { lit: "#f6eddc", dark: "#8c7a5c", r: 8 },
};
const looks = (name: string): Look => LOOK[name] ?? { lit: "#9fb4c8", dark: "#1b2c3c", r: 10 };

/** Dónde va cada planeta y cada luna: x, y, el radio del cuerpo y si es una luna (lleva el nombre abajo). */
type Spot = { x: number; y: number; r: number; moon?: true };
function layout(): Map<string, Spot> {
  const pos = new Map<string, Spot>();
  STAR_ORBITS.forEach((name, i) => {
    const a = ((-90 + i * 137.5) * Math.PI) / 180;
    pos.set(name, { x: C + ring(i) * Math.cos(a), y: C + ring(i) * Math.sin(a), r: looks(name).r });
  });
  // Cada luna va a la misma altura que su planeta, del lado de afuera (lejos del sol); si son dos, una a cada lado.
  // Así no tapa el nombre del planeta, que va arriba.
  const moons = new Map<string, string[]>();
  for (const [moon, host] of Object.entries(STAR_MOONS)) moons.set(host, [...(moons.get(host) ?? []), moon]);
  for (const [host, list] of moons) {
    const h = pos.get(host)!;
    const out = h.x >= C ? 1 : -1;
    // Lo bastante lejos para que el nombre de la luna no pise la cuenta del planeta, que va debajo de él.
    const gap = h.r + 36;
    list.forEach((moon, k) => pos.set(moon, { x: h.x + (list.length > 1 && k === 0 ? -out : out) * gap, y: h.y, r: looks(moon).r, moon: true }));
  }
  return pos;
}
const POS = layout();

/** Un número de 0 a 1 que sale siempre igual para la misma semilla (mulberry32): las estrellas no cambian entre el servidor y el navegador. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** El campo de estrellas: casi todas chicas y quietas; unas pocas grandes titilan. Más densas sobre la franja de la galaxia. */
const STARS = (() => {
  const rnd = seeded(1999);
  const out: { x: number; y: number; r: number; o: number; tw: boolean }[] = [];
  for (let i = 0; i < 150; i++) {
    let x = rnd() * 640;
    let y = rnd() * 640;
    // La mitad cae cerca de la franja (la diagonal de abajo a la izquierda a arriba a la derecha).
    if (i % 2) {
      const t = rnd() * 640;
      const d = (rnd() - 0.5) * 150;
      x = t + d * 0.7;
      y = 640 - t + d * 0.7;
    }
    if (x < 0 || x > 640 || y < 0 || y > 640) continue;
    // Lejos del sol: ahí manda su luz.
    if (Math.hypot(x - C, y - C) < 60) continue;
    const big = rnd() < 0.08;
    out.push({ x: fix(x), y: fix(y), r: big ? 1.4 : fix(0.4 + rnd() * 0.6), o: fix(0.35 + rnd() * 0.55), tw: big });
  }
  return out;
})();
/** El radio del disco del sol. */
const SUN = 26;

/** Los degradados de un cuerpo: el brillo cae del lado que mira al sol. */
function Body({ id, x, y, r, look }: { id: string; x: number; y: number; r: number; look: Look }) {
  const a = Math.atan2(C - y, C - x);
  const fx = fix(0.5 + 0.32 * Math.cos(a));
  const fy = fix(0.5 + 0.32 * Math.sin(a));
  return (
    <>
      <defs>
        <radialGradient id={`${id}-g`} cx={fx} cy={fy} fx={fx} fy={fy} r="0.85">
          <stop offset="0" stopColor={look.lit} />
          <stop offset="0.55" stopColor={look.lit} stopOpacity="0.9" />
          <stop offset="1" stopColor={look.dark} />
        </radialGradient>
        <clipPath id={`${id}-c`}>
          <circle cx={fix(x)} cy={fix(y)} r={r} />
        </clipPath>
      </defs>
      {look.kind === "ring" && <ellipse className="wf-planet-ring is-back" cx={fix(x)} cy={fix(y)} rx={fix(r * 1.9)} ry={fix(r * 0.55)} stroke={look.detail} />}
      <circle className="wf-planet-body" cx={fix(x)} cy={fix(y)} r={r} fill={`url(#${id}-g)`} />
      {look.kind === "bands" && (
        <g clipPath={`url(#${id}-c)`} fill={look.detail} opacity="0.55">
          {[-0.55, -0.15, 0.25, 0.6].map((k, i) => (
            <rect x={fix(x - r)} y={fix(y + k * r)} width={r * 2} height={fix(r * (i % 2 ? 0.14 : 0.2))} key={k} />
          ))}
          <ellipse cx={fix(x + r * 0.3)} cy={fix(y + r * 0.42)} rx={fix(r * 0.22)} ry={fix(r * 0.12)} fill="#d0714a" opacity="0.9" />
        </g>
      )}
      {look.kind === "land" && (
        <g clipPath={`url(#${id}-c)`} fill={look.detail} opacity="0.75">
          <ellipse cx={fix(x - r * 0.35)} cy={fix(y - r * 0.2)} rx={fix(r * 0.4)} ry={fix(r * 0.28)} />
          <ellipse cx={fix(x + r * 0.4)} cy={fix(y + r * 0.35)} rx={fix(r * 0.3)} ry={fix(r * 0.22)} />
        </g>
      )}
      {look.kind === "ring" && (
        // La mitad de adelante del anillo, sobre el planeta.
        <path className="wf-planet-ring" d={`M ${fix(x - r * 1.9)} ${fix(y)} A ${fix(r * 1.9)} ${fix(r * 0.55)} 0 0 0 ${fix(x + r * 1.9)} ${fix(y)}`} stroke={look.detail} />
      )}
      {/* La atmósfera: un filo de luz fino del color de la cara iluminada. */}
      <circle className="wf-planet-air" cx={fix(x)} cy={fix(y)} r={fix(r + 1.2)} stroke={look.lit} />
    </>
  );
}

/** Los planetas que el dibujo sabe ubicar. */
export const inOrbit = (p: StarPlanet): boolean => POS.has(p.name[0]);

export default function OrbitMap({
  planets,
  selected,
  label,
  link,
}: {
  planets: readonly StarPlanet[];
  selected: string | null;
  /** El nombre del dibujo, para los lectores de pantalla. */
  label: string;
  /** El enlace de un planeta: recibe su slug y el contenido del enlace. */
  link: (slug: string, children: ReactNode, on: boolean) => ReactNode;
}) {
  const { lang } = useLang();
  const shown = planets.filter(inOrbit);
  const selName = shown.find((p) => p.slug === selected)?.name[0];
  const selRing = selName ? STAR_ORBITS.indexOf(selName as (typeof STAR_ORBITS)[number]) : -1;
  return (
    <svg className="wf-orbits" viewBox="0 0 640 640" role="group" aria-label={label}>
      <defs>
        <radialGradient id="wf-space" cx="0.5" cy="0.5" r="0.75">
          <stop offset="0" stopColor="#13243a" />
          <stop offset="0.6" stopColor="#0a1220" />
          <stop offset="1" stopColor="#05080f" />
        </radialGradient>
        <radialGradient id="wf-nebula-a" cx="0.22" cy="0.78" r="0.45">
          <stop offset="0" stopColor="#6b3fa0" stopOpacity="0.38" />
          <stop offset="1" stopColor="#6b3fa0" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="wf-nebula-b" cx="0.82" cy="0.2" r="0.42">
          <stop offset="0" stopColor="#1f8fa8" stopOpacity="0.32" />
          <stop offset="1" stopColor="#1f8fa8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="wf-galaxy" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#9fb8ff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#c9d6ff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#9fb8ff" stopOpacity="0" />
        </linearGradient>
        <filter id="wf-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
        {/* La fotosfera: blanca en el centro y más oscura y roja hacia el borde (el oscurecimiento del limbo). */}
        <radialGradient id="wf-sun-disk">
          <stop offset="0" stopColor="#fffdf2" />
          <stop offset="0.45" stopColor="#ffeaa8" />
          <stop offset="0.78" stopColor="#ffbf55" />
          <stop offset="0.93" stopColor="#f2862c" />
          <stop offset="1" stopColor="#c4501a" />
        </radialGradient>
        {/* La granulación: ruido fractal recortado al disco, teñido de naranja y con transparencia. */}
        <filter id="wf-sun-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.22" numOctaves="3" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 0.55  0 0 0 0 0.12  0 0 0 -2.2 1.35" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <clipPath id="wf-sun-clip">
          <circle cx={C} cy={C} r={SUN} />
        </clipPath>
        <radialGradient id="wf-sun-glow">
          <stop offset="0" stopColor="#fff3c4" stopOpacity="0.95" />
          <stop offset="0.3" stopColor="#ffc861" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#ff8a2a" stopOpacity="0.18" />
          <stop offset="1" stopColor="#ff8a2a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="wf-sun-halo">
          <stop offset="0" stopColor="#ffe7a8" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ffe7a8" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* El espacio: fondo, dos nebulosas, la franja de la galaxia y las estrellas. */}
      <g className="wf-space" aria-hidden="true">
        <rect width="640" height="640" rx="6" fill="url(#wf-space)" />
        <rect width="640" height="640" fill="url(#wf-nebula-a)" />
        <rect width="640" height="640" fill="url(#wf-nebula-b)" />
        <ellipse cx={C} cy={C} rx="470" ry="70" transform={`rotate(-45 ${C} ${C})`} fill="url(#wf-galaxy)" filter="url(#wf-soft)" />
        {STARS.map((s, i) => (
          <circle className={s.tw ? "wf-star is-twinkle" : "wf-star"} cx={s.x} cy={s.y} r={s.r} opacity={s.o} style={s.tw ? { animationDelay: `${(i % 7) * 0.6}s` } : undefined} key={i} />
        ))}
      </g>

      {STAR_ORBITS.map((name, i) => (
        <circle className={i === selRing ? "wf-ring is-on" : "wf-ring"} cx={C} cy={C} r={ring(i)} key={name} />
      ))}

      {/* El sol, de afuera hacia adentro: el halo ancho, el resplandor y el disco con su
          granulación, que gira despacio. */}
      <g className="wf-sun" aria-hidden="true">
        <circle cx={C} cy={C} r="120" fill="url(#wf-sun-halo)" />
        <circle className="wf-sun-glow" cx={C} cy={C} r="62" fill="url(#wf-sun-glow)" />
        <circle cx={C} cy={C} r={SUN} fill="url(#wf-sun-disk)" />
        <g clipPath="url(#wf-sun-clip)">
          <g className="wf-sun-surface">
            <rect x={C - SUN} y={C - SUN} width={SUN * 2} height={SUN * 2} filter="url(#wf-sun-grain)" />
          </g>
          {/* El limbo otra vez encima del grano, así el borde queda oscuro y nítido. */}
          <circle cx={C} cy={C} r={SUN} fill="url(#wf-sun-disk)" opacity="0.35" />
        </g>
        <circle className="wf-sun-rim" cx={C} cy={C} r={SUN + 0.6} />
      </g>

      {shown.map((p) => {
        const { x, y, r, moon } = POS.get(p.name[0])!;
        const on = p.slug === selected;
        const extra = looks(p.name[0]).kind === "ring" ? r * 0.9 : 0;
        const dots = Array.from({ length: p.n }, (_, j) => {
          const t = (j / p.n) * Math.PI * 2;
          return <circle className="wf-orbit-dot" cx={fix(x + (r + 6 + extra) * Math.cos(t))} cy={fix(y + (r + 6) * Math.sin(t))} r={1.6} key={j} />;
        });
        return (
          <g className={`wf-planet${on ? " is-on" : ""}`} key={p.slug}>
            {link(
              p.slug,
              <>
                <circle className="wf-planet-halo" cx={fix(x)} cy={fix(y)} r={r + 12 + extra} />
                <g className="wf-planet-art">
                  <Body id={`wf-p-${p.slug}`} x={x} y={y} r={r} look={looks(p.name[0])} />
                </g>
                {dots}
                {moon ? (
                  // Una luna lleva el nombre y la cuenta juntos, abajo.
                  <text className="is-moon" x={fix(x)} y={fix(y + r + 20)} textAnchor="middle">
                    {say(p.name, lang)} <tspan className="wf-planet-n">{p.n}</tspan>
                  </text>
                ) : (
                  <>
                    <text x={fix(x)} y={fix(y - r - 12)} textAnchor="middle">
                      {say(p.name, lang)}
                    </text>
                    <text className="wf-planet-n" x={fix(x)} y={fix(y + r + 20)} textAnchor="middle">
                      {p.n}
                    </text>
                  </>
                )}
              </>,
              on,
            )}
          </g>
        );
      })}
    </svg>
  );
}
