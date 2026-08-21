/**
 * Los rangos de Deadlock, y cómo se agrupan para medir el meta.
 *
 * Deadlock tiene **12 rangos**, cada uno con seis subniveles. El juego los reporta
 * en un solo número por partida: `average_badge_team0/1`, que vale `rango*10 +
 * subnivel` — 116 es Eternus 6. Dividir por 10 da el rango, y es lo único que se
 * usa acá: el subnivel es más precisión de la que ninguna muestra sostiene.
 *
 * **La banda sale de la PARTIDA, no del jugador**, y esa es la diferencia grande
 * con TFT. Allá cada tablero traía el rango de su dueño; acá lo que hay es el
 * promedio del equipo, que es mejor dato para esto: describe el nivel de juego en
 * el que pasó la partida, que es justamente lo que hace que un consejo aplique o no.
 *
 * ---
 *
 * **Por qué agrupadas y no los 12 sueltos.** Doce opciones en un selector es una
 * decisión que nadie quiere tomar, y la muestra no lo pide: la banda más flaca de
 * abajo ya tiene ~69.000 partidas en quince días. El corte de arriba es Phantom
 * porque ahí empieza el juego "decente" (criterio de ZoTaD, 2026-07-29).
 *
 * Es la misma forma que las bandas de TFT (`games/tft/pipeline/src/bands.ts`):
 * cuatro cortes que parten la escalera sin solaparse, más una banda por defecto
 * que sí se solapa a propósito y **nunca clasifica a un jugador** — si lo hiciera,
 * "la banda de arriba" dejaría de estar definida.
 */

import { readFileSync } from "node:fs";
import { PROVISIONAL_MATCHES } from "./snapshot";

/**
 * Cuánta muestra necesita una banda para ser la que se ve sin elegir nada.
 *
 * Es `PROVISIONAL_MATCHES` y no un número propio: si una banda no alcanza para
 * publicarse sin la advertencia de muestra fina, tampoco alcanza para ser lo
 * primero que alguien ve.
 */
export const MIN_FOR_DEFAULT = PROVISIONAL_MATCHES;

/** Los 12 rangos, en orden. Los nombres son los que devuelve la API de assets. */
/**
 * Ojo: **Valve renombró los rangos 3 a 7 en el parche del 2026-07-30.** Antes
 * eran Alchemist, Arcanist, Ritualist, Emissary y Archon; ahora son Acolyte,
 * Sentinel, Mystic, Ritualist y Emissary — Archon dejó de existir y Ritualist y
 * Emissary se corrieron un escalón para arriba.
 *
 * Los **slugs de banda no se tocaron** (`archon-oracle`, `arcanist-below`): son
 * URLs indexadas y nombres de archivo, o sea identificadores. Lo que el jugador
 * lee sale de `i18n.ts` y sí se actualizó.
 */
export const RANKS = [
  "Obscurus",
  "Initiate",
  "Seeker",
  "Acolyte",
  "Sentinel",
  "Mystic",
  "Ritualist",
  "Emissary",
  "Oracle",
  "Phantom",
  "Ascendant",
  "Eternus",
] as const;

export type BandId = "phantom-above" | "archon-oracle" | "ritualist-emissary" | "arcanist-below";

export interface Band {
  id: BandId;
  /** Los rangos que cubre, por número (0 = Obscurus, 11 = Eternus). */
  tiers: number[];
}

/**
 * Cuatro bandas que parten la escalera entera, sin ninguna que se solape.
 *
 * **Acá NO hay banda agregada, y es la diferencia con TFT.** Allá `global` existe
 * porque el cerebro de coaching compara al jugador contra su banda y contra la de
 * arriba, y para que "la banda de arriba" esté definida hace falta una banda que
 * no clasifique a nadie. Deadlock todavía no tiene ese cerebro, así que una banda
 * de más sería un archivo más, una opción más en el selector y ninguna pregunta
 * contestada. El día que exista el coach, esto hay que volver a mirarlo.
 */
export const BANDS: Band[] = [
  { id: "phantom-above", tiers: [9, 10, 11] },
  { id: "archon-oracle", tiers: [7, 8] },
  { id: "ritualist-emissary", tiers: [5, 6] },
  { id: "arcanist-below", tiers: [0, 1, 2, 3, 4] },
];

