import { useEffect, useState } from "react";
import { catalog } from "./deadlockData";
import { text, type Localized } from "./catalog";
import type { Lang } from "./i18n";
import { type Items, type ReportFile } from "./deadlockAdvice";

/**
 * La capa de datos del informe de partida.
 *
 * **`report.json` no viaja en el bundle**, igual que las builds y por el mismo
 * motivo: nadie aterriza en una partida sin hacer clic, así que se baja en ese
 * clic y no lo paga el que entra a la tier list. Son 181 KB.
 *
 * La partida en sí no pasa por acá: la trae `deadlockMatch.ts` directamente de
 * deadlock-api. Acá vive lo que medimos nosotros.
 */

interface FullCatalog {
  items: Record<string, { name: Localized; img: string; cost: number; slot: string; upgradesTo?: number[] }>;
  heroes: Record<string, { name: Localized; img: string }>;
  ranks: { tier: number; name: Localized; img: string; subranks: string[]; color: string }[];
}

const full = catalog as unknown as FullCatalog;

/** Lo que el motor necesita del catálogo, sin nombres ni imágenes. */
export const items: Items = new Map(
  Object.entries(full.items).map(([id, v]) => [
    Number(id),
    { cost: v.cost, slot: v.slot, upgradesTo: v.upgradesTo },
  ])
);

export const heroImg = (heroId: number): string | null => full.heroes[String(heroId)]?.img ?? null;
export const heroName = (heroId: number): Localized | null => full.heroes[String(heroId)]?.name ?? null;
export const itemOf = (itemId: number) => full.items[String(itemId)] ?? null;

/** El numeral de cada subnivel. Indexado por el subnivel, así que el 0 no se usa. */
export const ROMAN = ["", "I", "II", "III", "IV", "V", "VI"] as const;

/**
 * Dónde va el numeral dentro de la insignia, y qué forma tiene el lienzo.
 *
 * **Los dos datos están MEDIDOS, no estimados**: se restó la insignia lisa
 * (`rankNN_lg`) de la que el juego publica ya compuesta con el numeral
 * (`/v1/assets/ranks/{rango}/4/image`) y se tomó el centro de lo que cambia.
 * El script quedó en el scratchpad de la sesión (`diamond.mjs`) y se puede
 * volver a correr si el juego rehace el arte.
 *
 * **Un solo número no sirve**: el numeral se apoya en la placa de cada insignia,
 * y esa placa está entre el 72,8% (Acólito) y el 92,6% (Fantasma) del alto. Con
 * un valor fijo, la mitad de los rangos quedan con el numeral flotando fuera de
 * su placa. En horizontal sí es siempre el centro (49,3-50,1%).
 *
 * **Se guarda la BASE del numeral, no su centro.** El nuestro se dibuja 2,5
 * veces más grande que el del juego —el suyo mide 3px sobre una insignia de
 * 34— así que centrarlo donde el juego centra el suyo lo hace colgar por debajo
 * de la insignia. Apoyado en la misma línea queda bien a cualquier tamaño, y
 * cambiar la tipografía o el cuerpo no obliga a re-medir la tabla.
 *
 * **El lienzo tampoco es uno solo**: los rangos 0-8 miden 404 × 324 y los 9-11
 * miden 512 × 404. Son 1,247 contra 1,267 de proporción — poco, pero es lo que
 * hace que el alto medido se pueda aplicar como porcentaje sin corregir nada.
 */
const RANK_ART: Record<number, { ratio: number; subBase: number }> = {
  0: { ratio: 404 / 324, subBase: 0.772 },
  1: { ratio: 404 / 324, subBase: 0.772 },
  2: { ratio: 404 / 324, subBase: 0.806 },
  3: { ratio: 404 / 324, subBase: 0.728 },
  4: { ratio: 404 / 324, subBase: 0.744 },
  5: { ratio: 404 / 324, subBase: 0.784 },
  6: { ratio: 404 / 324, subBase: 0.744 },
  7: { ratio: 404 / 324, subBase: 0.796 },
  8: { ratio: 404 / 324, subBase: 0.787 },
  9: { ratio: 512 / 404, subBase: 0.926 },
  10: { ratio: 512 / 404, subBase: 0.921 },
  11: { ratio: 512 / 404, subBase: 0.921 },
};

/**
 * La insignia de un badge del juego (`rango*10 + subnivel`).
 *
 * **`img` es la insignia LISA del rango y el numeral lo dibujamos nosotros
 * encima, como texto** (ver `RankBadge`). Es lo que hace Statlocker, verificado
 * en su HTML: usan `rankNN_lg.webp` y le montan un `<span>` con el numeral.
 *
 * La alternativa era la insignia que el juego publica ya compuesta en
 * `/v1/assets/ranks/{rango}/{subnivel}/image`, y **se probó y se descartó por
 * dos motivos medidos**: su numeral ocupa el 8-10% del alto —a 34px de insignia
 * son 3px, invisible— y pesa 138-205 KB contra 14-85 de la lisa, con una imagen
 * distinta por subnivel en vez de doce para todo el sitio. Un perfil con
 * historial de ascensos pasaba de 335 KB a 934.
 *
 * **El campo `mark` se borró el 2026-08-13 y no debe volver.** Traía esa URL
 * compuesta con nombre de "numeral suelto", herencia de cuando `small_subrankN`
 * era un dibujo de 5-11 KB con sólo el numeral. Hoy la API apunta
 * `small_subrankN` y `large_subrankN` **a la misma imagen compuesta**, y los tres
 * lugares que la dibujaban a 18-22 px estaban metiendo la insignia entera dentro
 * de un cuadradito: al lado de "ETERNUS" se veía un borrón que repetía la
 * insignia grande de al lado, no un "IV".
 *
 * De paso cae la advertencia vieja de que el subnivel 6 "no es un VI sino una
 * estrella": eso valía para aquel dibujo suelto. El juego escribe **VI** en la
 * placa de su propia insignia compuesta, verificado imagen por imagen, así que
 * escribirlo nosotros no inventa nada.
 *
 * **`sub` es el número e `img` es una URL.** El campo se llamaba `sub` y devolvía
 * una URL, y eso llegó a producción imprimiendo *"Emissary
 * https://api.deadlock-api.com/v1/assets/ranks/7/4/image?format=webp"* debajo del
 * avatar. Si algún día se agrega otro campo de imagen acá, que su nombre lo diga.
 */
