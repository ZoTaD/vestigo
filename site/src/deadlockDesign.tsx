import { createContext, useContext, useEffect, useState } from "react";
import { useLang } from "./i18n";

/**
 * Los dos diseños de Deadlock para comparar (ZoTaD, 2026-09-30).
 *
 * "A" es el de City Never Sleeps que ya está (cajas oscuras, placas naranjas).
 * "B" es la alternativa "mucho más Deadlock": la tier list de héroes como una
 * pared de carteles con las cartas del juego, su arte de fondo y las caras de
 * ánimo, y la de objetos como un tablero por letra. Por ahora sólo cambian la
 * tier list y la pestaña Objetos; el resto de las pestañas se ve igual.
 *
 * Se elige con el botón flotante (o `?diseno=b` en la URL, para pasar el link)
 * y dura mientras se navega por Deadlock. No se guarda en el navegador a
 * propósito: es un prototipo y no merece una clave más en la política de
 * privacidad. Cuando ZoTaD elija, se borra el que no quede junto con este archivo.
 */
export type DeadlockDesign = "a" | "b";

function inicial(): DeadlockDesign {
  const q = new URLSearchParams(window.location.search);
  const d = q.get("diseno") ?? q.get("design");
  return d === "b" ? "b" : "a";
}

export const DesignContext = createContext<DeadlockDesign>("a");
export const useDesign = () => useContext(DesignContext);

export function useDesignState(): [DeadlockDesign, (d: DeadlockDesign) => void] {
  // El prerender no tiene `window`: arranca en "a" y el efecto lee la URL.
  const [design, setDesign] = useState<DeadlockDesign>("a");
  useEffect(() => setDesign(inicial()), []);
  return [design, setDesign];
}

/** El botón flotante para pasar de un diseño al otro. */
export function DesignSwitch({ design, onChange }: { design: DeadlockDesign; onChange: (d: DeadlockDesign) => void }) {
  const { lang } = useLang();
  const es = lang === "es";
  const opciones: { id: DeadlockDesign; label: string }[] = [
    { id: "a", label: es ? "A · Diario" : "A · Paper" },
    { id: "b", label: es ? "B · Cartel" : "B · Poster" },
  ];
  return (
    <div className="dl-design-switch" role="group" aria-label={es ? "Diseño" : "Design"}>
      <span className="dl-design-switch-label">{es ? "Diseño" : "Design"}</span>
      {opciones.map((o) => (
        <button key={o.id} type="button" aria-pressed={design === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
