/**
 * Las cuentas pesadas de la calculadora y su aviso (2026-09-29): lo que suelta un jefe o un área tarda de 100 a 300 ms en
 * escritorio y varias veces eso en un celular. Las listas van una vuelta atrás de los controles (`useDeferredValue`), y
 * mientras la que se ve no es la de las opciones elegidas, o todavía no hay ninguna, un "calculando…" callado lo dice.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useD2rCopy } from "../../d2rCopy";

/**
 * Falso hasta después del primer pintado en el navegador, y verdadero en el servidor (el prerender y los tests), donde no hay
 * pintado que esperar y el HTML tiene que salir con las listas. Una pantalla que abre con una cuenta pesada la deja para el
 * render siguiente: la página aparece enseguida, con "calculando…", en vez de quedar trabada con el HTML viejo a la vista.
 */
export function usePainted(): boolean {
  const [painted, setPainted] = useState(() => typeof window === "undefined");
  useEffect(() => {
    setPainted(true);
  }, []);
  return painted;
}

/**
 * La región de una cuenta. Con `busy`, "calculando…" arriba a la derecha de la lista vieja, que se apaga un poco (o solo, si
 * todavía no hay lista), y `aria-busy` para que un lector de pantalla sepa que la región se está actualizando.
 */
export function Busy({ busy, children }: { busy: boolean; children?: ReactNode }) {
  const td = useD2rCopy().drops;
  return (
    <div className={`d2-dr-live${busy ? " is-busy" : ""}`} aria-busy={busy || undefined}>
      {busy && <p className="d2-dr-busy">{td.calculating}</p>}
      {children}
    </div>
  );
}
