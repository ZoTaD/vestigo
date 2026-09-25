/**
 * Las fuentes de todo el sitio, servidas desde vestigo.gg (2026-09-25).
 *
 * Cada `import` trae las `@font-face` de un peso con sus rangos de caracteres
 * (latin, latin-ext…): el navegador baja sólo el archivo del rango que la
 * página usa, y sólo si alguna regla usa ese peso. Vite copia los `.woff2` a
 * /assets con hash, que se guardan un año (`netlify.toml`).
 *
 * Los pesos son los que pedía el enlace a Google Fonts que reemplazan. Antes de
 * sumar uno, confirmar que alguna regla lo usa.
 */
import "@fontsource/big-shoulders-display/700";
import "@fontsource/big-shoulders-display/800";
import "@fontsource/big-shoulders-display/900";
import "@fontsource/barlow/400";
import "@fontsource/barlow/500";
import "@fontsource/barlow/600";
import "@fontsource/barlow/700";
import "@fontsource/barlow-condensed/500";
import "@fontsource/barlow-condensed/700";
import "@fontsource/barlow-condensed/900";
