// Maquetas del nuevo Armador/Builds. Datos reales de Abrams:
// - catálogo de objetos y habilidades (games/deadlock/data)
// - build medida (builds.json), builds de los 20 mejores (top-players.json)
// - builds públicas del juego (deadlock-api /v1/builds), bajadas hoy.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (n) => Number(n).toLocaleString("es-AR");
const item = (id) => D.items[String(id)];
const ABIL = Object.fromEntries(D.abilities.map((a) => [a.slot, a]));
const ABIL_BY_ID = Object.fromEntries(D.abilities.map((a) => [a.id, a.slot]));

function itemTile(id, size = 48, extra = "") {
  const it = item(id);
  if (!it) return "";
  return `<span class="it ${it.slot} s${size}" title="${esc(it.n)} · ${fmt(it.cost)}" ${extra}><img src="${it.img}" alt="${esc(it.n)}" loading="lazy" decoding="async"></span>`;
}

function header(active) {
  const links = [["Tier list"], ["Héroes"], ["Objetos"], ["Builds", "index.html"], ["Rangos"], ["Jugador"]];
  return `<header class="top"><div class="wrap">
    <a class="logo" href="index.html">VESTIGO</a>
    <nav class="nav">${links.map(([l, h]) => `<a href="${h || "#"}" class="${l === "Builds" ? "on" : ""}">${l.toUpperCase()}</a>`).join("")}</nav>
    <span class="spacer"></span>
    <span class="mock">MAQUETA</span>
    <span class="who"><span class="av"></span>Sesión de Steam</span>
  </div></header>`;
}

function mapnav(active) {
  const p = [["index.html", "1 Biblioteca"], ["ficha.html", "2 Ficha"], ["editor.html", "3 Editor"], ["publicar.html", "4 Publicar"]];
  return `<nav class="mapnav" aria-label="Maquetas"><span>Maquetas</span>${p.map(([h, l]) => `<a href="${h}" class="${h === active ? "on" : ""}">${l}</a>`).join("")}</nav>`;
}

function toast(msg) {
  let t = $(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.append(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 1600);
}

function sumCost(ids) { return ids.reduce((s, id) => s + (item(id)?.cost || 0), 0); }

// El juego guarda la build entera (también componentes que después se mejoran).
// Para mostrar 3 objetos clave tomamos los más caros.
function keyItems(cats, n = 3) {
  const all = [...new Set(cats.flatMap((c) => c.items))].filter(item);
  return all.sort((a, b) => item(b).cost - item(a).cost).slice(0, n);
}

function styleOf(cats) {
  const ids = [...new Set(cats.flatMap((c) => c.items))].filter(item);
  const by = { weapon: 0, vitality: 0, spirit: 0 };
  ids.forEach((id) => (by[item(id).slot] += item(id).cost));
  const tot = by.weapon + by.vitality + by.spirit || 1;
  if (by.weapon / tot > 0.5) return "Arma";
  if (by.spirit / tot > 0.4) return "Espíritu";
  if (by.vitality / tot > 0.5) return "Tanque";
  return "Híbrida";
}

const TIER_NAMES = { 1: "Temprano", 2: "Medio", 3: "Tarde", 4: "Lujo" };
const daysAgo = (ts) => Math.max(0, Math.round((Date.now() / 1000 - ts) / 86400));

function allBuilds() {
  const out = [];
  D.measured.forEach((m) => out.push({
    src: "vestigo", key: "v-" + m.id, name: "Abrams aguante · la que más gana",
    author: "Vestigo", badge: ["OFICIAL", "b-oficial"], gameId: null,
    desc: `Armada con lo que compran los Abrams que ganan en Fantasma o más (${m.matches.toLocaleString("es-AR")} partidas del ${D.meta.from} al ${D.meta.to}). Va por etapas: lo de arriba primero.`,
    cats: Object.entries(m.tiers).map(([t, ids]) => ({ name: TIER_NAMES[t], desc: "", items: ids })),
    ao: [], wr: m.wr, matches: m.matches, fav: null, upd: null,
  }));
  D.top.forEach((t) => out.push({
    src: "top", key: "t-" + t.id, name: t.name, author: `${t.players} de los 20 mejores`, badge: ["TOP 20", "b-top"], gameId: t.id,
    desc: `La eligieron ${t.players} de los 20 mejores Abrams en ${t.matches} partidas del ${D.topFrom} al ${D.topTo}.`,
    cats: t.cats.map((c) => ({ name: c.name.replace("#Citadel_HeroBuilds_EarlyGame", "Temprano"), desc: "", items: c.items })),
    ao: (COMM.find((x) => x.id === t.id) || {}).ao || [], wr: Math.round((t.wins / t.matches) * 100), matches: t.matches, small: true, fav: null, upd: null,
  }));
  COMM.forEach((c) => out.push({
    src: "comm", key: "c-" + c.id, name: c.name, author: "cuenta " + c.author, badge: ["STEAM", "b-steam"], gameId: c.id,
    desc: c.desc, cats: c.cats.filter((k) => k.items.length), ao: c.ao, wr: null, matches: null, fav: c.fav, upd: c.upd, ver: c.ver,
  }));
  out.forEach((b) => { b.style = styleOf(b.cats); b.key3 = keyItems(b.cats); b.souls = sumCost([...new Set(b.cats.flatMap((c) => c.items))]); });
  return out;
}

// El orden de habilidades del juego: una lista de ids, un punto por entrada.
function abilityGrid(ao, cols = 16) {
  const seq = ao.map((id) => ABIL_BY_ID[id]).filter(Boolean).slice(0, cols);
  if (!seq.length) return `<p class="muted" style="margin:0">Esta build no trae orden de habilidades.</p>`;
  const color = { 1: "#e58a00", 2: "#ce90ff", 3: "#5aa8ff", 4: "#ffefd7" };
  return `<div style="overflow-x:auto"><div style="display:grid;grid-template-columns:150px repeat(${seq.length},30px);gap:4px;align-items:center;min-width:max-content">
    ${[1, 2, 3, 4].map((s) => `<span style="display:flex;gap:8px;align-items:center;font-size:12px;color:var(--text-2)"><span class="ab" style="width:28px;height:28px"><img src="${ABIL[s].img}" alt=""></span>${esc(ABIL[s].n)}</span>` +
      seq.map((k, i) => `<span style="height:30px;border-radius:4px;display:flex;align-items:center;justify-content:center;font:700 12px Inter;${k === s ? `background:${color[s]};color:#10130d` : "background:var(--ink)"}">${k === s ? i + 1 : ""}</span>`).join("")).join("")}
  </div></div>`;
}
