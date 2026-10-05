/**
 * Baja a `#tabla` (o el ancla que sea) una sola vez por carga del documento. Remontar la pestaña (ir a Objetos y volver)
 * o entrar con Atrás/Adelante no tiene que tirar al lector a la tabla: ahí manda la posición que restaura el navegador.
 * No usa `cameFromHistory` de Rust.tsx porque ese flag se consume y lo necesita el scroll a tope de la sección.
 */
let done = false;

/** Pura para poder probarla sin navegador: ¿hay que bajar al ancla ahora? */
export function shouldScrollToHash(hash: string, navType: string | undefined, alreadyDone: boolean): boolean {
  return hash.length > 1 && !alreadyDone && navType !== "back_forward";
}

/**
 * Corre el scroll si corresponde y devuelve cómo cancelarlo. El ancla puede tardar unos cuadros en existir (la pestaña
 * se carga en diferido), así que se la espera con requestAnimationFrame, hasta ~2 s; apenas el lector toca la rueda, la
 * pantalla, el puntero o el teclado se deja de insistir, para no tirarlo de vuelta a la tabla.
 */
export function scrollToHashOnce(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const nav = (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type;
  const hash = window.location.hash;
  if (!shouldScrollToHash(hash, nav, done)) return () => undefined;
  done = true;
  const id = decodeURIComponent(hash.slice(1));
  const start = performance.now();
  let frame = 0;
  let finished = false;
  const stop = () => {
    finished = true;
    cancelAnimationFrame(frame);
    for (const ev of ["wheel", "touchstart", "pointerdown", "mousedown", "keydown"]) window.removeEventListener(ev, stop);
  };
  // Algo de la carga en diferido (el parent que sube arriba al montar la pestaña, la hidratación) mueve la página después
  // del primer scroll: se vuelve a poner el ancla arriba cada cuadro mientras no esté, hasta 1,5 s o hasta que el lector
  // toque algo. No es un reintento ciego: sólo actúa si el ancla se corrió.
  const tick = () => {
    const el = document.getElementById(id);
    if (el && Math.abs(el.getBoundingClientRect().top) > 2) el.scrollIntoView();
    if (performance.now() - start < 1500) frame = requestAnimationFrame(tick);
    else stop();
  };
  for (const ev of ["wheel", "touchstart", "pointerdown", "mousedown", "keydown"]) window.addEventListener(ev, stop, { passive: true });
  frame = requestAnimationFrame(tick);
  // En desarrollo React monta, desmonta y vuelve a montar el efecto: si lo cortó el desmontaje y no el lector ni el
  // tiempo, el flag se devuelve para que el segundo montaje sí baje.
  return () => {
    const interrupted = !finished;
    stop();
    if (interrupted) done = false;
  };
}

/** Sólo para los tests. */
export function resetHashScroll(): void {
  done = false;
}
