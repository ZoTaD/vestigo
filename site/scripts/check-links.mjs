#!/usr/bin/env node
/**
 * Cada enlace interno del sitio ya construido tiene que abrir algo (2026-10-11).
 *
 * Desde ese día una dirección sin archivo contesta 404 (ver el final de las redirecciones en `netlify.toml`); antes
 * recibía la portada con 200 y un enlace roto pasaba por bueno. Esto recorre los HTML de `dist/`, junta los `href` que
 * apuntan al propio sitio y falla si alguno no tiene su página, su archivo o una regla de Netlify que lo atienda.
 *
 * Es lo que avisa cuando se agrega una página que no está en el sitemap (no se prerenderiza) y se la enlaza igual.
 *
 * Uso: `npm run check:links`, después de `npm run build`. Sin dependencias.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(SITE, "dist");
const ORIGIN = "https://vestigo.gg";

if (!existsSync(DIST)) {
  console.error("check-links: no hay dist/. Corré `npm run build` antes.");
  process.exit(1);
}

/** Las reglas de `netlify.toml` y de `_redirects`, salvo el comodín final: `from` como expresión regular. */
function rules() {
  const out = [];
  const add = (from) => {
    if (from === "/*") return;
    const re = from
      .split("/")
      .map((seg) => (seg === "*" ? ".*" : seg.startsWith(":") ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      .join("/");
    out.push(new RegExp(`^${re}$`));
  };
  const toml = readFileSync(join(SITE, "..", "netlify.toml"), "utf-8");
  for (const m of toml.matchAll(/^\s*from\s*=\s*"([^"]+)"/gm)) add(m[1]);
  const file = join(DIST, "_redirects");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf-8").split("\n")) {
      const from = line.trim().split(/\s+/)[0];
      if (from && !from.startsWith("#")) add(from);
    }
  }
  return out;
}

const isFile = (p) => existsSync(p) && statSync(p).isFile();
/** Lo que Netlify sirve para una ruta: el archivo tal cual, su `.html` o el `index.html` de la carpeta. */
const served = (path) => {
  const clean = decodeURIComponent(path).replace(/^\/+|\/+$/g, "");
  if (!clean) return true;
  return isFile(join(DIST, clean)) || isFile(join(DIST, `${clean}.html`)) || isFile(join(DIST, clean, "index.html"));
};

function* htmlFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* htmlFiles(p);
    else if (e.name.endsWith(".html")) yield p;
  }
}

const HREF = /<a\b[^>]*?\shref="([^"]+)"/g;
/** Dirección → la primera página que la enlaza, para poder ir a mirar. */
const seen = new Map();
let pages = 0;
for (const file of htmlFiles(DIST)) {
  pages++;
  const html = readFileSync(file, "utf-8");
  for (const m of html.matchAll(HREF)) {
    let href = m[1].replace(/&amp;/g, "&");
    if (href.startsWith(ORIGIN)) href = href.slice(ORIGIN.length) || "/";
    if (!href.startsWith("/") || href.startsWith("//")) continue;
    const path = href.split(/[?#]/)[0];
    if (!seen.has(path)) seen.set(path, file.slice(DIST.length).replace(/\\/g, "/"));
  }
}

const redirects = rules();
const broken = [...seen].filter(([path]) => !served(path) && !redirects.some((re) => re.test(path)));

console.log(`check-links: ${pages} páginas, ${seen.size} direcciones internas distintas, ${broken.length} sin destino.`);
if (broken.length) {
  for (const [path, from] of broken.slice(0, 60)) console.error(`  ${path}   (enlazada desde ${from})`);
  if (broken.length > 60) console.error(`  … y ${broken.length - 60} más`);
  process.exit(1);
}
