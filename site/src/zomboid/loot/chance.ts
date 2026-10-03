/**
 * Cómo se lee una chance de botín en la ficha de un objeto (2026-10-01): como porcentaje y como palabra ("poco común").
 * El número solo no dice mucho a quien no conoce la escala del juego (un 3,9 % en una cocina es bastante, porque hay
 * miles), y la palabra sola no deja comparar dos lugares: van las dos. Las bandas son fijas para todo el sitio, así
 * "raro" quiere decir lo mismo en cualquier ficha.
 */

export type Band = "veryCommon" | "common" | "uncommon" | "rare" | "veryRare";

/** La palabra de una chance (de 0 a 1): de un cuarto para arriba es muy común; debajo del medio por ciento, muy raro. */
export function band(p: number): Band {
  return p >= 0.25 ? "veryCommon" : p >= 0.1 ? "common" : p >= 0.03 ? "uncommon" : p >= 0.005 ? "rare" : "veryRare";
}

/**
 * "3,9 %", "34 %", "< 0,1 %": un decimal debajo del 10 %, ninguno arriba. Debajo del 0,1 % el número redondeado diría
 * "0 %", que se lee como "nunca": ahí va "< 0,1 %".
 *
 * El signo va a mano y no con `style: "percent"`: para es-AR el estándar (CLDR) lo pega al número ("3,9%"), y el sitio
 * en español lo escribe separado ("50 %", como Deadlock y Valheim). Separado con un espacio duro, así el número y su
 * signo nunca quedan en renglones distintos. En inglés, pegado ("34%").
 */
export function pct(p: number, locale: string): string {
  const fmt = (v: number) => {
    const n = new Intl.NumberFormat(locale, { maximumFractionDigits: v < 0.1 ? 1 : 0 }).format(v * 100);
    return locale.startsWith("es") ? `${n} %` : `${n}%`;
  };
  return p > 0 && p < 0.001 ? `< ${fmt(0.001)}` : fmt(p);
}
