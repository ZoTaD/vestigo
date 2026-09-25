#!/usr/bin/env node
/**
 * La economía de una liga en dos archivos (2026-09-25).
 *
 * `<liga>.json` pesaba ~950 KB y tres cuartos eran los únicos (íconos y
 * modificadores en los dos idiomas), que la página sólo muestra al abrir una de
 * sus pestañas o al buscar. La Economía es la portada de PoE2 y abre en Moneda,
 * así que ahora:
 *
 *  - `<liga>.json`: moneda, tasas y, de los únicos, sólo sus pestañas con la
 *    cantidad de filas (`count`), para dibujar la barra de pestañas.
 *  - `<liga>.uniques.json`: las filas de cada pestaña de únicos, que el sitio
 *    pide recién cuando las necesita (`loadUniques` en poe2EconomyData.ts).
 *
 * La usa economy.mjs al escribir cada liga. Suelto
 * (`node games/poe2/pipeline/economy-split.mjs`) divide los archivos de
 * data/economy que todavía estén enteros, sin bajar nada.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function splitEconomy(full) {
  const main = { ...full, uniques: full.uniques.map(({ id, label, rows }) => ({ id, label, count: rows.length })) };
  const uniques = { league: full.league, updated: full.updated, tabs: full.uniques.map(({ id, rows }) => ({ id, rows })) };
  return { main, uniques };
}

export function writeSplit(dir, slug, full) {
  const { main, uniques } = splitEconomy(full);
  writeFileSync(join(dir, `${slug}.json`), JSON.stringify(main));
  writeFileSync(join(dir, `${slug}.uniques.json`), JSON.stringify(uniques));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "economy");
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f === "leagues.json" || f.endsWith(".uniques.json")) continue;
    const full = JSON.parse(readFileSync(join(dir, f), "utf-8"));
    // Ya dividido: las pestañas de únicos traen `count` y no `rows`.
    if (full.uniques.every((u) => !("rows" in u))) continue;
    writeSplit(dir, f.slice(0, -".json".length), full);
    console.log(`${f}: dividido`);
  }
}