/**
 * La banda que queremos por defecto: **Fantasma para arriba**, decisión de
 * ZoTaD. Es donde empieza el juego que vale la pena mirar, el equivalente del
 * "Platino+" de TFT — la vista que alguien ve sin elegir nada — sólo que acá esa
 * banda también es un escalón real de la escalera en vez de un agregado aparte.
 *
 * **Es la preferida, no la efectiva.** Cuál se publica sin sufijo lo decide
 * `defaultBandFor` mirando la muestra, porque una banda vacía por defecto es una
 * página vacía. Ver ahí por qué hizo falta.
 */
export const PREFERRED_BAND: BandId = "phantom-above";

/**
 * A dónde cae el defecto cuando la banda preferida no tiene con qué.
 *
 * **Archon/Oráculo, y hoy no es una preferencia sino el techo del juego.** El
 * soft reset del 2026-07-30 topeó la colocación en **Oráculo 6**: medido sobre
 * las primeras 16 horas de cola rankeada, el badge máximo de una partida fue 86
 * u 87 en todas y cada una de esas horas, y Fantasma+ dio **cero partidas en
 * todas**. No hay nada arriba de esta banda hasta que la gente escale.
 */
export const FALLBACK_BAND: BandId = "archon-oracle";

/**
 * Qué banda se publica sin sufijo, o sea cuál se ve sin elegir nada.
 *
 * **Gana la más alta de la escalera que ya tiene con qué medir**, no la de más
 * muestra a secas. El corte es el mismo `PROVISIONAL_MATCHES` que decide si una
 * banda sale marcada como provisional, y es el mismo número a propósito: una
 * banda que no alcanza para publicarse sin advertencia tampoco alcanza para ser
 * lo primero que alguien ve.
 *
 * **Bug real, visto en producción el 2026-08-04**: la versión anterior elegía
 * la de más muestra entre las cuatro apenas Fantasma+ se quedaba corto, y eso
 * casi siempre termina en `arcanist-below` — cubre cinco rangos contra los dos
 * de `archon-oracle`, así que por población bruta le gana aunque las dos
 * sobren de sobra el corte (33.537 contra 32.324 esa corrida). El sitio quedó
 * publicando "Arcanista y abajo" por defecto en vez de "Oráculo y arriba", que
 * es el techo real del juego hoy (ver `FALLBACK_BAND`). Recorrer la escalera en
 * orden y quedarse con la primera que llega es lo que hace que ese defecto
 * signifique algo otra vez.
 *
 * Sólo cuando **ninguna** banda llega al corte se cae al criterio viejo (la de
 * más muestra, o `FALLBACK_BAND` si no hay ninguna con partidas): ahí no hay
 * una banda "buena" que perder, así que tiene sentido mostrar la que más tiene
 * de dónde medir.
 *
 * Esto se revisa en **cada corrida**, así que el día que Fantasma+ junte muestra
 * vuelve a ser el defecto solo, sin deploy de por medio.
 */
export function defaultBandFor(matches: Partial<Record<BandId, number>>): BandId {
  const calificada = EXCLUSIVE.find((b) => (matches[b.id] ?? 0) >= MIN_FOR_DEFAULT);
  if (calificada) return calificada.id;
  const conMuestra = EXCLUSIVE.filter((b) => (matches[b.id] ?? 0) > 0);
  if (conMuestra.length === 0) return FALLBACK_BAND;
  return conMuestra.reduce((a, b) => ((matches[b.id] ?? 0) > (matches[a.id] ?? 0) ? b : a)).id;
}

/** Las bandas que parten la escalera: un jugador pertenece a exactamente una. */
export const EXCLUSIVE: Band[] = BANDS;

/** El rango de un badge crudo (`rango*10 + subnivel`), o null si no hay dato. */
export function tierOfBadge(badge: number | null | undefined): number | null {
  if (badge === null || badge === undefined) return null;
  const tier = Math.floor(badge / 10);
  return tier >= 0 && tier < RANKS.length ? tier : null;
}

