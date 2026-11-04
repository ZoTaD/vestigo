import type { CSSProperties } from "react";
import type { Hint, PoolEntry, Revealed, Row, Value } from "./api";
import { useCopy } from "../deadlockCopy";
import { useLocale } from "../i18n";
import { DLE_COLUMNS, DLE_HINT_AT, type DleMode } from "./modes";
import DleSearch from "./DleSearch";
import DleResult from "./DleResult";

/**
 * El tablero de un modo, sin estado propio: pistas, buscador, resultado y las
 * filas (la última arriba). `DleGame` le pasa todo; así el prerender y los tests
 * lo dibujan sin red.
 */
export interface BoardProps {
  mode: DleMode;
  number: number | null;
  rows: Row[];
  hints: Hint[];
  solved: boolean;
  answer?: Revealed;
  /** Mensaje de error ya traducido, o null. */
  error: string | null;
  busy: boolean;
  pool: PoolEntry[];
  signedIn: boolean;
  onGuess: (name: string) => void;
}

export function formatValue(key: string, v: Value, locale: string): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "number") {
    if (key === "winRate") return `${v.toFixed(1)}%`;
    if (key === "cooldown") return `${v}s`;
    return v.toLocaleString(locale);
  }
  return v;
}

export default function DleBoard(p: BoardProps) {
  const c = useCopy().deadlock.dle;
  const locale = useLocale();
  const cols = DLE_COLUMNS[p.mode];
  const tried = new Set(p.rows.map((r) => r.guess.id));
  const label = (key: string) => (p.mode === "items" && key === "slot" ? c.itemSlot : c.cols[key] ?? key);

  return (
    <section className="dle-board" aria-live="polite">
      <div className="dle-ask">
        <h2>{c.ask[p.mode]}</h2>
        <span>{c.guesses(p.rows.length)}</span>
      </div>

      <ol className="dle-hints">
        {c.hints[p.mode].map((name, i) => {
          const hint = p.hints[i];
          return (
            <li key={name} className={hint ? "is-open box" : undefined}>
              <span className="dle-hint-ic" aria-hidden="true">
                {hint?.kind === "img" ? (
                  <img
                    // Sin cuenta, el Worker no sabe cuántos intentos lleva la partida: se los dice la página.
                    src={p.signedIn ? hint.src : `${hint.src}&n=${p.rows.length}`}
                    alt=""
                    width={40}
                    height={40}
                    className={hint.blur ? "is-blur" : undefined}
                  />
                ) : (
                  DLE_HINT_AT[i]
                )}
              </span>
              <span>
                <b>{hint ? c.hintOpen : c.hintIn(Math.max(1, DLE_HINT_AT[i] - p.rows.length))}</b>
                {hint?.kind === "text" ? hint.text : name}
              </span>
            </li>
          );
        })}
      </ol>

      {p.solved && p.answer ? (
        <DleResult mode={p.mode} number={p.number} rows={p.rows} answer={p.answer} signedIn={p.signedIn} />
      ) : (
        <DleSearch entries={p.pool} tried={tried} placeholder={c.placeholder[p.mode]} button={c.guess} onPick={p.onGuess} />
      )}
      {p.error && (
        <p className="dle-error" role="alert">
          {p.error}
        </p>
      )}

      <div className="dle-grid" style={{ "--cols": cols.length } as CSSProperties}>
          <div className="dle-th">{c.first[p.mode]}</div>
          {cols.map((k) => (
            <div className="dle-th" key={k}>
              {label(k)}
            </div>
          ))}
          {p.rows.map((r) => (
            <div className="dle-row" key={r.guess.id}>
              <div className="dle-who">
                <img src={r.guess.img} alt="" width={140} height={82} loading="lazy" decoding="async" className={p.mode === "heroes" ? undefined : "is-icon"} />
                <span>{r.guess.name}</span>
              </div>
              {r.cells.map((cell) => (
                <div className={`dle-c is-${cell.mark}${Array.isArray(cell.value) ? " is-list" : ""}`} key={cell.key} data-label={label(cell.key)}>
                  <span>{formatValue(cell.key, cell.value, locale)}</span>
                  {cell.dir && <small aria-label={cell.dir === "up" ? "higher" : "lower"}>{cell.dir === "up" ? "▲" : "▼"}</small>}
                </div>
              ))}
            </div>
          ))}
      </div>
      <p className="dle-legend">{c.legend}</p>
    </section>
  );
}
