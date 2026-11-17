import type { CSSProperties } from "react";
import type { Route } from "./route";
import gameArt from "@deadlock/game-art.json";
import { heroes as heroSlugs } from "./deadlockSlugs";

/**
 * El fondo de la página de Deadlock (2026-11-17, "Escenas": lo eligió ZoTaD
 * entre cinco maquetas).
 *
 * Cada pestaña tiene una escena del juego y la página de un héroe usa su propio
 * arte de fondo. La capa va justo debajo de la barra de pestañas (las dos barras
 * de arriba quedan siempre negras) y muestra la imagen **entera**, al ancho de
 * la pantalla y con su proporción, fundiéndose en negro hacia abajo: no se
 * recorta. Las imágenes son las originales del juego en 2560 px
 * (`public/deadlock/game/ui/fondos/`); los estilos, en `styles/deadlock-fondo.css`.
 */

const F = "/deadlock/game/ui/fondos";

interface Imagen {
  src: string;
  /** Ancho / alto, para que la caja tenga la proporción de la imagen. */
  ratio: number;
  /** El arte con transparencia a la izquierda (héroes, art déco): menos veladura. */
  derecha?: boolean;
}

const ESCENAS: Record<string, Imagen> = {
  gotica: { src: `${F}/gotica.webp`, ratio: 2560 / 1302 },
  cuadra: { src: `${F}/cuadra.webp`, ratio: 2560 / 1440 },
  deco: { src: `${F}/art-deco.webp`, ratio: 2560 / 1445, derecha: true },
};

/** La escena de cada pestaña. */
const ESCENA_DE: Record<string, keyof typeof ESCENAS> = {
  meta: "gotica",
  "street-brawl": "gotica",
  heroes: "gotica",
  draft: "gotica",
  patches: "cuadra",
  live: "cuadra",
  comebacks: "cuadra",
  player: "cuadra",
  match: "cuadra",
  items: "deco",
  builds: "deco",
  builder: "deco",
  map: "deco",
  ranks: "deco",
  ladder: "deco",
  dle: "deco",
};

/** El arte de fondo de un héroe, en alta (`fondos/heroes/<nombre>_bg.webp`). */
function arteHeroe(id: string): Imagen | null {
  const actual = (gameArt.backgrounds as Record<string, string>)[id];
  if (!actual) return null;
  const nombre = actual.split("/").pop()!;
  return { src: `${F}/heroes/${nombre}`, ratio: 2560 / 1445, derecha: true };
}

/** El héroe de la página, si es la página de un héroe. */
function heroeDe(route: Route): string | null {
  const s = route.dlSection;
  const slug =
    (s === "meta" || s === "heroes" || s === "ladder") && route.detail
      ? route.detail
      : s === "builds" && route.detail
        ? route.detail.split("/")[0]
        : null;
  return slug ? (heroSlugs.toId.get(slug) ?? null) : null;
}

export function fondoDe(route: Route): Imagen {
  const heroe = heroeDe(route);
  return (heroe && arteHeroe(heroe)) || ESCENAS[ESCENA_DE[route.dlSection] ?? "deco"];
}

export default function DeadlockFondo({ route }: { route: Route }) {
  const img = fondoDe(route);
  return (
    <div
      className="dl-fondo"
      aria-hidden="true"
      data-lado={img.derecha ? "derecha" : undefined}
      style={{ "--dl-img": `url(${img.src})`, "--dl-ratio": String(img.ratio) } as CSSProperties}
    />
  );
}
