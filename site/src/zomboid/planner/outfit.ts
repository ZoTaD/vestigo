/**
 * La ropa del sobreviviente del Planificador de Project Zomboid (2026-10-01): qué lleva puesto cada profesión, en cada
 * sexo, y las rutas de lo que dibuja el visor 3D (`viewer3d.ts`) y del afiche que se ve antes. Puro: sin React ni
 * navegador, así lo usan el panel en el servidor, el visor y los tests.
 *
 * Los datos los escribe `games/zomboid/tools/model3d.py` (el atuendo por defecto más el de la profesión, como al crear
 * el personaje, con la piel y el peinado fijos). Acá sólo se les antepone la carpeta pública (`ASSETS`).
 */
import data from "@zomboid/outfits.json";

export type Sex = "m" | "f";
/** Una prenda: el objeto del juego (`ref`), su ficha en Objetos si tiene (`slug`) y su nombre en cada idioma. */
export interface Wear { ref: string; slug?: string; en: string; es: string }
/** Un modelo con su textura. `bone` sólo en las piezas fijas (anteojos, gorros): el hueso del que cuelgan. */
export interface Piece { glb: string; tex: string; bone?: string }
/**
 * Un atuendo, con rutas completas. `hair` puede faltar: un gorro que tapa todo el pelo lo saca (hoy ninguna profesión,
 * pero un parche puede sumarlo y el visor no tiene que romperse).
 */
export interface Outfit { skin: string; pieces: Piece[]; hair?: Piece; poster: string; wear: Wear[] }

export const ASSETS = "/zomboid/3d/";
const FALLBACK = "unemployed";

type Raw = { skin: string; pieces: Piece[]; hair?: Piece; poster: string; wear: Wear[] };
const OUTFITS = data.outfits as Record<string, Record<Sex, Raw>>;
const BODY = data.body as Record<Sex, string>;

const piece = (p: Piece): Piece => ({ ...p, glb: ASSETS + p.glb, tex: ASSETS + p.tex });

/**
 * Los atuendos van con el id del juego (`fireofficer`) y el Planificador con el de la ficha (`firefighter`). Casi siempre
 * es el mismo sin guiones (`park-ranger` → `parkranger`); éstas son las que el juego llama de otra manera. Las comprueba
 * `test/zomboidSurvivor.test.ts` contra el índice de fichas: si un parche suma otra, el test dice cuál.
 */
const GAME_ID: Record<string, string> = {
  blacksmith: "smither",
  "custom-occupation": "unemployed",
  "diy-expert": "repairman",
  firefighter: "fireofficer",
  "fishing-guide": "fisherman",
  mechanic: "mechanics",
  welder: "metalworker",
};

/**
 * El atuendo de una profesión, por el id de su ficha o el del juego; si no está (un link viejo, una profesión nueva
 * sin modelo), el de Desempleado.
 */
export function outfitFor(prof: string, sex: Sex): Outfit {
  const raw = (OUTFITS[prof] ?? OUTFITS[GAME_ID[prof] ?? prof.replace(/-/g, "")] ?? OUTFITS[FALLBACK])[sex];
  return {
    skin: ASSETS + raw.skin,
    pieces: raw.pieces.map(piece),
    ...(raw.hair ? { hair: piece(raw.hair) } : {}),
    poster: ASSETS + raw.poster,
    wear: raw.wear,
  };
}

/** El cuerpo de cada sexo, con su esqueleto y el idle. */
export const bodyFor = (sex: Sex): string => ASSETS + BODY[sex];

/**
 * Lo que lleva puesto en una oración, con los nombres de las prendas en cada idioma: el `alt` del afiche y el
 * `aria-label` del 3D. `join` es el "a, b y c" del idioma.
 */
export function describe(o: Outfit, lang: "en" | "es", join: (xs: string[]) => string): string {
  const s = join(o.wear.map((w) => w[lang].trim()));
  return s ? `${s}.` : "";
}
