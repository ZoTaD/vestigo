/**
 * ¿La página prerenderizada de CoH3 salió con la hoja de "cargando…" (`Coh3Loading`, clase `c3-loading`)? Igual que
 * `cs2/loadingGuard.ts`.
 */
export function isCoh3LoadingPage(html: string): boolean {
  return /class="(?:[^"]*\s)?c3-loading(?:\s[^"]*)?"/.test(html);
}
