/**
 * ¿La página prerenderizada de CS2 salió con la hoja de "cargando…" (`Cs2Loading`, clase `c2-loading`)? Se mira la
 * clase como palabra entera dentro del atributo `class`, igual que en Warframe.
 */
export function isCs2LoadingPage(html: string): boolean {
  return /class="(?:[^"]*\s)?c2-loading(?:\s[^"]*)?"/.test(html);
}
