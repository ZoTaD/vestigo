/**
 * Las partes puras de patches.mjs: leer el listado del foro, sacar el primer
 * post de un hilo, pasarlo a secciones y líneas, y ponerle a cada línea su
 * dirección (buff, nerf, arreglo…) y los nombres de la enciclopedia que cita.
 *
 * Nada de red ni de disco acá, así lo prueban los tests del sitio
 * (games/tft/ui/test/poe2Patches.test.ts) sin bajar nada.
 */

// ---------- texto ----------
const NAMED = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", iexcl: "¡", iquest: "¿",
  times: "×", deg: "°", middot: "·", bull: "•", trade: "™", reg: "®", copy: "©", ordf: "ª", ordm: "º",
  szlig: "ß", aelig: "æ", oslash: "ø", Oslash: "Ø", eth: "ð", thorn: "þ", euro: "€", minus: "−",
};
// Las letras acentuadas salen de componer la letra con la marca: &iacute; = i + la tilde que se combina.
const MARK = Object.fromEntries(Object.entries({ acute: 0x301, grave: 0x300, tilde: 0x303, uml: 0x308, circ: 0x302, cedil: 0x327, ring: 0x30a }).map(([k, c]) => [k, String.fromCharCode(c)]));

/** Entidades HTML → texto. */
export function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([A-Za-z])(acute|grave|tilde|uml|circ|cedil|ring);/g, (_, l, m) => (l + MARK[m]).normalize("NFC"))
    .replace(/&([A-Za-z]+);/g, (all, n) => NAMED[n] ?? all);
}
const NBSP = String.fromCharCode(0xa0);
const squash = (s) => s.split(NBSP).join(" ").replace(/\s+/g, " ").trim();

// ---------- versiones ----------
/** "0.5.5c" → [0, 5, 5, "c"]; null si no hay versión. */
export function parseVersion(s) {
  const m = /\b(\d+)\.(\d+)\.(\d+)([a-z]?)\b/.exec(s || "");
  return m ? { v: `${m[1]}.${m[2]}.${m[3]}${m[4]}`, n: [+m[1], +m[2], +m[3]], l: m[4] } : null;
}
/** Orden de versiones: 0.5.5 < 0.5.5b < 0.5.5c < 0.5.10. */
export function cmpVersion(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] - y.n[i];
  return x.l < y.l ? -1 : x.l > y.l ? 1 : 0;
}
export const slugOf = (version) => version.replace(/\./g, "-");

// ---------- listado del foro ----------
/** Los hilos de una página de view-forum, en el orden del foro (el más nuevo arriba). */
export function parseListing(html) {
  const out = [];
  const re = /<div class="title">\s*<a href="\/forum\/view-thread\/(\d+)">([\s\S]*?)<\/a>/g;
  for (let m; (m = re.exec(html)); ) out.push({ id: m[1], title: squash(decode(m[2].replace(/<[^>]*>/g, ""))) });
  return out;
}

/**
 * Qué es un hilo según el título.
 *  - { kind: "edition", version, content } → notas de parche o actualización de contenido.
 *  - { kind: "hotfix", version, nums: [1, 2…] } → uno o varios hotfixes ("0.5.2 Hotfix - 0.5.2 Hotfix 2").
 *  - null → mantenimiento, reinicios, lo que no sea notas.
 * El "Hotfix" a secas es el 1: el foro inglés alterna "Hotfix" y "Hotfix 1".
 */
export function classify(title) {
  const pv = parseVersion(title);
  if (!pv) return null;
  if (/\bhotfix/i.test(title)) {
    const nums = [];
    for (const m of title.matchAll(/(\d+\.\d+\.\d+[a-z]?)\s+hotfix(?:es)?(?:\s+(\d+))?/gi)) nums.push(m[2] ? +m[2] : 1);
    // "0.5.1 Hotfix - 0.5.1 Hotfix 5" es del 1 al 5, no sólo los dos extremos.
    const full = nums.length === 2 && nums[1] > nums[0] ? Array.from({ length: nums[1] - nums[0] + 1 }, (_, i) => nums[0] + i) : nums;
    return { kind: "hotfix", version: pv.v, nums: full };
  }
  if (/maintenance|mantenimiento|\brestart\b|reinicio/i.test(title)) return null;
  if (/patch notes|content update|notas del? parche|actualizaci[oó]n de contenido|notas da atualiza/i.test(title))
    return { kind: "edition", version: pv.v, content: /content update|actualizaci[oó]n de contenido/i.test(title) };
  return null;
}

