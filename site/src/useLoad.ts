/**
 * La carga de datos de una pestaña (2026-10-05): nació en Project Zomboid (`zomboid/ui.tsx`) y bajó acá cuando llegó
 * Rust, que la usa igual. En `zomboid/ui.tsx` arrastraba la portada de Zomboid (`ZomboidHome`, por el sello), y con eso
 * la portada entera entraba en el chunk de cualquier otra sección que la importara.
 */
import { useEffect, useReducer, useState } from "react";

/**
 * Lo que ya llegó de una carga (`peek`), y si no, la pide y vuelve a dibujar cuando llega. `key` es qué se pide (el slug
 * de la ficha, o "list"); `null` es no pedir nada. Si falla, `failed` y `retry` para la hoja de error.
 */
export function useLoad<T>(key: string | null, peek: () => T | undefined, load: () => Promise<unknown>) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const value = key === null ? undefined : peek();
  const waiting = key !== null && value === undefined;
  useEffect(() => {
    if (!waiting) return;
    let alive = true;
    load().then(
      () => alive && bump(),
      () => alive && setFailed(key),
    );
    return () => {
      alive = false;
    };
    // `load` cambia en cada render (es una flecha): lo que decide pedir de nuevo es qué se pide y el reintento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, waiting, attempt]);
  return {
    value,
    failed: waiting && failed === key,
    retry: () => {
      setFailed(null);
      setAttempt((n) => n + 1);
    },
  };
}
