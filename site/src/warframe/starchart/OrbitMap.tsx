/**
 * El dibujo del mapa estelar (2026-10-27, maqueta A "Órbitas"): el sol, las doce órbitas en el orden del juego y cada
 * planeta sobre la suya, con un punto por nodo alrededor; las lunas (Lua, Fobos, Deimos, Europa) al lado de su planeta.
 * Los lugares fuera de órbita (Vacío, Fortaleza Kuva, Zariman…) van en botones debajo, en `StarChartList`.
 *
 * Cada planeta es un enlace de verdad (`?planet=sedna`): el dibujo sale igual en el prerender y anda sin JS. Las
 * posiciones son fijas (un ángulo de oro por órbita), así el servidor y el navegador dibujan lo mismo.
 */
import type { ReactNode } from "react";
import { useLang } from "../../i18n";
import { say, STAR_MOONS, STAR_ORBITS, type StarPlanet } from "../data";

const C = 320;
const fix = (n: number) => Math.round(n * 10) / 10;

/** Dónde va cada planeta y cada luna: x, y, el radio del cuerpo y si es una luna (lleva el nombre abajo). */
type Spot = { x: number; y: number; r: number; moon?: true };
function layout(): Map<string, Spot> {
  const pos = new Map<string, Spot>();
  STAR_ORBITS.forEach((name, i) => {
    const ring = 62 + i * 21.5;
    const a = ((-90 + i * 137.5) * Math.PI) / 180;
    pos.set(name, { x: C + ring * Math.cos(a), y: C + ring * Math.sin(a), r: 14 });
  });
  // Cada luna va a la misma altura que su planeta, del lado de afuera (lejos del sol); si son dos, una a cada lado.
  // Así no tapa el nombre del planeta, que va arriba.
  const moons = new Map<string, string[]>();
  for (const [moon, host] of Object.entries(STAR_MOONS)) moons.set(host, [...(moons.get(host) ?? []), moon]);
  for (const [host, list] of moons) {
    const h = pos.get(host)!;
    const out = h.x >= C ? 1 : -1;
    list.forEach((moon, k) => pos.set(moon, { x: h.x + (list.length > 1 && k === 0 ? -out : out) * 42, y: h.y, r: 8, moon: true }));
  }
  return pos;
}
const POS = layout();

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
  return (
    <svg className="wf-orbits" viewBox="0 0 640 640" role="group" aria-label={label}>
      <defs>
        <radialGradient id="wf-sun">
          <stop offset="0" stopColor="#ffe3a3" />
          <stop offset="0.5" stopColor="#d8b46a" stopOpacity="0.6" />
          <stop offset="1" stopColor="#d8b46a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="wf-sun" cx={C} cy={C} r={38} fill="url(#wf-sun)" />
      {STAR_ORBITS.map((name, i) => (
        <circle className="wf-ring" cx={C} cy={C} r={62 + i * 21.5} key={name} />
      ))}
      {planets.filter(inOrbit).map((p) => {
        const { x, y, r, moon } = POS.get(p.name[0])!;
        const on = p.slug === selected;
        const dots = Array.from({ length: p.n }, (_, j) => {
          const t = (j / p.n) * Math.PI * 2;
          return <circle className="wf-orbit-dot" cx={fix(x + (r + 6) * Math.cos(t))} cy={fix(y + (r + 6) * Math.sin(t))} r={1.6} key={j} />;
        });
        return (
          <g className={`wf-planet${on ? " is-on" : ""}`} key={p.slug}>
            {link(
              p.slug,
              <>
                <circle className="wf-planet-halo" cx={fix(x)} cy={fix(y)} r={r + 12} />
                <circle className="wf-planet-body" cx={fix(x)} cy={fix(y)} r={r} />
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
