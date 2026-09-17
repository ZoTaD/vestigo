/**
 * Cuándo salió cada parche de Deadlock.
 *
 * **Esto no está en las partidas.** Lo primero que probé fue `game_mode_version`,
 * que suena a lo que uno quiere: tiene dos valores y los dos abarcan el período
 * entero, así que no marca nada. El dato vive en el changelog oficial del foro,
 * que deadlock-api republica en `/v1/patches` — el mismo feed que lee un jugador.
 *
 * **Por qué importa tanto.** Medido el 2026-07-29 sobre el parche del día
 * anterior: seis héroes se movieron 2 o más puntos de winrate, y Mirage y Haze
 * casi cinco. Una ventana de quince días a caballo de un parche promedia dos
 * juegos distintos y publica un número que no describe a ninguno — el día que lo
 * medí, el sitio decía que Haze ganaba el 53,7% cuando hacía un día jugaba al
 * 49,1%.
 */

const PATCHES_URL = "https://api.deadlock-api.com/v1/patches";

export interface Patch {
  /** Cuándo se publicó, ISO 8601 UTC. */
  date: string;
  title: string;
  link: string;
}

interface RawPatch {
  title?: string;
  pub_date?: string;
  link?: string;
}

/**
 * Los parches, del más nuevo al más viejo.
 *
 * Se ordena por `pub_date` y NO por el título, aunque el título lleve una fecha:
 * el del 2026-07-28 se llama "06-30-2026 Update". El título es la fecha de la
 * build y lo que nos importa es cuándo llegó a los jugadores.
 */
export function sortPatches(raw: RawPatch[]): Patch[] {
  return raw
    .filter((p): p is RawPatch & { pub_date: string } => typeof p.pub_date === "string" && p.pub_date !== "")
    .map((p) => ({ date: p.pub_date, title: p.title ?? "", link: p.link ?? "" }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Baja la lista de parches. Tira si no contesta: sin ella el corte sería a ciegas. */
export async function fetchPatches(url: string = PATCHES_URL): Promise<Patch[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`la API de parches contestó ${res.status}`);
  const parches = sortPatches((await res.json()) as RawPatch[]);
  if (parches.length === 0) {
    throw new Error("la API de parches contestó una lista vacía o sin fechas usables.");
  }
  return parches;
}

/**
 * Las dos ventanas que se comparan: desde el último parche, y el tramo
 * equivalente de antes.
 *
 * `before` es **los mismos días que dura `after`, contados hacia atrás desde el
 * parche**, y no "todo el parche anterior". Dos motivos: un parche anterior de
 * 46 días contra uno de un día compara un promedio asentado contra un estreno, y
 * además obligaría a leer el doble de particiones. Al arrancar parejos, lo único
 * que difiere es la confianza, y de eso ya avisa `provisional`.
 *
 * **`after` termina SIEMPRE en `now` y se topea por el arranque, no por el
 * final.** El tope existe porque "un parche que lleva dos meses vivo ya no
 * necesita más muestra y sí necesita ser reciente" — pero durante semanas hizo
 * lo contrario: devolvía `[parche, parche + maxDays]`, o sea **los primeros 15
 * días del parche, que son los más VIEJOS**, y se congelaba ahí.
 *
 * Lo que costó, medido el 2026-08-16: con el parche del 28/7 la tier list medía
 * hasta el **12/8** y llevaba cuatro días sin moverse, sumando uno por día. Las
 * partidas existían —el snapshot iba 2,5 h atrasado— y las tirábamos. Nadie lo
 * notó porque la ventana sólo se congela **después** del día 15, cuando ya nadie
 * está mirando el estreno del parche.
 *
 * Con el arranque topado, la ventana son los últimos `maxDays` días **sin cruzar
 * el parche**: recién salido mide desde el parche hasta ahora, y a las tres
 * semanas mide los últimos quince, todos posteriores al parche.
 */
/**
 * La ventana que mide la tier list, y **cuándo corta en el parche**.
 *
 * Hasta el 2026-09-17 cortaba siempre: el día que salía un parche la lista
 * arrancaba de cero, con cientos de partidas en vez de miles, y Fantasma+
 * tardaba una semana en volver a ser la banda por defecto. ZoTaD lo vio con el
 * parche del 16/9 (313 partidas a la mañana) y decidió la regla de acá:
 *
 * - **Los últimos `maxDays` días, sin cortar**, mientras el parche nuevo no
 *   junte `minMatches` partidas. La lista sigue llena y el parche entra de a
 *   poco; un héroe nerfeado baja a medida que se juega.
 * - **Corta en el parche** en cuanto las partidas posteriores llegan al piso:
 *   desde ahí la ventana es la de siempre, los últimos `maxDays` días sin
 *   cruzarlo.
 *
 * El "desde el parche" (`patchWindows`) queda como dato aparte: es la señal
 * rápida, y se muestra al lado de la lista, no adentro de ella.
 *
 * Es la misma regla que `builds.ts` ya aplicaba a las builds, ahora compartida.
 */
export function measureWindow(
  patchDate: string,
  now: Date,
  maxDays: number,
  postPatchMatches: number,
  minMatches: number
): { from: string; to: string; sincePatch: boolean; crossesPatch: boolean } {
  const patch = new Date(patchDate).getTime();
  const wideFrom = now.getTime() - maxDays * 86_400_000;
  const sincePatch = postPatchMatches >= minMatches;
  const from = sincePatch ? Math.max(patch, wideFrom) : wideFrom;
  return {
    from: new Date(from).toISOString(),
    to: now.toISOString(),
    sincePatch,
    // Cruza si el parche cae adentro de la ventana y no se cortó en él. Un
    // parche más viejo que la ventana no la cruza aunque no haya cortado.
    crossesPatch: !sincePatch && patch > wideFrom && patch < now.getTime(),
  };
}

export function patchWindows(
  patchDate: string,
  now: Date,
  maxDays: number
): { after: { from: string; to: string }; before: { from: string; to: string } } {
  const patch = new Date(patchDate);
  const dias = Math.min(maxDays, Math.max(1, (now.getTime() - patch.getTime()) / 86_400_000));
  const ms = dias * 86_400_000;
  return {
    after: {
      from: new Date(Math.max(patch.getTime(), now.getTime() - ms)).toISOString(),
      to: now.toISOString(),
    },
    before: { from: new Date(patch.getTime() - ms).toISOString(), to: patch.toISOString() },
  };
}
