/**
 * Cuánto pesa cada página (2026-10-06): pedidos, imágenes, nodos del DOM y memoria al cargar en frío.
 *
 *   npx vite preview --port 4173 &
 *   node scripts/perf.mjs [http://localhost:4173] [--only zomboid] [--json salida.json] [--budget]
 *
 * Cada página se abre en un contexto nuevo (sin caché) y se mide cuando la red queda quieta. Es el antes y el después
 * del plan de optimización (`docs/plans/2026-10-06-optimizacion-sitio.md`) y la base del presupuesto de CI.
 *
 * Con `--budget` sale con error si una página pasa el presupuesto de `CLAUDE.md` (`BUDGET` abajo). No corre en CI: los
 * minutos de GitHub Actions están contados (ver `.github/workflows/tests.yml`); se corre antes de publicar un juego o una
 * pestaña nueva.
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
  "/en/rust",
  "/en/rust/items",
  // La ficha más pesada: los fragmentos de metal se usan en 303 objetos.
  "/en/rust/items/metal-fragments",
  "/en/rust/raid",
  "/es/rust/objetos",
  // Granjas (2026-10-09): la portada de la granja (94 compostables), una planta y la calculadora.
  "/en/rust/farming",
  "/en/rust/farming/hemp",
  "/en/rust/farming/genetics",
  "/es/rust/granjas/genetica",
  // Parches (2026-10-09): la lista (41 portadas) y la edición más larga traducida.
  "/en/rust/patches",
  "/es/rust/parches/livestock",
  // Monumentos (2026-10-09): la lista con la red de Power Trip y la ficha con la tienda más larga (Bandit Camp, 46).
  "/en/rust/monuments",
  "/en/rust/monuments/bandit-camp",
  "/es/rust/monumentos/complejo-de-apartamentos",
  // Lo que aparece en cada monumento (2026-10-09): la que más cajas tiene y la de los científicos nuevos.
  "/en/rust/monuments/launch-site",
  "/es/rust/monumentos/plataforma-petrolifera",
  // Servidor (2026-10-09): 1.384 convars de a tandas.
  "/en/rust/server",
  // Electricidad (2026-10-09): el editor (en frío abre la torreta solar) y el circuito listo más grande.
  "/en/rust/electricity",
  "/es/rust/electricidad",
  "/en/rust/electricity/battery-backup",
  // Agua e industrial (2026-10-09): un circuito de cada uno.
  "/en/rust/electricity/farm-irrigation",
  "/es/rust/electricidad/horno-automatico",
];

/** El presupuesto por página al abrir en frío. Es el mismo de `CLAUDE.md`: si se cambia, cambiar los dos. */
export const BUDGET = { requests: 250, images: 200, nodes: 3000 };

const args = process.argv.slice(2);
const budget = args.includes("--budget");
if (budget) args.splice(args.indexOf("--budget"), 1);
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
if (budget) {
  const over = rows.flatMap((r) => [
    ...(r.requests > BUDGET.requests ? [`${r.path}: ${r.requests} pedidos (tope ${BUDGET.requests})`] : []),
    ...(r.images > BUDGET.images ? [`${r.path}: ${r.images} imágenes (tope ${BUDGET.images})`] : []),
    ...(r.nodes > BUDGET.nodes ? [`${r.path}: ${r.nodes} nodos (tope ${BUDGET.nodes})`] : []),
    ...(r.errors ? [`${r.path}: ${r.errors} errores`] : []),
  ]);
  if (over.length) {
    console.error(`\nFuera de presupuesto:\n  ${over.join("\n  ")}`);
    process.exit(1);
  }
  console.log("\nTodas las páginas dentro del presupuesto.");
}
