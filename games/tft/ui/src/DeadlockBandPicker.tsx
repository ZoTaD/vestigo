import { useCopy } from "./i18n";
import { BANDS, bandBadge, type BandId } from "./deadlockData";

/**
 * El selector de banda de Deadlock, como **control segmentado** (`.seg`).
 *
 * Las cuatro bandas en una fila, con su insignia; en móvil, dos filas de dos
 * (`is-wrap`). Son botones de verdad con `aria-pressed`, así que teclado y
 * lector de pantalla no pierden nada. La nota "cada banda se mide con sus
 * propias partidas" ya no cuelga de acá: va en la bajada plegable de la
 * cabecera de sección, que es donde vive lo que explica y no lo que controla.
 */
export default function DeadlockBandPicker({
  band,
  onChange,
}: {
  band: BandId;
  onChange: (band: BandId) => void;
}) {
  const copy = useCopy();

  return (
    <div className="seg is-wrap" role="group" aria-label={copy.deadlock.ranks.filter}>
      {BANDS.map((b) => {
        const insignia = bandBadge(b.id);
        return (
          <button
            key={b.id}
            type="button"
            data-active={band === b.id}
            aria-pressed={band === b.id}
            onClick={() => onChange(b.id)}
          >
            {insignia.img && <img src={insignia.img} alt="" width={20} height={20} />}
            {copy.deadlock.bands[b.id]}
          </button>
        );
      })}
    </div>
  );
}
