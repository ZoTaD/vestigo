import { loadLobbies, isComparable, type LobbyRecord } from "./store";
import { compSignature, primaryCarry, type Participant } from "./aggregate/signature";
import { publishedSet, setFromEnv } from "./sets";
import { archivedSetNumbers } from "./setsArchive";

/**
 * What separates one rank band from another.
 *
 * The question this exists to answer is whether higher ranks win because they
 * pick different comps or because they execute the same ones better. Those are
 * opposite pieces of advice, and only a side-by-side of the bands can tell them
 * apart — so every figure here is reported per band, never pooled.
 *
 *   npm run compare
 *
 * Bands with too few boards are dropped rather than shown with a wide error
 * bar, because a table invites comparison and a thin row would get compared.
 */

const STORE = "../data/matches";
/** El set del que habla el sitio, igual que build.ts — esto reporta sobre lo publicado. */
const SET = setFromEnv(process.env.TFT_SET) ?? publishedSet(archivedSetNumbers());
/** Below this a band's averages move with a handful of games. */
const MIN_BOARDS = 200;

/** "GOLD IV" and "GOLD I" are the same band for this purpose. */
function bandOf(lobby: LobbyRecord): string {
  const tier = lobby.tier.split(/\s+/)[0] ?? "";
  return tier.toLowerCase();
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const itemsOn = (b: Participant) => b.units.reduce((s, u) => s + u.items.length, 0);
const carryItems = (b: Participant) =>
  b.units.find((u) => u.character_id === primaryCarry(b))?.items.length ?? 0;

interface BandStats {
  band: string;
  matches: number;
  boards: number;
  avgLevel: number;
  avgGoldLeft: number;
  /** Share of boards that died sitting on 26+ gold. */
  wastedGoldRate: number;
  avgItems: number;
  /** Share of boards whose carry holds a full three items. */
  fullCarryRate: number;
  /**
   * Distinct comps per hundred boards — high means the band plays a bit of
   * everything, low means it converges on the meta. Measured on a fixed-size
   * sample shared by every band: raw variety falls as boards rise (more chances
   * to repeat a signature), which made the largest band look like the most
   * disciplined one when it was only the biggest.
   */
  compVariety: number;
  /** Share of boards sharing their carry with someone else in the lobby. */
  contestedRate: number;
}

/**
 * Distinct signatures per hundred boards over a window of `size`, averaged
 * across several windows so the answer does not depend on which slice is taken.
 */
function varietyOver(boards: Participant[], size: number): number {
  const signatures = boards.map(compSignature).filter(Boolean);
  // Clamp against the signatures, not the boards: dropping the unsignable ones
  // makes this array shorter, and sizing the window off `boards` sent the
  // smallest band's start index negative — which read as near-zero variety.
  const window = Math.min(size, signatures.length);
  if (window === 0) return NaN;

  const windows = 5;
  let total = 0;
  for (let i = 0; i < windows; i++) {
    const start = Math.floor(((signatures.length - window) * i) / Math.max(1, windows - 1));
    total += new Set(signatures.slice(start, start + window)).size;
  }
  return (total / windows / window) * 100;
}

function statsFor(band: string, lobbies: LobbyRecord[], varietyWindow: number): BandStats {
  const boards = lobbies.flatMap((l) => l.boards);

  let contested = 0;
  for (const lobby of lobbies) {
    const carries = lobby.boards.map(primaryCarry);
    const tally = new Map<string, number>();
    for (const c of carries) if (c) tally.set(c, (tally.get(c) ?? 0) + 1);
    for (const c of carries) if (c && (tally.get(c) ?? 0) > 1) contested++;
  }

  return {
    band,
    matches: lobbies.length,
    boards: boards.length,
    avgLevel: mean(boards.map((b) => b.level)),
    avgGoldLeft: mean(boards.map((b) => b.goldLeft)),
    wastedGoldRate: boards.filter((b) => b.goldLeft >= 26).length / boards.length,
    avgItems: mean(boards.map(itemsOn)),
    fullCarryRate: boards.filter((b) => carryItems(b) >= 3).length / boards.length,
    compVariety: varietyOver(boards, varietyWindow),
    contestedRate: contested / boards.length,
  };
}

function main() {
  const usable = loadLobbies(STORE).filter((l) => isComparable(l, SET) && l.tier !== "");
  if (usable.length === 0) {
    console.error("no tagged lobbies yet — run `npm run pull:all` first");
    process.exit(1);
  }

  const byBand = new Map<string, LobbyRecord[]>();
  for (const lobby of usable) {
    const band = bandOf(lobby);
    byBand.set(band, [...(byBand.get(band) ?? []), lobby]);
  }

  // Every band's variety is read off the same number of boards, so the column
  // compares bands rather than sample sizes.
  const sizes = [...byBand.values()]
    .map((ls) => ls.flatMap((l) => l.boards).length)
    .filter((n) => n >= MIN_BOARDS);
  const varietyWindow = Math.min(...sizes);

  const rows = [...byBand.entries()]
    .map(([band, ls]) => statsFor(band, ls, varietyWindow))
    .filter((r) => r.boards >= MIN_BOARDS)
    .sort((a, b) => b.avgLevel - a.avgLevel);

  const thin = [...byBand.entries()]
    .map(([band, ls]) => ({ band, boards: ls.flatMap((l) => l.boards).length }))
    .filter((r) => r.boards < MIN_BOARDS);

  if (rows.length === 0) {
    console.error(`no band reached ${MIN_BOARDS} boards yet.`);
    for (const t of thin) console.error(`  ${t.band}: ${t.boards}`);
    process.exit(1);
  }

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  console.log(
    "band".padEnd(13) +
      "boards".padStart(7) +
      "level".padStart(7) +
      "gold".padStart(7) +
      "wasted".padStart(8) +
      "items".padStart(7) +
      "carry3".padStart(8) +
      "variety".padStart(9) +
      "contested".padStart(11)
  );
  for (const r of rows) {
    console.log(
      r.band.padEnd(13) +
        String(r.boards).padStart(7) +
        r.avgLevel.toFixed(2).padStart(7) +
        r.avgGoldLeft.toFixed(1).padStart(7) +
        pct(r.wastedGoldRate).padStart(8) +
        r.avgItems.toFixed(1).padStart(7) +
        pct(r.fullCarryRate).padStart(8) +
        r.compVariety.toFixed(1).padStart(9) +
        pct(r.contestedRate).padStart(11)
    );
  }

  if (thin.length > 0) {
    console.log(`\nbands below ${MIN_BOARDS} boards, not shown:`);
    for (const t of thin) console.log(`  ${t.band}: ${t.boards}`);
  }
}

main();
