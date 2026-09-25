import type { ImgHTMLAttributes } from "react";

/**
 * Una imagen de Deadlock al tamaño en que se dibuja (2026-09-25).
 *
 * Las imágenes del juego llegan grandes (retratos de 280 px, insignias de 512)
 * y el sitio las dibuja chicas (61 px, 20 px). `games/deadlock/tools/thumbs.py`
 * deja cada una también a 48, 96 y 160 px de ancho bajo `w<ancho>/`; esto
 * elige, a partir del `width` con que se dibuja, la variante justa para una
 * pantalla común y la del doble para una de alta densidad (`srcSet` 1x/2x).
 *
 * Sólo toca las imágenes servidas desde el sitio (`/deadlock/game/…`): una URL
 * de afuera (el bucket de deadlock-api, un avatar de Steam) pasa tal cual.
 *
 * **`width` tiene que ser el ancho dibujado.** Si el CSS la agranda mucho más
 * que eso, se va a ver borrosa: en ese caso, pasar el ancho real.
 */
// Tienen que coincidir con WIDTHS de games/deadlock/tools/thumbs.py.
export const WIDTHS = [48, 96, 160] as const;
const LOCAL = "/deadlock/game/";
const VARIANT = /^\/deadlock\/game\/w\d+\//;

/** La variante más chica que cubre `px`, o la original si ninguna alcanza. */
export function variantUrl(src: string, px: number): string {
  // Sólo los .webp del sitio tienen variantes (el script no toca los .svg).
  if (!src.startsWith(LOCAL) || !src.endsWith(".webp") || VARIANT.test(src)) return src;
  const w = WIDTHS.find((x) => x >= px);
  return w ? `${LOCAL}w${w}/${src.slice(LOCAL.length)}` : src;
}

/** `src` y `srcSet` para una imagen que se dibuja a `px` de ancho. */
export function gameImgSrc(src: string, px: number): { src: string; srcSet?: string } {
  const one = variantUrl(src, px);
  const two = variantUrl(src, px * 2);
  if (one === src) return { src };
  return { src: one, srcSet: one === two ? undefined : `${one} 1x, ${two} 2x` };
}

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "width"> & {
  src: string;
  /** El ancho del atributo `width`, en px de CSS. */
  width: number;
  /** El ancho más grande con que el CSS la dibuja, si es mayor que `width`. */
  drawn?: number;
};

export default function GameImg({ src, width, drawn, ...rest }: Props) {
  return <img {...gameImgSrc(src, Math.max(width, drawn ?? 0))} width={width} {...rest} />;
}