// ---------- hilo ----------
const EN_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ES_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** "Sep 17, 2026, 7:30:00 PM" o "17 sept. 2026 19:39:13" → "2026-09-17". */
export function parseDate(s) {
  const p2 = (n) => String(n).padStart(2, "0");
  let m = /([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})/.exec(s);
  if (m && EN_MONTHS.includes(m[1].toLowerCase())) return `${m[3]}-${p2(EN_MONTHS.indexOf(m[1].toLowerCase()) + 1)}-${p2(m[2])}`;
  m = /(\d{1,2}) ([a-zé]{3})[a-z]*\.? (\d{4})/i.exec(s);
  if (m && ES_MONTHS.includes(m[2].toLowerCase())) return `${m[3]}-${p2(ES_MONTHS.indexOf(m[2].toLowerCase()) + 1)}-${p2(m[1])}`;
  return null;
}

/**
 * El primer post de un view-thread: el primer `div.content` de la tabla de posts.
 * Termina en la firma (posts comunes) o en la fila de "Publicado por" (los hilos
 * con formato de noticia, como las actualizaciones de contenido). Contar divs no
 * sirve: las noticias traen cajas mal cerradas.
 */
export function firstPost(page) {
  const t = page.indexOf("forumPostListTable");
  if (t < 0) return null;
  const start = page.indexOf('<div class="content">', t);
  if (start < 0) return null;
  // Cortamos en el "<" de la etiqueta que contiene la marca, no en la marca.
  const ends = ['<div class="signature"', "newsPostInfo", 'class="post_info']
    .map((k) => page.indexOf(k, start))
    .filter((i) => i > 0)
    .map((i) => page.lastIndexOf("<", i));
  const end = Math.min(...ends);
  const dm = /class="post_date">([^<]*)</.exec(page.slice(start));
  return { html: page.slice(start + '<div class="content">'.length, end), date: dm ? parseDate(decode(dm[1])) : null };
}

const TOC = /^(table of contents|contents|tabla de contenidos?|índice|sumário)$/i;
const HEAD = new Set(["h1", "h2", "h3", "h4", "h5"]);
const BLOCK = new Set(["p", "div", "ul", "ol", "table", "tr", "td", "blockquote", "center", ...HEAD]);

/**
 * El HTML de un post → { banner, sections }. Los títulos de sección son los
 * <h2>/<h3> y los <strong> que ocupan una línea entera fuera de una lista;
 * cada <li> es una línea y las listas anidadas quedan como `kids`. Un título
 * igual al del hilo ("0.5.5c Patch Notes") no abre sección: es el encabezado.
 */
