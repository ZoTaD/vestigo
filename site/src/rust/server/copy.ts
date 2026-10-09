/**
 * Los textos de la pestaña Servidor de Rust (2026-10-09), en inglés y español. La ayuda de cada convar es la del juego,
 * que sólo existe en inglés.
 */
import { useLang } from "../../i18n";
import type { Filter } from "./data";

export interface ServerCopy {
  h1: string;
  lede: (n: string) => string;
  wipeTitle: string;
  wipeNote: string;
  setupTitle: string;
  setupLede: string;
  fields: Record<"hostname" | "identity" | "description" | "url" | "headerimage" | "port" | "maxplayers" | "worldsize" | "seed" | "saveinterval" | "pve" | "rconPort" | "rconPassword", string>;
  randomSeed: string;
  windows: string;
  linux: string;
  startup: string;
  cfg: string;
  cfgNote: string;
  copy: string;
  copied: string;
  refTitle: string;
  search: string;
  searchPlaceholder: string;
  filters: Record<Filter, string>;
  count: (n: string) => string;
  def: string;
  client: string;
  server: string;
  command: string;
  saved: string;
  admin: string;
  anyone: string;
  listDate: (d: string) => string;
  empty: string;
}

const EN: ServerCopy = {
  h1: "Rust server commands and convars",
  lede: (n) => `Every console variable and command of the game (${n}), with its default value and what it does, the forced wipe calendar and a generator for your server's startup line and server.cfg.`,
  wipeTitle: "Forced wipes",
  wipeNote: "First Thursday of every month, when Facepunch ships the update (around 2 pm New York time). Times in your time zone.",
  setupTitle: "Startup line and server.cfg",
  setupLede: "Fill in what you want to change: the rest stays at the game's default.",
  fields: {
    hostname: "Server name", identity: "Identity (save folder)", description: "Description", url: "Website", headerimage: "Header image URL",
    port: "Port", maxplayers: "Max players", worldsize: "Map size", seed: "Map seed", saveinterval: "Save every (s)", pve: "PvE",
    rconPort: "RCON port", rconPassword: "RCON password",
  },
  randomSeed: "Random",
  windows: "Windows",
  linux: "Linux",
  startup: "Startup line",
  cfg: "server/<identity>/cfg/server.cfg",
  cfgNote: "Put a strong RCON password: anyone who has it controls the server.",
  copy: "Copy",
  copied: "Copied",
  refTitle: "Every convar and command",
  search: "Search",
  searchPlaceholder: "decay, upkeep, server.pve…",
  filters: { all: "All", server: "Server", client: "Client", command: "Commands" },
  count: (n) => `${n} shown`,
  def: "Default",
  client: "Client",
  server: "Server",
  command: "Command",
  saved: "Saved in cfg",
  admin: "Admin",
  anyone: "Any player",
  listDate: (d) => `List of the game's convars as of ${d}: newer ones may be missing.`,
  empty: "Nothing matches that search.",
};

const ES: ServerCopy = {
  h1: "Comandos y convars del servidor de Rust",
  lede: (n) => `Todas las variables y comandos de consola del juego (${n}), con su valor por defecto y para qué sirven, el calendario de wipes forzados y un generador de la línea de arranque y el server.cfg de tu servidor.`,
  wipeTitle: "Wipes forzados",
  wipeNote: "Primer jueves de cada mes, cuando Facepunch saca la actualización (cerca de las 14 de Nueva York). Horas en tu zona horaria.",
  setupTitle: "Línea de arranque y server.cfg",
  setupLede: "Completá lo que quieras cambiar: lo demás queda con el valor por defecto del juego.",
  fields: {
    hostname: "Nombre del servidor", identity: "Identidad (carpeta de guardado)", description: "Descripción", url: "Sitio web",
    headerimage: "URL de la imagen de cabecera", port: "Puerto", maxplayers: "Jugadores máximos", worldsize: "Tamaño del mapa",
    seed: "Semilla del mapa", saveinterval: "Guardar cada (s)", pve: "PvE", rconPort: "Puerto RCON", rconPassword: "Contraseña RCON",
  },
  randomSeed: "Al azar",
  windows: "Windows",
  linux: "Linux",
  startup: "Línea de arranque",
  cfg: "server/<identidad>/cfg/server.cfg",
  cfgNote: "Poné una contraseña de RCON fuerte: quien la tenga maneja el servidor.",
  copy: "Copiar",
  copied: "Copiado",
  refTitle: "Todas las convars y comandos",
  search: "Buscar",
  searchPlaceholder: "decay, upkeep, server.pve…",
  filters: { all: "Todas", server: "Servidor", client: "Cliente", command: "Comandos" },
  count: (n) => `${n} a la vista`,
  def: "Por defecto",
  client: "Cliente",
  server: "Servidor",
  command: "Comando",
  saved: "Se guarda en el cfg",
  admin: "Admin",
  anyone: "Cualquier jugador",
  listDate: (d) => `Lista de convars del juego al ${d}: puede faltar alguna más nueva.`,
  empty: "No hay nada con esa búsqueda.",
};

export const SERVER_COPY: Record<"en" | "es", ServerCopy> = { en: EN, es: ES };
export const useServerCopy = (): ServerCopy => SERVER_COPY[useLang().lang];
