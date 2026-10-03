/**
 * Una fila del generador de servidor (2026-10-01): una opción de sandbox o del `.ini`, con
 * - el nombre del juego y la clave (`ZombieLore.Speed`, en monoespaciada: se selecciona entera de un clic para copiarla),
 *   que baja de renglón por sus puntos y nunca por la mitad de una palabra;
 * - el control: lista (enum), casilla (bool), número con su mínimo y máximo, o texto;
 * - la ayuda del juego y el "Default" de la base;
 * - si difiere de la base, tinte de fondo y el texto "cambiada", con un botón para volver (nunca un borde de color).
 *
 * Está memorizada: el generador tiene 413 y cambiar una no redibuja las otras.
 */
import { Fragment, memo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLang } from "../../i18n";
import { coerce, type CoerceError } from "./config";
import { usePzServerCopy } from "./copy";
import type { IniOption, SandboxOption, Value } from "./data";

export type Kind = "sandbox" | "ini";

/**
 * Los tramos por donde una clave puede bajar de renglón:
 * - con puntos, después de cada punto: `ZombieConfig.|PopulationStartMultiplier` (la parte de la tabla es la unidad);
 * - sin puntos (las del `.ini`), donde arranca otra palabra: `Remove|Player|Corpses|On|Corpse|Removal`,
 *   `server_|browser_|announced_|ip`. Es límite de palabra, como en `SoftBreaks`; antes se achicaban enteras y la más
 *   larga quedaba en ~9 px a 320 (revisión del 2026-10-01).
 */
export const keyParts = (k: string): string[] =>
  k.includes(".")
    ? k.split(".").map((p, i, all) => (i < all.length - 1 ? `${p}.` : p))
    : k.replace(/([a-z0-9])(?=[A-Z])|(_)(?=.)/g, "$1$2\u0000").split("\u0000");

/** La clave con un lugar para bajar de renglón en cada tramo (`keyParts`). */
export function KeyBreaks({ k }: { k: string }) {
  return (
    <>
      {keyParts(k).map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {p}
        </Fragment>
      ))}
    </>
  );
}

/**
 * Un texto con lugares para bajar de renglón dentro de las tiradas largas sin espacios: las listas de los defaults del
 * `.ini` (`ClientCommandFilter`, 90 letras), las rutas de la ayuda (`\Steam\steamapps\workshop\…`) y los nombres de
 * opción que la ayuda menciona (`AllowDestructionBySledgehammer`). En el celular salían de la hoja. Sólo se corta en una
 * tirada de más de 18 letras, y sólo después de un separador (`; , . / \ _`) o donde un nombre pasa a la palabra
 * siguiente (`Destruction|By`): nunca en medio de una palabra.
 */
export function SoftBreaks({ text }: { text: string }) {
  // Sin lookbehind (`(?<=[;,])`): un Safari viejo no lo entiende y el chunk entero no cargaría (ver `wordFit`).
  const marked = text.replace(/\S{19,}/g, (run) => run.replace(/([;,./\\_])(?=\S)/g, "$1\u0000").replace(/([a-z])(?=[A-Z])/g, "$1\u0000"));
  const parts = marked.split("\u0000");
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {p}
        </Fragment>
      ))}
    </>
  );
}

/**
 * Cuántas letras tiene el tramo más largo de una clave (`keyParts`, sin el punto): el CSS achica la clave sólo si ese
 * tramo no entra en su caja (`--pzsv-k`, ver `.pzsv-key`), como `wordFit` con los títulos.
 */
export const keyFit = (key: string): CSSProperties =>
  ({ "--pzsv-k": Math.max(...keyParts(key).map((p) => p.replace(/\.$/, "").length)) }) as CSSProperties;

/** Un valor para leer: la etiqueta del enum, sí/no, o el número o el texto tal cual. */
export function useShowValue() {
  const t = usePzServerCopy();
  const { lang } = useLang();
  return (opt: SandboxOption | IniOption, v: Value): string => {
    if (opt.type === "bool") return v ? t.yes : t.no;
    if (opt.type === "enum" && "values" in opt && opt.values) return opt.values[Number(v) - 1]?.[lang] ?? String(v);
    if (v === "") return t.emptyValue;
    return String(v);
  };
}

type Props = {
  kind: Kind;
  opt: SandboxOption | IniOption;
  value: Value;
  /** El texto del "Default" de la fila, ya armado (el valor del preset base, o el default del `.ini`). */
  baseText: string;
  changed: boolean;
  onSet: (kind: Kind, key: string, value: Value) => void;
  onReset: (kind: Kind, key: string) => void;
  /** Una nota nuestra junto a la opción (los cortes, el punto de aparición, lo que no viaja en el link). */
  note?: ReactNode;
};