export function parsePost(html, threadTitle = "") {
  const tokens = [];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)|</g;
  for (let m; (m = re.exec(html)); ) {
    if (m[2]) tokens.push({ tag: m[2].toLowerCase(), close: !!m[1], attrs: m[3] || "" });
    else if (m[4] !== undefined) tokens.push({ text: m[4] });
    else if (m[0] === "<") tokens.push({ text: "<" });
  }

  const sections = [];
  let sec = { title: "", lines: [] };
  let banner = null;
  let para = ""; // texto suelto fuera de listas, hasta el próximo corte
  const liStack = []; // líneas abiertas; la de arriba recibe el texto
  const listStack = []; // por cada <ul> abierto: la línea madre (o null en la raíz)
  let heading = null; // { tag, text } mientras estamos dentro de un título
  let skip = 0; // dentro de <style>/<script>
  let anchorTop = false; // el "Return to top" de las noticias
  const norm = (s) => squash(s).toLowerCase().replace(/[—–-]/g, "-");
  const threadNorm = norm(threadTitle);

  const isTitleOfThread = (t) => {
    const n = norm(t);
    if (n === threadNorm) return true;
    const cl = classify(t);
    // Corto: una oración que menciona "the 0.5.5 patch notes" no es un encabezado.
    return !!cl && cl.kind === "edition" && n.length < 100;
  };
  const openSection = (title) => {
    if (sec.lines.length || sec.title) sections.push(sec);
    sec = { title, lines: [] };
  };
  const flushPara = (asHeadingIfShort = false) => {
    const t = squash(para);
    para = "";
    if (!t) return;
    if (isTitleOfThread(t)) return;
    // "Updated Patch Notes:" y compañía: renglón corto que termina en dos puntos.
    if (asHeadingIfShort && t.length <= 80 && /:$/.test(t)) return openSection(t.replace(/:$/, ""));
    sec.lines.push({ text: t });
  };
  const peekNext = (i) => {
    for (let j = i + 1; j < tokens.length; j++) {
      const k = tokens[j];
      if (k.text !== undefined) { if (squash(decode(k.text))) return k; continue; }
      return k;
    }
    return null;
  };

  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.tag === "style" || tk.tag === "script") { skip += tk.close ? -1 : 1; continue; }
    if (skip > 0) continue;

    if (tk.text !== undefined) {
      if (anchorTop) continue;
      const txt = decode(tk.text);
      if (heading) heading.text += txt;
      else if (liStack.length) liStack[liStack.length - 1].text += txt;
      else para += txt;
      continue;
    }
    const { tag, close, attrs } = tk;

    if (tag === "a") {
      if (!close && /href="#top"/.test(attrs)) anchorTop = true;
      else if (close) anchorTop = false;
      continue;
    }
    if (tag === "img" && !close) {
      const src = /src="([^"]+)"/.exec(attrs)?.[1];
      // El banner es la primera imagen de GGG antes de cualquier nota (el índice no cuenta).
      const before = [...sections, sec].every((s) => !s.lines.length || TOC.test(squash(s.title)));
      if (!banner && src && /poecdn\.com/.test(src) && before) banner = decode(src);
      continue;
    }
    if (tag === "br") {
      if (heading) heading.text += " ";
      else if (liStack.length) liStack[liStack.length - 1].text += " ";
      else flushPara(peekNext(i)?.tag === "ul" || peekNext(i)?.tag === "ol");
      continue;
    }

    // Títulos: <hN>, o <strong>/<b> que arranca y termina un renglón fuera de listas.
    const strongHead = (tag === "strong" || tag === "b") && !liStack.length && !squash(para);
    if ((HEAD.has(tag) || strongHead) && !close && !heading) {
      flushPara();
      heading = { tag, text: "" };
      continue;
    }
    if (heading && close && tag === heading.tag) {
      const t = squash(heading.text);
      const inline = heading.tag === "strong" || heading.tag === "b";
      const nx = peekNext(i);
      // Un <strong> seguido de más texto en el mismo renglón no es título, es énfasis.
      if (inline && nx && nx.text !== undefined) para += heading.text;
      else if (t && !isTitleOfThread(t)) openSection(t.replace(/:$/, ""));
      heading = null;
      continue;
    }
    if (heading) continue;

    if (tag === "ul" || tag === "ol") {
      if (!close) {
        flushPara();
        listStack.push(liStack.length ? liStack[liStack.length - 1] : null);
      } else listStack.pop();
      continue;
    }
    if (tag === "li") {
      if (!close) {
        const line = { text: "" };
        const parent = listStack.length ? listStack[listStack.length - 1] : null;
        if (parent) (parent.kids ||= []).push(line);
        else sec.lines.push(line);
        liStack.push(line);
      } else liStack.pop();
      continue;
    }
    if (BLOCK.has(tag)) {
      if (liStack.length) liStack[liStack.length - 1].text += " ";
      else flushPara(!close ? false : peekNext(i)?.tag === "ul");
    }
  }
  flushPara();
  if (sec.lines.length || sec.title) sections.push(sec);

  // Limpieza: textos sin espacios de más, líneas vacías fuera, índice fuera.
  const tidy = (lines) =>
    lines
      .map((l) => {
        const out = { text: squash(l.text) };
        const kids = l.kids ? tidy(l.kids) : [];
        if (kids.length) out.kids = kids;
        return out;
      })
      .filter((l) => l.text || l.kids);
  const clean = sections
    .map((s) => ({ title: s.title, lines: tidy(s.lines) }))
    .filter((s) => s.lines.length && !TOC.test(s.title));
  return { banner, sections: clean };
}

