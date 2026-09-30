/**
 * Un campo numérico que no pelea con lo que se escribe (2026-09-29): el hallazgo mágico, el nivel de la Zona de Terror, las
 * runs del simulador y el hallazgo mágico de la ficha de un jefe. Antes cada tecla se acotaba al rango: borrar el nivel de la
 * Zona de Terror dejaba 1 y escribir "85" daba "185" → 99; borrar el hallazgo mágico lo dejaba en 0. Ahora el texto queda como
 * se escribe, cada número que se puede leer va enseguida (acotado) a la cuenta, y el texto se acota recién al salir del campo
 * o con Enter.
 */
import { useState } from "react";

/** Lo escrito como número del rango (redondeado y acotado), o null si todavía no es un número (vacío, "-", "."). */
export function parseNum(text: string, min: number, max: number): number | null {
  const s = text.trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : null;
}

export interface NumFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}

export default function NumField({ label, value, min, max, onChange }: NumFieldProps) {
  const [text, setText] = useState(String(value));
  // Si el valor cambia desde afuera (la casilla de la Zona de Terror lo pone en 90, un enlace, el tope aplicado), el texto lo
  // sigue; si ya es lo que dice lo escrito (por ejemplo "150" en un campo de 1 a 99 mientras se escribe), se deja lo escrito.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (parseNum(text, min, max) !== value) setText(String(value));
  }
  const commit = () => {
    const v = parseNum(text, min, max) ?? value;
    setText(String(v));
    if (v !== value) onChange(v);
  };
  return (
    <label className="d2-dr-field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseNum(e.target.value, min, max);
          if (v !== null && v !== value) onChange(v);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
    </label>
  );
}
