import { useEffect, useState } from "react";
import { GUIDE_DEFAULT_HEIGHT, encodeGuide, type GuideCategory } from "./deadlockBuildGuide";
import { encodeBuild } from "./deadlockBuilder";

/**
 * Los mejores de cada héroe y sus builds (2026-10-30), de
 * `games/deadlock/pipeline/src/topPlayers.ts`. Baja por `import()` con la
 * pestaña que lo usa (la escalera y la ficha), nunca con el JS de entrada.
 */

/** [account_id, partidas, victorias] en la ventana. */
export type PlayerPoint = [number, number, number];

export interface TopBuild {
  id: number;
  name: string;
  author: number;
  players: number;
  matches: number;
  wins: number;
  categories: { name: string; items: number[] }[];
}

export interface TopPlayersFile {
  generatedAt: string;
  from: string;
  to: string;
  buildsFrom: number;
  heroes: Record<string, { players: PlayerPoint[]; builds: TopBuild[] }>;
}

/**
 * Las categorías que la build no renombró traen la clave del juego
 * (`#Citadel_HeroBuilds_EarlyGame`). Se traducen las conocidas y el resto se
 * parte en palabras.
 */
const CATEGORIAS: Record<string, { en: string; es: string }> = {
  EarlyGame: { en: "Early game", es: "Inicio" },
  MidGame: { en: "Mid game", es: "Mitad" },
  LateGame: { en: "Late game", es: "Final" },
  Early: { en: "Early", es: "Inicio" },
  Mid: { en: "Mid", es: "Mitad" },
  Late: { en: "Late", es: "Final" },
  Lane: { en: "Laning", es: "Línea" },
};

export function categoryName(name: string, lang: "en" | "es"): string {
  const m = /^#Citadel_HeroBuilds_(\w+)$/i.exec(name.trim());
  if (!m) return name;
  const clave = Object.keys(CATEGORIAS).find((k) => k.toLowerCase() === m[1].toLowerCase());
  return clave ? CATEGORIAS[clave][lang] : m[1].replace(/([a-z])([A-Z])/g, "$1 $2");
}

let archivo: TopPlayersFile | null | undefined;
let pidiendo: Promise<void> | null = null;

export function useTopPlayers(): TopPlayersFile | null | undefined {
  const [, set] = useState(0);
  useEffect(() => {
    if (archivo !== undefined) return;
    let vivo = true;
    pidiendo ??= import("@deadlock/top-players.json")
      .then((m) => {
        archivo = m.default as unknown as TopPlayersFile;
      })
      .catch(() => {
        archivo = null;
      });
    pidiendo.then(() => vivo && set((n) => n + 1));
    return () => {
      vivo = false;
    };
  }, []);
  return archivo;
}

/**
 * Los nombres de Steam, en vivo y en un solo pedido, como el podio de la
 * escalera: el archivo publicado guarda cuentas, no nombres, porque un nombre
 * cambia y el del archivo envejecería.
 */
export function useSteamNames(ids: number[]): Map<number, string> {
  const [nombres, setNombres] = useState<Map<number, string>>(new Map());
  const clave = ids.join(",");
  useEffect(() => {
    if (!clave) return;
    let vivo = true;
    const q = clave
      .split(",")
      .map((id) => `account_ids=${id}`)
      .join("&");
    fetch(`https://api.deadlock-api.com/v1/players/steam?${q}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { account_id: number; personaname?: string }[]) => {
        if (!vivo) return;
        setNombres(new Map(rows.filter((r) => r.personaname).map((r) => [r.account_id, r.personaname!])));
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [clave]);
  return nombres;
}

/**
 * La dirección del Armador de builds con la build cargada: las categorías van
 * a la guía (`g`) y los primeros 12 objetos distintos a la barra (`b`).
 */
export function builderLink(base: string, heroId: number, build: TopBuild, nombre: (n: string) => string = (n) => n): string {
  const guia: GuideCategory[] = build.categories.map((c, i) => ({
    id: `t${i}`,
    name: nombre(c.name),
    desc: "",
    width: 12,
    height: GUIDE_DEFAULT_HEIGHT,
    items: c.items,
  }));
  const barra = [...new Set(build.categories.flatMap((c) => c.items))].slice(0, 12);
  const q = new URLSearchParams({ b: encodeBuild(heroId, barra), g: encodeGuide(guia) });
  return `${base}?${q}`;
}
