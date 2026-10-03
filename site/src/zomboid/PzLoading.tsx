/**
 * La hoja de "cargando…" de Project Zomboid (2026-09-30): una página vacía de la libreta con la nota a lápiz. La usan
 * el `Suspense` de la sección (mientras baja el chunk de una pestaña) y cada pestaña mientras bajan sus datos, así el
 * salto de una página a otra se ve igual siempre. Ocupa lo que una página, para que el pie no suba y baje.
 *
 * Si los datos no llegan (`onRetry`), la misma hoja dice qué pasó y ofrece reintentar: las cargas de la pestaña se
 * vuelven a pedir en la próxima llamada.
 */
import { useZomboidCopy } from "../zomboidCopy";

export default function PzLoading({ onRetry }: { onRetry?: () => void }) {
  const c = useZomboidCopy();
  return (
    <div className="pz-loading" aria-busy={!onRetry}>
      <div className="pz-page pz-loading-page">
        {onRetry ? (
          <p className="pz-loading-error" role="alert">
            {c.loadError}{" "}
            <button type="button" className="pz-retry" onClick={onRetry}>
              {c.retry}
            </button>
          </p>
        ) : (
          <p className="pz-loading-hand">{c.loading}</p>
        )}
      </div>
    </div>
  );
}
