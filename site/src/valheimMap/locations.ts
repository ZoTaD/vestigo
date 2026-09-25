/**
 * Los lugares del mapa (jefes, mazmorras, comerciantes…): se ubican con el
 * algoritmo del juego en un Web Worker propio (`locWorker.ts`) y se agrupan
 * por categoría y por tipo para el panel de la derecha (pedido de ZoTaD,
 * 2026-09-25: "opciones al costado para ver las minas, los traders, las
 * dungeons").
 *
 * Nombres, categoría, ícono del juego y ficha del sitio salen de
 * `games/valheim/data/map/display.json` (`pipeline/map_data.py`).
 */
import { useEffect, useMemo, useState } from "react";
import type { Txt } from "../valheimData";
import type { PlacedLocation } from "./engine/contract";
import display from "@valheimMap/display.json";

export interface MapLocation {
  key: string;
  prefab: string;
  x: number;
  z: number;
  name: Txt;
  /** El tipo para mostrar: los prefabs con el mismo nombre ("Cámaras funerarias") son uno. */
  type: string;
  category: string;
  categoryName: Txt;
  color: string;
  icon: HTMLImageElement | null;
  /** Jefes, comerciantes y el inicio: se dibujan más grandes. */
  major: boolean;
  candidate: boolean;
  /** La ficha del sitio (pestaña y slug), si la hay. */
  page: { tab: string; slug: string } | null;
}

export interface LocationType { id: string; name: Txt; category: string; color: string; iconUrl: string | null; count: number; candidate: boolean }
export interface LocationCategory { id: string; name: Txt; color: string; count: number; types: LocationType[] }

export interface LocationsState {
  items: MapLocation[] | null;
  categories: LocationCategory[];
  progress: number | null;
  /** Dónde está el inicio (las piedras de sacrificio), si ya se ubicó. */
  spawn: { x: number; z: number } | null;
  error: string | null;
}

interface DisplayEntry {
  name: Txt;
  category: string;
  icon: string | null;
  page: { tab: string; slug: string } | null;
  candidates: boolean;
}
const DISPLAY = (display as unknown as { locations: Record<string, DisplayEntry> }).locations;

/** Las categorías en el orden del panel, con su nombre y el color del punto. */
export const CATEGORIES: { id: string; name: Txt; color: string; show: boolean; major?: boolean }[] = [
  { id: "start", name: { en: "Spawn", es: "Inicio" }, color: "#ffffff", show: true, major: true },
  { id: "boss", name: { en: "Boss altars", es: "Altares de jefes" }, color: "#e0463c", show: true, major: true },
  { id: "trader", name: { en: "Traders", es: "Comerciantes" }, color: "#f2c46f", show: true, major: true },
  { id: "dungeon", name: { en: "Dungeons", es: "Mazmorras" }, color: "#b77cff", show: true },
  { id: "village", name: { en: "Villages", es: "Aldeas" }, color: "#ff8a3d", show: false },
  { id: "camp", name: { en: "Enemy camps", es: "Campamentos" }, color: "#ff6f6f", show: false },
  { id: "tower", name: { en: "Towers and outposts", es: "Torres y puestos" }, color: "#d9a066", show: false },
  { id: "runestone", name: { en: "Runestones", es: "Piedras rúnicas" }, color: "#62d0ff", show: false },
  { id: "shipwreck", name: { en: "Shipwrecks", es: "Naufragios" }, color: "#7fb3ff", show: false },
  { id: "resource", name: { en: "Resources", es: "Recursos" }, color: "#8fe38f", show: false },
  { id: "poi", name: { en: "Other places", es: "Otros lugares" }, color: "#c9c9c9", show: false },
];
const CAT = new Map(CATEGORIES.map((c) => [c.id, c]));

const typeId = (d: DisplayEntry | undefined, prefab: string) => (d ? `${d.category}:${d.name.en}` : `poi:${prefab}`);

/** Qué tipos se ven al abrir el mapa: los de las categorías que arrancan visibles. */
export function defaultHidden(): Set<string> {
  const out = new Set<string>();
  const seen = new Set<string>();
  for (const [prefab, d] of Object.entries(DISPLAY)) {
    const id = typeId(d, prefab);
    if (seen.has(id)) continue;
    seen.add(id);
    if (!CAT.get(d.category)?.show) out.add(id);
  }
  return out;
}

const icons = new Map<string, HTMLImageElement>();
function icon(name: string | null): HTMLImageElement | null {
  if (!name || typeof Image === "undefined") return null;
  let im = icons.get(name);
  if (!im) {
    im = new Image();
    im.src = `/valheim/map/icons/${name}.webp`;
    icons.set(name, im);
  }
  return im;
}

function decorate(list: PlacedLocation[]): MapLocation[] {
  return list.map((p, i) => {
    const d = DISPLAY[p.prefab];
    const cat = CAT.get(d?.category ?? "poi") ?? CAT.get("poi")!;
    return {
      key: `${i}`, prefab: p.prefab, x: p.x, z: p.z,
      name: d?.name ?? { en: p.prefab, es: p.prefab }, type: typeId(d, p.prefab),
      category: cat.id, categoryName: cat.name, color: cat.color, icon: icon(d?.icon ?? null),
      major: !!cat.major, candidate: !!p.candidate || !!d?.candidates, page: d?.page ?? null,
    };
  });
}

// Una ubicación por semilla, guardada mientras la página está abierta.
const cache = new Map<string, PlacedLocation[]>();

export function useLocations(seed: string): LocationsState {
  const [raw, setRaw] = useState<PlacedLocation[] | null>(() => cache.get(seed) ?? null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!seed) return;
    const hit = cache.get(seed);
    if (hit) {
      setRaw(hit);
      setProgress(1);
      return;
    }
    setRaw(null);
    setError(null);
    setProgress(0);
    const w = new Worker(new URL("./locWorker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev: MessageEvent<{ progress?: number; result?: PlacedLocation[]; error?: string }>) => {
      const m = ev.data;
      if (m.progress != null) setProgress(m.progress);
      if (m.error) { setError(m.error); setProgress(null); w.terminate(); }
      if (m.result) {
        cache.set(seed, m.result);
        setRaw(m.result);
        setProgress(1);
        w.terminate();
      }
    };
    w.onerror = (e) => { setError(e.message); setProgress(null); };
    w.postMessage({ seed });
    return () => w.terminate();
  }, [seed]);

  const items = useMemo(() => (raw ? decorate(raw) : null), [raw]);

  const categories = useMemo(() => {
    const byCat = new Map<string, Map<string, LocationType>>();
    for (const l of items ?? []) {
      const types = byCat.get(l.category) ?? new Map<string, LocationType>();
      byCat.set(l.category, types);
      const t = types.get(l.type) ?? { id: l.type, name: l.name, category: l.category, color: l.color,
        iconUrl: l.icon ? l.icon.src : null, count: 0, candidate: l.candidate };
      t.count++;
      types.set(l.type, t);
    }
    return CATEGORIES.filter((c) => byCat.has(c.id)).map((c) => {
      const types = [...byCat.get(c.id)!.values()].sort((a, b) => a.name.en.localeCompare(b.name.en));
      return { id: c.id, name: c.name, color: c.color, count: types.reduce((n, t) => n + t.count, 0), types };
    });
  }, [items]);

  const spawn = useMemo(() => {
    const s = items?.find((l) => l.category === "start");
    return s ? { x: s.x, z: s.z } : null;
  }, [items]);

  return { items, categories, progress, spawn, error };
}
