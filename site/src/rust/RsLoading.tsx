/**
 * La hoja de "cargando…" de Rust (2026-10-05): un panel del inventario vacío, del alto de una página para que el pie no
 * salte. Si los datos no llegan (`onRetry`), dice qué pasó y ofrece reintentar. El prerender corta el build si una
 * página sale con esta hoja (`vite.config.ts`).
 */
import { useRustCopy } from "../rustCopy";

export default function RsLoading({ onRetry }: { onRetry?: () => void }) {
  const c = useRustCopy();
  return (
    <main className="rs-main rs-loading" aria-busy={!onRetry}>
      <div className="rs-pnl">
        {onRetry ? (
          <p role="alert">
            {c.loadError}{" "}
            <button type="button" className="rs-btn" onClick={onRetry}>
              {c.retry}
            </button>
          </p>
        ) : (
          <p>{c.loading}</p>
        )}
      </div>
    </main>
  );
}