// ---------- dirección ----------
// La dirección es para el jugador: "up" = mejor para vos, "down" = peor.
// Cosas donde más es peor: si el costo sube, es un nerf.
const WORSE = /\b(cost|costs|cooldown|cast time|attack time|reservation|reserves?|requirements?|required|delay|penalty|damage taken|recovery time|charge time|windup|wind-up|downside|drawback)\b/i;
// Cuando el que cambia es el enemigo, que le suba algo es malo para el jugador.
const FOE_START = /^(monsters?|enemies|enemy|bosses|rare monsters|unique monsters|map bosses)\b/i;
const FOE_ANY = /\b(monsters?|enemies|enemy|bosses|boss)\b/i;
const FOE_STAT = /\b(damage|life|toughness|attack speed|resistances?|health|wind-up|windup|dashes|hits?)\b/i;
const LOOT = /\b(rewards?|drops?|loot|quantity|rarity|experience|tribute)\b/i;
const FOE_SECTION = /monster|boss|enem|monstruo|jefe/i;
const ADV = String.raw`(?:(?:significantly|slightly|greatly|substantially|massively|considerably|further|heavily|drastically|somewhat|dramatically)\s+)?`;
const NUM = /[+-]?\d+(?:\.\d+)?/g;
const NUMR = String.raw`[+-]?\d+(?:\.\d+)?`;
const VAL = String.raw`\(?(${NUMR})(?:\s*[-–]\s*(${NUMR}))?\)?`;
const avg = (a, b) => (b === undefined ? +a : (+a + +b) / 2);
/**
 * Las cifras que cambian: sin "level 8" ni "Act 4" (no son el valor) y con los
 * rangos partidos en dos ("0-20%" son 0 y 20, no 0 y -20).
 */
const numbers = (s) =>
  (s.replace(/\b(?:gem\s+)?(?:levels?|acts?|tiers?|lv\.?)\s+\d+(?:\s*[-–]\s*\d+)?/gi, " ").replace(/(\d)%?\s*[-–]\s*(?=\d)/g, "$1 ").match(NUM) || []).map(Number);

/** El signo de lo que cambia: +1 sube, -1 baja, 0 mezclado, null sin números. */
function numericTrend(t) {
  const signs = [];
  const fromTo = new RegExp(String.raw`\bfrom\s+${VAL}%?(?:\s+[a-z]+){0,3}?\s+to\s+${VAL}`, "gi");
  for (const m of t.matchAll(fromTo)) {
    const a = avg(m[1], m[2]), b = avg(m[3], m[4]);
    if (a !== b) signs.push(Math.sign(b - a));
  }
  // "now has 725 Armour, 206 Energy Shield (previously 210 Armour, 60 Energy
  // Shield)": los k números del paréntesis contra los k anteriores de la oración.
  for (const m of t.matchAll(/\((?:previously|was|up from|down from)\s+([^)]*)\)/gi)) {
    const was = numbers(m[1]);
    const head = t.slice(0, m.index);
    // La oración (o lo que va desde el paréntesis anterior: "scaling up to 62% at level 20 (previously 44%)").
    const clause = head.slice(Math.max(head.lastIndexOf(". "), head.lastIndexOf("; "), head.lastIndexOf(")")) + 1);
    const now = numbers(clause).slice(-was.length);
    if (!was.length || now.length < was.length) continue;
    was.forEach((w, i) => { if (now[i] !== w) signs.push(Math.sign(now[i] - w)); });
  }
  if (!signs.length) return null;
  return signs.every((s) => s === signs[0]) ? signs[0] : 0;
}

/**
 * La dirección de una línea en inglés: fix, new, up, down, mid o undefined.
 * Reglas a mano sobre el texto; primero lo inequívoco (arreglos, novedades),
 * después los números ("from 20% to 30%", "(previously 50%)") y por último las
 * palabras (increased, reduced, no longer). Costos, enfriamientos y requisitos
 * se leen al revés, y lo mismo cuando la línea habla de los monstruos (o está
 * en una sección de monstruos: `foe`). Las dos vueltas se multiplican: que un
 * jefe tarde más en cargar un golpe es bueno para vos.
 */
