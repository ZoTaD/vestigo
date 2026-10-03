/**
 * Cómo escribe los números cada idioma en Project Zomboid (2026-10-02, salió de `stats.ts`): suelto y sin datos, porque
 * lo usan también los renglones de "Qué cambió" de todas las fichas, que no tienen por qué cargar las stats de Objetos.
 */

/** Cómo escribe los números cada idioma: coma decimal en español, hasta dos decimales, el menos tipográfico. */
export function numbers(locale: string) {
  const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const signed = new Intl.NumberFormat(locale, { maximumFractionDigits: 2, signDisplay: "exceptZero" });
  // El signo va a mano y no con `style: "percent"`: para es-AR el estándar lo pega al número ("20%"), y el sitio en
  // español lo escribe separado ("20 %"), con espacio duro, igual que "Dónde aparece" (`loot/chance.ts`).
  const pctNum = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const pct = { format: (x: number) => `${pctNum.format(x * 100)}${locale.startsWith("es") ? " %" : "%"}` };
  const num = (x: number) => fmt.format(x).replace("-", "−");
  return {
    num,
    signed: (x: number) => signed.format(x).replace("-", "−"),
    /** De una fracción del juego (0,35) a un porcentaje. */
    frac: (x: number) => pct.format(x),
    /** De un valor que el juego ya da en porcentaje (20) a "20 %". */
    pct: (x: number) => pct.format(x / 100),
    range: (a: number, b: number) => (a === b ? num(a) : `${num(a)}–${num(b)}`),
    mult: (x: number) => `×${num(x)}`,
  };
}
