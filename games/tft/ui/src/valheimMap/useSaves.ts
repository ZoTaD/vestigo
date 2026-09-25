/**
 * "Tu partida" (2026-09-25, idea del amigo de ZoTaD): la carpeta del mundo (o
 * un zip) y los personajes que suba la persona, leídos en un Web Worker
 * (`savesWorker.ts`). Nada se sube ni se guarda: vive en esta pestaña.
 *
 * De acá salen capas para el visor: la niebla de lo no explorado (lo que se
 * compartió en la mesa de cartografía y/o lo de cada personaje), los pines,
 * los portales unidos por nombre, tumbas, camas, barcos y bases.
 */
import { useCallback, useMemo, useState } from "react";
import type { FogLayer, MapLine, Marker } from "./MapViewer";
import type { CharacterData, Explored, InputFile, MapPin, WorldSaveData } from "./saves/contract";

export type SaveKind = "pin" | "portal" | "tombstone" | "bed" | "ship" | "cart" | "cartography" | "base";

export interface SaveMarkerInfo { kind: SaveKind; label: string; owner?: string; x: number; z: number; extra?: string }

/** Colores de cada jugador (lo explorado y sus pines), en orden. */
export const PLAYER_COLORS = ["#62d0ff", "#ff8a3d", "#8fe38f", "#e07cff", "#ffd84d", "#ff6f6f", "#7fb3ff", "#c9c9c9"];

const KIND_COLOR: Record<SaveKind, string> = {
  pin: "#ffffff", portal: "#b77cff", tombstone: "#ff5a5a", bed: "#ffd84d", ship: "#7fb3ff",
  cart: "#d9a066", cartography: "#f2c46f", base: "#ffb347",
};

interface State {
  world: WorldSaveData | null;
  characters: CharacterData[];
  busy: boolean;
  error: string | null;
}

/** Lee archivos en el worker. `kind` dice qué son. */
function runWorker<T>(msg: { kind: "world"; files: InputFile[] } | { kind: "zip"; data: Uint8Array } | { kind: "character"; file: InputFile }): Promise<T> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("./savesWorker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev: MessageEvent<{ ok: boolean; result?: T; error?: string }>) => {
      w.terminate();
      if (ev.data.ok) resolve(ev.data.result as T);
      else reject(new Error(ev.data.error));
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message)); };
    const transfer = msg.kind === "world" ? msg.files.map((f) => f.data.buffer) : msg.kind === "zip" ? [msg.data.buffer] : [msg.file.data.buffer];
    w.postMessage(msg, transfer as ArrayBuffer[]);
  });
}

/** La niebla: oscuro donde nadie exploró, transparente donde sí (unión de las grillas elegidas). */
function buildFog(grids: Explored[]): FogLayer | null {
  if (!grids.length || typeof document === "undefined") return null;
  const g0 = grids[0];
  const size = g0.size;
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let row = 0; row < size; row++) {
    // La grilla del juego empieza por el sur; la imagen, por el norte.
    const dst = (size - 1 - row) * size;
    const src = row * size;
    for (let i = 0; i < size; i++) {
      let seen = 0;
      for (const g of grids) if (g.size === size && g.cells[src + i]) { seen = 1; break; }
      const o = (dst + i) * 4;
      d[o] = 12; d[o + 1] = 12; d[o + 2] = 16; d[o + 3] = seen ? 0 : 190;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: c, span: size * g0.pixelSize };
}

