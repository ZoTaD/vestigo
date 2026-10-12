/**
 * Capturas de pantalla de una lista de páginas, en escritorio y en teléfono, para revisar el diseño a ojo.
 *
 *   node scripts/shots.mjs <carpeta de salida> [http://localhost:5205] /en/terraria /en/terraria/items …
 *
 * Usa el mismo Chromium que `perf.mjs` (`PW_CHROMIUM`). Cada página sale entera (`fullPage`), después de bajar
 * despacio hasta el final para que carguen las imágenes `lazy`.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const [out, ...rest] = process.argv.slice(2);
const base = rest[0]?.startsWith("http") ? rest.shift().replace(/\/$/, "") : "http://localhost:5205";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
for (const [tag, viewport] of [["d", { width: 1400, height: 900 }], ["m", { width: 375, height: 812 }]]) {
  const page = await (await browser.newContext({ viewport })).newPage();
  for (const path of rest) {
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(400);
    const name = `${path.replace(/[^\w]+/g, "_").replace(/^_/, "")}_${tag}.png`;
    await page.screenshot({ path: `${out}/${name}`, fullPage: true });
    console.log(name);
  }
  await page.close();
}
await browser.close();