export function dirOf(text, { foe = false } = {}) {
  const t = text.trim();
  if (/^(fixed|resolved|corrected)\b/i.test(t) || /\bfixed (a|an|the|some|several|multiple|\d+) (rare )?(bugs?|issues?|crash)/i.test(t)) return "fix";
  if (/^(added|adds|new|introduced|introducing)\b/i.test(t) || /\b(now drops?|can now drop|has been added|have been added|are now available)\b/i.test(t)) return "new";
  const foeLine = (foe || FOE_START.test(t) || (FOE_ANY.test(t) && FOE_STAT.test(t))) && !LOOT.test(t);
  const flip = (WORSE.test(t) ? -1 : 1) * (foeLine ? -1 : 1);
  const trend = numericTrend(t);
  if (trend === 0) return "mid";
  if (trend !== null) return trend * flip > 0 ? "up" : "down";
  let s = 0;
  if (new RegExp(`^${ADV}(increased|raised|improved|buffed|doubled|tripled)\\b`, "i").test(t)) s = 1;
  else if (new RegExp(`^${ADV}(reduced|decreased|lowered|nerfed|halved)\\b`, "i").test(t)) s = -1;
  else if (/\bno longer (continues|appears?|shows?|displays?|plays?)\b/i.test(t)) return "mid";
  // Sacar una restricción es a favor: "no longer limited to supporting just Attacks".
  else if (/\bno longer (limited|restricted|prevents?|disables?|requires?|blocks?|interrupts?|loses?)\b/i.test(t)) s = 1;
  else if (/\bnow (has|have|deals?|grants?|gives?|provides?|gains?)\b.*\b(more|increased|additional|higher|greater)\b/i.test(t)) s = 1;
  else if (/\bnow (has|have|deals?|grants?|gives?|provides?|gains?)\b.*\b(less|reduced|fewer|lower)\b/i.test(t) || /\bno longer\b/i.test(t)) s = -1;
  if (s) return s * flip > 0 ? "up" : "down";
  if (/\b(now|changed|reworked|redesigned|instead|replaced|updated|adjusted|moved)\b/i.test(t)) return "mid";
  return undefined;
}

/** Pone `dir` en cada línea (y sus hijas), recursivo. `foe` = sección de monstruos. */
export function markDirs(lines, opts = {}) {
  for (const l of lines) {
    const d = dirOf(l.text, opts);
    if (d) l.dir = d;
    else delete l.dir;
    if (l.kids) markDirs(l.kids, opts);
  }
  return lines;
}
export const isFoeSection = (title) => FOE_SECTION.test(title || "");