export function useSaves() {
  const [s, setS] = useState<State>({ world: null, characters: [], busy: false, error: null });
  const [useTable, setUseTable] = useState(true);
  const [shownPlayers, setShownPlayers] = useState<Set<number>>(new Set());
  const [showFog, setShowFog] = useState(true);

  const loadWorld = useCallback(async (files: InputFile[]) => {
    setS((p) => ({ ...p, busy: true, error: null }));
    try {
      const zip = files.length === 1 && /\.zip$/i.test(files[0].name);
      const world = await runWorker<WorldSaveData>(zip ? { kind: "zip", data: files[0].data } : { kind: "world", files });
      setS((p) => ({ ...p, world, busy: false }));
      return world;
    } catch (e) {
      setS((p) => ({ ...p, busy: false, error: String((e as Error).message ?? e) }));
      return null;
    }
  }, []);

  const loadCharacters = useCallback(async (files: InputFile[]) => {
    setS((p) => ({ ...p, busy: true, error: null }));
    try {
      const read: CharacterData[] = [];
      for (const f of files) read.push(await runWorker<CharacterData>({ kind: "character", file: f }));
      setS((p) => {
        const characters = [...p.characters, ...read];
        setShownPlayers(new Set(characters.map((_, i) => i)));
        return { ...p, characters, busy: false };
      });
    } catch (e) {
      setS((p) => ({ ...p, busy: false, error: String((e as Error).message ?? e) }));
    }
  }, []);

  const clear = useCallback(() => { setS({ world: null, characters: [], busy: false, error: null }); setShownPlayers(new Set()); }, []);

  /** Lo de cada personaje en ESTE mundo (por uid); sin mundo cargado, el primero que tenga datos. */
  const playerWorlds = useMemo(() => s.characters.map((c) => {
    const w = s.world ? c.worlds.find((x) => x.uid === s.world!.uid) : c.worlds.find((x) => x.explored || x.pins.length);
    return { name: c.name, explored: w?.explored ?? null, pins: w?.pins ?? [], found: !!w };
  }), [s.characters, s.world]);

  const fog = useMemo(() => {
    if (!showFog) return null;
    const grids: Explored[] = [];
    if (useTable) for (const t of s.world?.cartography ?? []) if (t.explored) grids.push(t.explored);
    playerWorlds.forEach((p, i) => { if (shownPlayers.has(i) && p.explored) grids.push(p.explored); });
    return buildFog(grids);
  }, [showFog, useTable, s.world, playerWorlds, shownPlayers]);

  // Las marcas de la partida, con su información para la ventanita.
  const { markers, info, lines } = useMemo(() => {
    const markers: Marker[] = [];
    const info = new Map<string, SaveMarkerInfo>();
    const lines: MapLine[] = [];
    const add = (kind: SaveKind, x: number, z: number, label: string, extra?: string, color?: string, owner?: string) => {
      const key = `s:${markers.length}`;
      markers.push({ key, x, z, color: color ?? KIND_COLOR[kind], size: kind === "portal" || kind === "tombstone" ? 5 : 4,
        label: kind === "portal" || kind === "pin" ? label || undefined : undefined });
      info.set(key, { kind, label, x, z, extra, owner });
    };
    const w = s.world;
    if (w) {
      // Portales: los que comparten nombre están unidos; se dibuja la línea.
      const byTag = new Map<string, { x: number; z: number }[]>();
      for (const p of w.portals) {
        add("portal", p.x, p.z, p.tag);
        byTag.set(p.tag, [...(byTag.get(p.tag) ?? []), p]);
      }
      for (const [, ps] of byTag) if (ps.length === 2) lines.push({ x1: ps[0].x, z1: ps[0].z, x2: ps[1].x, z2: ps[1].z, color: "rgba(183,124,255,0.85)" });
      for (const p of w.points) add(p.kind, p.x, p.z, p.label ?? "");
      for (const [zx, zz, n] of w.buildZones) if (n >= 40) add("base", zx * 64, zz * 64, "", String(n));
      if (useTable) for (const t of w.cartography) for (const pin of t.pins) add("pin", pin.x, pin.z, pin.name, String(pin.type), undefined, pin.owner);
    }
    playerWorlds.forEach((p, i) => {
      if (!shownPlayers.has(i)) return;
      for (const pin of p.pins) add("pin", pin.x, pin.z, pin.name, String(pin.type), PLAYER_COLORS[i % PLAYER_COLORS.length], p.name);
    });
    return { markers, info, lines };
  }, [s.world, playerWorlds, shownPlayers, useTable]);

  return {
    ...s, loadWorld, loadCharacters, clear, playerWorlds, fog, markers, info, lines,
    useTable, setUseTable, shownPlayers, setShownPlayers, showFog, setShowFog,
  };
}

export type SavesState = ReturnType<typeof useSaves>;
export type { MapPin };
