/**
 * Las piezas que comparten las pantallas de Warframe (2026-10-27), con la estética A "Arsenal": el panel de vidrio, el
 * ícono de un objeto, la rareza por color de texto y la hoja de "cargando…".
 */
import type { ElementType, ReactNode } from "react";
import type { Route } from "../route";
import { SettledImg } from "../SettledImg";
import { useWfCopy, type WfRarity } from "../warframeCopy";

export type Nav = (r: Route) => void;

/** El panel de vidrio translúcido: sin borde, sólo un tinte (`.wf-panel` en warframe.css). */
export function Panel({ as: Tag = "section", className, children, ...rest }: { as?: ElementType; className?: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <Tag className={className ? `wf-panel ${className}` : "wf-panel"} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * El ícono de un objeto: `public/warframe/s/<img>.webp` (128 px) o, de la ficha, `l/` (256 px). Ancho y alto fijos, así
 * no corre la página al llegar; `lazy` salvo la imagen principal de arriba de una ficha.
 */
export function Icon({ img, size = 64, big = false, lazy = true }: { img: string | null | undefined; size?: number; big?: boolean; lazy?: boolean }) {
  if (!img) return <span className="wf-icon is-empty" style={{ width: size, height: size }} aria-hidden="true" />;
  const props = { className: "wf-icon", src: `/warframe/${big ? "l" : "s"}/${img}.webp`, alt: "", width: size, height: size };
  return lazy ? <SettledImg {...props} /> : <img {...props} decoding="async" />;
}

/** La rareza de un mod, escrita en el color de su rareza (texto, nunca un filo). Una rareza que no se conoce va en neutro. */
export function Rarity({ r }: { r: string | null | undefined }) {
  const t = useWfCopy();
  if (!r) return null;
  const known = r in t.rarity;
  return <span className={`wf-rarity is-${r.toLowerCase()}`}>{known ? t.rarity[r as WfRarity] : r}</span>;
}

/** La hoja de "cargando…" (o del error, con el botón para reintentar). */
export function WfLoading({ onRetry }: { onRetry?: () => void }) {
  const t = useWfCopy();
  return (
    <main className="wf-main wf-loading" aria-busy={!onRetry}>
      <Panel>
        {onRetry ? (
          <p role="alert">
            {t.loadError}{" "}
            <button type="button" className="wf-btn" onClick={onRetry}>
              {t.retry}
            </button>
          </p>
        ) : (
          <p>{t.loading}</p>
        )}
      </Panel>
    </main>
  );
}
