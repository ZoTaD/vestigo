#!/usr/bin/env node
/**
 * Notas de parche de Path of Exile 2 → games/poe2/data/patches/
 *
 * Lee los dos foros oficiales de notas de Early Access:
 *  - inglés: pathofexile.com/forum/view-forum/2212 (una nota o un hotfix por hilo)
 *  - español: es.pathofexile.com/forum/view-forum/2243 (las mismas notas traducidas,
 *    con los hotfixes juntados de a varios en un hilo)
 * robots.txt deja leer view-forum y view-thread. Vamos de a una petición por
 * segundo y con contacto en el User-Agent.
 *
 * Cada edición (notas de parche o actualización de contenido, de la 0.5.0 en
 * adelante) sale en `data/patches/<slug>.json` con el texto en los dos idiomas,
 * la dirección de cada línea (buff, nerf, arreglo, novedad) y los nombres de la
 * enciclopedia que menciona. Los hotfixes en inglés se cuelgan de su versión.
 * `data/patches/index.json` es la hemeroteca, la más nueva primero.
 *
 * Las ediciones viejas quedan congeladas: sólo se escriben las nuevas, la más
 * reciente (GGG le suma "Updated Patch Notes" los primeros días) y las que
 * sumaron un hotfix. El HTML de cada hilo queda en `data/patches/.cache/`
 * (fuera de git) para no volver a pedirlo.
 *
 * Sin dependencias: Node 18+ trae fetch. Uso:
 *   node games/poe2/pipeline/patches.mjs          ediciones nuevas y la última
 *   node games/poe2/pipeline/patches.mjs --all    rehace todas (desde la caché)
 *   node games/poe2/pipeline/patches.mjs --refs   sólo recalcula refs, sin red
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseListing, classify, cmpVersion, slugOf, firstPost, parsePost, markDirs, copyDirs, copySectionDirs,
  countLines, makeMatcher, markRefs, dropPortuguese, isPortuguese, isFoeSection,
} from "./patches-parse.mjs";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const OUT_DIR = join(DATA, "patches");
const CACHE = join(OUT_DIR, ".cache");
// POE2_ENCYCLOPEDIA sirve para probar las refs con un índice de mentira.
const ENCYCLOPEDIA = process.env.POE2_ENCYCLOPEDIA || join(DATA, "encyclopedia", "index.json");
const UA = "vestigo.gg patches/1.0 (contact: grundynicolas021@gmail.com)";
const FORUMS = { en: ["https://www.pathofexile.com", 2212], es: ["https://es.pathofexile.com", 2243] };
const FIRST = "0.5.0"; // antes de la 0.5 el juego era otro; no vale la pena el diario
const MAX_PAGES = 8;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
/** Texto de una URL, con una petición por segundo como techo y reintentos. */
async function get(url) {
  for (let i = 0; i < 3; i++) {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
    if (r.ok) return r.text();
    if (r.status < 500 && r.status !== 429) throw new Error(`${r.status} ${url}`);
    const ra = +r.headers.get("retry-after");
    await sleep(ra > 0 ? ra * 1000 : 3000 * (i + 1));
  }
  throw new Error(`sin respuesta: ${url}`);
}

let fetched = 0, cached = 0;
/** Un hilo, desde la caché si ya lo bajamos (salvo `fresh`). */
async function thread(lang, id, fresh = false) {
  const file = join(CACHE, `${lang}-${id}.html.gz`);
  if (!fresh && existsSync(file)) {
    cached++;
    return gunzipSync(readFileSync(file)).toString("utf-8");
  }
  const html = await get(`${FORUMS[lang][0]}/forum/view-thread/${id}`);
  fetched++;
  writeFileSync(file, gzipSync(html));
  return html;
}
const threadUrl = (lang, id) => `${FORUMS[lang][0]}/forum/view-thread/${id}`;

/**
 * Todos los hilos del foro hasta la 0.5.0. El listado va del más nuevo al más
 * viejo; cortamos una página después de ver la primera edición anterior, porque
 * GGG a veces publica un parche de la versión vieja después del anuncio de la
 * nueva (la 0.4.0l salió después de "Content Update 0.5.0").
 */
