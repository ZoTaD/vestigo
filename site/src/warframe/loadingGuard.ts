/**
 * ¿La página prerenderizada de Warframe salió con la hoja de "cargando…" (`WfLoading`, clase `wf-loading`)? Se mira la
 * clase como palabra entera dentro del atributo `class`, igual que en Stardew, Rust y Terraria.
 */
export function isWfLoadingPage(html: string): boolean {
  return /class="(?:[^"]*\s)?wf-loading(?:\s[^"]*)?"/.test(html);
}
