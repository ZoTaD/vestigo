/**
 * El pozo del Deadlockdle (2026-11-04): héroes, objetos y habilidades con las
 * columnas que se comparan en el juego.
 *
 * Corre antes de `vite dev` y de `vite build` (`predev`/`prebuild`) y deja
 * `public/deadlock/dle-pool.json`. Como el sitio se publica todos los días con
 * la tier list, el pozo se actualiza solo: héroes y objetos nuevos, stats de un
 * parche y el winrate del día. El Worker (`api/`) lo lee de vestigo.gg; ver
 * `docs/plans/2026-11-04-deadlockdle.md`. Los datos son públicos: lo secreto es
 * cuál es la respuesta, y eso lo elige el Worker.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BUCKET = "https://assets-bucket.deadlock-api.com/assets-api-res/";

/** Igual que `slugify` de `src/route.ts`: el enlace tiene que caer en la ficha. */
function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/['.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const text = (parts) => (parts ?? []).map((p) => p.t).join("").trim();
const round = (n) => Math.round(n * 10) / 10;

/** Qué da un objeto, en palabras: los `types` del catálogo. */
const GIVES = {
  tech_damage: "Spirit damage",
  bullet_damage: "Bullet damage",
  melee_damage: "Melee damage",
  healing: "Healing",
  health: "Health",
};
const gives = (types) =>
  types?.length ? [...new Set(types.map((t) => GIVES[t] ?? t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())))].sort() : null;

/**
 * Los efectos de una habilidad salen de los íconos de sus números y no de los
 * `attr` del texto: sólo 91 de las 176 habilidades marcan `attr` (medido el
 * 4/11), mientras que todas ponen un ícono a cada número.
 */
const EFFECTS = {
  damage_magic_color: "Spirit damage",
  damage_bullet_color: "Bullet damage",
  condition_slow: "Slow",
  heal: "Healing",
  move_speed: "Movement",
  condition_stun: "Stun",
  condition_knockdown: "Knockdown",
  condition_immobilize: "Immobilize",
  condition_silence: "Silence",
  condition_disarm: "Disarm",
  armor_bullet_color: "Resist shred",
  armor_spirit_color: "Resist shred",
  melee: "Melee",
  armor_melee_color: "Melee",
};
function effects(ability) {
  const found = new Set();
  for (const m of JSON.stringify(ability.sections ?? []).matchAll(/properties\/([a-z_]+)\.svg/g)) {
    if (EFFECTS[m[1]]) found.add(EFFECTS[m[1]]);
  }
  return found.size ? [...found].sort() : null;
}

export function buildPool(dataDir, manifestPath) {
  const manifest = read(manifestPath);
  const local = (url) => {
    const rel = url?.startsWith(BUCKET) ? url.slice(BUCKET.length) : null;
    const file = rel && manifest[rel];
    if (!file) throw new Error(`dle-pool: sin copia local de ${url}`);
    return `/deadlock/game/${file}`;
  };

  const catalog = read(join(dataDir, "catalog.json"));
  const kit = read(join(dataDir, "hero-kit.json"));
  const stats = new Map(Object.values(kit.heroes).map((h) => [String(h.heroId), h]));
  const winRates = new Map(read(join(dataDir, "heroes.phantom-above.json")).heroes.map((h) => [String(h.heroId), h.winRate]));
  const details = read(join(dataDir, "items-detail.json"));
  const kits = new Map(
    readdirSync(join(dataDir, "hero-kit"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const k = read(join(dataDir, "hero-kit", f));
        return [String(k.heroId), k];
      }),
  );

  const heroes = [];
  const abilities = [];
  for (const [id, h] of Object.entries(catalog.heroes)) {
    const s = stats.get(id);
    const k = kits.get(id);
    if (!s || !k) continue;
    const name = h.name.en;
    const own = k.abilities.en;
    const wr = winRates.get(id);
    heroes.push({
      id: `hero:${id}`,
      name,
      img: local(h.card),
      cols: {
        complexity: s.complexity,
        health: s.stats.health,
        moveSpeed: s.stats.moveSpeed,
        clip: s.stats.weapon.clip,
        gunDps: s.stats.weapon.dps,
        winRate: wr == null ? null : round(wr * 100),
      },
      hints: [
        { kind: "img", src: local(own.find((a) => a.slot === 1)?.img ?? own[0].img), blur: false },
        { kind: "text", text: k.text.en.role },
      ],
      link: `deadlock/heroes/${slugify(name)}`,
    });
    for (const a of own) {
      abilities.push({
        id: `ability:${a.id}`,
        name: a.name,
        img: local(a.img),
        cols: {
          hero: name,
          slot: a.slot,
          ultimate: a.ultimate ? "Yes" : "No",
          cooldown: a.cooldown ? Number(a.cooldown.value) : null,
          effects: effects(a),
        },
        hints: [
          { kind: "text", text: `A ${name} ability` },
          { kind: "text", text: text(a.quip) },
        ],
        link: `deadlock/heroes/${slugify(name)}`,
      });
    }
  }

  const items = [];
  for (const [id, it] of Object.entries(catalog.items)) {
    const name = it.name.en ?? it.name;
    const sections = details[id]?.en?.sections ?? [];
    const first = sections.flatMap((s) => s.blocks ?? []).map((b) => text(b.text)).find(Boolean);
    const from = (it.upgradesFrom ?? []).map((f) => catalog.items[f]?.name?.en ?? catalog.items[f]?.name).filter(Boolean);
    items.push({
      id: `item:${id}`,
      name,
      img: local(it.img),
      cols: {
        slot: it.slot.charAt(0).toUpperCase() + it.slot.slice(1),
        tier: it.tier,
        cost: it.cost,
        kind: sections.some((s) => s.kind === "active") ? "Active" : "Passive",
        upgradeOf: from.length ? "Yes" : "No",
        gives: gives(it.types),
      },
      hints: [
        { kind: "text", text: first ?? "No description" },
        { kind: "text", text: from.length ? `Builds from ${from.join(", ")}` : "Builds from nothing" },
      ],
      link: `deadlock/items/${slugify(name)}`,
    });
  }

  const byName = (a, b) => a.name.localeCompare(b.name, "en");
  return {
    builtAt: new Date().toISOString(),
    heroes: heroes.sort(byName),
    items: items.sort(byName),
    abilities: abilities.sort(byName),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const site = fileURLToPath(new URL("..", import.meta.url));
  const pool = buildPool(join(site, "../games/deadlock/data"), join(site, "public/deadlock/game/manifest.json"));
  writeFileSync(join(site, "public/deadlock/dle-pool.json"), JSON.stringify(pool));
  console.log(`dle-pool: ${pool.heroes.length} héroes, ${pool.items.length} objetos, ${pool.abilities.length} habilidades`);
}
