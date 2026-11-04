/**
 * Los nombres de la pestaña Parches de CS2 (2026-11-03): el de una edición ("Parche del 28 de octubre de 2026" o el
 * título del lanzamiento) y el de cada sección de las notas, que Valve escribe en mayúsculas ("MAP SCRIPTING").
 */
import type { Lang } from "../../i18n";
import type { PatchMeta } from "./data";

export const fmtDate = (d: string, lang: Lang, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }) =>
  new Intl.DateTimeFormat(lang === "es" ? "es-AR" : "en-US", { ...opts, timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

/** ¿Es el nombre de un parche (no de un lanzamiento)? Lo usa el <head>, que sólo tiene el nombre. */
export const isPatchName = (name: string): boolean => /^Parche del |^\w+ \d{1,2}, \d{4} update$/.test(name);

/** El nombre de una edición: un parche por su fecha, un lanzamiento por su título. */
export const patchName = (e: Pick<PatchMeta, "kind" | "date" | "title">, lang: Lang): string =>
  e.kind === "content" ? e.title : lang === "es" ? `Parche del ${fmtDate(e.date, lang)}` : `${fmtDate(e.date, lang)} update`;

/** Las secciones más comunes, con su nombre en el juego. Las demás (un Major, una colección) van con mayúscula inicial. */
const SEC_ES: Record<string, string> = {
  MISC: "Varios", MAPS: "Mapas", GAMEPLAY: "Jugabilidad", ANIMATION: "Animaciones", SOUND: "Sonido", AUDIO: "Sonido",
  UI: "Interfaz", "MAP SCRIPTING": "Scripts de mapas", GRAPHICS: "Gráficos", "WORKSHOP TOOLS": "Herramientas del Workshop",
  NETWORKING: "Red", NETWORK: "Red", "MUSIC KITS": "Kits de música", ENGINE: "Motor", MOVEMENT: "Movimiento",
  MATCHMAKING: "Emparejamiento", "WEAPON FINISHES": "Acabados de armas", "MAP GUIDES": "Guías de mapas", WEAPONS: "Armas",
  INPUT: "Controles", "INPUT SYSTEM": "Controles", SMOKE: "Humo", "VOLUMETRIC SMOKE": "Humo volumétrico", SPECTATING: "Modo espectador",
  VISUALS: "Imagen", RENDERING: "Renderizado", "BUY MENU": "Menú de compra", "ARMS RACE": "Carrera de armamentos",
  STICKERS: "Pegatinas", DAMAGE: "Daño", "DAMAGE PREDICTION": "Predicción de daño", MISSIONS: "Misiones", ITEMS: "Objetos",
  CROSSHAIR: "Mira", SETTINGS: "Opciones", "VIDEO SETTINGS": "Opciones de video", SCRIPTING: "Scripts", TOOLS: "Herramientas",
  OTHER: "Otros", "KNOWN ISSUES": "Problemas conocidos", INVENTORY: "Inventario", "INVENTORY & ITEMS": "Inventario y objetos",
  SERVERS: "Servidores", "COMMUNITY DEDICATED SERVERS": "Servidores de la comunidad", ECONOMY: "Economía", LOADOUT: "Equipamiento",
  SHOOTING: "Disparo", COSMETICS: "Cosméticos", EFFECTS: "Efectos", CHICKENS: "Gallinas", JUMPING: "Saltos", WATER: "Agua",
  "PREMIER MATCHMAKING": "Emparejamiento de Premier", "CASE DROPS": "Cajas que caen", "WEEKLY CARE PACKAGE": "Paquete semanal",
  DEMO: "Demos", DEMOS: "Demos", "WORKSHOP MAPS": "Mapas del Workshop", COMPETITIVE: "Competitivo", STORE: "Tienda", GAME: "Juego",
  "BUG FIXES": "Arreglos", FIXES: "Arreglos", CHARMS: "Llaveros", CONTRACTS: "Contratos", PERFORMANCE: "Rendimiento",
};
/** Siglas que quedan como están. */
const KEEP = new Set(["UI", "HUD", "VAC", "CSTV", "CS:GO", "CS2", "II", "AO", "MVP", "FPS", "AI", "VacNet"]);
const titleCase = (s: string) =>
  s.split(" ").map((w) => (KEEP.has(w) || /\d/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase())).join(" ");

/** El nombre de una sección de las notas. Sin título (pasa en las notas viejas), "General". */
export function sectionName(title: string, lang: Lang): string {
  if (!title) return "General";
  const key = title.toUpperCase();
  if (lang === "es" && SEC_ES[key]) return SEC_ES[key];
  return title === key ? titleCase(title) : title;
}
