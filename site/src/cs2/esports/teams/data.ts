/**
 * Los datos de las fichas de la etapa 6b de CS2 (2026-11-03), que escribe `games/cs2/tools/esports_teams.py`: el índice
 * (`esports/index.json`: equipos, jugadores, torneos y banderas) y una ficha por archivo (`teams/`, `players/`,
 * `tours/`), que se baja recién al abrirla.
 */
import { once } from "../../../zomboid/store";

type Mod<T> = { default: T };
export interface RosterRow {
  lp: string;
  id: string;
  name: string;
  flag: string | null;
  since: string | null;
  captain: boolean;
  role: "player" | "coach";
}
export interface MapStat {
  map: string;
  played: number;
  won: number;
  ct_w: number;
  ct_p: number;
  t_w: number;
  t_p: number;
}
/** Un mapa desde el equipo: `us`/`them` nulos si fue por abandono (`ff`: lo ganó el equipo). */
export interface TeamMap {
  map: string;
  us: number | null;
  them: number | null;
  ff?: boolean;
}
export interface TeamMatch {
  t: number;
  opp: string;
  opp_lp: string | null;
  tour: string | null;
  tour_lp: string | null;
  won: boolean | null;
  maps: TeamMap[];
}
export interface Team {
  slug: string;
  lp: string | null;
  name: string;
  logo: string | null;
  /** `rank`: el puesto en el mundial; `region_rank`: el de su región, si no está en el mundial. */
  vrs: { rank: number | null; region_rank?: number | null; pts: number; region: string | null; prev?: number | null; history: { date: string; rank: number; pts: number }[] };
  location: string | null;
  igl: string | null;
  coaches: string[] | null;
  winnings: number | null;
  created: string | null;
  roster: RosterRow[];
  results: { date: string; place: string; tier: string; tour: string; tour_lp: string; prize: number | null }[];
  maps: MapStat[];
  matches: TeamMatch[];
}
export interface Player {
  slug: string;
  lp: string;
  id: string;
  name: string | null;
  flag: string | null;
  born: string | null;
  roles: string[];
  team_lp: string | null;
  team_slug: string | null;
  winnings: number | null;
}
/** Un mapa de un partido de la llave: `a`/`b` nulos por abandono (`ff`: el lado que ganó). */
export interface BracketMap {
  map: string;
  a: number | null;
  b: number | null;
  ha: [string, number][];
  hb: [string, number][];
  ff?: "a" | "b";
}
export interface BracketMatch {
  t: number;
  a: string;
  b: string;
  a_lp: string | null;
  b_lp: string | null;
  bo: number | null;
  maps: BracketMap[];
}
export interface Tour {
  slug: string;
  lp: string;
  name: string;
  state: "ongoing" | "upcoming" | "concluded";
  organizer: string | null;
  location: string | null;
  venue: string | null;
  prize: number | null;
  start: string | null;
  end: string | null;
  tier: string | null;
  streams: string[];
  teams: string[];
  matches: BracketMatch[];
}
export interface EsIndex {
  teams: { slug: string; name: string; logo: string | null; rank: number | null; region_rank?: number | null; region: string | null; pts: number }[];
  players: { slug: string; id: string; team_slug: string | null }[];
  tours: { slug: string; name: string; state: string; start: string | null }[];
  flags: string[];
}

const index = once<EsIndex>(() => import("@cs2/esports/index.json") as Promise<Mod<unknown>>);
export const loadIndex = () => index.load();
export const peekIndex = () => index.peek() ?? undefined;

/** Un archivo por ficha, de una carpeta: se pide al abrirla. `null`: no existe. */
function folder<T>(files: Record<string, () => Promise<Mod<T>>>, dir: string) {
  const pending = new Map<string, Promise<T | null>>();
  const ready = new Map<string, T | null>();
  return {
    load(slug: string): Promise<T | null> {
      let p = pending.get(slug);
      if (!p) {
        const key = Object.keys(files).find((k) => k.endsWith(`/${dir}/${slug}.json`));
        p = key
          ? files[key]().then(
              (m) => (ready.set(slug, m.default), m.default),
              (err) => {
                pending.delete(slug);
                throw err;
              },
            )
          : Promise.resolve(null);
        if (!key) ready.set(slug, null);
        pending.set(slug, p);
      }
      return p;
    },
    /** `undefined`: todavía no se pidió; `null`: no existe. */
    peek: (slug: string): T | null | undefined => ready.get(slug),
  };
}

const teams = folder<Team>(import.meta.glob<Mod<Team>>("@cs2/esports/teams/*.json"), "teams");
const players = folder<Player>(import.meta.glob<Mod<Player>>("@cs2/esports/players/*.json"), "players");
const tours = folder<Tour>(import.meta.glob<Mod<Tour>>("@cs2/esports/tours/*.json"), "tours");
export const loadTeam = teams.load;
export const peekTeam = teams.peek;
export const loadPlayer = players.load;
export const peekPlayer = players.peek;
export const loadTour = tours.load;
export const peekTour = tours.peek;

/** El slug de Vestigo de una página de Liquipedia (el mismo `slugify` de `cs2.py`). */
export const lpSlug = (lp: string) =>
  lp.normalize("NFD").replace(/[^\x00-\x7f]/g, "").toLowerCase().replace(/['.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
