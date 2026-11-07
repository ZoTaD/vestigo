import type { Lang } from "./i18n";

/** Las pestañas de una partida, en el orden en que se dibujan. La primera no lleva segmento en la URL. */
export const MATCH_TABS = ["report", "win-chance", "lanes", "numbers"] as const;
export type MatchTab = (typeof MATCH_TABS)[number];

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
/** Entre 1 y 99: "100 % de ganar" afirma algo que las almas no pueden saber. */
const r = (p: number) => Math.min(99, Math.max(1, Math.round(p * 100)));
const pct = (p: number) => `${r(p)}%`;
const pctEs = (p: number) => `${r(p)} %`;

const en = {
  tabs: { report: "Your report", "win-chance": "Win chance", lanes: "Lanes", numbers: "All the numbers" } as Record<MatchTab, string>,
  chance: {
    title: "Who was going to win",
    read: (t: number, team: string, p: number) => `${mmss(t)} · ${team} ${pct(p)} to win`,
    lead:
      "The line is the chance Hidden King wins, read from the souls each team had at every moment. Above the middle Hidden King was the favourite; below it, Archmother.",
    how: (matches: string, band: string) =>
      `Each point answers: of the ${matches} ${band} matches this patch where a team was this far ahead in souls at this minute, how many did it win? It only looks at souls, not objectives.`,
    momentsTitle: "The moments that decided it",
    noMoments: "No big fights in this match: it was decided by farm.",
    fight: (team: string, lost: number, killed: number) => `${team} won a fight, ${killed} for ${lost}`,
    fightEven: (n: number) => `Even trade: ${n} for ${n}`,
    swing: (team: string, pts: number) => `+${Math.abs(pts)} pts for ${team}`,
    flip: (team: string) => `${team} becomes the favourite`,
    midboss: (team: string) => `${team} took the Mid Boss`,
    midbossNone: "The Mid Boss fell",
    peak: (team: string, p: number, t: number) => `${team} peaked at ${pct(p)} at ${mmss(t)}.`,
    upset: (team: string, p: number) => `${team} won after being down to ${pct(p)}.`,
    fightMark: "Fight",
  },
  lanes: {
    title: "The laning phase",
    lead: (min: number) => `Each lane at minute ${min}, when most duos leave to fight: souls, kills and last hits.`,
    names: { 1: "Yellow lane", 4: "Blue lane", 6: "Green lane" } as Record<number, string>,
    won: (team: string, diff: string, pctV: number) => `${team} won the lane by ${diff} souls (+${Math.round(pctV * 100)}%)`,
    even: "Even lane: less than 5% apart",
    souls: "Souls",
    kda: "K/D/A",
    lh: "Last hits",
    later: (team: string) => `${team} won the match.`,
    noLanes: "This match does not say who played which lane.",
    summary: (team: string, n: number) => `${team} won ${n} of 3 lanes.`,
  },
  numbers: {
    lead: "Every player's totals at the end of the match. The best value in each column is in bold.",
    player: "Player",
    groups: {
      fight: "Fighting",
      kills: "How they got kills",
      souls: "Souls",
      support: "Objectives and support",
    },
    cols: {
      kills: "Kills",
      deaths: "Deaths",
      assists: "Assists",
      damage: "Hero damage",
      taken: "Damage taken",
      gun: "Gun kills",
      ability: "Ability kills",
      melee: "Melee kills",
      headshot: "Headshot kills",
      accuracy: "Accuracy",
      souls: "Souls",
      lastHits: "Last hits",
      denies: "Denies",
      jungle: "Jungle kills",
      lost: "Souls lost dying",
      objective: "Objective damage",
      allyHeal: "Healing allies",
      barrier: "Barriers on allies",
      prevented: "Healing prevented",
    },
  },
};

const es: typeof en = {
  tabs: { report: "Tu informe", "win-chance": "Chance de ganar", lanes: "Líneas", numbers: "Todas las cifras" },
  chance: {
    title: "Quién iba a ganar",
    read: (t, team, p) => `${mmss(t)} · ${team} ${pctEs(p)} de ganar`,
    lead:
      "La línea es la chance de que gane Hidden King, leída de las almas de cada equipo en cada momento. Arriba del medio Hidden King era favorito; abajo, Archmother.",
    how: (matches, band) =>
      `Cada punto contesta: de las ${matches} partidas ${band} del parche en que un equipo iba así de adelante en almas en este minuto, ¿cuántas ganó? Mira sólo las almas, no los objetivos.`,
    momentsTitle: "Los momentos que la definieron",
    noMoments: "No hubo peleas grandes: se definió farmeando.",
    fight: (team, lost, killed) => `${team} ganó una pelea, ${killed} a ${lost}`,
    fightEven: (n) => `Pelea pareja: ${n} a ${n}`,
    swing: (team, pts) => `+${Math.abs(pts)} pts para ${team}`,
    flip: (team) => `${team} pasa a ser favorito`,
    midboss: (team) => `${team} se llevó el Mid Boss`,
    midbossNone: "Cayó el Mid Boss",
    peak: (team, p, t) => `${team} llegó a ${pctEs(p)} en el ${mmss(t)}.`,
    upset: (team, p) => `${team} ganó después de estar en ${pctEs(p)}.`,
    fightMark: "Pelea",
  },
  lanes: {
    title: "La fase de líneas",
    lead: (min) => `Cada línea en el minuto ${min}, cuando la mayoría de los dúos sale a pelear: almas, kills y golpes finales.`,
    names: { 1: "Línea amarilla", 4: "Línea azul", 6: "Línea verde" },
    won: (team, diff, pctV) => `${team} ganó la línea por ${diff} almas (+${Math.round(pctV * 100)} %)`,
    even: "Línea pareja: menos de 5 % de diferencia",
    souls: "Almas",
    kda: "K/D/A",
    lh: "Golpes finales",
    later: (team) => `${team} ganó la partida.`,
    noLanes: "Esta partida no dice quién jugó cada línea.",
    summary: (team, n) => `${team} ganó ${n} de 3 líneas.`,
  },
  numbers: {
    lead: "Los totales de cada jugador al terminar la partida. El mejor de cada columna va en negrita.",
    player: "Jugador",
    groups: {
      fight: "Pelea",
      kills: "Cómo consiguió las kills",
      souls: "Almas",
      support: "Objetivos y apoyo",
    },
    cols: {
      kills: "Kills",
      deaths: "Muertes",
      assists: "Asistencias",
      damage: "Daño a héroes",
      taken: "Daño recibido",
      gun: "Kills con arma",
      ability: "Kills con habilidad",
      melee: "Kills cuerpo a cuerpo",
      headshot: "Kills a la cabeza",
      accuracy: "Precisión",
      souls: "Almas",
      lastHits: "Golpes finales",
      denies: "Negaciones",
      jungle: "Kills en la jungla",
      lost: "Almas perdidas al morir",
      objective: "Daño a objetivos",
      allyHeal: "Curación a aliados",
      barrier: "Barreras a aliados",
      prevented: "Curación evitada",
    },
  },
};

export const MATCH_TABS_COPY: Record<Lang, typeof en> = { en, es };