export function rankOf(badge: number): {
  name: Localized;
  img: string;
  sub: number;
  /** El numeral ya resuelto, para no repetir el índice en cada pantalla. */
  roman: string;
  /** Ancho/alto del arte de ESE rango: no todos comparten lienzo. */
  ratio: number;
  /** Dónde se apoya el numeral, en fracción del alto de la insignia. */
  subBase: number;
  color: string;
} | null {
  if (!badge || badge <= 0) return null;
  const crudo = Math.floor(badge / 10);
  /**
   * **Arriba del último rango publicado no hay otro rango: hay el mismo rango.**
   *
   * El badge no se detiene en Eternus VI (116): sigue a 121, 122, 123. No es un
   * rango nuevo —`assets/ranks` devuelve doce entradas en v1, en v2 y en la
   * versión más nueva del cliente, y `rank12_lg` da 404— sino el contador
   * interno que ordena la cima de la escalera. El juego lo llama Eternus igual:
   * `player_rank_initial_display_rank`, que es el rango que MUESTRA, vale 111
   * para todos los que pasan de 111, mientras que abajo muestra el badge exacto.
   *
   * **Sin este tope, `rankOf` devolvía `null`** y el perfil del #1 del mundo
   * anunciaba "todavía sin partidas rankeadas" arriba de sus 104 clasificatorias,
   * con la columna de rango vacía en las 104 filas. El `null` significaba dos
   * cosas —"no tiene rango" y "no sé nombrar este rango"— y quien lo leía se
   * quedaba con la primera. Hoy sólo significa la primera.
   */
  const tier = Math.min(crudo, TOP_TIER);
  // El numeral se cae con el tope: quien pasó los seis subniveles no está en
  // ninguno de ellos, y escribir "Eternus III" sobre un badge de 123 sería
  // inventarle un escalón que ya dejó atrás.
  const sub = crudo > TOP_TIER ? 0 : badge % 10;
  const r = full.ranks.find((x) => x.tier === tier);
  if (!r) return null;
  const art = RANK_ART[tier] ?? RANK_ART[0];
  return {
    name: r.name,
    img: r.img,
    sub,
    roman: ROMAN[sub] ?? "",
    ratio: art.ratio,
    subBase: art.subBase,
    color: r.color,
  };
}

/**
 * El último rango que el juego publica, **leído del catálogo y no escrito acá**.
 *
 * Es lo que hace que el tope de `rankOf` se deshaga solo: el día que Valve
 * agregue un escalón de verdad, la corrida del catálogo lo trae y esta constante
 * lo sigue sin que haya que tocar código.
 */
const TOP_TIER = Math.max(...full.ranks.map((x) => x.tier));

/**
 * El nombre del rango como se lee: "Eternus III", o "Eternus" a secas.
 *
 * **Existe porque el numeral no siempre está**, y cinco pantallas interpolaban
 * `${nombre} ${sub}` a mano: con el tope de `rankOf` eso imprimía "Eternus 0"
 * justo en el perfil del mejor jugador del mundo.
 */
export function rankLabel(r: { name: Localized; roman: string; sub: number }, lang: Lang): string {
  const nombre = text(r.name, lang, "");
  const numeral = r.roman || (r.sub > 0 ? String(r.sub) : "");
  return numeral ? `${nombre} ${numeral}` : nombre;
}

let file: ReportFile | null = null;
let pidiendo: Promise<void> | null = null;

export function loadReport(): Promise<void> {
  if (file) return Promise.resolve();
  pidiendo ??= import("@deadlock/report.json").then((m) => {
    file = m.default as unknown as ReportFile;
  });
  return pidiendo;
}

export const report = (): ReportFile | null => file;

/**
 * Espera a que el archivo esté y devuelve si ya se puede dibujar.
 *
 * Devuelve `false` mientras baja y **también si falla**: el informe sin la
 * referencia no es un informe a medias, es una lista de compras. La página
 * prefiere decir que no pudo.
 */
export function useReport(): { ready: boolean; failed: boolean } {
  const [estado, setEstado] = useState<{ ready: boolean; failed: boolean }>({
    ready: file !== null,
    failed: false,
  });
  useEffect(() => {
    let vivo = true;
    loadReport().then(
      () => vivo && setEstado({ ready: true, failed: false }),
      () => vivo && setEstado({ ready: false, failed: true })
    );
    return () => {
      vivo = false;
    };
  }, []);
  return estado;
}
