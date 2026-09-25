import { useEffect, useState } from "react";

/**
 * En qué héroes el jugador entra al top del mundo.
 *
 * **No cuesta un pedido a deadlock-api.** El archivo lo publica nuestro pipeline
 * (`build:ladder`) con el top 100 de cada héroe: 38 KB para 3.800 puestos.
 * Contestar esto en vivo obligaría a bajar las 38 tablas y buscarse en cada una
 * — 38 pedidos por cada perfil que alguien abra.
 *
 * Se carga con `import()` dinámico y **sólo cuando hay un perfil abierto**: quien
 * entra a la tier list no paga estos 38 KB.
 */

export interface HeroLadderFile {
  generatedAt: string;
  since: number;
  minMatches: number;
  worldMinMatches: number;
  /** El ranking del mundo entero. La posición es el puesto. */
  world: number[];
  /** Por héroe, los `account_id` en orden de mérito. La posición es el puesto. */
  heroes: Record<string, number[]>;
}

/** El puesto mundial de una cuenta, y sobre cuánta gente. */
export interface WorldStanding {
  place: number;
  of: number;
  minMatches: number;
}

/** Un puesto del jugador en la tabla de un héroe. */
export interface HeroPlacing {
  heroId: number;
  /** 1 es el mejor del mundo. */
  place: number;
}

let file: HeroLadderFile | null = null;
let pidiendo: Promise<void> | null = null;

function load(): Promise<void> {
  if (file) return Promise.resolve();
  pidiendo ??= import("@deadlock/heroLadder.json")
    .then((m) => {
      file = m.default as unknown as HeroLadderFile;
    })
    .catch(() => {
      // Sin el archivo, el perfil se dibuja sin medallas. Es un adorno con
      // información, no la razón por la que alguien abrió la página.
    });
  return pidiendo;
}

/**
 * Dónde entra una cuenta, héroe por héroe, de mejor puesto a peor.
 *
 * Recorre las 38 listas de 100: 3.800 comparaciones de enteros, que en la
 * práctica es instantáneo y evita publicar el índice invertido —que estaría
 * indexado por cuenta y pesaría cientos de miles de entradas—.
 */
export function placingsOf(accountId: number): HeroPlacing[] {
  if (!file) return [];
  const out: HeroPlacing[] = [];
  for (const [heroId, ids] of Object.entries(file.heroes)) {
    const i = ids.indexOf(accountId);
    if (i >= 0) out.push({ heroId: Number(heroId), place: i + 1 });
  }
  return out.sort((a, b) => a.place - b.place);
}

/**
 * El puesto de una cuenta en el mundo.
 *
 * `null` cuando no llega al piso de partidas clasificatorias — que no es lo
 * mismo que ser malo: es no haber jugado lo suficiente para que el número
 * signifique algo. El piso viaja en el resultado para que la página pueda
 * decirlo en vez de callarse.
 */
export function worldStandingOf(accountId: number): WorldStanding | null {
  if (!file) return null;
  const i = file.world.indexOf(accountId);
  if (i < 0) return null;
  return { place: i + 1, of: file.world.length, minMatches: file.worldMinMatches };
}

/** Carga el archivo y devuelve los puestos de esa cuenta cuando esté. */
export function useHeroPlacings(accountId: number | null): {
  placings: HeroPlacing[];
  world: WorldStanding | null;
} {
  const [estado, setEstado] = useState<{
    placings: HeroPlacing[];
    world: WorldStanding | null;
  }>({ placings: [], world: null });

  useEffect(() => {
    if (accountId === null) {
      setEstado({ placings: [], world: null });
      return;
    }
    let vivo = true;
    load().then(() => {
      if (vivo) {
        setEstado({ placings: placingsOf(accountId), world: worldStandingOf(accountId) });
      }
    });
    return () => {
      vivo = false;
    };
  }, [accountId]);

  return estado;
}

/**
 * El metal de un puesto.
 *
 * Sólo los tres primeros tienen metal; del cuarto al centésimo el número va en
 * blanco. Es la decisión de ZoTaD y es la correcta: si todo brilla, nada
 * brilla, y un top 100 no es un podio.
 */
export function metalOf(place: number): "gold" | "silver" | "bronze" | null {
  if (place === 1) return "gold";
  if (place === 2) return "silver";
  if (place === 3) return "bronze";
  return null;
}
