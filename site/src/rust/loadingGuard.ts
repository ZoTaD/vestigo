/**
 * ¿La página prerenderizada de Rust salió con la hoja de "cargando…" (`RsLoading`, clase `rs-loading`)? Se mira la
 * clase como palabra entera dentro del atributo `class`: la cadena suelta daría falsos positivos con cualquier clase
 * que la contenga (`rs-loading-bar`), y haría fallar un build sano.
 */
export function isRsLoadingPage(html: string): boolean {
  return /class="(?:[^"]*\s)?rs-loading(?:\s[^"]*)?"/.test(html);
}
