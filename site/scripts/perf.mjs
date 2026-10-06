/**
 * Cuánto pesa cada página (2026-10-06): pedidos, imágenes, nodos del DOM y memoria al cargar en frío.
 *
 *   npx vite preview --port 4173 &
 *   node scripts/perf.mjs [http://localhost:4173] [--only zomboid] [--json salida.json]
 *
 * Cada página se abre en un contexto nuevo (sin caché) y se mide cuando la red queda quieta. Es el antes y el después
 * del plan de optimización (`docs/plans/2026-10-06-optimizacion-sitio.md`) y la base del presupuesto de CI.
 *
 * Usa el Playwright que haya: el del proyecto si está, si no el global. `PW_CHROMIUM` apunta a un Chromium propio.
 */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    return require(`${execSync("npm root -g").toString().trim()}/playwright`);
  }
}
const { chromium } = loadPlaywright();

export const PAGES = [
  "/en",
  "/en/deadlock",
  "/en/deadlock/heroes",
  "/en/deadlock/items",
  "/en/deadlock/patches",
  "/en/poe2/economy",
  "/en/poe2/encyclopedia",
  "/en/valheim",
  "/en/valheim/foods",
  "/en/valheim/weapons",
  "/en/valheim/materials",
  "/en/d2r",
  "/en/d2r/runewords",
  "/en/d2r/uniques",
  "/en/d2r/sets",
  "/en/d2r/bases",
  "/en/project-zomboid",
  "/en/project-zomboid/map",
  "/en/project-zomboid/items",
  "/en/project-zomboid/recipes",
  "/en/project-zomboid/crafting",
  "/en/project-zomboid/traits",
  "/en/project-zomboid/patches",
];

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const only = flag("--only");
const jsonOut = flag("--json");
const base = (args[0] ?? "http://localhost:4173").replace(/\/$/, "");

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const rows = [];
for (const path of PAGES.filter((p) => !only || p.includes(only))) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  // Sin el aviso de cookies: no es parte de la página y tapa el primer pantallazo.
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("vestigo.consent", "denied");
    } catch {}
  });
  const page = await ctx.newPage();
  let requests = 0;
  let images = 0;
  let bytes = 0;
  const errors = [];
  page.on("request", (r) => {
    requests++;
    if (r.resourceType() === "image") images++;
  });
  page.on("response", async (r) => {
    const len = Number(r.headers()["content-length"] ?? 0);
    bytes += len;
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  page.on("pageerror", (e) => errors.push(e.message));
  const t0 = Date.now();
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 120_000 }).catch((e) => errors.push(String(e)));
  const ms = Date.now() - t0;
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  const { metrics } = await cdp.send("Performance.getMetrics");
  const m = (k) => metrics.find((x) => x.name === k)?.value ?? 0;
  const dom = await page.evaluate(() => ({ nodes: document.getElementsByTagName("*").length, imgs: document.images.length }));
  const row = { path, ms, requests, images, kb: Math.round(bytes / 1024), nodes: dom.nodes, imgTags: dom.imgs, heapMB: Math.round(m("JSHeapUsedSize") / 1e6), errors: errors.length };
  rows.push(row);
  console.log(
    `${path.padEnd(32)} ${String(ms).padStart(6)}ms req=${String(requests).padStart(4)} img=${String(images).padStart(4)} ` +
      `<img>=${String(dom.imgs).padStart(5)} nodes=${String(dom.nodes).padStart(6)} heap=${row.heapMB}MB${errors.length ? ` errores=${errors.length}` : ""}`,
  );
  for (const e of errors.slice(0, 3)) console.log(`    ${e.slice(0, 160)}`);
  await ctx.close();
}
await browser.close();
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
