/**
 * Los datos de la pestaña Servidor de Rust (2026-10-09): `games/rust/data/server.json` (`convars.py`), ~160 KB (≈35
 * gzip), bajado con `import()` en su chunk. Sin React: también lo usan el generador y los tests.
 */
import type { Route } from "../../route";
import { once } from "../../zomboid/store";

export interface Convar {
  name: string;
  sides: ("server" | "client")[];
  kind: "var" | "command";
  type?: "bool" | "int" | "float" | "string" | "other";
  default?: string | number | boolean;
  help?: string;
  saved?: true;
  admin?: true;
  anyone?: true;
}
export interface ServerData {
  source: { commit: string | null; date: string | null };
  vars: Convar[];
}

const data = once<ServerData>(() => import("@rust/server.json"));
export const peekServer = (): ServerData | null => data.peek();
export const loadServer = (): Promise<ServerData> => data.load();

export async function preloadServerRoute(_route: Route): Promise<void> {
  await loadServer();
}

export type Filter = "all" | "server" | "client" | "command";

/** La lista filtrada: por lado o comando, y por texto en el nombre o la ayuda (sin mayúsculas). */
export function filterConvars(vars: readonly Convar[], filter: Filter, query: string): Convar[] {
  const q = query.trim().toLowerCase();
  return vars.filter((v) => {
    if (filter === "command" && v.kind !== "command") return false;
    if ((filter === "server" || filter === "client") && (v.kind !== "var" || !v.sides.includes(filter))) return false;
    return !q || v.name.includes(q) || (v.help ?? "").toLowerCase().includes(q);
  });
}

/** Un valor como se escribe en la consola o en el `server.cfg`: los textos entre comillas, los booleanos en minúscula. */
export function cfgValue(v: string | number | boolean): string {
  if (typeof v === "string") return `"${v.replace(/"/g, "'")}"`;
  return String(v);
}

export interface Setup {
  hostname: string;
  identity: string;
  description: string;
  url: string;
  headerimage: string;
  port: number;
  maxplayers: number;
  worldsize: number;
  seed: number;
  saveinterval: number;
  pve: boolean;
  rconPort: number;
  rconPassword: string;
}

/** La línea de arranque de `RustDedicated` (los parámetros de inicio van con `+`) y el `server.cfg` con el resto. */
export function startupLine(s: Setup, windows: boolean): string {
  const exe = windows ? "RustDedicated.exe" : "./RustDedicated";
  const parts = [
    `${exe} -batchmode -nographics`,
    `+server.port ${s.port}`,
    `+server.level ${cfgValue("Procedural Map")}`,
    `+server.seed ${s.seed}`,
    `+server.worldsize ${s.worldsize}`,
    `+server.maxplayers ${s.maxplayers}`,
    `+server.hostname ${cfgValue(s.hostname)}`,
    `+server.identity ${cfgValue(s.identity)}`,
    `+rcon.port ${s.rconPort}`,
    `+rcon.password ${cfgValue(s.rconPassword)}`,
    "+rcon.web 1",
  ];
  return parts.join(windows ? " ^\n  " : " \\\n  ");
}

export function serverCfg(s: Setup): string {
  const rows: [string, string | number | boolean][] = [
    ["server.description", s.description],
    ["server.url", s.url],
    ["server.headerimage", s.headerimage],
    ["server.saveinterval", s.saveinterval],
    ["server.pve", s.pve],
  ];
  return rows.filter(([, v]) => v !== "").map(([k, v]) => `${k} ${cfgValue(v)}`).join("\n");
}
