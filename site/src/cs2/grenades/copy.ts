/**
 * Los textos de la pestaña Granadas de CS2 (2026-11-04). Viajan con la pestaña y no en `cs2Copy.ts`, que entra en la
 * cáscara de la sección; ahí quedan sólo el nombre de la pestaña, su SEO y la tarjeta de la portada.
 */
import { useLang } from "../../i18n";
import type { GrenadeType, Side, Tech } from "./data";

export interface GrCopy {
  h1: (map: string) => string;
  hubH1: string;
  lede: string;
  hubLede: string;
  count: (n: number) => string;
  side: Record<Side, string>;
  sideLong: Record<Side, string>;
  type: Record<GrenadeType, string>;
  typePlural: Record<GrenadeType, string>;
  tech: Record<Tech, string>;
  sideLbl: string;
  typeLbl: string;
  throwLbl: string;
  noJump: string;
  names: string;
  floor: [string, string];
  legendCount: string;
  dests: string;
  destsLede: (side: string) => string;
  ways: (n: number) => string;
  nothing: string;
  aim: string;
  copySetpos: string;
  copied: string;
  setposHint: string;
  practice: string;
  practiceLede: string;
  copyPractice: string;
  back: string;
  from: (v: string) => string;
  radarLabel: (map: string) => string;
  pinLabel: (name: string, n: number) => string;
  credit: string;
  notFound: string;
  allMaps: string;
}

const EN: GrCopy = {
  h1: (m) => `${m} grenade lineups`,
  hubH1: "Grenade lineups",
  lede: "Tap a spot on the radar to see every way to throw a grenade there. Each lineup tells you where to stand, where to aim, how to throw it and the command to practice it.",
  hubLede: "Smokes, molotovs and flashes for every Active Duty map, on the real radar: where to stand, where to aim and how to throw.",
  count: (n) => `${n} lineup${n === 1 ? "" : "s"}`,
  side: { t: "T", ct: "CT" },
  sideLong: { t: "Attack", ct: "Defend" },
  type: { smoke: "Smoke", molotov: "Molotov", flash: "Flash", he: "HE grenade" },
  typePlural: { smoke: "Smokes", molotov: "Molotovs", flash: "Flashes", he: "HE grenades" },
  tech: { stand: "Standing", walk: "Walking", run: "Running", crouch: "Crouching", jump: "Jumpthrow", left: "Left click", right: "Right click", both: "Both buttons" },
  sideLbl: "Side",
  typeLbl: "Grenade",
  throwLbl: "Throw",
  noJump: "No jumpthrow",
  names: "Spot names",
  floor: ["Upper", "Lower"],
  legendCount: "The number is how many ways there are to get there.",
  dests: "Where to throw",
  destsLede: (s) => `Every spot with a lineup on the ${s} side. Or tap one on the radar.`,
  ways: (n) => (n === 1 ? "One way to get there" : `${n} ways to get there`),
  nothing: "Nothing with these filters. Turn on more grenades or switch sides.",
  aim: "How to throw it",
  copySetpos: "Copy setpos",
  copied: "Copied",
  setposHint: "With sv_cheats 1, paste it in the console to stand exactly there, looking where you have to aim.",
  practice: "Practice in game",
  practiceLede: "Start a private match, open the console and paste this: infinite grenades, the trajectory preview and no time limit.",
  copyPractice: "Copy practice commands",
  back: "All maps",
  from: (v) => `from ${v}`,
  radarLabel: (m) => `${m} radar with every grenade destination`,
  pinLabel: (n, k) => `${n}: ${k} lineup${k === 1 ? "" : "s"}`,
  credit: "Lineups: CS2-annotations by ReneRebsdorf and contributors (MIT). Radars and map data: awpy-data (MIT). Maps are trademarks of Valve.",
  notFound: "There are no lineups for that map yet.",
  allMaps: "Maps",
};

const ES: GrCopy = {
  h1: (m) => `Granadas de ${m}`,
  hubH1: "Granadas",
  lede: "Tocá un punto del radar para ver todas las formas de tirar una granada ahí. Cada lineup trae dónde pararte, adónde apuntar, cómo tirarla y el comando para practicarla.",
  hubLede: "Humos, molotovs y flashes de todos los mapas del Active Duty, sobre el radar real: dónde pararte, adónde apuntar y cómo tirar.",
  count: (n) => `${n} lineup${n === 1 ? "" : "s"}`,
  side: { t: "T", ct: "CT" },
  sideLong: { t: "Atacan", ct: "Defienden" },
  type: { smoke: "Humo", molotov: "Molotov", flash: "Flash", he: "Granada" },
  typePlural: { smoke: "Humos", molotov: "Molotovs", flash: "Flashes", he: "Granadas" },
  tech: { stand: "Quieto", walk: "Caminando", run: "Corriendo", crouch: "Agachado", jump: "Jumpthrow", left: "Clic izquierdo", right: "Clic derecho", both: "Los dos clics" },
  sideLbl: "Lado",
  typeLbl: "Granada",
  throwLbl: "Tiro",
  noJump: "Sin jumpthrow",
  names: "Nombres de zonas",
  floor: ["Arriba", "Abajo"],
  legendCount: "El número es cuántas formas hay de llegar ahí.",
  dests: "Adónde tirar",
  destsLede: (s) => `Todos los lugares con lineup del lado ${s}. O tocá uno en el radar.`,
  ways: (n) => (n === 1 ? "Una forma de llegar" : `${n} formas de llegar`),
  nothing: "Nada con estos filtros. Activá más granadas o cambiá de lado.",
  aim: "Cómo tirarla",
  copySetpos: "Copiar setpos",
  copied: "Copiado",
  setposHint: "Con sv_cheats 1, pegalo en la consola y quedás parado justo ahí, mirando adonde hay que apuntar.",
  practice: "Practicar en el juego",
  practiceLede: "Abrí una partida privada, la consola y pegá esto: granadas infinitas, la trayectoria a la vista y sin límite de tiempo.",
  copyPractice: "Copiar comandos de práctica",
  back: "Todos los mapas",
  from: (v) => `desde ${v}`,
  radarLabel: (m) => `Radar de ${m} con el destino de cada granada`,
  pinLabel: (n, k) => `${n}: ${k} lineup${k === 1 ? "" : "s"}`,
  credit: "Lineups: CS2-annotations de ReneRebsdorf y colaboradores (MIT). Radares y datos de los mapas: awpy-data (MIT). Los mapas son marcas de Valve.",
  notFound: "Todavía no hay lineups para ese mapa.",
  allMaps: "Mapas",
};

export const GR_COPY = { en: EN, es: ES } as const;
export function useGrCopy(): GrCopy {
  const { lang } = useLang();
  return lang === "es" ? ES : EN;
}

/** Los comandos para practicar: partida sin tiempo, granadas infinitas y la vista previa de la trayectoria. */
export const PRACTICE =
  "sv_cheats 1; bot_kick; mp_warmup_end; mp_freezetime 0; mp_roundtime_defuse 60; mp_buy_anywhere 1; mp_maxmoney 60000; mp_startmoney 60000; sv_infinite_ammo 1; ammo_grenade_limit_total 5; sv_grenade_trajectory_prac_pipreview 1; sv_showimpacts 1; mp_restartgame 1";
