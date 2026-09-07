/**
 * El último perfil de Deadlock que se miró, para ofrecerlo a un clic desde la
 * portada ("último visto: ZoTaD").
 *
 * Es el par de TFT de `lastSearch.ts`: sólo el id y el nombre, en
 * `localStorage`, para que una visita nueva encuentre su perfil sin escribir.
 * Es lo único que se escribe en el dispositivo del visitante desde acá, y la
 * política de privacidad lo nombra junto al Riot ID recordado.
 */

const KEY = "vestigo.lastProfile";

export interface LastProfile {
  accountId: number;
  name: string;
  /** El rango, en texto, si se sabía al guardarlo. Sólo para mostrarlo. */
  rank?: string;
}

export function lastProfile(): LastProfile | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<LastProfile>;
    if (typeof p.accountId !== "number" || typeof p.name !== "string") return null;
    return { accountId: p.accountId, name: p.name, rank: typeof p.rank === "string" ? p.rank : undefined };
  } catch {
    return null;
  }
}

export function rememberProfile(p: LastProfile): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* Un navegador sin espacio o en modo privado no rompe la página. */
  }
}

export function forgetProfile(): void {
  if (typeof localStorage !== "undefined") localStorage.removeItem(KEY);
}
