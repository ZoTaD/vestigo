/**
 * Piezas chicas de las pestañas de Project Zomboid (2026-09-30): el ícono del juego, el sello como viñeta, el botón de
 * copiar, la búsqueda sin tildes, el desplegable de "y N más", las notas del juego con sus `<br>`, el tamaño de un
 * título según su palabra más larga y la carga de datos con su hoja de "cargando…". Nacieron
 * en Objetos (`items/ui.tsx`) y subieron acá cuando llegó Recetas, que las usa igual: una sola versión de cada una, así
 * las dos pestañas se ven y se comportan igual.
 */
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { stamp } from "./ZomboidHome";

/**
 * `useLayoutEffect` en el navegador; en el servidor (prerender) avisa que no hace nada, y ahí va `useEffect`, que tampoco
 * corre. Lo usan las pestañas que leen la dirección o lo guardado al montarse, antes de pintar.
 */
export const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Las carpetas de íconos que sirve el sitio: los de inventario (`items`, 32×32), los de las construcciones (`build`,
 * 48×48) y los de rasgos y profesiones.
 */
export type IconDir = "items" | "build" | "traits" | "professions";

/**
 * El ícono de un objeto (o de lo que diga `dir`), servido desde el sitio. Escapado: dos íconos de rasgos del juego
 * tienen espacios en el nombre ("trait_out of shape"), y un espacio crudo en un `src` no es una dirección válida. Las
 * carpetas son planas, así que escapar también la barra no rompe nada.
 */
export const itemIcon = (icon: string | null | undefined, dir: IconDir = "items"): string | null =>
  icon ? `/zomboid/${dir}/${encodeURIComponent(icon)}.webp` : null;

/**
 * El ícono con su tamaño declarado (no corre la página al llegar) y `pixelated`: son 32×32 del juego y escalados se
 * ven como el juego, no borrosos. `lazy` en las listas largas; la cabecera de una ficha lo pide ya. `dir` es la carpeta
 * (ver `IconDir`): los de construcción (48×48) y los de profesión (64×64) se achican en una fila, así que ahí van
 * suavizados (`is-smooth`): achicar a una escala que no es entera se come líneas enteras del dibujo.
 */
export function ItemIcon({
  icon,
  size = 32,
  lazy = true,
  dir = "items",
}: {
  icon: string | null | undefined;
  size?: number;
  lazy?: boolean;
  dir?: IconDir;
}) {
  const src = itemIcon(icon, dir);
  // Sin ícono, un cuadrado teñido del tamaño que ocuparía. Desempleado es la única profesión sin ícono en el juego (24
  // para 25): ahí va una hoja en blanco de la libreta (`.is-blank`), así en una lista de íconos no parece que faltó uno.
  if (!src) {
    const cls = dir === "professions" ? "pzi-noicon is-blank" : "pzi-noicon";
    return <span className={cls} style={{ width: size, height: size }} aria-hidden="true" />;
  }
  const smooth = (dir === "build" && size < 48) || (dir === "professions" && size < 64);
  return (
    <img
      className={smooth ? "pzi-icon is-smooth" : "pzi-icon"}
      src={src}
      alt=""
      width={size}
      height={size}
      loading={lazy ? "lazy" : undefined}
      decoding="async"
    />
  );
}

/** Un sello del juego como viñeta, teñido con `mask` (ver `.pz-stamp` en zomboid.css). */
export function Stamp({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`pz-stamp ${className}`.trim()} style={{ "--stamp": `url(${stamp(name)})` } as CSSProperties} aria-hidden="true" />;
}

/**
 * El texto para buscar y comparar, igual en todas las pestañas y en el buscador del Mapa: minúsculas, sin tildes
 * ("camion" encuentra "Camión"), sin apóstrofos ("greenes" encuentra "Greene's") y con cualquier otro signo como espacio
 * ("u store" encuentra "U-Store It").
 */
export const fold = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Copia un texto al portapapeles: `true` si se copió. Sin permiso de portapapeles (un iframe, un navegador viejo, sin
 * HTTPS) lo muestra en `fallback` para copiarlo a mano, y devuelve `false`: ahí no se copió nada, y el botón no puede
 * decir "¡Copiado!". El portapapeles y el cuadro se pasan de afuera para probarlo sin un navegador.
 */
export async function copyText(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined = typeof navigator === "undefined" ? undefined : navigator.clipboard,
  fallback: (text: string) => void = (t) => window.prompt("", t),
): Promise<boolean> {
  try {
    if (!clipboard) throw new Error("sin portapapeles");
    await clipboard.writeText(text);
    return true;
  } catch {
    fallback(text);
    return false;
  }
}

