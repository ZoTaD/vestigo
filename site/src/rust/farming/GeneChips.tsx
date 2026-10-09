/**
 * Los genes como los muestra el juego: una letra por casillero, verde si es bueno y rojo si es malo (tinte de fondo, sin
 * bordes de color). `GeneRow` dibuja los seis.
 */
import { POSITIVE, type Gene } from "./genetics";

export function GeneChip({ gene, dim }: { gene: Gene; dim?: boolean }) {
  return <span className={`rs-gene ${POSITIVE[gene] ? "is-good" : "is-bad"}${dim ? " is-dim" : ""}`}>{gene}</span>;
}

export function GeneRow({ genes, label }: { genes: string; label?: string }) {
  return (
    <span className="rs-genes" aria-label={label ?? genes} role="img">
      {[...genes].map((g, i) => (
        <GeneChip gene={g as Gene} key={i} />
      ))}
    </span>
  );
}
