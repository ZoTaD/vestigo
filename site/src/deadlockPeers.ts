import { useEffect, useState } from "react";
import { fetchNames, type HistoryRow, type SteamAccount } from "./deadlockMatch";

/**
 * Con quién jugás y contra quién te cruzás.
 *
 * **Las dos preguntas salen de dos endpoints con la misma forma** —
 * `players/{id}/mate-stats` y `players/{id}/enemy-stats`— y por eso comparten
 * todo: el tipo, el cruce con el historial y la tarjeta que las dibuja.
 *
 * Es la feature que Statlocker pone al frente de su perfil ("win rates with your
 * friends"); la mitad de los rivales no la publica nadie.
 */

/** Una fila cruda, ya normalizada: los dos endpoints nombran distinto la misma columna. */
export interface PeerRaw {
  accountId: number;
  /** Los `match_id` compartidos. Es lo que permite cruzar contra el historial. */
  matches: number[];
}

/** Un compañero o un rival, ya medido sobre el modo que el perfil está mirando. */
export interface Peer {
  accountId: number;
  matches: number;
  wins: number;
  losses: number;
}

/**
 * Cuántas partidas compartidas hacen falta para entrar en la lista.
 *
 * Cruzarse una vez con alguien no es "tu némesis": es el matchmaking. Dos es el
 * mínimo con el que la palabra "recurrente" significa algo, y es además el piso
 * que se le pide a la API (`min_matches_played`), así que la lista que llega ya
 * viene sin el ruido de una sola coincidencia.
 */
export const PEER_MIN = 2;

/**
 * Cruza las filas crudas contra el historial del modo elegido.
 *
 * **Las victorias se recalculan, no se copian.** La API cuenta sobre el
 * historial entero y el perfil habla del modo que el visitante eligió: copiar
 * `wins` haría que un dúo de 60-60 de siempre dijera "60-60" también dentro de
 * una pestaña de clasificatorias donde jugaron tres partidas.
 *
 * **Que se pueda recalcular está medido** (2026-08-25): el 100% de los
 * `match_id` que devuelven los dos endpoints está dentro del historial que la
 * página ya bajó, y las victorias recalculadas dan exactamente los mismos
 * números que la API sobre "todas" (60 de 120 con el dúo principal, 2 de 4 con
 * el rival más repetido). Los ids que el historial no tenga se ignoran: hoy no
 * hay ninguno, pero eso es una propiedad de los datos y no una promesa del
 * contrato.
 *
 * No cuesta ningún pedido más al cambiar de modo: el cruce es en memoria.
 */
export function peersInScope(peers: PeerRaw[], rows: HistoryRow[], min = PEER_MIN): Peer[] {
  if (rows.length === 0) return [];
  const won = new Map<number, boolean>();
  for (const r of rows) won.set(r.matchId, r.won);

  const out: Peer[] = [];
  for (const p of peers) {
    let matches = 0;
    let wins = 0;
    for (const id of p.matches) {
      const w = won.get(id);
      if (w === undefined) continue;
      matches++;
      if (w) wins++;
    }
    if (matches >= min) out.push({ accountId: p.accountId, matches, wins, losses: matches - wins });
  }
  return out.sort((a, b) => b.matches - a.matches || b.wins - a.wins);
}

const API = "https://api.deadlock-api.com/v1";

/** Cuál de las dos preguntas se está haciendo. */
export type PeerKind = "mates" | "enemies";

interface RawPeer {
  mate_id?: number;
  enemy_id?: number;
  matches?: number[];
}

/**
 * Los compañeros o los rivales de una cuenta.
 *
 * **Se pide con piso y no entero, y la diferencia es de dos órdenes de
 * magnitud** (medido el 2026-08-25 sobre una cuenta de 488 partidas): sin piso
 * son 128 KB y 1.774 compañeros —casi todos de una sola partida, o sea el
 * matchmaking— contra **11 KB y 125** pidiendo `min_matches_played=2`. Del lado
 * de los rivales, 160 KB y 2.204 contra 16 KB y 191.
 *
 * `wins` viene en la respuesta y **no se usa**: cuenta sobre el historial entero
 * y la tarjeta habla del modo elegido. Ver `peersInScope`.
 */
export async function fetchPeers(accountId: number, kind: PeerKind): Promise<PeerRaw[]> {
  const path = kind === "mates" ? "mate-stats" : "enemy-stats";
  const res = await fetch(`${API}/players/${accountId}/${path}?min_matches_played=${PEER_MIN}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = (await res.json()) as RawPeer[];
  return raw
    .map((r) => ({ accountId: r.mate_id ?? r.enemy_id ?? 0, matches: r.matches ?? [] }))
    .filter((p) => p.accountId > 0);
}

/**
 * Los compañeros y los rivales de un perfil: dos pedidos, una sola vez.
 *
 * **No se vuelve a pedir al cambiar de modo.** El crudo trae los `match_id`
 * compartidos, así que la pestaña de clasificatorias se contesta cruzando en
 * memoria contra las filas que ya están. Un pedido por click sería pagar dos
 * veces por el mismo dato.
 *
 * Falla en silencio: quedarse sin la tarjeta tiene que costar la tarjeta, no el
 * perfil. Es el mismo criterio que ya usan el rango y las notas.
 */
export function usePeers(accountId: number | null): { mates: PeerRaw[]; enemies: PeerRaw[] } {
  const [mates, setMates] = useState<PeerRaw[]>([]);
  const [enemies, setEnemies] = useState<PeerRaw[]>([]);

  useEffect(() => {
    setMates([]);
    setEnemies([]);
    if (accountId === null || !Number.isFinite(accountId)) return;
    let vivo = true;
    fetchPeers(accountId, "mates").then(
      (p) => vivo && setMates(p),
      () => undefined
    );
    fetchPeers(accountId, "enemies").then(
      (p) => vivo && setEnemies(p),
      () => undefined
    );
    return () => {
      vivo = false;
    };
  }, [accountId]);

  return { mates, enemies };
}

/**
 * Los nombres de Steam de las cuentas que se están dibujando.
 *
 * **El caché es lo que hace que cambiar de modo salga gratis.** Sin él, cada
 * click en el filtro volvería a pedir los mismos diez nombres; con él sólo se
 * piden los que aparecieron por primera vez, que suelen ser cero.
 *
 * Vive en el módulo y no en el estado del componente a propósito: el perfil
 * monta y desmonta la tarjeta al cambiar de cuenta, y los nombres de Steam no
 * dejan de ser válidos por eso.
 */
const nombres = new Map<number, SteamAccount>();

export function useSteamNames(ids: number[]): Map<number, SteamAccount> {
  const [, redibujar] = useState(0);
  // La clave es la lista de ids y no el array: un array nuevo con los mismos
  // ids no tiene por qué disparar otro pedido.
  const clave = ids.join(",");

  useEffect(() => {
    const faltan = ids.filter((id) => !nombres.has(id));
    if (faltan.length === 0) return;
    let vivo = true;
    fetchNames(faltan).then((m) => {
      for (const [id, a] of m) nombres.set(id, a);
      if (vivo && m.size > 0) redibujar((n) => n + 1);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return nombres;
}