/**
 * Copia un texto (el ID, el comando) y lo confirma un momento en el mismo botón. Hay varios "Copiar" en una ficha: el
 * nombre accesible dice qué copia cada uno ("Copiar ID Base.Crowbar"), y la confirmación va en una región aparte que el
 * lector de pantalla anuncia (con `aria-label`, el cambio de texto del botón no siempre se lee).
 */
export function CopyButton({ text, label, done, what }: { text: string; label: string; done: string; what: string }) {
  const [ok, setOk] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    if (!(await copyText(text))) return;
    setOk(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOk(false), 1500);
  };
  return (
    <>
      <button type="button" className={`pzi-copy${ok ? " is-done" : ""}`} onClick={copy} aria-label={ok ? undefined : `${label} ${what}`}>
        {ok ? done : label}
      </button>
      <span className="visually-hidden" role="status">
        {ok ? done : ""}
      </span>
    </>
  );
}

/**
 * Las notas del juego traen `<br>` literales (58 objetos, la del estante de secado, las de las barricadas): se dibujan
 * como saltos de línea, nunca como texto escapado ni como HTML crudo. Nació en la ficha de Recetas.
 */
export function gameLines(text: string): ReactNode {
  return text.split(/<br\s*\/?>/i).map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {part}
    </Fragment>
  ));
}

/**
 * Cuánto ocupa una letra en Old Standard TT negrita, en em: el ancho más grande de cada grupo (medido en el navegador,
 * 2026-09-30), así la cuenta nunca queda corta. Contar letras no alcanzaba: una W mide 1,08 em y una i 0,3, y
 * "DESARROLLO" (10) es más ancha que "estacionamiento" (15).
 */
const letterEm = (ch: string): number =>
  /[MW+]/.test(ch) ? 1.08
  : /[A-Z&]/.test(ch) ? 0.82
  : /[mw]/.test(ch) ? 0.8
  : /[0-9]/.test(ch) ? 0.58
  : /[a-z]/.test(ch) ? (/[ijlft]/.test(ch) ? 0.36 : /[rsz]/.test(ch) ? 0.46 : 0.56)
  : /[.,:;'!¡]/.test(ch) ? 0.28
  : 0.47;

/**
 * Para un título que se achica con su caja (`.pzi-h1`): cuántos em mide su palabra más larga, así el CSS elige un tamaño
 * con el que esa palabra entra entera (las palabras no se cortan nunca). Un guion es un lugar donde el navegador puede
 * bajar de renglón, así que "Chocolate-Covered" cuenta como "Chocolate-" y no entera; los espacios duros no, y se
 * cuentan como parte de la palabra. Las tildes se miden como su letra (la "ó" como la "o").
 */
export function wordFit(title: string): CSSProperties {
  // Sin lookbehind (`(?<=-)`): un Safari viejo no lo entiende y el chunk entero no cargaría.
  const words = title.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/-/g, "- ").split(/ +/);
  const widest = Math.max(1, ...words.map((w) => [...w].reduce((sum, ch) => sum + letterEm(ch), 0)));
  return { "--pzi-w": Math.ceil(widest * 100) / 100 } as CSSProperties;
}

/** Cuántos enlaces se ven de entrada en una lista de una ficha; el resto, en un desplegable. */
const SHOWN = 24;

/**
 * Una lista con los primeros `shown` a la vista y el resto en un desplegable ("y N más"). Lo de adentro sigue en el
 * HTML (un `<details>` cerrado no le esconde nada a Google): ninguna ficha queda huérfana por estar al fondo de una
 * lista larga.
 */
export function Collapse<T>({
  items,
  render,
  more,
  shown = SHOWN,
  className = "pzi-links",
}: {
  items: T[];
  render: (x: T, i: number) => ReactNode;
  more: (n: number) => string;
  shown?: number;
  className?: string;
}) {
  const rest = items.slice(shown);
  return (
    <>
      <ul className={className}>{items.slice(0, shown).map((x, i) => render(x, i))}</ul>
      {rest.length > 0 && (
        <details className="pzi-more">
          <summary>{more(rest.length)}</summary>
          <ul className={className}>{rest.map((x, i) => render(x, shown + i))}</ul>
        </details>
      )}
    </>
  );
}

// `useLoad` vive en `src/useLoad.ts` desde que la usa Rust (ver ahí); se re-exporta para que las pestañas de Zomboid
// la sigan importando de acá.
export { useLoad } from "../useLoad";
