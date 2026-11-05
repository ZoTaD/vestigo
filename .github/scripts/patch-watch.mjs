/**
 * Aviso de parches por juego (2026-11-02).
 *
 * Una vez por semana mira dónde publica cada juego sus parches y, si salió uno
 * nuevo, lo anota en un issue abierto por juego ("Parches nuevos: Valheim"):
 * ahí se ve qué hay que revisar (valores de armas, cosas nuevas…) y el issue se
 * cierra cuando los datos del sitio están al día. Si el issue del juego sigue
 * abierto, el parche nuevo se suma como comentario: un issue por juego, no uno
 * por hotfix.
 *
 * Deadlock queda afuera (tiene su propio periódico, `publish-deadlock`), y Rust
 * y Terraria también (congelados desde el 2026-11-02), igual que PoE2, Diablo II
 * y Warframe (escondidos desde el 2026-11-05).
 *
 * Qué parche ya se avisó sale de los issues mismos: cada línea lleva una marca
 * `<!-- parche:<juego>:<id> -->`. No hay archivo de estado que commitear.
 *
 * `--dry` sólo imprime lo que avisaría, sin tocar GitHub.
 */

const UA = "vestigo.gg patch-watch/1.0 (contact: grundynicolas021@gmail.com)";
/** Lo de antes no se avisa: los datos del sitio se revisaron hasta acá. */
const SINCE = Date.parse("2026-10-20T00:00:00Z");
const LABEL = "parches";
const REPO = process.env.GITHUB_REPOSITORY ?? "ZoTaD/vestigo";
const TOKEN = process.env.GITHUB_TOKEN;
const DRY = process.argv.includes("--dry");

async function get(url, as = "json") {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return as === "json" ? r.json() : r.text();
}

/**
 * Los anuncios de Steam que son parches: la etiqueta `patchnotes` cuando la
 * ponen, y si no, un número de versión en el título ("Build 42.21 Stable
 * Released", "Terraria 1.4.5.7 - Out Now"). "State of the Game" no lleva número.
 */
const steam = (appid) => async () => {
  const d = await get(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=20&maxlength=1&feeds=steam_community_announcements`);
  return d.appnews.newsitems
    .filter((n) => n.tags?.includes("patchnotes") || /\b\d+\.\d+(?:\.\d+)*\b/.test(n.title))
    .map((n) => ({ id: n.gid, title: n.title, url: n.url, date: n.date * 1000 }));
};

const GAMES = [
  { key: "valheim", name: "Valheim", fetch: steam(892970) },
  { key: "zomboid", name: "Project Zomboid", fetch: steam(108600) },
  { key: "stardew", name: "Stardew Valley", fetch: steam(413150) },
];

// ——— GitHub ———

async function gh(path, init = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": UA, ...init.headers },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status} ${path}: ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

/** Todos los issues de parches (abiertos y cerrados) con sus comentarios. */
async function known() {
  const issues = [];
  for (let page = 1; ; page++) {
    const batch = await gh(`/issues?labels=${LABEL}&state=all&per_page=100&page=${page}`);
    issues.push(...batch);
    if (batch.length < 100) break;
  }
  const seen = new Set();
  const open = new Map();
  for (const i of issues) {
    let text = i.body ?? "";
    if (i.comments) for (const c of await gh(`/issues/${i.number}/comments?per_page=100`)) text += c.body;
    for (const m of text.matchAll(/<!-- parche:([\w-]+:[^ ]+) -->/g)) seen.add(m[1]);
    const game = i.body?.match(/<!-- juego:([\w-]+) -->/)?.[1];
    if (i.state === "open" && game) open.set(game, i.number);
  }
  return { seen, open };
}

const line = (g, p) =>
  `- [${p.title}](${p.url}) · ${new Date(p.date).toISOString().slice(0, 10)} <!-- parche:${g.key}:${p.id} -->`;

async function main() {
  const { seen, open } = DRY && !TOKEN ? { seen: new Set(), open: new Map() } : await known();
  if (!DRY) {
    await gh("/labels", {
      method: "POST",
      body: JSON.stringify({ name: LABEL, color: "c2512a", description: "Salió un parche: revisar los datos del juego" }),
    }).catch(() => {}); // ya existe
  }

  let failed = 0;
  for (const g of GAMES) {
    let posts;
    try {
      posts = await g.fetch();
    } catch (e) {
      failed++;
      console.error(`${g.name}: ${e.message}`);
      continue;
    }
    const fresh = posts.filter((p) => p.date >= SINCE && !seen.has(`${g.key}:${p.id}`)).sort((a, b) => a.date - b.date);
    console.log(`${g.name}: ${fresh.length} nuevo(s)${fresh.map((p) => `\n  ${p.title}`).join("")}`);
    if (!fresh.length || DRY) continue;

    const lines = fresh.map((p) => line(g, p)).join("\n");
    const issue = open.get(g.key);
    if (issue) {
      await gh(`/issues/${issue}/comments`, { method: "POST", body: JSON.stringify({ body: `Más parches:\n\n${lines}` }) });
    } else {
      const body =
        `<!-- juego:${g.key} -->\nSalieron parches de ${g.name}. Revisar si cambian los datos del sitio ` +
        `(valores, objetos nuevos, recetas…) y cerrar este issue cuando esté al día.\n\n${lines}`;
      await gh("/issues", { method: "POST", body: JSON.stringify({ title: `Parches nuevos: ${g.name}`, body, labels: [LABEL] }) });
    }
  }
  // Un juego que no contestó no frena a los otros, pero deja la corrida en rojo.
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