// Lo que sobrevive a la traducción: cifras y nombres propios ("Runes of Aldur",
// "Rakkar", "35%"). Con eso se reconoce qué línea española es cuál inglesa.
const clues = (t) => new Set([...(t.match(/\d+(?:\.\d+)?%?|\p{Lu}[\p{L}'’-]{3,}/gu) || [])].map((w) => w.toLowerCase()));
function likeness(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / Math.min(a.size, b.size);
}

/**
 * Alinea dos listas (Needleman-Wunsch, como los únicos de la economía): parejas
 * con pistas en común suman, parejas sin nada en común restan poco (así dos
 * listas del mismo largo quedan por posición) y saltarse una resta más.
 * Devuelve pares [i, j].
 */
function alignPairs(A, B, sim, { miss = -0.5, gap = -0.6 } = {}) {
  const n = A.length, m = B.length;
  const S = Array.from({ length: n + 1 }, (_, i) => new Float64Array(m + 1).map((_, j) => (i === 0 ? j * gap : j === 0 ? i * gap : 0)));
  const sc = (i, j) => { const s = sim(A[i], B[j]); return s > 0 ? 1 + 2 * s : miss; };
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      S[i][j] = Math.max(S[i - 1][j - 1] + sc(i - 1, j - 1), S[i - 1][j] + gap, S[i][j - 1] + gap);
  const out = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (Math.abs(S[i][j] - (S[i - 1][j - 1] + sc(i - 1, j - 1))) < 1e-9) { out.push([i - 1, j - 1]); i--; j--; }
    else if (Math.abs(S[i][j] - (S[i - 1][j] + gap)) < 1e-9) i--;
    else j--;
  }
  return out.reverse();
}
const flat = (lines, out = []) => { for (const l of lines) { out.push(l); if (l.kids) flat(l.kids, out); } return out; };

// Para lo que la alineación no alcanza: los arreglos y novedades se dicen igual siempre.
const ES_FIX = /^(corregimos|se corrigi[oó]|se han corregido|arreglamos|se arregl[oó]|solucionamos|se solucion[oó])\b/i;
const ES_NEW = /^(agregamos|añadimos|se agreg[oó]|se añadi[oó]|se ha añadido|se han añadido|nuev[oa]s?)\b/i;

/**
 * Copia los `dir` del inglés al español. Las dos listas se aplanan (el español a
 * veces trae las sublistas sueltas) y se alinean por cifras y nombres propios;
 * si tienen el mismo largo y nada se contradice, queda por posición. Una línea
 * española sin pareja se queda sin dirección, salvo que diga "Corregimos…".
 */
export function copyDirs(en, es) {
  if (!en || !es) return 0;
  const A = flat(en), B = flat(es);
  const ca = A.map((l) => clues(l.text)), cb = B.map((l) => clues(l.text));
  for (const l of B) delete l.dir;
  let n = 0;
  for (const [i, j] of alignPairs(A.map((_, k) => k), B.map((_, k) => k), (i, j) => likeness(ca[i], cb[j]))) {
    if (A[i].dir) { B[j].dir = A[i].dir; n++; }
  }
  for (const l of B) {
    if (l.dir) continue;
    if (ES_FIX.test(l.text)) l.dir = "fix";
    else if (ES_NEW.test(l.text)) l.dir = "new";
  }
  return n;
}

/** Lo mismo a nivel de secciones: primero se emparejan las secciones, después sus líneas. */
export function copySectionDirs(en, es) {
  if (!en || !es) return 0;
  const ca = en.map((s) => clues(flat(s.lines).map((l) => l.text).join(" ")));
  const cb = es.map((s) => clues(flat(s.lines).map((l) => l.text).join(" ")));
  const pairs = alignPairs(en.map((_, k) => k), es.map((_, k) => k), (i, j) => likeness(ca[i], cb[j]), { miss: -1, gap: -0.8 });
  const paired = new Set(pairs.map(([, j]) => j));
  es.forEach((s, j) => { if (!paired.has(j)) copyDirs([], s.lines); });
  return pairs.reduce((n, [i, j]) => n + copyDirs(en[i].lines, es[j].lines), 0);
}

// Palabras que en español no existen y en portugués están en todas las notas.
const PT = /(^|[^\p{L}])(não|você|vocês|corrigido|corrigida|corrigimos|também|agora|atualização|está sendo)(?![\p{L}])/iu;
/**
 * El foro español a veces trae notas o renglones en portugués ("Notas da
 * atualização 0.5.3" empieza con una línea en portugués y sigue en español).
 * Saca esos renglones; una sección que queda vacía se va.
 */
export function dropPortuguese(sections) {
  const keep = (lines) => lines.filter((l) => !PT.test(l.text)).map((l) => (l.kids ? { ...l, kids: keep(l.kids) } : l));
  return sections.map((s) => ({ ...s, lines: keep(s.lines) })).filter((s) => s.lines.length);
}
export const isPortuguese = (title) => /notas da atualiza|atualização/i.test(title);

/** Cuenta líneas y direcciones, hijas incluidas. */
export function countLines(sections) {
  const c = { lines: 0, up: 0, down: 0, fix: 0, new: 0 };
  const walk = (ls) => ls.forEach((l) => { c.lines++; if (l.dir && l.dir in c) c[l.dir]++; if (l.kids) walk(l.kids); });
  sections.forEach((s) => walk(s.lines));
  return c;
}

// ---------- nombres de la enciclopedia ----------
// Nombres que son también palabras del juego de todos los días: si marcáramos
// "Life" o "Espíritu" cada línea de balance tendría una referencia falsa.
export const STOPWORDS = new Set(
  [
    "verisium", "life", "mana", "spirit", "chaos", "armour", "armor", "evasion", "energy shield", "fire", "cold", "lightning",
    "physical", "strength", "dexterity", "intelligence", "rage", "glory", "power", "frenzy", "endurance", "charge",
    "charges", "minion", "minions", "attack", "attacks", "spell", "spells", "projectile", "area", "duration", "ignite",
    "freeze", "shock", "chill", "bleeding", "bleed", "poison", "stun", "block", "leech", "ritual", "expedition",
    "breach", "delirium", "abyss", "essence", "essences", "rune", "runes", "sacrifice", "tribute", "omen", "omens",
    "relic", "relics", "tablet", "tablets", "waystone", "waystones", "precursor", "soul", "core", "cores", "idol",
    "idols", "jewel", "jewels", "ring", "rings", "amulet", "belt", "boots", "gloves", "helmet", "shield", "quiver",
    "focus", "flask", "flasks", "charm", "charms", "sceptre", "staff", "wand", "bow", "crossbow", "spear", "mace",
    "quarterstaff", "talisman", "trap", "traps", "totem", "totems", "curse", "curses", "aura", "auras", "herald",
    "mark", "marks", "warcry", "slam", "strike", "shot", "nova", "wave", "storm", "blast", "barrier", "armour break",
    "unique", "uniques", "rare", "magic", "normal", "gold", "vaal", "corrupted", "corruption", "atlas", "map", "maps",
    "boss", "bosses", "trial", "king", "queen", "hunt", "fury", "wrath", "hatred", "grace", "discipline", "vitality",
    "clarity", "haste", "purity", "determination", "berserk", "overwhelm", "impale", "stun", "daze", "dazed",
    "vida", "maná", "espíritu", "caos", "armadura", "evasión", "escudo de energía", "fuego", "frío", "rayo",
    "físico", "física", "fuerza", "destreza", "inteligencia", "furia", "gloria", "poder", "frenesí", "aguante",
    "carga", "cargas", "esbirro", "esbirros", "ataque", "ataques", "hechizo", "hechizos", "proyectil", "área",
    "duración", "quemadura", "congelación", "electrocución", "sangrado", "veneno", "aturdimiento", "bloqueo",
    "robo", "expedición", "fisura", "delirio", "abismo", "esencia", "esencias", "runa", "runas", "sacrificio",
    "tributo", "presagio", "presagios", "reliquia", "tablilla", "alma", "núcleo", "ídolo", "joya", "anillo",
    "amuleto", "cinturón", "botas", "guantes", "yelmo", "escudo", "carcaj", "foco", "frasco", "cetro", "vara",
    "arco", "ballesta", "lanza", "maza", "trampa", "tótem", "maldición", "aura", "heraldo", "marca", "grito",
    "golpe", "disparo", "onda", "tormenta", "barrera", "único", "única", "raro", "rara", "mágico", "oro",
    "corrupto", "corrupción", "mapa", "mapas", "jefe", "jefes", "prueba", "rey", "reina", "cacería", "ira", "odio",
    "gracia", "disciplina", "vitalidad", "claridad", "celeridad", "pureza", "determinación",
  ].map((w) => w.toLowerCase()),
);

const isWordChar = (c) => !!c && /[\p{L}\p{N}]/u.test(c);

/**
 * Arma un buscador de nombres para un idioma. `entries` = [{ id, name }].
 * Recorre el texto de izquierda a derecha y en cada comienzo de palabra se
 * queda con el nombre más largo que calce entero; así "Chaos Orb" no deja
 * también un "Chaos" suelto y dos nombres nunca se pisan.
 */
export function makeMatcher(entries) {
  const byKey = new Map();
  for (const { id, name } of entries) {
    const n = (name || "").trim();
    if (n.length < 4 || STOPWORDS.has(n.toLowerCase())) continue;
    const key = n.slice(0, 4);
    if (!byKey.has(key)) byKey.set(key, new Map());
    const m = byKey.get(key);
    if (!m.has(n)) m.set(n, []);
    if (!m.get(n).includes(id)) m.get(n).push(id);
  }
  const sorted = new Map([...byKey].map(([k, m]) => [k, [...m].sort((a, b) => b[0].length - a[0].length)]));
  return (text) => {
    const found = [];
    for (let i = 0; i < text.length; i++) {
      if (!isWordChar(text[i]) || isWordChar(text[i - 1])) continue;
      const cands = sorted.get(text.slice(i, i + 4));
      if (!cands) continue;
      for (const [name, ids] of cands) {
        if (text.startsWith(name, i) && !isWordChar(text[i + name.length])) {
          for (const id of ids) if (!found.includes(id)) found.push(id);
          i += name.length - 1;
          break;
        }
      }
    }
    return found;
  };
}

/** Pone o saca `refs` en cada línea según el buscador (o los saca todos si no hay). */
export function markRefs(lines, match) {
  for (const l of lines) {
    const r = match ? match(l.text) : [];
    if (r.length) l.refs = r;
    else delete l.refs;
    if (l.kids) markRefs(l.kids, match);
  }
  return lines;
}
