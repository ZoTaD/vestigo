import { useEffect, useState } from "react";
import { catalog } from "./deadlockData";
import { ROMAN } from "./deadlockReportData";
import { text } from "./catalog";
import type { Lang } from "./i18n";

/**
 * La capa de datos de la escalera de rangos.
 *
 * **`ranks.json` es el único archivo de Deadlock que no va por banda**, y no es
 * una excepción caprichosa: la escalera *es* el eje sobre el que se definen las
 * bandas. Preguntar "¿cuánta gente hay en cada rango, dentro de Oráculo?" no
 * significa nada, así que esta pestaña tampoco recibe el selector de banda.
 *
 * Se baja con `import()` y no con import estático, igual que las builds: nadie
 * aterriza acá sin hacer clic, y el bundle lo paga todo el que entra al sitio.
 */

export interface SideRow {
  /** −1 en el global; 0..11 en los rangos. */
  tier: number;
  matches: number;
  /** Winrate del lado 0, en 0..1. */
  team0: number;
  /** Error estándar, en la misma escala. */
  se: number;
}

export interface RankDay {
  day: string;
  /** Indexados por rango, 0 = Obscurus … 11 = Eternus. */
  matches: number[];
  players: number[];
}

/** Un escalón real: rango **y** subnivel. */
export interface RankBin {
  badge: number;
  tier: number;
  /** 1 a 6. */
  sub: number;
  matches: number;
  players: number;
}

export interface RanksFile {
  generatedAt: string;
  from: string;
  to: string;
  coverage: number;
  accounts: { seen: number; ranked: number };
  days: RankDay[];
  totals: { matches: number[]; players: number[] };
  bins: RankBin[];
  sides: SideRow[];
  sidesOverall: SideRow;
}

/** Las dos preguntas que contesta la escalera. Son un toggle, no dos gráficos. */
export type RankView = "matches" | "players";

/**
 * Cuánta cobertura hace falta para que el cartel de calibración se apague.
 *
 * **No es 100% y no puede serlo**: siempre va a haber cuentas nuevas sin
 * calibrar, así que exigir el total dejaría el cartel puesto para siempre y
 * dejaría de significar algo. A partir del 90% el sesgo de "los que calibraron
 * primero son los que más juegan" ya no cambia la forma de la escalera lo
 * suficiente como para tener que avisarlo.
 *
 * Se apaga **solo**, sin deploy de por medio, igual que el cartel de banda
 * provisional.
 */
export const COVERAGE_ENOUGH = 0.9;

export const showsCalibrationNotice = (coverage: number): boolean => coverage < COVERAGE_ENOUGH;

export interface HistColumn {
  badge: number;
  tier: number;
  sub: number;
  /** "Oráculo 4", ya resuelto al idioma. */
  label: string;
  color: string;
  value: number;
  /** Alto de la columna contra el escalón más poblado, 0..1. */
  share: number;
  /**
   * El numeral del subrango, **escrito y no descargado**.
   *
   * Antes acá venía una URL, con esta regla: *"no se escribe el romano a mano
   * porque el sexto subrango no es un VI sino una estrella de seis puntas"*. Eso
   * valía para el dibujito suelto de 5-11 KB que el juego publicaba entonces y
   * **hoy no existe**: `small_subrankN` y `large_subrankN` apuntan a la misma
   * imagen, que es la insignia entera del rango con el numeral en el rombo, y
   * ahí el sexto **sí dice VI** (verificado imagen por imagen el 2026-08-13).
   *
   * Mientras la regla vieja siguió en pie, este histograma bajaba **61 insignias
   * compuestas de 45 KB — 2,7 MB— para dibujar marcas de 19 px** en las que no
   * se distingue nada. El numeral como texto cuesta cero bytes y se lee.
   */
  mark: string;
}

export interface HistGroup {
  tier: number;
  name: string;
  img: string;
  color: string;
  /** Cuántas columnas abarca. Es lo que alinea el eje con el gráfico. */
  span: number;
  value: number;
}

export interface Histogram {
  columns: HistColumn[];
  groups: HistGroup[];
  /** El escalón más poblado, que es la escala del eje vertical. */
  max: number;
  total: number;
}

