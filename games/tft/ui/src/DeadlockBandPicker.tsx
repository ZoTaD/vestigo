import { useCopy } from "./i18n";
import { BANDS, bandBadge, type BandId } from "./deadlockData";

/**
 * El selector de banda de Deadlock, compartido por sus pestañas.
 *
 * Vivía adentro de `Deadlock.tsx` hasta que la tier list de ítems necesitó el
 * mismo control. Extraerlo no es sólo evitar la copia: **el estado sube a
 * `App.tsx`**, así que elegir Arconte en la tier list de héroes y pasar a objetos
 * conserva la elección. Con un `useState` por página, cada pestaña volvía sola a
 * Fantasma+ y el visitante tenía que elegir dos veces lo mismo.
 *
 * Las cuatro bandas son pastillas en línea, todas visibles a la vez. Antes era
 * un botón para la publicada y un `<select>` para las otras tres: dos renglones
 * de alto y tres de las cuatro opciones escondidas detrás de un click.
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
    <div className="band-picker">
      <span className="band-label">{copy.deadlock.ranks.label}</span>
      {/* Las cuatro en línea, como pastillas. Antes eran un botón para la banda
          publicada y un `<select>` para las otras tres, que ocupaba dos
          renglones y escondía tres de las cuatro opciones detrás de un click.
          Siguen siendo botones de verdad, con `aria-pressed`, así que el
          teclado y el lector de pantalla no pierden nada. */}
      <div className="band-controls dl-band-pills" role="group" aria-label={copy.deadlock.ranks.filter}>
        {BANDS.map((b) => {
          const insignia = bandBadge(b.id);
          return (
            <button
              key={b.id}
              className="dl-band-pill"
              data-active={band === b.id}
              aria-pressed={band === b.id}
              onClick={() => onChange(b.id)}
            >
              {insignia.img && (
                // `.dl-band-badge` fuerza 1.4rem (26,6px con la raíz de 19px): el
                // atributo tiene que decir lo que el CSS de verdad dibuja.
                <img className="dl-band-badge" src={insignia.img} alt="" width={27} height={27} />
              )}
              {copy.deadlock.bands[b.id]}
            </button>
          );
        })}
      </div>
      <p className="detail-note band-note">{copy.deadlock.note}</p>
    </div>
  );
}