function OptionRow({ kind, opt, value, baseText, changed, onSet, onReset, note }: Props) {
  const t = usePzServerCopy();
  const { lang } = useLang();
  const id = `pzsv-${kind}-${opt.key}`;
  const name = kind === "sandbox" ? (opt as SandboxOption).name[lang] : null;
  const tip = opt.tip?.[lang];
  return (
    <div className={`pzsv-row${changed ? " is-changed" : ""}`} data-key={opt.key}>
      <div className="pzsv-head">
        <label className="pzsv-label" htmlFor={id}>
          {name ? <span className="pzsv-name">{name}</span> : null}
          <code className={name ? "pzsv-key" : "pzsv-key is-name"} style={keyFit(opt.key)}>
            <KeyBreaks k={opt.key} />
          </code>
        </label>
        {changed && <b className="pzsv-mark">{t.changed}</b>}
      </div>
      <div className="pzsv-ctl">
        <Control id={id} kind={kind} opt={opt} value={value} onSet={onSet} />
      </div>
      {tip && (
        <p className="pzsv-tip">
          {tip.split("\n").map((line, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              <SoftBreaks text={line} />
            </Fragment>
          ))}
        </p>
      )}
      {note && <p className="pzsv-note">{note}</p>}
      <p className="pzsv-meta">
        <span>
          <SoftBreaks text={baseText} />
        </span>
        {changed && (
          <button type="button" className="pzsv-reset" onClick={() => onReset(kind, opt.key)}>
            {kind === "sandbox" ? t.resetSandbox : t.resetIni}
          </button>
        )}
      </p>
    </div>
  );
}

export default memo(OptionRow);

/**
 * El control de una opción. Los números y los textos guardan lo que vas escribiendo (`draft`) aparte del valor: así se
 * puede pasar por "-" o por "0." sin que la fila lo corrija a medio escribir. Un valor que el juego no aceptaría no se
 * guarda, y se dice por qué en texto, debajo.
 *
 * "El archivo se queda con el anterior" quiere decir el de antes de empezar a escribir (`before`, tomado al entrar al
 * campo): al tipear "300" en MaxPlayers, el "30" de en medio sí era válido y quedaba guardado (revisión del 2026-10-01).
 * Ahora, mientras lo escrito no valga, el archivo vuelve a `before`.
 */
function Control({ id, kind, opt, value, onSet }: { id: string; kind: Kind; opt: SandboxOption | IniOption; value: Value; onSet: Props["onSet"] }) {
  const t = usePzServerCopy();
  const { lang } = useLang();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<CoerceError | null>(null);
  const before = useRef<Value>(value);

  if (opt.type === "bool") {
    return (
      <label className="pzsv-check">
        <input id={id} type="checkbox" checked={!!value} onChange={(e) => onSet(kind, opt.key, e.target.checked)} />
        <span>{value ? t.yes : t.no}</span>
      </label>
    );
  }
  if (opt.type === "enum") {
    const count = "values" in opt && opt.values ? opt.values.length : (opt as IniOption).n ?? 0;
    const labels = "values" in opt ? opt.values : undefined;
    return (
      <select id={id} className="pzsv-select" value={String(value)} onChange={(e) => onSet(kind, opt.key, Number(e.target.value))}>
        {Array.from({ length: count }, (_, i) => (
          <option value={String(i + 1)} key={i}>
            {labels?.[i] ? labels[i][lang] : String(i + 1)}
          </option>
        ))}
      </select>
    );
  }
  const isNumber = opt.type === "int" || opt.type === "double";
  const shown = draft ?? String(value);
  const commit = (raw: string) => {
    setDraft(raw);
    const r = coerce(opt, raw);
    if (r.ok) {
      setError(null);
      onSet(kind, opt.key, r.value);
    } else {
      setError(r.reason);
      if (value !== before.current) onSet(kind, opt.key, before.current);
    }
  };
  const errorText =
    error === "range"
      ? t.invalid.range(String(opt.min), String(opt.max))
      : error === "enum"
        ? t.invalid.enum
        : error === "equals"
          ? t.invalid.equals
          : error === "type"
            ? t.invalid.type
            : // Un texto del `.ini` con `=` que llegó cargado de un archivo (Task 3): se conserva, pero se marca, porque el
              // servidor lo corta ahí.
              draft === null && !("name" in opt) && typeof value === "string" && value.includes("=")
              ? t.invalid.equalsLoaded(value.split("=")[0])
              : null;
  return (
    <>
      <input
        id={id}
        className={isNumber ? "pzsv-input is-number" : "pzsv-input"}
        type={isNumber ? "number" : "text"}
        inputMode={isNumber ? (opt.type === "int" ? "numeric" : "decimal") : undefined}
        min={isNumber ? opt.min : undefined}
        max={isNumber ? opt.max : undefined}
        step={opt.type === "int" ? 1 : opt.type === "double" ? "any" : undefined}
        value={shown}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={errorText ? true : undefined}
        aria-describedby={errorText ? `${id}-err` : undefined}
        onFocus={() => {
          before.current = value;
        }}
        onChange={(e) => commit(e.target.value)}
        // Al salir, lo escrito vuelve a ser el valor guardado (si no se pudo guardar, el anterior).
        onBlur={() => {
          setDraft(null);
          setError(null);
        }}
      />
      {errorText && (
        <span className="pzsv-error" id={`${id}-err`} role="status">
          {errorText}
        </span>
      )}
    </>
  );
}
