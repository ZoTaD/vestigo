/**
 * La apertura de cada jugador de una partida (2026-11-20), pedida a `/api/aoe2/opening` cuando hace falta: la función
 * baja la grabación (~1 MB) y la lee, así que se piden de a dos a la vez y cada una una sola vez (la respuesta no cambia).
 */
import { useEffect, useState } from "react";
import type { Opening } from "../api/openings";
import type { Aoe2Match, MatchMode } from "../api/wel";

const CON_APERTURA = new Set<MatchMode>(["rm1v1", "rmteam", "ew1v1", "ewteam"]);
/** Si vale la pena leer la apertura: en Deathmatch se arranca en Imperial, las personalizadas pueden ser cualquier cosa y
 * en menos de 5 minutos no hay apertura. */
export const tieneApertura = (m: Pick<Aoe2Match, "mode" | "start" | "end">): boolean => CON_APERTURA.has(m.mode) && m.end - m.start > 300;

type Res = Record<number, Opening> | null;
const hechas = new Map<string, Promise<Res>>();
const cola: (() => void)[] = [];
let activas = 0;
const MAX = 2;

function correr() {
  while (activas < MAX && cola.length) {
    activas++;
    cola.shift()!();
  }
}

export function fetchOpening(id: number, p: number): Promise<Res> {
  const k = `${id}:${p}`;
  let pr = hechas.get(k);
  if (!pr) {
    pr = new Promise<Res>((ok) => {
      cola.push(() =>
        fetch(`/api/aoe2/opening?id=${id}&p=${p}`)
          .then((r) => {
            if (r.ok) return r.json() as Promise<{ players: Record<number, Opening> }>;
            // 404 = no hay grabación (no va a aparecer); lo demás es una falla pasajera: se puede volver a pedir.
            if (r.status !== 404) hechas.delete(k);
            return null;
          })
          .then((d) => ok(d?.players ?? null))
          .catch(() => {
            hechas.delete(k);
            ok(null);
          })
          .finally(() => {
            activas--;
            correr();
          }),
      );
      correr();
    });
    hechas.set(k, pr);
  }
  return pr;
}

/** `undefined` mientras carga (o mientras `pedir` es false), `null` si no hay grabación. */
export function useOpening(id: number, p: number, pedir = true): Res | undefined {
  const [r, setR] = useState<Res | undefined>(undefined);
  useEffect(() => {
    if (!pedir) return;
    let vivo = true;
    void fetchOpening(id, p).then((x) => vivo && setR(x));
    return () => {
      vivo = false;
    };
  }, [id, p, pedir]);
  return r;
}