/**
 * La distribución como histograma, con su eje de rangos.
 *
 * **Doce barras no son una distribución; cincuenta y cuatro sí.** Agregado por
 * rango, el gráfico eran doce valores y había que leerlos de a uno; por subrango
 * aparece la forma —dónde se amontona la gente, dónde el techo corta de golpe— y
 * eso se ve de un vistazo sin leer un número.
 *
 * **Las columnas y el eje son dos filas flex con el mismo total.** Cada columna
 * pesa 1 y cada grupo del eje pesa cuantas columnas abarque (`span`), así que la
 * insignia de cada rango cae exactamente debajo de sus escalones sin que nada
 * mida nada. Un eje posicionado por píxeles se desalinearía con el zoom del
 * navegador, que es justo lo que este sitio quiere que funcione.
 */
export function histogram(file: RanksFile, view: RankView, lang: Lang): Histogram {
  const valor = (b: RankBin) => (view === "players" ? b.players : b.matches);
  const columns: HistColumn[] = [];
  const groups: HistGroup[] = [];
  const max = Math.max(1, ...file.bins.map(valor));

  for (const bin of file.bins) {
    const rank = catalog.ranks.find((r) => r.tier === bin.tier);
    const name = text(rank?.name, lang, String(bin.tier));
    const color = rank?.color ?? "";
    columns.push({
      badge: bin.badge,
      tier: bin.tier,
      sub: bin.sub,
      label: `${name} ${bin.sub}`,
      color,
      value: valor(bin),
      share: valor(bin) / max,
      mark: ROMAN[bin.sub] ?? "",
    });

    const ultimo = groups[groups.length - 1];
    if (ultimo && ultimo.tier === bin.tier) {
      ultimo.span += 1;
      ultimo.value += valor(bin);
    } else {
      groups.push({ tier: bin.tier, name, img: rank?.img ?? "", color, span: 1, value: valor(bin) });
    }
  }

  return { columns, groups, max, total: columns.reduce((a, c) => a + c.value, 0) };
}

export interface DaySegment {
  tier: number;
  color: string;
  name: string;
  value: number;
  /** Fracción del día, 0..1. */
  share: number;
}

export interface DayRow {
  day: string;
  total: number;
  segments: DaySegment[];
  /** Cuánto mide la barra del día contra el día más grande, 0..1. */
  scale: number;
}

/**
 * La serie diaria, como una barra apilada por día.
 *
 * **Cada día se normaliza a su propio total y la barra entera se escala contra el
 * día más grande.** Así se leen las dos cosas a la vez: el reparto entre rangos
 * (dentro de la barra) y cuánto se jugó ese día (el largo de la barra). Un
 * apilado sin escalar mostraría los tres días iguales aunque el primero tenga
 * una décima parte de las partidas.
 */
export function dayRows(file: RanksFile, view: RankView, lang: Lang): DayRow[] {
  const totales = file.days.map((d) => d[view].reduce((a, b) => a + b, 0));
  const mayor = Math.max(1, ...totales);

  return file.days.map((d, i) => {
    const total = totales[i];
    const segments: DaySegment[] = [];
    d[view].forEach((value, tier) => {
      if (value <= 0) return;
      const rank = catalog.ranks.find((r) => r.tier === tier);
      segments.push({
        tier,
        color: rank?.color ?? "",
        name: text(rank?.name, lang, String(tier)),
        value,
        share: total > 0 ? value / total : 0,
      });
    });
    return { day: d.day, total, segments, scale: total / mayor };
  });
}

/**
 * El winrate de un lado leído como "cuánto se despega del 50%".
 *
 * Devuelve `null` cuando el intervalo de dos errores estándar incluye al 50%: la
 * cifra sigue en pantalla, pero **no se afirma que un lado gane**. Es la misma
 * regla que el resto del sitio: que un número tenga señal no alcanza, tiene que
 * poder sostenerse.
 */
export function leansTo(row: SideRow): "team0" | "team1" | null {
  const brecha = row.team0 - 0.5;
  if (Math.abs(brecha) <= 2 * row.se) return null;
  return brecha > 0 ? "team0" : "team1";
}

/** El archivo, o null mientras se está bajando. */
export function useRanks(): RanksFile | null {
  const [file, setFile] = useState<RanksFile | null>(null);

  useEffect(() => {
    let alive = true;
    import("@deadlock/ranks.json")
      .then((m) => {
        if (alive) setFile(m.default as unknown as RanksFile);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return file;
}
