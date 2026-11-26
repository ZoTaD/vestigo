/**
 * Seguidos y perfil propio de AoE2 (2026-11-20). Sin sesión de Steam los seguidos viven en el navegador
 * (`vg_aoe2_follows`); con sesión, en la cuenta (`/api/follows?game=aoe2`, Worker de `api/`). Al iniciar sesión se junta
 * lo del navegador con lo de la cuenta. Las funciones puras tienen tests en `test/aoe2Me.test.ts`; `useAoe2Me` las conecta.
 *
 * El perfil propio ya no se marca a mano (el botón "Soy yo" salió el 2026-11-26: cualquiera podía decir que era otro).
 * Sale del SteamID de la sesión: el perfil de AoE2 cuyo SteamID es el de la cuenta es el tuyo.
 */
import { useCallback, useEffect, useState } from "react";

export type Follows = { follows: number[] };
type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };

const KEY = "vg_aoe2_follows";
/** Marca de "lo de este navegador ya se juntó con la cuenta". */
const JUNTADO = "vg_aoe2_merged";
const VACIO: Follows = { follows: [] };
const esId = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

export function localFollows(s: Store | null): Follows {
  try {
    const raw = s?.getItem(KEY);
    if (!raw) return VACIO;
    // Lo guardado antes del 2026-11-26 traía además `me`: se ignora.
    const o = JSON.parse(raw) as Partial<Follows>;
    return { follows: Array.isArray(o.follows) ? o.follows.filter(esId) : [] };
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

/** Los seguidos se suman (primero los de la cuenta). */
export const mergeFollows = (local: Follows, remote: Follows): Follows => ({
  follows: [...new Set([...remote.follows, ...local.follows])],
});

/** Con sesión: la primera vez en este navegador se junta lo local con la cuenta; después la cuenta manda (si no, lo que
 * se dejó de seguir en otro equipo volvería desde el `localStorage` de éste). */
export const resolveFollows = (local: Follows, remote: Follows, yaJuntado: boolean): Follows => (yaJuntado ? remote : mergeFollows(local, remote));

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

/** El SteamID64 de la cuenta guardada por `NavAccount` (`vg_account`), o null sin sesión. */
export function steamIdDeSesion(s: Store | null = storage(), sesion = conSesion()): string | null {
  if (!sesion) return null;
  try {
    const raw = s?.getItem("vg_account");
    const id = raw ? (JSON.parse(raw) as { steamId?: unknown }).steamId : null;
    return typeof id === "string" && /^7656\d{13}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** El SteamID de la sesión, leído después de montar (el HTML prerenderizado no sabe quién mira). */
export function useSteamId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => setId(steamIdDeSesion()), []);
  return id;
}

/** Perfil de AoE2 de la cuenta, buscado una vez por sesión del navegador. */
const MIO = "vg_aoe2_mine";
export function useMiPerfil(): number | null {
  const steam = useSteamId();
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    if (!steam) return setId(null);
    try {
      const guardado = sessionStorage.getItem(MIO);
      if (guardado?.startsWith(`${steam}:`)) return setId(Number(guardado.slice(steam.length + 1)) || null);
    } catch {
      // sin almacenamiento: se pregunta
    }
    let vivo = true;
    fetch(`/api/aoe2/search?q=${steam}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ results: { id: number }[] }>) : null))
      .then((r) => {
        if (!vivo || !r) return;
        const mio = r.results[0]?.id ?? null;
        setId(mio);
        try {
          sessionStorage.setItem(MIO, `${steam}:${mio ?? 0}`);
        } catch {
          // nada
        }
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [steam]);
  return id;
}

/** Los seguidos, con guardado en la cuenta si hay sesión y en el navegador si no. */
export function useAoe2Me() {
  const [f, setF] = useState<Follows>(VACIO);
  const [cuenta, setCuenta] = useState(false);
  useEffect(() => {
    const local = localFollows(storage());
    const inicial = local;
    setF(inicial);
    if (!conSesion()) return;
    fetch("/api/follows?game=aoe2", { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<Follows>) : Promise.reject(r.status)))
      .then((remoto) => {
        const st = storage();
        let yaJuntado = false;
        try {
          yaJuntado = st?.getItem(JUNTADO) === "1";
        } catch {
          yaJuntado = false;
        }
        const junto = resolveFollows(local, remoto, yaJuntado);
        // Si el usuario tocó algo mientras llegaba la cuenta, eso gana (se sube al guardar).
        setF((actual) => (actual === inicial ? junto : actual));
        setCuenta(true);
        saveLocalFollows(st, junto);
        try {
          st?.setItem(JUNTADO, "1");
        } catch {
          // sin lugar: se vuelve a juntar la próxima vez, nada más
        }
        if (junto.follows.length !== remoto.follows.length) void subir(junto);
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
    follows: f.follows,
    toggleFollow: (id: number) => guardar({ follows: toggle(f.follows, id) }),
  };
}

const subir = (f: Follows) =>
  fetch("/api/follows?game=aoe2", { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(f) }).catch(() => undefined);
