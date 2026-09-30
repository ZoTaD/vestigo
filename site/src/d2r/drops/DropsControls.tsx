/**
 * Los controles de la calculadora (2026-09-29): a la vista sólo los cuatro que
 * cambian casi todo (hallazgo mágico, jugadores, dificultad y Zona de Terror);
 * el resto va en "Más opciones".
 */
import { useState } from "react";
import { useD2rCopy } from "../../d2rCopy";
import { Chips } from "../ui";
import { dropData } from "./data";
import NumField from "./NumField";
import type { DropsState, Mode } from "./state";
import type { Diff } from "./types";

const upTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export default function DropsControls({ st, set, mode }: { st: DropsState; set: (p: Partial<DropsState>) => void; mode: Mode }) {
  const td = useD2rCopy().drops;
  // El Heraldo sólo aparece en las Zonas de Terror de Infierno: el selector de su nivel se ve cuando eso puede pasar.
  // "¿Dónde lo farmeo?" mira su propia dificultad ("Todas" incluye Infierno); los otros modos, la del lugar.
  const hell = mode === "farm" ? st.diff === -1 || st.diff === 2 : st.pdiff === 2;
  // Hasta qué nivel llega el Heraldo lo dicen los datos del juego (5 desde RotW; 0 sería que no hay Heraldos).
  const maxTier = dropData().tz.maxTier;
  const herald = st.tz > 0 && hell && maxTier > 0;
  // "Más opciones" viene abierta si el enlace ya trae algo de adentro (si no, quien lo recibe no ve por qué cambian los números).
  // Se decide una sola vez, al armar el componente: después la abre y la cierra quien la use.
  const [extraOpen] = useState(() => st.party > 1 || st.ladder || st.quest || (herald && st.tier > 1));
  return (
    <div className="d2-dr-controls">
      <NumField label={td.mf} value={st.mf} min={0} max={9999} onChange={(mf) => set({ mf })} />
      <label className="d2-dr-field">
        <span>{td.players}</span>
        <select
          value={st.players}
          onChange={(e) => {
            const players = Number(e.target.value);
            set({ players, party: Math.min(st.party, players) });
          }}
        >
          {upTo(8).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {mode === "farm" && (
        <Chips<number>
          label={td.diff}
          value={st.diff}
          onChange={(diff) => set({ diff: diff as -1 | Diff })}
          options={[{ value: -1, label: td.allDiffs }, ...td.diffs.map((label, i) => ({ value: i, label }))]}
        />
      )}
      <label className="d2-check">
        <input type="checkbox" checked={st.tz > 0} onChange={(e) => set({ tz: e.target.checked ? 90 : 0 })} />
        {td.tz}
      </label>
      {st.tz > 0 && <NumField label={td.tzLevel} value={st.tz} min={1} max={99} onChange={(tz) => set({ tz })} />}
      <details className="d2-dr-extra" open={extraOpen}>
        <summary>{td.more}</summary>
        <div className="d2-dr-extra-in">
          <label className="d2-dr-field">
            <span>{td.party}</span>
            <select value={st.party} onChange={(e) => set({ party: Number(e.target.value) })}>
              {upTo(st.players).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {herald && (
            <label className="d2-dr-field">
              <span>{td.herald}</span>
              <select value={st.tier} onChange={(e) => set({ tier: Number(e.target.value) })}>
                {upTo(maxTier).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="d2-check">
            <input type="checkbox" checked={st.ladder} onChange={(e) => set({ ladder: e.target.checked })} />
            {td.ladder}
          </label>
          <label className="d2-check">
            <input type="checkbox" checked={st.quest} onChange={(e) => set({ quest: e.target.checked })} />
            {td.quest}
          </label>
        </div>
      </details>
    </div>
  );
}
