/**
 * ¿La página prerenderizada de Terraria salió con la hoja de "cargando…" (`TrLoading`, clase `tr-loading`)? Se mira la
 * clase como palabra entera dentro del atributo `class`, igual que en Rust (`rust/loadingGuard.ts`).
 */
export function isTrLoadingPage(html: string): boolean {
  return /class="(?:[^"]*\s)?tr-loading(?:\s[^"]*)?"/.test(html);
}