async function listing(lang) {
  const [host, forum] = FORUMS[lang];
  const all = [];
  let olderPages = 0;
  for (let p = 1; p <= MAX_PAGES && olderPages < 2; p++) {
    const page = parseListing(await get(`${host}/forum/view-forum/${forum}${p > 1 ? `/page/${p}` : ""}`));
    if (!page.length) break;
    all.push(...page);
    const older = page.some((t) => { const c = classify(t.title); return c?.kind === "edition" && cmpVersion(c.version, FIRST) < 0; });
    if (older || olderPages) olderPages++;
  }
  return all.map((t) => ({ ...t, ...(classify(t.title) || { kind: null }) }));
}

/** Las secciones de un hotfix en una sola lista; los títulos que quedan pasan a madre de sus líneas. */
function flatten(sections) {
  return sections.flatMap((s) => {
    if (!s.title || classify(s.title)?.kind) return s.lines;
    return [{ text: s.title, kids: s.lines }];
  });
}

/**
 * Los hotfixes en español vienen de a varios por hilo, cada uno bajo su título
 * ("0.5.2 Hotfix", "0.5.2 Hotfix 2"). Devuelve número → líneas. Un hilo de un
 * solo hotfix sin títulos adentro va entero a ese número; uno de varios sin
 * títulos no se puede repartir y queda afuera.
 */
function splitEsHotfixes(thread, sections) {
  const out = new Map();
  let any = false;
  for (const s of sections) {
    const c = classify(s.title);
    if (c?.kind === "hotfix" && c.nums.length === 1) { out.set(c.nums[0], (out.get(c.nums[0]) || []).concat(s.lines)); any = true; }
  }
  if (!any && thread.nums.length === 1) out.set(thread.nums[0], flatten(sections));
  return out;
}

function loadMatchers() {
  if (!existsSync(ENCYCLOPEDIA)) return null;
  const raw = JSON.parse(readFileSync(ENCYCLOPEDIA, "utf-8"));
  const rows = Array.isArray(raw) ? raw : Object.values(raw).find(Array.isArray) || [];
  if (!rows.length) return null;
  return {
    en: makeMatcher(rows.map((r) => ({ id: r.id, name: r.en }))),
    es: makeMatcher(rows.map((r) => ({ id: r.id, name: r.es }))),
    size: rows.length,
  };
}

/** Recalcula refs de una edición ya armada (los dos idiomas y los hotfixes). */
function applyRefs(ed, m) {
  for (const s of ed.en) markRefs(s.lines, m?.en);
  for (const s of ed.es || []) markRefs(s.lines, m?.es);
  for (const h of ed.hotfixes) {
    markRefs(h.lines, m?.en);
    if (h.es) markRefs(h.es, m?.es);
  }
  return ed;
}

/**
 * El título en español tal cual el foro, salvo cuando vino en portugués: ahí va
 * el nombre que usa el foro español para las demás ("Notas del parche 0.5.3").
 */
function esTitle(v, es) {
  if (!es) return null;
  if (!isPortuguese(es.title)) return es.title;
  return es.content ? `Actualización de contenido ${v}` : `Notas del parche ${v}`;
}

async function buildEdition(v, { en, es, hotEn, hotEs, fresh, matchers }) {
  const enPost = firstPost(await thread("en", en.id, fresh));
  if (!enPost) throw new Error(`no encontré el primer post de ${threadUrl("en", en.id)}`);
  const enParsed = parsePost(enPost.html, en.title);
  const enSecs = enParsed.sections.map((s) => ({ title: s.title, lines: markDirs(s.lines, { foe: isFoeSection(s.title) }) }));

  let esSecs = null, esBanner = null;
  if (es) {
    const esPost = firstPost(await thread("es", es.id, fresh));
    if (esPost) {
      const p = parsePost(esPost.html, es.title);
      esSecs = dropPortuguese(p.sections);
      esBanner = p.banner;
      // Si todo el hilo vino en portugués, mejor sin español que con otro idioma.
      if (!esSecs.length) esSecs = null;
      else copySectionDirs(enSecs, esSecs);
    }
  }

  // Los hotfixes en español, repartidos por número, una sola vez por hilo.
  const esByNum = new Map();
  for (const t of hotEs) {
    const post = firstPost(await thread("es", t.id));
    if (!post) continue;
    for (const [n, lines] of splitEsHotfixes(t, dropPortuguese(parsePost(post.html, t.title).sections))) if (!esByNum.has(n)) esByNum.set(n, lines);
  }
  const hotfixes = [];
  for (const h of hotEn) {
    const post = firstPost(await thread("en", h.id));
    if (!post) continue;
    const lines = markDirs(flatten(parsePost(post.html, h.title).sections));
    const esLines = h.nums.length === 1 ? esByNum.get(h.nums[0]) || null : null;
    if (esLines) copyDirs(lines, esLines);
    hotfixes.push({ title: h.title, date: post.date, url: threadUrl("en", h.id), lines, es: esLines });
  }

  return applyRefs(
    {
      version: v, slug: slugOf(v), date: enPost.date, kind: en.content || es?.content ? "content" : "patch",
      title: { en: en.title, es: esTitle(v, es) },
      url: { en: threadUrl("en", en.id), es: es ? threadUrl("es", es.id) : null },
      banner: enParsed.banner || esBanner,
      en: enSecs, es: esSecs, hotfixes,
    },
    matchers,
  );
}

