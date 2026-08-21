import type { PlayerRef } from "./api";
import type { LpSnapshot } from "./lp";

/**
 * The profile you last looked at, so leaving the Player tab and coming back
 * does not mean typing your Riot ID again.
 *
 * Two layers, because they answer different questions and only one of them
 * costs anything:
 *
 *   session   The whole result, in memory. Switching tabs unmounts the view;
 *             restoring from here redraws it with NO request at all. Without
 *             this, every tab switch would spend one of the twelve searches a
 *             minute an IP is allowed, on a profile we already had.
 *
 *   stored    Just the Riot ID and region, in localStorage, so a fresh page
 *             load can offer the same thing. This is the only part that
 *             survives closing the browser, and the only part that is written
 *             to the visitor's device — which is why the privacy policy names
 *             it.
 */

export interface SearchSession {
  query: string;
  region: string;
  player: PlayerRef;
  matches: unknown[];
  expected: number;
  offline: boolean;
  /** Kept with the rest so coming back to the tab redraws the graph too. */
  lpHistory: LpSnapshot[];
}

/**
 * Module-level on purpose. It is not React state: nothing re-renders when it
 * changes, it is only read once when the view mounts.
 */
let session: SearchSession | null = null;

export const rememberSession = (s: SearchSession): void => {
  session = s;
};
export const lastSession = (): SearchSession | null => session;
export const forgetSession = (): void => {
  session = null;
};

const STORAGE_KEY = "vestigo.lastPlayer";

export interface StoredSearch {
  query: string;
  region: string;
}

/** The Riot ID typed last time, or null. Never throws on a hostile value. */
export function storedSearch(): StoredSearch | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSearch>;
    if (typeof parsed?.query !== "string" || typeof parsed?.region !== "string") return null;
    // A stored value is attacker-controllable in the sense that anything with
    // script access could have written it, so it is treated as untrusted input
    // and bounded rather than used as-is.
    if (parsed.query.length > 64 || parsed.region.length > 8) return null;
    return { query: parsed.query, region: parsed.region };
  } catch {
    return null;
  }
}

export function rememberSearch(query: string, region: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ query, region }));
  } catch {
    // Private browsing and a full quota both throw here. Forgetting the last
    // profile is not worth breaking a search over.
  }
}

/** Used by the footer's "forget me" control, alongside the analytics opt-out. */
export function forgetSearch(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
  forgetSession();
}
