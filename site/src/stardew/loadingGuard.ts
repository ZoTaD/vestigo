/**
 * ¿La página prerenderizada de Stardew Valley salió con la hoja de "cargando…" (`SdLoading`, clase `sd-loading`)? Se
 * mira la clase como palabra entera dentro del atributo `class`, igual que en Rust y Terraria (`terraria/loadingGuard.ts`).
 */
export function isSdLoadingPage(html: string): boolean {
  return /class="(?:[^"]*\s)?sd-loading(?:\s[^"]*)?"/.test(html);
}
