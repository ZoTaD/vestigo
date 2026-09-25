/**
 * La lista del Planificador (2026-09-25): una sola para todo el sitio, así el
 * botón "Agregar al Planificador" de cada ficha y la pestaña ven lo mismo. Se
 * guarda en este navegador y, en las páginas del Planificador, en la dirección
 * (para compartirla). Sin cuentas.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { addPick, decodePlan, EMPTY_PLAN, encodePlan, type PlanState } from "./valheimPlanner";

const KEY = "vestigo:valheim:planner";
const HAVE = "vestigo:valheim:planner:have";
const onPlanner = () => typeof window !== "undefined" && window.location.pathname.includes("/valheim/planner");

let plan: PlanState = EMPTY_PLAN;
let ready = false;
const subs = new Set<() => void>();

function start() {
  if (ready || typeof window === "undefined") return;
  ready = true;
  const fromUrl = onPlanner() ? decodePlan(window.location.search) : EMPTY_PLAN;
  if (fromUrl.picks.length) { plan = fromUrl; return; }
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) plan = decodePlan(`?${saved}`);
  } catch { /* sin almacenamiento: la lista vive sólo en esta pestaña */ }
}

export function getPlan(): PlanState {
  start();
  return plan;
}

/** Deja la lista en la dirección, sin sumar una entrada al historial. Sólo en el Planificador. */
export function writeUrl() {
  if (!onPlanner()) return;
  const q = encodePlan(getPlan());
  window.history.replaceState(window.history.state, "", window.location.pathname + (q ? `?${q}` : ""));
}

export function setPlan(next: PlanState) {
  start();
  plan = next;
  try { localStorage.setItem(KEY, encodePlan(next)); } catch { /* ídem */ }
  writeUrl();
  subs.forEach((f) => f());
}

export const addToPlan = (id: string) => setPlan(addPick(getPlan(), id));

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const usePlan = (): PlanState => useSyncExternalStore(subscribe, getPlan, () => EMPTY_PLAN);

/** "Ya lo tengo": sólo visual, por lista; si la lista cambia, se empieza de cero. */
function readHave(list: string): Set<string> {
  try {
    const o = JSON.parse(localStorage.getItem(HAVE) ?? "null");
    return new Set(o && o.list === list ? o.ids : []);
  } catch {
    return new Set();
  }
}

export function useHave(list: string): [Set<string>, (id: string) => void] {
  const [have, setHave] = useState<Set<string>>(() => new Set());
  useEffect(() => setHave(readHave(list)), [list]);
  const toggle = (id: string) => setHave((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    try { localStorage.setItem(HAVE, JSON.stringify({ list, ids: [...n] })); } catch { /* ídem */ }
    return n;
  });
  return [have, toggle];
}
