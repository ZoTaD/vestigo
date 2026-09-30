/**
 * Config mínima para correr scripts del sitio con vite-node (sin los plugins
 * del build): sólo el alias de los datos de Diablo II.
 */
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: { alias: { "@d2r": fileURLToPath(new URL("../../games/d2r/data", import.meta.url)) } },
});
