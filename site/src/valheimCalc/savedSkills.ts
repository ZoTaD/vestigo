/**
 * Las habilidades leídas del personaje en Mi partida (2026-10-30), guardadas en este navegador. La calculadora de
 * Habilidades las ofrece como nivel actual. Sin almacenamiento (o en el prerender), null.
 */
export const SKILLS_KEY = "vestigo:valheim:skills";

export function savedSkills(): Record<number, number> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SKILLS_KEY);
    return raw ? (JSON.parse(raw) as Record<number, number>) : null;
  } catch {
    return null;
  }
}

export function saveSkills(skills: Record<number, number>): void {
  try {
    localStorage.setItem(SKILLS_KEY, JSON.stringify(skills));
  } catch { /* sin almacenamiento: no se guardan */ }
}
