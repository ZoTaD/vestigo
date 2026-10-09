/** El contexto del editor (2026-10-09): el estado, el idioma y los textos, para los nodos y los paneles. */
import { createContext, useContext, useSyncExternalStore } from "react";
import type { ElectricCopy } from "../copy";
import type { EditorStore } from "./store";

export interface EditorCtx {
  store: EditorStore;
  lang: "en" | "es";
  t: ElectricCopy;
  readOnly: boolean;
}

export const Ctx = createContext<EditorCtx | null>(null);

export function useEditor(): EditorCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("fuera del editor");
  return c;
}

/** Se vuelve a dibujar cuando cambia el estado (la simulación avisa hasta 10 veces por segundo). */
export function useSim(): number {
  const { store } = useEditor();
  return useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
}

/** El nombre de un componente en el idioma de la página. */
export const nameOf = (n: { en: string; es: string | null }, lang: "en" | "es"): string => (lang === "es" ? n.es ?? n.en : n.en);

/** Los que usan el ícono de otro objeto (el campo `icon` de electricity.json): el poste de tendido no tiene uno. */
const BORROWED: Record<string, string> = { "powerline.pole": "fuse.highgrade" };
export const iconOf = (id: string): string => `/rust/items/${BORROWED[id] ?? id}.webp`;