/** El índice sale de lo que hay escrito, así nunca se desfasa de los archivos. */
function writeIndex() {
  const editions = readdirSync(OUT_DIR)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => JSON.parse(readFileSync(join(OUT_DIR, f), "utf-8")))
    .sort((a, b) => cmpVersion(b.version, a.version))
    .map((e) => ({ version: e.version, slug: e.slug, date: e.date, kind: e.kind, title: e.title, counts: countLines(e.en) }));
  writeFileSync(join(OUT_DIR, "index.json"), JSON.stringify({ updated: new Date().toISOString(), editions }, null, 1));
  return editions;
}

async function main() {
  const flags = new Set(process.argv.slice(2));
  mkdirSync(CACHE, { recursive: true });
  const matchers = loadMatchers();
  console.log(matchers ? `enciclopedia: ${matchers.size} nombres` : "sin enciclopedia todavía: las líneas van sin refs");

  if (flags.has("--refs")) {
    let n = 0;
    for (const f of readdirSync(OUT_DIR).filter((f) => f.endsWith(".json") && f !== "index.json")) {
      const file = join(OUT_DIR, f);
      writeFileSync(file, JSON.stringify(applyRefs(JSON.parse(readFileSync(file, "utf-8")), matchers)));
      n++;
    }
    writeIndex();
    console.log(`refs recalculadas en ${n} ediciones`);
    return;
  }

  const [en, es] = [await listing("en"), await listing("es")];
  const eds = en.filter((t) => t.kind === "edition" && cmpVersion(t.version, FIRST) >= 0);
  // Si un título se repite (pasa con los "Updated"), vale el hilo más nuevo: el primero del listado.
  const byVersion = new Map();
  for (const t of eds) if (!byVersion.has(t.version)) byVersion.set(t.version, t);
  const versions = [...byVersion.keys()].sort((a, b) => cmpVersion(b, a));
  if (!versions.length) throw new Error("el listado inglés no trajo ninguna edición: ¿cambió el HTML del foro?");
  const esEd = new Map();
  for (const t of es) if (t.kind === "edition" && !esEd.has(t.version)) esEd.set(t.version, t);
  const hot = (list, v) => list.filter((t) => t.kind === "hotfix" && t.version === v);

  const all = flags.has("--all");
  let wrote = 0;
  for (const v of versions) {
    const file = join(OUT_DIR, `${slugOf(v)}.json`);
    const hotEn = hot(en, v).sort((a, b) => a.nums[0] - b.nums[0] || +a.id - +b.id);
    const prev = existsSync(file) ? JSON.parse(readFileSync(file, "utf-8")) : null;
    const newest = v === versions[0];
    const newHotfix = prev && hotEn.some((h) => !prev.hotfixes.some((p) => p.url === threadUrl("en", h.id)));
    const newEs = prev && !prev.es && esEd.has(v);
    if (prev && !all && !newest && !newHotfix && !newEs) continue;
    try {
      const ed = await buildEdition(v, { en: byVersion.get(v), es: esEd.get(v), hotEn, hotEs: hot(es, v), fresh: newest, matchers });
      writeFileSync(file, JSON.stringify(ed));
      wrote++;
      const c = countLines(ed.en);
      console.log(`${v}: ${ed.en.length} secciones · ${c.lines} líneas · es ${ed.es ? "sí" : "no"} · hotfixes ${ed.hotfixes.length}`);
    } catch (e) {
      console.error(`${v}: ${e.message} (queda la versión anterior si había)`);
    }
  }
  const index = writeIndex();
  console.log(`${wrote} ediciones escritas, ${index.length} en el índice · hilos bajados ${fetched}, de la caché ${cached}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
