#!/usr/bin/env node
/**
 * Economía de Path of Exile 2 → games/poe2/data/economy/<liga>.json
 *
 * Junta dos cosas:
 *  - Precios: la API de economía de poe.ninja (documentada en poe.ninja/docs/api
 *    y abierta a terceros con dos condiciones: identificarse en el User-Agent y
 *    no copiar su sitio). Precios en divinos, cambio de 7 días y volumen.
 *  - Nombres en español: los datos del buscador de comercio en español
 *    (es.pathofexile.com/api/trade2/data/*). Traen el nombre oficial de cada
 *    objeto de intercambio por id, los únicos en el mismo orden que la versión
 *    en inglés, y las plantillas de modificadores por id de estadística.
 *
 * Sin dependencias: Node 18+ trae fetch. Uso: `node games/poe2/pipeline/economy.mjs [liga…]`.
 * Sin ligas baja todas las que lista poe.ninja, en su orden (el primero es el de
 * por defecto en el sitio). Escribe dos archivos por liga en `data/economy/`
 * (`<slug>.json` y `<slug>.uniques.json`, ver economy-split.mjs) y el índice
 * `data/economy/leagues.json`; una liga que falla no tira las demás.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { writeSplit } from "./economy-split.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "economy");
const UA = "vestigo.gg economy/1.0 (contact: grundynicolas021@gmail.com)";
const NINJA = "https://poe.ninja/poe2/api/economy";
const CDN = "https://web.poecdn.com";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (r.ok) return r.json();
    if (r.status < 500 && r.status !== 429) throw new Error(`${r.status} ${url}`);
    await sleep(2000 * (i + 1));
  }
  throw new Error(`sin respuesta: ${url}`);
}

/** Las pestañas de intercambio, en el orden en que se muestran. */
const EXCHANGE = [
  ["Currency", "Monedas", "Currency"], ["Fragments", "Fragmentos", "Fragments"], ["Runes", "Runas", "Runes"],
  ["Essences", "Esencias", "Essences"], ["SoulCores", "Núcleos de alma", "Soul Cores"],
  ["UncutGems", "Gemas sin tallar", "Uncut Gems"], ["LineageSupportGems", "Gemas de linaje", "Lineage Gems"],
  ["Ritual", "Ritual", "Ritual"], ["Breach", "Fisuras", "Breach"], ["Delirium", "Delirio", "Delirium"],
  ["Expedition", "Expedición", "Expedition"], ["Abyss", "Abismo", "Abyss"], ["Idols", "Ídolos", "Idols"],
  ["Verisium", "Verisium", "Verisium"],
];
const UNIQUES = [
  ["UniqueWeapons", "Armas", "Weapons"], ["UniqueArmours", "Armaduras", "Armour"],
  ["UniqueAccessories", "Accesorios", "Accessories"], ["UniqueJewels", "Joyas", "Jewels"],
  ["UniqueFlasks", "Frascos", "Flasks"], ["UniqueCharms", "Amuletos de uso", "Charms"],
  ["UniqueTablets", "Tablillas", "Tablets"], ["UniqueSanctumRelics", "Reliquias", "Relics"],
];

// ---------- nombres y modificadores ----------
const clean = (t) => t.replace(/\[([^\]|]*)\|([^\]]*)\]/g, "$2").replace(/\[([^\]]*)\]/g, "$1").replace(/\r/g, "");
const NUM = /[+-]?\(-?[\d.]+-[\d.]+\)|[+-]?\d+(?:\.\d+)?/g;

/**
 * Alinea las dos listas de únicos (inglés y español). Vienen en el mismo orden
 * pero la española puede tener alguno menos; Needleman-Wunsch con premio a los
 * nombres propios que no se traducen (Andvarius, Temporalis) las re-sincroniza.
 */
