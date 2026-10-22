/**
 * Las piezas que comparten las pantallas de Stardew Valley (2026-10-22), con el arte del menú del juego: la caja con
 * el marco de madera, el casillero del inventario, el sprite de un objeto, la cifra en oro y la hoja de "cargando…".
 */
import type { ElementType, ReactNode } from "react";
import { useLocale } from "../i18n";
import type { Route } from "../route";
import { useStardewCopy } from "../stardewCopy";

export type Nav = (r: Route) => void;

/**
 * La caja del menú del juego: el marco de madera es `border-image` sobre `/stardew/ui/frame.png` (64 / 32px, ver
 * `.sd-box` en stardew.css). El marco es el arte del juego, no un filo de color.
 */
export function Box({ as: Tag = "section", className, children, ...rest }: { as?: ElementType; className?: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <Tag className={className ? `sd-box ${className}` : "sd-box"} {...rest}>
      {children}
    </Tag>
  );
}

/** El archivo del sprite de un objeto: `(BC)12` → `bc-12.png`, el resto `<id>.png` (igual que `sprite_file` de sprites.py). */
export const spriteFile = (id: string): string => (id.startsWith("(BC)") ? `bc-${id.slice(4)}.png` : `${id}.png`);

/**
 * El sprite de un objeto, agrandado para que su lado mayor mida `size` px. Los sprites del juego vienen a su tamaño
 * real (16×16, o 16×32 las máquinas) y se agrandan con `image-rendering: pixelated`. Ancho y alto fijos, así no corre
 * la página al llegar; `lazy` salvo la imagen principal de arriba de una ficha.
 */
export function Sprite({ id, w = 16, h = 16, size = 48, lazy = true }: { id: string; w?: number; h?: number; size?: number; lazy?: boolean }) {
  const k = size / Math.max(w, h, 1);
  return (
    <img
      className="sd-sprite"
      src={`/stardew/items/${spriteFile(id)}`}
      alt=""
      width={Math.round(w * k)}
      height={Math.round(h * k)}
      loading={lazy ? "lazy" : undefined}
      decoding="async"
    />
  );
}

/** El casillero del inventario (64 px, el arte de `/stardew/ui/slot.png`) con lo que lleve adentro, centrado. */
export function Slot({ children, title }: { children?: ReactNode; title?: string }) {
  return (
    <span className="sd-slot" title={title}>
      {children}
    </span>
  );
}

/** Una cifra en oro, como la escribe el juego: el número y la "g" pegada. */
export function Gold({ n }: { n: number }) {
  const locale = useLocale();
  const t = useStardewCopy();
  return (
    <span className="sd-gold">
      {n.toLocaleString(locale)}
      <small>{t.gold}</small>
    </span>
  );
}

/** La hoja de "cargando…" (o del error, con el botón para reintentar). */
export function SdLoading({ onRetry }: { onRetry?: () => void }) {
  const t = useStardewCopy();
  return (
    <main className="sd-main sd-loading" aria-busy={!onRetry}>
      <Box>
        {onRetry ? (
          <p role="alert">
            {t.loadError}{" "}
            <button type="button" className="sd-btn" onClick={onRetry}>
              {t.retry}
            </button>
          </p>
        ) : (
          <p>{t.loading}</p>
        )}
      </Box>
    </main>
  );
}
