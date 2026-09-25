/**
 * El `.build` del Build Planner del juego (desde la 0.5): un JSON que se deja en
 * `Documentos\My Games\Path of Exile 2\BuildPlanner` y el juego marca en el árbol
 * cada pasivo en su rango de niveles.
 *
 * Forma (la de los archivos que el juego acepta):
 *   { name, author, ascendancy, passives: [{ id, level_interval: [desde, hasta], weapon_set? }],
 *     skills: [{ id, level_interval, support_skills: [{ id }] }] }
 * `id` de un pasivo es el id de texto del export ("projectiles15"); el de una gema,
 * su ruta de metadata ("Metadata/Items/Gems/SkillGemLightningArrow").
 */
import type { Tree } from "./data";
import { MAX_LEVEL } from "./points";
import { Planner, type RouteEntry, type WeaponSet } from "./planner";
import type { GemStage } from "./share";

interface BuildPassive { id: string; level_interval?: [number, number]; weapon_set?: number; additional_text?: string }
interface BuildSkill { id: string; level_interval?: [number, number]; support_skills?: { id: string }[] }
export interface BuildFile {
  name?: string;
  author?: string;
  ascendancy?: string;
  passives?: BuildPassive[];
  skills?: BuildSkill[];
  [k: string]: unknown;
}

export function toBuild(P: Planner, gems: GemStage[], gemIds: Record<string, string>, name: string): BuildFile {
  const lv = P.levels();
  const passives: BuildPassive[] = [];
  if (P.ascStart) passives.push({ id: P.T.nodes[P.ascStart].gid, level_interval: [lv.asc[0] ?? MAX_LEVEL, MAX_LEVEL] });
  P.route.forEach((id, i) => {
    const l = lv.main[i];
    if (l == null) return; // no alcanzan los puntos
    const p: BuildPassive = { id: P.T.nodes[id].gid, level_interval: [l, MAX_LEVEL] };
    if (P.ws[id]) p.weapon_set = P.ws[id];
    passives.push(p);
  });
  P.ascRoute.forEach((id, i) => {
    const l = lv.asc[i];
    if (l != null) passives.push({ id: P.T.nodes[id].gid, level_interval: [l, MAX_LEVEL] });
  });
  const skills: BuildSkill[] = [];
  for (const st of gems) {
    for (const s of st.skills) {
      const id = gemIds[s.slug];
      if (!id) continue;
      skills.push({
        id,
        level_interval: [st.from, st.to],
        support_skills: s.sup.map((x) => gemIds[x]).filter(Boolean).map((x) => ({ id: x })),
      });
    }
  }
  const out: BuildFile = { name, author: "vestigo.gg" };
  if (P.asc) out.ascendancy = P.asc;
  out.passives = passives;
  out.skills = skills;
  return out;
}

export interface Imported {
  ci: number;
  asc: string | null;
  route: RouteEntry[];
  gems: GemStage[];
  /** Pasivos del archivo que no están en este árbol (otra versión). */
  unknown: number;
}

/**
 * Lee un `.build`. Si trae varias etapas (una guía de campaña con respecs), se
 * queda con el árbol final —lo que llega al nivel más alto— en el orden en que
 * aparece cada nodo.
 */
export function fromBuild(b: BuildFile, T: Tree, gemIds: Record<string, string>): Imported | null {
  const byGid = new Map(Object.entries(T.nodes).map(([k, n]) => [n.gid, k]));
  const passives = (b.passives ?? []).filter((p) => typeof p?.id === "string");
  const end = Math.max(0, ...passives.map((p) => p.level_interval?.[1] ?? MAX_LEVEL));
  const first = new Map<string, number>();
  for (const p of passives) {
    const s = p.level_interval?.[0] ?? 1;
    first.set(p.id, Math.min(first.get(p.id) ?? Infinity, s));
  }
  const final = passives.filter((p) => (p.level_interval?.[1] ?? MAX_LEVEL) === end);
  let unknown = 0;
  const entries: (RouteEntry & { at: number })[] = [];
  const seen = new Set<string>();
  for (const p of final) {
    const id = byGid.get(p.id);
    if (!id) { unknown++; continue; }
    if (seen.has(id)) continue;
    seen.add(id);
    const ws = (p.weapon_set === 1 || p.weapon_set === 2 ? p.weapon_set : 0) as WeaponSet;
    entries.push({ id, ws, at: first.get(p.id) ?? 1 });
  }
  entries.sort((a, b) => a.at - b.at);

  // La clase: la de la ascendencia, o la que tenga el inicio pegado a algún nodo.
  let ci = -1;
  const asc = typeof b.ascendancy === "string" ? b.ascendancy : null;
  if (asc) ci = T.classes.findIndex((c) => c.asc.some((a) => a.id === asc));
  if (ci < 0) {
    const ids = new Set(entries.map((e) => e.id));
    ci = T.classes.findIndex((c) => T.edges.some(([x, y]) => (x === c.start && ids.has(y)) || (y === c.start && ids.has(x))));
  }
  if (ci < 0) return null;

  const bySlugId = new Map(Object.entries(gemIds).map(([slug, id]) => [id, slug]));
  const stages = new Map<string, GemStage>();
  for (const s of b.skills ?? []) {
    const slug = bySlugId.get(s.id);
    if (!slug) continue;
    const [from, to] = s.level_interval ?? [1, MAX_LEVEL];
    const key = `${from}-${to}`;
    if (!stages.has(key)) stages.set(key, { from, to, skills: [] });
    stages.get(key)!.skills.push({ slug, sup: (s.support_skills ?? []).map((x) => bySlugId.get(x.id)).filter((x): x is string => !!x) });
  }
  const gems = [...stages.values()].sort((a, b) => a.from - b.from || a.to - b.to);
  return { ci, asc: asc && T.classes[ci].asc.some((a) => a.id === asc && a.c) ? asc : null, route: entries, gems, unknown };
}

/** Aplica lo importado a un planificador. */
export function applyImport(P: Planner, imp: Imported): void {
  P.setClass(imp.ci);
  P.setAsc(imp.asc);
  P.load(imp.route);
}