/** A qué banda exclusiva pertenece un rango, o null si el rango no existe. */
export function bandForTier(tier: number): BandId | null {
  return EXCLUSIVE.find((b) => b.tiers.includes(tier))?.id ?? null;
}

/**
 * Qué banda eligió la última corrida de `build:heroes`, leída de lo que escribió.
 *
 * **`build:items` y `build:builds` no vuelven a decidir: obedecen.** Los tres
 * archivos sin sufijo tienen que abrir en la misma banda o la pestaña de ítems
 * diría otra cosa que la de héroes sin que nada lo explique, y la tarjeta de
 * build mediría un nivel de juego distinto del que la tier list dice mostrar.
 *
 * El dato sale de `heroes.json` y no de un archivo de marca aparte, por lo mismo
 * de siempre: una segunda verdad se desincroniza de la primera. El orden en el
 * workflow ya es héroes → ítems → builds, que es el que esto necesita.
 */
/**
 * La banda con MÁS muestra de las cuatro, para lo que se calibra y no se opina.
 *
 * **La usa el informe de partida, y no la banda por defecto.** La tier list
 * elige su banda por criterio editorial —Fantasma+ es "donde empieza el juego
 * decente"— y eso está bien para decir quién es S. Pero la nota de una partida
 * es una **calibración**: compara tu desempeño contra una distribución, y esa
 * distribución mejora con más datos, no con datos más selectos.
 *
 * **Lo que costó descubrirlo, el 2026-08-16**: al arreglar la ventana, Fantasma+
 * cruzó el umbral y pasó a ser la banda por defecto, llevándose el informe de
 * 84.857 partidas a 8.232. Con esa muestra los ocho cortes por tramo de duración
 * dejaron de moverse parejo entre tramos, y **el mismo rendimiento empezó a dar
 * B en una partida corta y B− en una larga** — justo la propiedad que el tramo
 * de duración existe para garantizar. Lo agarró un test que ya estaba.
 *
 * Lee los cuatro archivos publicados; si falta alguno, esa banda no compite.
 */
export function widestBand(dir = "../data"): BandId {
  let mejor: BandId = FALLBACK_BAND;
  let max = -1;
  for (const b of BANDS) {
    try {
      const j = JSON.parse(readFileSync(bandPath(`${dir}/heroes.json`, b.id), "utf8")) as {
        matches?: number;
      };
      if (typeof j.matches === "number" && j.matches > max) {
        max = j.matches;
        mejor = b.id;
      }
    } catch {
      // Una banda sin archivo no compite. No es un error: el pipeline publica
      // las cuatro, pero una corrida a medias no debería tirar por esto.
    }
  }
  return mejor;
}

export function publishedDefaultBand(path = "../data/heroes.json"): BandId {
  const { band } = JSON.parse(readFileSync(path, "utf8")) as { band?: string };
  const conocida = EXCLUSIVE.find((b) => b.id === band);
  if (!conocida) {
    throw new Error(
      `${path} no dice a qué banda pertenece ("${band}"). Corré \`npm run build:heroes\` antes que esto.`
    );
  }
  return conocida.id;
}

/**
 * El nombre del archivo de una banda. **Siempre lleva sufijo.**
 *
 * Antes la banda por defecto conservaba el nombre llano y las otras tres llevaban
 * sufijo. Con el defecto decidido por la muestra eso no se sostiene: el archivo
 * sin sufijo cambiaría de banda entre corridas, `heroes.phantom-above.json`
 * aparecería y desaparecería, y **Vite necesita que las rutas de `import()`
 * existan en tiempo de build** — una que se evapora rompe la compilación, no la
 * página.
 *
 * Así que se escriben las cuatro con sufijo y **además** una copia sin sufijo de
 * la que toque ser el defecto (ver `writeBands`). Cuesta 6 KB de héroes y 15 de
 * ítems duplicados por corrida, que es nada al lado de una ruta de import que
 * puede no existir.
 */
export function bandPath(path: string, band: BandId): string {
  const dot = path.lastIndexOf(".");
  return `${path.slice(0, dot)}.${band}${path.slice(dot)}`;
}
