import type { CSSProperties } from "react";
import { useLang } from "./i18n";
import { rankLabel, rankOf } from "./deadlockReportData";

/**
 * La insignia de un rango de Deadlock, **con el numeral del subnivel encima**.
 *
 * Es el arte liso del rango (`rankNN_lg`) y un numeral romano dibujado como
 * texto sobre la placa de la insignia. **Es lo que hace Statlocker**, verificado
 * en su HTML el 2026-08-13: `<img src="rank10_lg.webp">` más un `<span>` con la
 * "I" encima. Por qué no se usa la insignia compuesta que publica el juego —que
 * ya trae el numeral— está en `rankOf`: el suyo mide 3px a nuestro tamaño y pesa
 * el triple.
 *
 * **El numeral se dibuja grande a propósito.** El del juego ocupa el 8-10% del
 * alto; éste va al 40% del ancho, que sobre una insignia de 34px son 17. La
 * insignia contesta "qué rango" de un vistazo por su forma y su color, y el
 * numeral contesta "cuál de los seis" — si hay que acercarse para leerlo, no
 * contesta nada.
 *
 * **Blanco con contorno oscuro, no el oro del tema.** Las doce insignias van del
 * marrón al dorado brillante, y un numeral dorado sobre Eternus desaparece. El
 * contorno de cuatro sombras es lo que lo hace legible sobre cualquiera de las
 * doce; el color del rango queda en el resplandor, que sí acompaña sin competir.
 */
export default function RankBadge({
  badge,
  height,
  className,
  title,
  eager,
}: {
  /** El badge del juego: `rango*10 + subnivel`. Sin rango no se dibuja nada. */
  badge: number;
  /** El alto en px. El ancho sale de la proporción del arte de ese rango. */
  height: number;
  className?: string;
  /** Qué decir al pasar el mouse. Por defecto, el nombre del rango y su subnivel. */
  title?: string;
  /** La del perfil se ve de entrada; las de la lista esperan a acercarse. */
  eager?: boolean;
}) {
  const { lang } = useLang();
  const r = rankOf(badge);
  if (!r) return null;

  const nombre = rankLabel(r, lang);
  const width = Math.round(height * r.ratio);

  return (
    <span
      className={`dl-badge${className ? ` ${className}` : ""}`}
      style={
        {
          /**
           * **El tamaño va como variable y no como `width`/`height` en línea.**
           * Un estilo en línea le gana a cualquier regla del CSS, y el teléfono
           * necesita achicar esta insignia: con `width` en línea, la media query
           * sólo podría pelearla con `!important`. Así el alto se pisa en un
           * lugar y el ancho lo sigue solo.
           */
          "--dl-badge-h": `${height}px`,
          "--dl-badge-ratio": r.ratio.toFixed(4),
          // Cada rango tiene su placa a distinta altura: el valor está medido
          // contra la insignia compuesta del juego. Ver `RANK_ART` en `rankOf`.
          "--dl-badge-base": `${(r.subBase * 100).toFixed(1)}%`,
          "--dl-badge-glow": r.color || "#000",
        } as CSSProperties
      }
      title={title ?? nombre}
    >
      <img src={r.img} alt={nombre} width={width} height={height} loading={eager ? undefined : "lazy"} />
      {/* `aria-hidden` porque el `alt` de la imagen ya dice "Eternus IV": sin
          esto un lector de pantalla leería el numeral dos veces. */}
      {r.roman && (
        <b className="dl-badge-sub" aria-hidden="true">
          {r.roman}
        </b>
      )}
    </span>
  );
}
