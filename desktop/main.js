/**
 * Minimal probe: ask the Game Events Provider what it actually offers for the
 * games we care about, instead of trusting the web docs.
 *
 * Run once, print, write the answer to disk, exit. No windows, no UI.
 */
const { app } = require("electron");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");

const GAMES = [
  { name: "Teamfight Tactics", id: 21570 },
  { name: "Deadlock", id: 24482 },
];

// If the package never reports ready, fail loudly rather than hang forever.
const READY_TIMEOUT_MS = 30000;
const timeout = setTimeout(() => {
  console.error(`\n[timeout] el paquete gep no reportó "ready" en ${READY_TIMEOUT_MS / 1000}s`);
  app.exit(1);
}, READY_TIMEOUT_MS);

app.overwolf.packages.on("ready", async (_event, packageName, version) => {
  if (packageName !== "gep") return;
  clearTimeout(timeout);
  console.log(`paquete gep listo (v${version})\n`);

  const gep = app.overwolf.packages.gep;
  const report = { probedAt: new Date().toISOString(), gepVersion: version, games: {} };

  try {
    const supported = await gep.getSupportedGames();
    report.supportedGameCount = supported.length;
    console.log(`juegos con eventos en tiempo real: ${supported.length}\n`);
  } catch (err) {
    console.error(`getSupportedGames falló: ${err.message}`);
  }

  for (const game of GAMES) {
    try {
      const features = await gep.getFeatures(game.id);
      report.games[game.name] = features;
      console.log(`=== ${game.name} (${game.id}) — ${features.length} features ===`);
      for (const feature of features) console.log(`   ${feature}`);
      console.log("");
    } catch (err) {
      report.games[game.name] = { error: err.message };
      console.error(`${game.name}: ERROR ${err.message}\n`);
    }
  }

  const out = join(__dirname, "gep-features.json");
  writeFileSync(out, JSON.stringify(report, null, 2), "utf-8");
  console.log(`escrito en ${out}`);
  app.quit();
});

app.overwolf.packages.on("crashed", (_event, canRecover) => {
  console.error(`[crashed] el paquete se cayó (recuperable: ${canRecover})`);
});

app.whenReady().then(() => {
  console.log("ow-electron arrancó, esperando el paquete gep...");
});
