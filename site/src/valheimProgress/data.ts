/**
 * Mi partida (2026-10-30): las tareas de cada bioma (`progress.json`, armado por `pipeline/progress.py`), lo tildado
 * en este navegador y qué se tilda solo al leer un personaje. Sin React.
 */
import type { PlayerProgress } from "../valheimMap/saves/contract";
import type { BiomeId, Ref } from "../valheimData";

export type TaskKind = "station" | "gear" | "mead" | "material" | "offering" | "boss";
export interface Task { id: string; kind: TaskKind; ref: Ref; check: "station" | "material" | "trophy"; key: string | null }
export interface BiomeTasks { biome: BiomeId; boss: Ref | null; tasks: Task[] }

/** Las columnas de la ruta: equipo, materiales y jefe. */
export const COLUMN: Record<TaskKind, "gear" | "materials" | "boss"> = {
  station: "gear", gear: "gear", mead: "gear", material: "materials", offering: "boss", boss: "boss",
};

/** Las tareas que el personaje ya hizo, según lo que guarda su archivo. */
export function doneByCharacter(biomes: BiomeTasks[], p: PlayerProgress): Set<string> {
  const stations = new Set(Object.keys(p.knownStations));
  const materials = new Set(p.knownMaterials);
  const trophies = new Set(p.trophies);
  const out = new Set<string>();
  for (const b of biomes)
    for (const t of b.tasks) {
      if (!t.key) continue;
      const hit = t.check === "station" ? stations.has(t.key) : t.check === "trophy" ? trophies.has(t.key) : materials.has(t.key);
      if (hit) out.add(t.id);
    }
  return out;
}

/** El primer bioma con algo sin tildar: "por dónde vas". */
export function currentBiome(biomes: BiomeTasks[], done: Set<string>): BiomeId | null {
  return biomes.find((b) => b.tasks.some((t) => !done.has(t.id)))?.biome ?? null;
}

const KEY = "vestigo:valheim:progress";

export function loadDone(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function saveDone(done: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...done]));
  } catch { /* sin almacenamiento: vive en la pestaña */ }
}
