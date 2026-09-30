import type { CSSProperties, ReactNode } from "react";
import SectionHead from "./SectionHead";
import { useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import type { BandId } from "./deadlockData";
import comebacksJson from "@deadlock/comebacks.json";

/**
 * Remontadas (2026-09-30): cuánto vale ir adelante o atrás en almas.
 *
 * La pregunta que más se repite en los foros de Deadlock —"si perdés la línea,
 * ¿perdiste?"— y que nadie contestaba con números. Una grilla minuto × ventaja
 * de almas con el % de victorias de los equipos que estaban así, por banda de
 * rango, y arriba tres titulares que la resumen. Los datos salen del pipeline
 * (`npm run build:comebacks`).
 */

interface Cell {
  n: number;
  wins: number;
}

interface WindowCells {
  from: string;
  to: string;
  matches: number;
  bands: Record<string, { matches: number; cells: Cell[][] }>;
}

interface ComebacksFile {
  compare?: { patch: string; date: string; before: WindowCells; after: WindowCells };
  from: string;
  to: string;
  matches: number;
  minutes: number[];
  edges: number[];
  bands: Record<string, { matches: number; cells: Cell[][] }>;
}

const DATA = comebacksJson as unknown as ComebacksFile;
/** Menos lados de partida que esto y la casilla no se pinta: el % bailaría. */
const MIN_CELL = 200;

/** Rojo tinta (0 %) → papel (50 %) → verde tinta (100 %). */
function heat(p: number): string {
  const rojo = [178, 38, 28];
  const papel = [239, 227, 198];
  const verde = [47, 122, 31];
  const [a, b, t] = p < 0.5 ? [rojo, papel, p / 0.5] : [papel, verde, (p - 0.5) / 0.5];
  const mix = a.map((x, i) => Math.round(x + (b[i] - x) * t));
  return `rgb(${mix.join(", ")})`;
}

export default function DeadlockComebacks({ band, picker }: { band: BandId; picker: ReactNode }) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.deadlock.comebacks;
  const datos = DATA.bands[band] ?? DATA.bands.all;
  const E = DATA.edges;

  const pctDe = (cell: Cell | undefined) => (cell && cell.n >= MIN_CELL ? cell.wins / cell.n : null);
  const fmtPct = (p: number) => `${Math.round(p * 100).toLocaleString(locale)} %`;
  const fmtEdge = (e: number) => `${Math.round(Math.abs(e) * 100)} %`;
  /** El tramo sin signo: el lado (abajo / arriba) lo dice la fila de arriba. */
  const tramo = (j: number) => {
    if (j === 0) return `> ${fmtEdge(E[0])}`;
    if (j === E.length) return `> ${fmtEdge(E[E.length - 1])}`;
    const [a, b] = [Math.abs(E[j - 1]), Math.abs(E[j])].sort((x, y) => x - y);
    return E[j - 1] < 0 && E[j] > 0 ? `± ${fmtEdge(b)}` : `${Math.round(a * 100)}–${fmtEdge(b)}`;
  };
  const medio = E.findIndex((e) => e > 0);
  const lado = (j: number) => (j < medio ? c.behind : j > medio ? c.ahead : c.even).toLowerCase();

  // Los tres titulares: sumar tramos es sumar partidas y victorias.
  const celda = (minute: number, tramos: number[]): number | null => {
    const i = DATA.minutes.indexOf(minute);
    if (i < 0) return null;
    const suma = tramos.reduce((s, j) => ({ n: s.n + datos.cells[i][j].n, wins: s.wins + datos.cells[i][j].wins }), { n: 0, wins: 0 });
    return pctDe(suma);
  };
  const t20 = celda(20, [2]);
  const hondo = celda(20, [0, 1]);
  const temprano = celda(9, [2]);
  const unoDe = (p: number) => c.oneIn(Math.max(1, Math.round(1 / p)));

  return (
    <main className="deadlock deadlock-comebacks">
      <SectionHead
        eyebrow={copy.deadlock.eyebrow}
        title={c.title}
        accent={c.titleBreak}
        lead={c.lead}
        controls={picker}
        meta={<span className="dl-meta-line">{c.sample(datos.matches.toLocaleString(locale), DATA.from, DATA.to)}</span>}
      />

      <div className="page">
        <ul className="dl-cb-heads">
          {t20 !== null && (
            <li className="cartel-papel" data-tone="bad">
              <strong>{unoDe(t20)}</strong>
              <span>{c.headline(20, fmtEdge(E[2]), fmtEdge(E[1]), fmtPct(t20))}</span>
            </li>
          )}
          {hondo !== null && (
            <li className="cartel-papel" data-tone="worst">
              <strong>{fmtPct(hondo)}</strong>
              <span>{c.headlineDeep(20, fmtEdge(E[1]))}</span>
            </li>
          )}
          {temprano !== null && (
            <li className="cartel-papel" data-tone="hope">
              <strong>{fmtPct(temprano)}</strong>
              <span>{c.headlineEarly(9, fmtEdge(E[2]), fmtEdge(E[1]))}</span>
            </li>
          )}
        </ul>

        {DATA.compare && <Comparacion band={band} />}

        <section className="box dl-cb-board">
          <div className="box-head">
            <h2 className="box-title">{c.boardTitle}</h2>
            <p className="box-lead">{c.boardLead}</p>
          </div>
          <div className="dl-cb-scroll">
            <table className="dl-cb-grid">
              <thead>
                <tr className="dl-cb-sides">
                  <th />
                  <th colSpan={medio}>← {c.behind}</th>
                  <th>{c.even}</th>
                  <th colSpan={E.length - medio}>{c.ahead} →</th>
                </tr>
                <tr>
                  <th scope="col">{c.minute}</th>
                  {Array.from({ length: E.length + 1 }, (_, j) => (
                    <th key={j} scope="col">
                      {tramo(j)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DATA.minutes.map((m, i) => (
                  <tr key={m}>
                    <th scope="row">{m}′</th>
                    {datos.cells[i].map((cell, j) => {
                      const p = pctDe(cell);
                      return (
                        <td
                          key={j}
                          data-thin={p === null || undefined}
                          style={p === null ? undefined : ({ "--heat": heat(p), "--ink": p < 0.2 || p > 0.8 ? "#f4e8d2" : "#1e1a14" } as CSSProperties)}
                          title={p === null ? c.thin : c.cell(m, j === medio ? c.even.toLowerCase() : `${tramo(j)} ${lado(j)}`, fmtPct(p), cell.n.toLocaleString(locale))}
                        >
                          {p === null ? "—" : Math.round(p * 100)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="dl-cb-read">{c.read}</p>
        </section>
      </div>
    </main>
  );
}

/** El antes y el después del parche que recortó las remontadas, al minuto 20. */
function Comparacion({ band }: { band: BandId }) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.deadlock.comebacks.compare;
  const cmp = DATA.compare!;
  const i = DATA.minutes.indexOf(20);
  if (i < 0) return null;
  const celdas = (w: WindowCells) => (w.bands[band] ?? w.bands.all).cells[i];
  const suma = (cs: Cell[], tramos: number[]) =>
    tramos.reduce((s, j) => ({ n: s.n + cs[j].n, wins: s.wins + cs[j].wins }), { n: 0, wins: 0 });
  const total = (cs: Cell[]) => cs.reduce((s, x) => s + x.n, 0);
  const ult = DATA.edges.length;
  const filas = [
    // Los dos lados de una partida despareja caen en tramos lejos del medio.
    { label: c.lopsided, f: (cs: Cell[]) => suma(cs, [0, 1, 2, ult - 2, ult - 1, ult]).n / Math.max(1, total(cs)), bueno: -1 },
    { label: c.back10, f: (cs: Cell[]) => { const x = suma(cs, [2]); return x.n ? x.wins / x.n : NaN; }, bueno: 1 },
    { label: c.back20, f: (cs: Cell[]) => { const x = suma(cs, [0, 1]); return x.n ? x.wins / x.n : NaN; }, bueno: 1 },
  ];
  const antes = celdas(cmp.before);
  const despues = celdas(cmp.after);
  const pct = (p: number) => `${(p * 100).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;
  const dias = Math.round((Date.parse(cmp.after.to) - Date.parse(cmp.after.from)) / 86_400_000);
  const fecha = new Date(cmp.date + "T12:00:00Z").toLocaleDateString(locale, { day: "numeric", month: "long" });

  return (
    <section className="box dl-cb-compare">
      <div className="box-head">
        <h2 className="box-title">{c.title}</h2>
        <p className="box-lead">{c.lead(fecha, dias)}</p>
      </div>
      <table className="dl-cb-cmp">
        <thead>
          <tr>
            <th />
            <th scope="col">{c.before}</th>
            <th aria-hidden="true" />
            <th scope="col">{c.after}</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const a = f.f(antes);
            const b = f.f(despues);
            const dir = Math.abs(b - a) < 0.005 ? "flat" : (b - a) * f.bueno > 0 ? "good" : "bad";
            return (
              <tr key={f.label}>
                <th scope="row">{f.label}</th>
                <td>{Number.isFinite(a) ? pct(a) : "—"}</td>
                <td className="dl-cb-arrow" data-dir={dir} aria-hidden="true">
                  →
                </td>
                <td data-dir={dir}>{Number.isFinite(b) ? pct(b) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
