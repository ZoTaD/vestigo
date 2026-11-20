/**
 * Los datos de las pestañas extra de AoE2 (2026-11-21): logros de Steam, parches y build orders. Cada archivo en su
 * chunk, pedido una vez; `peek` para el prerender.
 */
import type { Nombre } from "../encyclopedia/data";

export type Logro = { slug: string; name: Nombre; desc: Nombre; icon: string | null; hidden: boolean; pct: number | null };
export type Logros = { generatedAt: string; list: Logro[] };
/** Un parche con cómo le fue a cada civ antes y después: `[civ, %antes, partidas, %después, partidas]`. */
export type Parche = { name: string; date: string; minor: boolean; url: string; civs: [string, number, number, number, number][]; days: [number, number] };
type Cambio = [number, string, unknown, unknown];
export type Diferencias = Record<string, { from: string; units: Cambio[]; new: number[]; techs: Cambio[]; civs: Record<string, { added: string[]; removed: string[] }> }>;
export type Paso = { pop: number; time: string; en: string; es: string };
export type BuildOrder = { slug: string; opening: string; name: Nombre; maps: string[]; feudal: { pop: number; time: string }; summary: Nombre; steps: Paso[] };

function cache<T>(cargar: () => Promise<T>) {
  let v: T | undefined;
  let p: Promise<T> | null = null;
  return { load: (): Promise<T> => (p ??= cargar().then((x) => (v = x))), peek: (): T | undefined => v };
}

export const logros = cache(() => import("@aoe2/achievements.json").then((m) => m.default as unknown as Logros));
export const parches = cache(() => import("@aoe2stats/patches.json").then((m) => m.default as unknown as Parche[]));
export const diferencias = cache(() => import("@aoe2/encyclopedia/patchdiff.json").then((m) => m.default as unknown as Diferencias));
export const buildOrders = cache(() => import("@aoe2/buildorders.json").then((m) => (m.default as unknown as { list: BuildOrder[] }).list));

/** Lo que el prerender espera para estas pestañas. */
export async function preloadExtras(route: { a2Section?: string }): Promise<void> {
  const sec = route.a2Section;
  if (sec === "achievements") await logros.load();
  else if (sec === "patches") {
    const [{ unidades, tecnologias }] = await Promise.all([import("../encyclopedia/data"), parches.load(), diferencias.load()]);
    await Promise.all([unidades.load(), tecnologias.load()]);
  } else if (sec === "build-orders") {
    const { loadSummary } = await import("../stats/data");
    await Promise.all([buildOrders.load(), loadSummary()]);
  }
}
