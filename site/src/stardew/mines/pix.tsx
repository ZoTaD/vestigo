/**
 * Los sprites de Minas y combate (etapa 3, tarea 6) y dos formatos de cifras que comparten la pestaña y la ficha de un
 * monstruo. Los sprites pixel van a un múltiplo entero de su tamaño, con ancho y alto fijos y `lazy` (salvo el grande
 * de arriba de una ficha).
 */
import { gearSprite, monsterSprite, pixelScale, type Monster } from "./state";

/** Un sprite pixel a un múltiplo entero de su tamaño, con ancho y alto fijos. */
export function Pix({ src, w, h, k, lazy = true }: { src: string; w: number; h: number; k: number; lazy?: boolean }) {
  return <img className="sd-pix" src={src} alt="" width={w * k} height={h * k} loading={lazy ? "lazy" : undefined} decoding="async" />;
}

/** El sprite de un monstruo, lo más grande que entre en una caja de `box`×`boxH` px (cuadrada si no se da el alto). */
export function MonsterPix({ m, box, boxH = box, lazy = true }: { m: Monster; box: number; boxH?: number; lazy?: boolean }) {
  const [w, h] = m.sprite;
  return <Pix src={monsterSprite(m)} w={w} h={h} k={pixelScale(w, h, box, boxH)} lazy={lazy} />;
}

/** El sprite de un arma, unas botas, una baratija, un sombrero u objeto (16×16, el sombrero 20×20), en una caja de `box` px. */
export function GearPix({ id, box }: { id: string; box: number }) {
  const src = gearSprite(id);
  if (!src) return null;
  const side = id.startsWith("(H)") ? 20 : 16;
  return <Pix src={src} w={side} h={side} k={pixelScale(side, side, box, box)} />;
}

/** "+4", "−8" o "0": la velocidad de un arma o de un monstruo, con signo. */
export const signed = (n: number, locale: string): string => (n > 0 ? `+${n.toLocaleString(locale)}` : n < 0 ? `−${(-n).toLocaleString(locale)}` : "0");
/** Una probabilidad (0 a 1) como porcentaje, con hasta un decimal y sin ceros de más. */
export const pct = (p: number, locale: string): string => `${(p * 100).toLocaleString(locale, { maximumFractionDigits: p < 0.01 ? 2 : 1 })} %`;

