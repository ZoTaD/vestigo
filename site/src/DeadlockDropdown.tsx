import { useEffect, useId, useRef, useState } from "react";

/**
 * Un desplegable con el papel del Cartel (2026-11-17).
 *
 * **Reemplaza al `<select>` nativo** porque su lista la dibuja el sistema: en
 * Windows sale blanca con el azul de selección, encima del papel tostado, y
 * rompe la estética (lo marcó ZoTaD en el ranking por estadística).
 *
 * Botón + lista con `role="listbox"`: flechas, Inicio/Fin, Enter y Escape
 * funcionan, y un clic afuera la cierra.
 */
export interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

export default function DeadlockDropdown<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (v: T) => void;
  /** Nombre accesible del control. */
  label: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const id = useId();
  const actual = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!abierto) return;
    setActivo(Math.max(0, options.findIndex((o) => o.value === value)));
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto, options, value]);

  // La opción activa siempre a la vista cuando la lista es más alta que su caja.
  useEffect(() => {
    if (abierto) lista.current?.children[activo]?.scrollIntoView({ block: "nearest" });
  }, [abierto, activo]);

  const elegir = (i: number) => {
    onChange(options[i].value);
    setAbierto(false);
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (!abierto) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setAbierto(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setAbierto(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActivo((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActivo(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActivo(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      elegir(activo);
    } else if (e.key === "Tab") {
      setAbierto(false);
    }
  };

  return (
    <div className="dl-dd" ref={caja} data-open={abierto}>
      <button
        type="button"
        className="dl-dd-btn"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={`${id}-l`}
        aria-label={`${label}: ${actual?.label ?? ""}`}
        aria-activedescendant={abierto ? `${id}-${activo}` : undefined}
        onClick={() => setAbierto((a) => !a)}
        onKeyDown={teclas}
      >
        <span className="dl-dd-value">{actual?.label}</span>
        <span className="dl-dd-caret" aria-hidden="true" />
      </button>
      {abierto && (
        <ul className="dl-dd-list" role="listbox" id={`${id}-l`} aria-label={label} ref={lista}>
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={o.value === value}
              data-active={i === activo}
              onMouseEnter={() => setActivo(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(i)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
