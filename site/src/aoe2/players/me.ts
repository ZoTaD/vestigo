/**
 * "Soy yo" y seguidos de AoE2 (2026-11-20). Sin sesión de Steam viven en el navegador (`vg_aoe2_follows`); con sesión,
 * en la cuenta (`/api/follows?game=aoe2`, Worker de `api/`). Al iniciar sesión se junta lo del navegador con lo de la
 * cuenta. Las funciones puras tienen tests en `test/aoe2Me.test.ts`; `useAoe2Me` las conecta.
 */
import { useCallback, useEffect, useState } from "react";

export type Follows = { me: number | null; follows: number[] };
type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };

const KEY = "vg_aoe2_follows";
const VACIO: Follows = { me: null, follows: [] };
const esId = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

export function localFollows(s: Store | null): Follows {
  try {
    const raw = s?.getItem(KEY);
    if (!raw) return VACIO;
    const o = JSON.parse(raw) as Partial<Follows>;
    return { me: esId(o.me) ? o.me : null, follows: Array.isArray(o.follows) ? o.follows.filter(esId) : [] };
  } catch {
    return VACIO;
  }
}

export function saveLocalFollows(s: Store | null, f: Follows): void {
  try {
    s?.setItem(KEY, JSON.stringify(f));
  } catch {
    // Sin lugar o bloqueado: se pierde al cerrar, nada más.
  }
}

/** Lo de la cuenta manda en "Soy yo"; los seguidos se suman (primero los de la cuenta). */
export const mergeFollows = (local: Follows, remote: Follows): Follows => ({
  me: remote.me ?? local.me,
  follows: [...new Set([...remote.follows, ...local.follows])],
});

export const toggle = (lista: readonly number[], id: number): number[] => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

const storage = (): Store | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};
/** La pista de sesión que deja el login (`vg_in`, ver `NavAccount.tsx`): sin ella no se le pregunta a la API. */
const conSesion = () => typeof document !== "undefined" && /(?:^|;\s*)vg_in=/.test(document.cookie);

/** El estado de "Soy yo" y seguidos, con guardado en la cuenta si hay sesión y en el navegador si no. */
export function useAoe2Me() {
  const [f, setF] = useState<Follows>(VACIO);
  const [cuenta, setCuenta] = useState(false);
  useEffect(() => {
    const local = localFollows(storage());
    setF(local);
    if (!conSesion()) return;
    fetch("/api/follows?game=aoe2", { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<Follows>) : Promise.reject(r.status)))
      .then((remoto) => {
        const junto = mergeFollows(local, remoto);
        setF(junto);
        setCuenta(true);
        if (junto.follows.length !== remoto.follows.length || junto.me !== remoto.me) void subir(junto);
      })
      .catch(() => undefined);
  }, []);
  const guardar = useCallback(
    (nuevo: Follows) => {
      setF(nuevo);
      saveLocalFollows(storage(), nuevo);
      if (cuenta) void subir(nuevo);
    },
    [cuenta],
  );
  return {
    me: f.me,
    follows: f.follows,
    setMe: (id: number | null) => guardar({ ...f, me: id }),
    toggleFollow: (id: number) => guardar({ ...f, follows: toggle(f.follows, id) }),
  };
}

const subir = (f: Follows) =>
  fetch("/api/follows?game=aoe2", { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(f) }).catch(() => undefined);
