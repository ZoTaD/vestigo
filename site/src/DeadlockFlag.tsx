import { useState } from "react";
import { flagUrl } from "./flags";

/**
 * La bandera del país como IMAGEN, no como emoji.
 *
 * **El emoji se probó el 2026-08-12 y se sacó**: se arma con indicadores
 * regionales y Windows no trae fuente para eso, así que en pantalla salían "US"
 * y "GB" sueltos, sin caja y sin alineación — se leía como un error de
 * codificación. Una imagen se ve igual en todos lados.
 *
 * Si la imagen no llega, queda el código de dos letras.
 */
export default function Flag({ code }: { code?: string | null }) {
  const [falló, setFalló] = useState(false);
  if (!code || code.length !== 2) return null;
  const cc = code.toLowerCase();
  if (falló) return <span className="dl-flag-code">{code.toUpperCase()}</span>;
  return (
    <img
      className="dl-flag"
      src={flagUrl(cc)}
      srcSet={`${flagUrl(cc, "64x48")} 2x`}
      alt={code.toUpperCase()}
      title={code.toUpperCase()}
      width={20}
      height={15}
      loading="lazy"
      decoding="async"
      onError={() => setFalló(true)}
    />
  );
}