function align(en, es) {
  const n = en.length, m = es.length, G = -2;
  const S = Array.from({ length: n + 1 }, (_, i) => new Int32Array(m + 1).fill(0).map((_, j) => (i === 0 ? j * G : j === 0 ? i * G : 0)));
  const sc = (i, j) => (en[i].name === es[j].name ? 3 : 1);
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      S[i][j] = Math.max(S[i - 1][j - 1] + sc(i - 1, j - 1), S[i - 1][j] + G, S[i][j - 1] + G);
  const out = new Map();
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (S[i][j] === S[i - 1][j - 1] + sc(i - 1, j - 1)) {
      out.set(`${en[i - 1].name}|${en[i - 1].type}`, [es[j - 1].name, es[j - 1].type]);
      i--; j--;
    } else if (S[i][j] === S[i - 1][j] + G) i--;
    else j--;
  }
  return out;
}

/** La liga en una URL: "HC Forbidden Rites" → "hc-forbidden-rites". */
const slugOf = (id) => id.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function main() {
  const leagues = await get(`${NINJA}/leagues`);
  const wanted = process.argv.slice(2);
  const todo = wanted.length ? leagues.filter((l) => wanted.includes(l.id)) : leagues;
  if (!todo.length) throw new Error(`no encontré liga: ${wanted.join(", ")}`);

  const [staticEs, itemsEn, itemsEs, statsEn, statsEs] = await Promise.all([
    get("https://es.pathofexile.com/api/trade2/data/static"),
    get("https://www.pathofexile.com/api/trade2/data/items"),
    get("https://es.pathofexile.com/api/trade2/data/items"),
    get("https://www.pathofexile.com/api/trade2/data/stats"),
    get("https://es.pathofexile.com/api/trade2/data/stats"),
  ]);
  const esById = new Map(staticEs.result.flatMap((c) => c.entries.map((e) => [e.id, e.text])));

  const uniqEs = new Map();
  itemsEn.result.forEach((a, k) => {
    const b = itemsEs.result[k];
    const ua = a.entries.filter((e) => e.flags?.unique);
    const ub = (b?.entries || []).filter((e) => e.flags?.unique);
    if (ua.length) for (const [key, v] of align(ua, ub)) uniqEs.set(key, v);
  });

  const esStat = new Map(statsEs.result.flatMap((c) => c.entries.map((e) => [e.id, e.text])));
  const tmpl = new Map();
  for (const c of statsEn.result) {
    if (c.id !== "explicit" && c.id !== "implicit") continue;
    for (const e of c.entries) if (esStat.has(e.id) && !tmpl.has(e.text)) tmpl.set(e.text, esStat.get(e.id));
  }
  let modsOk = 0, modsAll = 0;
  const trMod = (raw) => {
    const en = clean(raw);
    const nums = en.match(NUM) || [];
    const es = tmpl.get(en.replace(NUM, "#"));
    modsAll++;
    if (!es) return [en, en];
    modsOk++;
    let k = 0;
    return [en, es.replace(/#/g, () => nums[k++] ?? "#")];
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const indexFile = join(OUT_DIR, "leagues.json");
  const prev = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, "utf-8")).leagues : [];
  const done = new Map(prev.map((l) => [l.id, l]));
  for (const l of todo) {
    try {
      const out = await fetchLeague(l.id, { esById, uniqEs, trMod });
      const slug = slugOf(l.id);
      // En dos archivos: la moneda y, aparte, las filas de únicos (ver economy-split.mjs).
      writeSplit(OUT_DIR, slug, out);
      const nEx = out.exchange.reduce((s, c) => s + c.rows.length, 0);
      const nU = out.uniques.reduce((s, c) => s + c.rows.length, 0);
      const vol = out.exchange.reduce((s, c) => s + c.rows.reduce((a, r) => a + r.vol, 0), 0);
      done.set(l.id, {
        id: l.id, slug, name: l.name, hardcore: /^(HC |Hardcore)/.test(l.id), permanent: /^(Standard|Hardcore)$/.test(l.id),
        updated: out.updated, volume: Math.round(vol),
      });
      console.log(`${l.id}: intercambio ${nEx} · únicos ${nU}`);
    } catch (e) {
      console.error(`${l.id}: ${e.message} (queda la versión anterior si había)`);
    }
  }
  console.log(`modificadores en español ${modsOk}/${modsAll}`);
  // El orden es el de poe.ninja, no el de llegada: el primero es el de por defecto.
  const order = leagues.map((l) => l.id);
  const index = [...done.values()].filter((l) => order.includes(l.id)).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  writeFileSync(indexFile, JSON.stringify({ updated: new Date().toISOString(), leagues: index }, null, 1));
  console.log(`→ ${OUT_DIR}`);
}

async function fetchLeague(league, { esById, uniqEs, trMod }) {
  const L = encodeURIComponent(league);
  const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
  let k = 1;
  const out = { league, updated: new Date().toISOString(), rates: null, core: null, exchange: [], uniques: [] };

  for (const [type, es, en] of EXCHANGE) {
    const d = await get(`${NINJA}/exchange/current/overview?league=${L}&type=${type}`);
    if (!out.rates) {
      // La moneda base es la más comerciada de la liga: casi siempre el divino,
      // pero en ligas chicas (Hardcore) es el exaltado. Todo se pasa a divinos,
      // que es lo que espera el sitio: `k` = divinos por unidad de la base.
      const r = d.core.rates;
      if (r.divine) {
        k = r.divine;
        out.rates = { chaos: r.chaos / r.divine, exalted: (r.exalted ?? 1) / r.divine };
      } else out.rates = { chaos: r.chaos, exalted: r.exalted };
      out.core = Object.fromEntries(d.core.items.map((i) => [i.id, { en: i.name, es: esById.get(i.id) || i.name, icon: CDN + i.image }]));
    }
    const meta = new Map(d.items.map((i) => [i.id, i]));
    const rows = d.lines.flatMap((l) => {
      const i = meta.get(l.id);
      if (!i) return [];
      return [{
        id: l.id, en: i.name, es: esById.get(l.id) || i.name, icon: i.image ? CDN + i.image : null,
        v: l.primaryValue * k, vol: Math.round((l.volumePrimaryValue || 0) * k),
        chg: r1(l.sparkline?.totalChange), spark: (l.sparkline?.data || []).map(r1),
      }];
    }).sort((a, b) => b.v - a.v);
    out.exchange.push({ id: type, label: { es, en }, rows });
    await sleep(600);
  }

  for (const [type, es, en] of UNIQUES) {
    const d = await get(`${NINJA}/stash/current/item/overview?league=${L}&type=${type}`);
    const rows = d.lines.map((l) => {
      const [esName, esBase] = uniqEs.get(`${l.name}|${l.baseType}`) || [l.name, l.baseType];
      const mods = (l.explicitModifiers || []).map((m) => trMod(m.text));
      const imps = (l.implicitModifiers || []).map((m) => trMod(m.text));
      return {
        id: l.detailsId, en: l.name, es: esName, baseEn: l.baseType, base: esBase, icon: l.icon,
        v: l.primaryValue * k, n: l.listingCount || 0, chg: r1(l.sparkLine?.totalChange),
        spark: (l.sparkLine?.data || []).map(r1), lvl: l.levelRequired || 0, corrupted: !!l.corrupted,
        modsEn: mods.map((m) => m[0]), mods: mods.map((m) => m[1]),
        impsEn: imps.map((m) => m[0]), imps: imps.map((m) => m[1]),
      };
    }).sort((a, b) => b.v - a.v);
    out.uniques.push({ id: type, label: { es, en }, rows });
    await sleep(600);
  }

  if (!out.rates) throw new Error("sin tasas de cambio");
  return out;
}

main().catch((e) => { console.error(e); process.exit(1); });
