/** Textos de Mi partida (2026-10-30). El SEO también lo lee el prerender. */
import { useLang } from "../i18n";

const EN = {
  tab: "Progress",
  hub: "Your checklist, biome by biome",
  title: "Progress",
  lede: "Tick what you've done in each biome, or read it from your character. It stays in this browser.",
  seoTitle: "Valheim Progress Checklist: bosses, gear and materials by biome | Vestigo",
  seoDesc: "A Valheim progression checklist from Meadows to the Deep North: stations, armor, meads, key materials and boss offerings for each biome. Load your character file to tick off what you've already done.",
  loading: "Unrolling the map…",
  youAre: (b: string) => `You're in: ${b}`,
  allDone: "Every biome done. Skål!",
  cols: { gear: "Gear", materials: "Materials", boss: "Boss" } as Record<string, string>,
  kind: { station: "Build", gear: "Craft", mead: "Brew", material: "Get", offering: "Offering", boss: "Defeat" } as Record<string, string>,
  read: "Read my character",
  readHelp: "Your character file (.fch) is in %USERPROFILE%\\AppData\\LocalLow\\IronGate\\Valheim\\characters (or characters_local). Nothing leaves your browser.",
  reading: "Reading…",
  readOk: (name: string, n: number) => `${name}: ${n} tasks ticked from your character.`,
  readSkills: "Your skill levels are now in the Skills calculator.",
  readFail: "That file couldn't be read as a Valheim character.",
  reset: "Start over",
  resetAsk: "Untick everything?",
  open: "Open",
};

const ES: typeof EN = {
  tab: "Mi partida",
  hub: "Tu lista, bioma por bioma",
  title: "Mi partida",
  lede: "Tilda lo que ya hiciste en cada bioma, o léelo de tu personaje. Queda guardado en este navegador.",
  seoTitle: "Checklist de progreso de Valheim: jefes, equipo y materiales por bioma | Vestigo",
  seoDesc: "Una lista de progreso de Valheim desde la Pradera hasta el Norte profundo: estaciones, armaduras, hidromieles, materiales clave y ofrendas de cada bioma. Carga el archivo de tu personaje para tildar lo que ya hiciste.",
  loading: "Desplegando el mapa…",
  youAre: (b: string) => `Vas por: ${b}`,
  allDone: "Todos los biomas hechos. ¡Skål!",
  cols: { gear: "Equipo", materials: "Materiales", boss: "Jefe" },
  kind: { station: "Construir", gear: "Fabricar", mead: "Preparar", material: "Conseguir", offering: "Ofrenda", boss: "Vencer" },
  read: "Leer mi personaje",
  readHelp: "El archivo de tu personaje (.fch) está en %USERPROFILE%\\AppData\\LocalLow\\IronGate\\Valheim\\characters (o characters_local). Nada sale de tu navegador.",
  reading: "Leyendo…",
  readOk: (name: string, n: number) => `${name}: ${n} tareas tildadas desde tu personaje.`,
  readSkills: "Tus niveles de habilidad ya están en la calculadora de Habilidades.",
  readFail: "Ese archivo no se pudo leer como un personaje de Valheim.",
  reset: "Empezar de nuevo",
  resetAsk: "¿Destildar todo?",
  open: "Abrir",
};

export const PROGRESS_COPY = { en: EN, es: ES };
export const useProgressCopy = () => PROGRESS_COPY[useLang().lang];
