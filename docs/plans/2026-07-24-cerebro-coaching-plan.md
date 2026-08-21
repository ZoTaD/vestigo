# Cerebro de coaching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a player which of their habits separate them from the rank band above, using only habits that are a real choice and that actually cost placements inside their own band.

**Architecture:** A habit is defined once as a pure predicate in `games/tft/analysis` (the runtime-free package both the browser and Node import). The pipeline runs those predicates over each band's boards and publishes one small `habits.json` holding all four bands. A coach module applies three gates and returns ids plus numbers; the copy lives in `i18n.ts` with the panel that renders it.

**Tech Stack:** TypeScript, Node + tsx (pipeline), React 18 + Vite (UI), Vitest (all three packages).

**Spec:** `docs/design/2026-07-24-cerebro-coaching-design.md`

## Global Constraints

- **No prose outside `games/tft/ui/src/i18n.ts`.** The coach returns ids and numbers only, exactly like `analysis/src/tags.ts`. Game vocabulary (champions, items, traits) is never written by hand — it comes from CommunityDragon via the catalog.
- **Spanish is neutral Latin American, no voseo.** Write "te quedas", never "te quedás". Both EN and ES strings are added in the same edit.
- **`games/tft/analysis` must stay runtime-free.** No `node:` imports in that package — the same code runs in the browser, in Deno and in tests.
- **Nothing hardcoded that can be measured.** Thresholds either come from the pipeline's `calibration` block or carry their derivation in a comment.
- **Every displayed claim prints the number behind it**, including its sample size.
- **The tier list, the comps pipeline, the Edge Function, the API and the Postgres schema are not touched by this plan.**
- Run commands from the repo root `C:\Users\usuario\Desktop\ProBuilds` unless a step says otherwise.

---

### Task 1: The habit vocabulary

**Files:**
- Create: `games/tft/analysis/src/habits.ts`
- Test: `games/tft/analysis/test/habits.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `HabitBoard`, `HabitUnit`, `HabitId`, `HABIT_IDS`, `HABITS`, `HabitStat`, `HabitTable`, `measureHabits(boards: HabitBoard[]): HabitTable`, `habitCarry(board: HabitBoard): HabitUnit | null`, and the constants `GOLD_HOARD_FROM`, `LEVEL_FLOOR`, `FULL_ITEMS`, `REROLL_MAX_COST`, `PLACEMENT_SD`.

- [ ] **Step 1: Write the failing test**

Create `games/tft/analysis/test/habits.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  HABITS,
  HABIT_IDS,
  measureHabits,
  habitCarry,
  type HabitBoard,
} from "../src/habits";

/** A board with everything neutral, so each test changes exactly one thing. */
const board = (over: Partial<HabitBoard> = {}): HabitBoard => ({
  placement: 4,
  level: 8,
  goldLeft: 0,
  units: [{ id: "TFT17_Jinx", stars: 2, cost: 4, items: ["a", "b", "c"] }],
  ...over,
});

describe("the habit predicates", () => {
  it("reads leftover gold at the threshold the calibration measured", () => {
    expect(HABITS.hoardsGold(board({ goldLeft: 25 }))).toBe(false);
    expect(HABITS.hoardsGold(board({ goldLeft: 26 }))).toBe(true);
  });

  it("calls level 7 low and level 8 not, the cut the profile already uses", () => {
    expect(HABITS.lowLevel(board({ level: 8 }))).toBe(false);
    expect(HABITS.lowLevel(board({ level: 7 }))).toBe(true);
  });

  it("measures the carry's items, not any unit's", () => {
    expect(HABITS.carryShort(board())).toBe(false);
    expect(
      HABITS.carryShort(
        board({
          units: [
            { id: "TFT17_Jinx", stars: 2, cost: 4, items: ["a", "b"] },
            { id: "TFT17_Ornn", stars: 2, cost: 5, items: [] },
          ],
        })
      )
    ).toBe(true);
  });

  it("cannot answer carryShort for an empty board", () => {
    expect(HABITS.carryShort(board({ units: [] }))).toBeNull();
  });

  // Three stars is only a reroll decision on a cheap unit; a 3-star 5-cost is
  // an accident of the game, not a plan.
  it("counts a three-star cheap unit as rerolling, and an expensive one as not", () => {
    expect(
      HABITS.rerolls(board({ units: [{ id: "x", stars: 3, cost: 2, items: [] }] }))
    ).toBe(true);
    expect(
      HABITS.rerolls(board({ units: [{ id: "x", stars: 3, cost: 5, items: [] }] }))
    ).toBe(false);
    expect(
      HABITS.rerolls(board({ units: [{ id: "x", stars: 2, cost: 1, items: [] }] }))
    ).toBe(false);
  });

  // Summoned units carry cost 0 and can report three stars.
  it("does not read a summoned unit as a reroll", () => {
    expect(
      HABITS.rerolls(board({ units: [{ id: "TFT17_Golem", stars: 3, cost: 0, items: [] }] }))
    ).toBe(false);
  });

  // These three are facts about the lobby or the band's tier list, not about
  // the board alone. Absent means "cannot answer", never "no".
  it("returns null for the habits whose input was not supplied", () => {
    expect(HABITS.contestedCarry(board())).toBeNull();
    expect(HABITS.offMeta(board())).toBeNull();
    expect(HABITS.lowTierComp(board())).toBeNull();
    expect(HABITS.contestedCarry(board({ contested: true }))).toBe(true);
    expect(HABITS.offMeta(board({ compExact: true }))).toBe(false);
    expect(HABITS.lowTierComp(board({ compTier: "C" }))).toBe(true);
    expect(HABITS.lowTierComp(board({ compTier: "A" }))).toBe(false);
  });
});

describe("habitCarry", () => {
  it("is whoever the board committed the most items to", () => {
    const b = board({
      units: [
        { id: "front", stars: 2, cost: 1, items: ["a"] },
        { id: "carry", stars: 2, cost: 4, items: ["a", "b", "c"] },
      ],
    });
    expect(habitCarry(b)?.id).toBe("carry");
  });

  it("is null on an empty board rather than a guess", () => {
    expect(habitCarry(board({ units: [] }))).toBeNull();
  });
});

describe("measureHabits", () => {
  it("reports the rate and both sides' average placement", () => {
    const boards = [
      board({ goldLeft: 40, placement: 7 }),
      board({ goldLeft: 40, placement: 5 }),
      board({ goldLeft: 0, placement: 1 }),
      board({ goldLeft: 0, placement: 3 }),
    ];
    const table = measureHabits(boards);
    expect(table.hoardsGold).toEqual({
      rate: 0.5,
      boards: 4,
      withN: 2,
      avgWith: 6,
      avgWithout: 2,
    });
  });

  // A board that cannot answer must not be counted as a "no": that would turn
  // missing input into a claim that the habit is rare.
  it("leaves unanswerable boards out of the denominator", () => {
    const table = measureHabits([
      board({ contested: true }),
      board({ contested: false }),
      board(),
    ]);
    expect(table.contestedCarry?.boards).toBe(2);
    expect(table.contestedCarry?.rate).toBe(0.5);
  });

  it("omits a habit no board could answer instead of reporting zero", () => {
    const table = measureHabits([board(), board()]);
    expect(table.offMeta).toBeUndefined();
  });

  it("measures every habit in the vocabulary", () => {
    expect(HABIT_IDS).toEqual([
      "hoardsGold",
      "lowLevel",
      "carryShort",
      "rerolls",
      "contestedCarry",
      "offMeta",
      "lowTierComp",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix games/tft/analysis test -- habits`
Expected: FAIL — `Failed to resolve import "../src/habits"`.

- [ ] **Step 3: Write the implementation**

Create `games/tft/analysis/src/habits.ts`:

```ts
/**
 * What a player does, in the vocabulary the coach compares across rank bands.
 *
 * Defined here, once, and imported by the pipeline as well as the browser. Two
 * copies of a predicate cannot be checked against each other the way the two
 * bands.ts tables can — a test can compare tables, not function bodies — so a
 * drift between them would silently compare the player against a habit that is
 * no longer the one measured for the band.
 *
 * Every habit is a CHOICE a player makes, never a description of having
 * survived. Items held off the carry is the counter-example that shaped this
 * file: it sits on 84-95% of boards with an apparent effect of -2.2 to -2.8
 * places, because it measures having lived long enough to hold items. The
 * prevalence gate in coach.ts is what keeps that class of thing off the screen.
 */

export interface HabitUnit {
  id: string;
  /** Star level, 1 to 3. */
  stars: number;
  /** Shop cost in gold, 1 to 5. Zero for summoned units, which are not bought. */
  cost: number;
  items: string[];
}

export interface HabitBoard {
  placement: number;
  level: number;
  goldLeft: number;
  units: HabitUnit[];
  /**
   * Facts a board cannot answer on its own: being contested is a fact about the
   * lobby, and which comp you played depends on the band's tier list. Whoever
   * calls fills these in — the pipeline has lobbies grouped, the browser has the
   * raw match — so every predicate stays pure over one shape.
   *
   * Absent means "cannot answer", never "no". Counting a missing input as false
   * would turn silence into the claim that the habit is rare.
   */
  contested?: boolean;
  compExact?: boolean;
  compTier?: string;
}

export type HabitId =
  | "hoardsGold"
  | "lowLevel"
  | "carryShort"
  | "rerolls"
  | "contestedCarry"
  | "offMeta"
  | "lowTierComp";

/** Where leftover gold stops being normal. From `calibration.gold.wastedFrom`. */
export const GOLD_HOARD_FROM = 26;
/** A board that reached level 8 was pushing levels; below it, it was not. */
export const LEVEL_FLOOR = 7;
/** A finished carry holds three items. From `calibrate.ts`. */
export const FULL_ITEMS = 3;
/**
 * Three stars is a reroll decision only on a cheap unit: it takes nine copies,
 * which is realistic at 1-3 cost and an accident above it.
 */
export const REROLL_MAX_COST = 3;
/**
 * The standard deviation of a placement inside a band.
 *
 * Not a guess and not fitted: bands are built from whole lobbies, so every band
 * holds exactly one 1st, one 2nd and so on. Placements are uniform on 1..8, and
 * a discrete uniform over 8 values has sd = sqrt((8^2 - 1)/12) = 2.29. Measured
 * across the store the mix is 12.5% per place in all four bands, which is the
 * fact this rests on. coach.ts uses it to turn a placement gap into a standard
 * error without needing a second pass over the data.
 */
export const PLACEMENT_SD = 2.29;

const LOW_TIERS = new Set(["C", "D"]);

/** Whoever the board committed items to. Ties break toward the pricier unit. */
export function habitCarry(board: HabitBoard): HabitUnit | null {
  if (board.units.length === 0) return null;
  return [...board.units].sort(
    (a, b) =>
      b.items.length - a.items.length ||
      b.stars - a.stars ||
      b.cost - a.cost ||
      a.id.localeCompare(b.id)
  )[0];
}

/** Null when this board cannot answer the question at all. */
export type HabitPredicate = (board: HabitBoard) => boolean | null;

export const HABITS: Record<HabitId, HabitPredicate> = {
  hoardsGold: (b) => b.goldLeft >= GOLD_HOARD_FROM,
  lowLevel: (b) => b.level <= LEVEL_FLOOR,
  carryShort: (b) => {
    const carry = habitCarry(b);
    return carry ? carry.items.length < FULL_ITEMS : null;
  },
  rerolls: (b) =>
    b.units.some((u) => u.stars === 3 && u.cost >= 1 && u.cost <= REROLL_MAX_COST),
  contestedCarry: (b) => b.contested ?? null,
  offMeta: (b) => (b.compExact === undefined ? null : !b.compExact),
  lowTierComp: (b) => (b.compTier === undefined ? null : LOW_TIERS.has(b.compTier)),
};

/** Stable order, so the published file and the tests read the same way. */
export const HABIT_IDS: HabitId[] = [
  "hoardsGold",
  "lowLevel",
  "carryShort",
  "rerolls",
  "contestedCarry",
  "offMeta",
  "lowTierComp",
];

export interface HabitStat {
  /** Share of the boards that could answer where the habit was present. */
  rate: number;
  /** Boards that could answer. Never the whole set — see HabitBoard. */
  boards: number;
  /** Boards with the habit, so a caller can size each side of the split. */
  withN: number;
  /** Average placement with the habit, and without it. */
  avgWith: number;
  avgWithout: number;
}

export type HabitTable = Partial<Record<HabitId, HabitStat>>;

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/**
 * Every habit's rate and placement split over a set of boards.
 *
 * The same function serves a whole rank band and one player's twenty games —
 * which is the point: a comparison between two numbers measured different ways
 * is not a comparison.
 */
export function measureHabits(boards: HabitBoard[]): HabitTable {
  const table: HabitTable = {};
  for (const id of HABIT_IDS) {
    const predicate = HABITS[id];
    const withIt: number[] = [];
    const without: number[] = [];
    for (const board of boards) {
      const hit = predicate(board);
      if (hit === null) continue;
      (hit ? withIt : without).push(board.placement);
    }
    const answered = withIt.length + without.length;
    if (answered === 0) continue;
    table[id] = {
      rate: withIt.length / answered,
      boards: answered,
      withN: withIt.length,
      avgWith: mean(withIt),
      avgWithout: mean(without),
    };
  }
  return table;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix games/tft/analysis test -- habits`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add games/tft/analysis/src/habits.ts games/tft/analysis/test/habits.test.ts
git commit -m "feat: define the habit vocabulary the coach compares across bands"
```

---

### Task 2: The band ladder

**Files:**
- Modify: `games/tft/pipeline/src/bands.ts` (append after `EXCLUSIVE`)
- Modify: `games/tft/ui/src/bands.ts` (append after `EXCLUSIVE`)
- Test: `games/tft/ui/test/bands.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `EXCLUSIVE` and `BandId` from both `bands.ts` files.
- Produces: `BAND_LADDER: BandId[]` and `bandAbove(band: BandId): BandId | null` in the UI copy; `BAND_LADDER: string[]` and `bandAbove(bandId: string): string | null` in the pipeline copy.

- [ ] **Step 1: Write the failing test**

Append to `games/tft/ui/test/bands.test.ts`:

```ts
import { BAND_LADDER, bandAbove } from "../src/bands";

describe("the band ladder", () => {
  it("orders the exclusive bands from the bottom of the ladder up", () => {
    expect(BAND_LADDER).toEqual([
      "silver-below",
      "platinum-gold",
      "diamond-emerald",
      "apex",
    ]);
  });

  // The coach compares against one step up, never against the ceiling: advice
  // drawn from apex handed to a Silver player describes a different game.
  it("names the next step up, and nothing above apex", () => {
    expect(bandAbove("silver-below")).toBe("platinum-gold");
    expect(bandAbove("platinum-gold")).toBe("diamond-emerald");
    expect(bandAbove("diamond-emerald")).toBe("apex");
    expect(bandAbove("apex")).toBeNull();
  });

  // The overlapping default band claims no player, so it has no step above it.
  it("has no rung for the overlapping default band", () => {
    expect(BAND_LADDER).not.toContain("global");
    expect(bandAbove("global")).toBeNull();
  });

  it("holds exactly the bands that partition the ladder", () => {
    expect([...BAND_LADDER].sort()).toEqual(EXCLUSIVE.map((b) => b.id).sort());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix games/tft/ui test -- bands`
Expected: FAIL — `BAND_LADDER` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `games/tft/ui/src/bands.ts`:

```ts
/**
 * The exclusive bands from the bottom up, which is what makes "the band above
 * yours" a thing that can be named.
 *
 * Written out rather than derived from BANDS: the order in that table is display
 * order (the default first), and reusing it would tie the coach's meaning to a
 * cosmetic decision. The pipeline keeps the same list; test/bands.test.ts checks
 * both against the files on disk.
 */
export const BAND_LADDER: BandId[] = [
  "silver-below",
  "platinum-gold",
  "diamond-emerald",
  "apex",
];

/** The next rung up, or null at the top — and for the band that claims nobody. */
export function bandAbove(band: BandId): BandId | null {
  const at = BAND_LADDER.indexOf(band);
  if (at < 0 || at === BAND_LADDER.length - 1) return null;
  return BAND_LADDER[at + 1];
}
```

Append the same pair to `games/tft/pipeline/src/bands.ts`, typed against that
file's shapes (it has no `BandId` union, so use `string`):

```ts
/**
 * The exclusive bands from the bottom up. The browser's copy in
 * games/tft/ui/src/bands.ts must match; ui/test/bands.test.ts is the referee.
 */
export const BAND_LADDER: string[] = [
  "silver-below",
  "platinum-gold",
  "diamond-emerald",
  "apex",
];

/** The next rung up, or null at the top. */
export function bandAbove(bandId: string): string | null {
  const at = BAND_LADDER.indexOf(bandId);
  if (at < 0 || at === BAND_LADDER.length - 1) return null;
  return BAND_LADDER[at + 1];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix games/tft/ui test -- bands`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add games/tft/ui/src/bands.ts games/tft/pipeline/src/bands.ts games/tft/ui/test/bands.test.ts
git commit -m "feat: name the rung above each rank band"
```

---

### Task 3: Measuring habits per band in the pipeline

**Files:**
- Create: `games/tft/pipeline/src/aggregate/habits.ts`
- Test: `games/tft/pipeline/test/habits.test.ts`

**Interfaces:**
- Consumes: `Participant` from `../aggregate/signature`, `primaryCarry` from the same file, `measureHabits`/`HabitBoard`/`HabitTable` from Task 1, `LobbyRecord` from `../store`.
- Produces: `toHabitBoard(p: Participant, extra?: { contested?: boolean; compExact?: boolean; compTier?: string }): HabitBoard` and `aggregateHabits(lobbies: Participant[][], costOf: (id: string) => number): HabitTable`.

**Note on scope:** this task supplies `contested` only. `compExact`/`compTier`
need the band's tier list, which is built later in the same run; they stay
`undefined` here, and the design already says a habit whose input is missing is
skipped rather than guessed. The browser fills all three.

- [ ] **Step 1: Write the failing test**

Create `games/tft/pipeline/test/habits.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toHabitBoard, aggregateHabits } from "../src/aggregate/habits";
import type { Participant } from "../src/aggregate/signature";

const participant = (over: Partial<Participant> = {}): Participant => ({
  puuid: "p",
  placement: 4,
  level: 8,
  goldLeft: 0,
  units: [{ character_id: "TFT17_Jinx", tier: 2, rarity: 4, items: ["a", "b", "c"] }],
  traits: [],
  ...over,
});

// The adapter is the only place the pipeline's shape and the analyzer's shape
// touch. If it lies, the coach compares the player against a habit measured a
// different way and nothing fails.
describe("toHabitBoard", () => {
  it("renames every field the analyzer's shape expects", () => {
    const board = toHabitBoard(
      participant({ placement: 2, level: 9, goldLeft: 31 })
    , () => 4);
    expect(board.placement).toBe(2);
    expect(board.level).toBe(9);
    expect(board.goldLeft).toBe(31);
    expect(board.units).toEqual([
      { id: "TFT17_Jinx", stars: 2, cost: 4, items: ["a", "b", "c"] },
    ]);
  });

  // Riot's rarity is not cost-1: Set 17 reports Morgana at rarity 6 while she
  // is a 4-cost. The catalog is generated from the game's own data, so it wins.
  it("takes the cost from the catalog rather than from rarity", () => {
    const board = toHabitBoard(
      participant({
        units: [{ character_id: "TFT17_Morgana", tier: 2, rarity: 6, items: [] }],
      }),
      (id) => (id === "TFT17_Morgana" ? 4 : 0)
    );
    expect(board.units[0].cost).toBe(4);
  });

  it("carries the lobby-level facts through when given them", () => {
    const board = toHabitBoard(participant(), () => 4, { contested: true });
    expect(board.contested).toBe(true);
  });
});

describe("aggregateHabits", () => {
  it("marks a carry shared with another board in the same lobby as contested", () => {
    const lobby = [
      participant({ puuid: "a", placement: 1 }),
      participant({ puuid: "b", placement: 8 }),
    ];
    const table = aggregateHabits([lobby], () => 4);
    expect(table.contestedCarry?.rate).toBe(1);
    expect(table.contestedCarry?.boards).toBe(2);
  });

  it("leaves a lone carry uncontested", () => {
    const lobby = [
      participant({ puuid: "a" }),
      participant({
        puuid: "b",
        units: [{ character_id: "TFT17_Ornn", tier: 2, rarity: 6, items: ["a", "b", "c"] }],
      }),
    ];
    const table = aggregateHabits([lobby], () => 4);
    expect(table.contestedCarry?.rate).toBe(0);
  });

  it("measures the board habits across every lobby it is given", () => {
    const lobby = [
      participant({ goldLeft: 40, placement: 8 }),
      participant({ goldLeft: 0, placement: 1 }),
    ];
    const table = aggregateHabits([lobby], () => 4);
    expect(table.hoardsGold?.rate).toBe(0.5);
    expect(table.hoardsGold?.avgWith).toBe(8);
    expect(table.hoardsGold?.avgWithout).toBe(1);
  });

  // The tier list is not built yet when this runs, so these have no input.
  it("reports nothing for the habits that need the band's tier list", () => {
    const table = aggregateHabits([[participant(), participant()]], () => 4);
    expect(table.offMeta).toBeUndefined();
    expect(table.lowTierComp).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix games/tft/pipeline test -- habits`
Expected: FAIL — cannot resolve `../src/aggregate/habits`.

- [ ] **Step 3: Write the implementation**

Create `games/tft/pipeline/src/aggregate/habits.ts`:

```ts
import { primaryCarry, type Participant } from "./signature";
import {
  measureHabits,
  type HabitBoard,
  type HabitTable,
} from "../../../analysis/src/habits";

/**
 * A rank band's habits, measured with the very same predicates the browser runs
 * over the player's own games.
 *
 * The import above reaches across packages on purpose. games/tft/analysis is the
 * runtime-free package precisely so the same logic can run here, in the browser
 * and in tests; a second copy of a predicate could not be checked against this
 * one by any test, and the coach's whole claim is that the two sides of the
 * comparison were measured identically.
 */

/** Riot's rarity is not cost-1, so the catalog decides what a unit costs. */
export function toHabitBoard(
  p: Participant,
  costOf: (id: string) => number,
  extra: { contested?: boolean; compExact?: boolean; compTier?: string } = {}
): HabitBoard {
  return {
    placement: p.placement,
    level: p.level,
    goldLeft: p.goldLeft,
    units: p.units.map((u) => ({
      id: u.character_id,
      stars: u.tier,
      cost: costOf(u.character_id),
      items: u.items,
    })),
    ...extra,
  };
}

/**
 * Boards grouped by lobby, because being contested is a fact about a table and
 * disappears the moment every board is thrown into one list.
 *
 * compExact and compTier are left unset: the band's tier list does not exist yet
 * when this runs. A habit with no input is skipped rather than guessed, so those
 * two simply do not appear in the published file — which is also what happens,
 * correctly, for a band too thin to publish comps at all.
 */
export function aggregateHabits(
  lobbies: Participant[][],
  costOf: (id: string) => number
): HabitTable {
  const boards: HabitBoard[] = [];
  for (const lobby of lobbies) {
    const carries = lobby.map(primaryCarry);
    const tally = new Map<string, number>();
    for (const c of carries) if (c) tally.set(c, (tally.get(c) ?? 0) + 1);

    lobby.forEach((p, i) => {
      const carry = carries[i];
      boards.push(
        toHabitBoard(p, costOf, {
          contested: carry ? (tally.get(carry) ?? 0) > 1 : undefined,
        })
      );
    });
  }
  return measureHabits(boards);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix games/tft/pipeline test -- habits`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add games/tft/pipeline/src/aggregate/habits.ts games/tft/pipeline/test/habits.test.ts
git commit -m "feat: measure each rank band's habits with the analyzer's own predicates"
```

---

### Task 4: Publishing habits.json

**Files:**
- Modify: `games/tft/pipeline/src/output.ts` (append after `writeItems`)
- Modify: `games/tft/pipeline/src/build.ts` (`buildBand` signature, `main`, constants)

**Interfaces:**
- Consumes: `aggregateHabits` from Task 3, `BAND_LADDER` from Task 2, `HabitTable` from Task 1.
- Produces: `games/tft/data/habits.json` with the shape `HabitsDataset` exported from `output.ts`.

- [ ] **Step 1: Add the writer**

Append to `games/tft/pipeline/src/output.ts`:

```ts
import type { HabitTable } from "../../analysis/src/habits";

export interface HabitsDataset {
  generatedAt: string;
  patch: string;
  patchLabel?: string;
  bands: Record<string, { boards: number; matches: number; habits: HabitTable }>;
}

/**
 * Every band in ONE file, unlike comps/units/items.
 *
 * A deliberate break from bandPath: the coach reads two bands at once, and with
 * one file per band the profile would download two ~450 KB payloads to read
 * thirty numbers. All four bands together are a few KB.
 */
export function writeHabits(path: string, dataset: HabitsDataset): void {
  write(path, dataset);
}
```

- [ ] **Step 2: Wire it into the build**

In `games/tft/pipeline/src/build.ts`:

Add to the imports:

```ts
import { aggregateHabits } from "./aggregate/habits";
import { writeComps, writeUnits, writeItems, writeHabits } from "./output";
import { BANDS, BAND_LADDER, bandCovers, bandPath, type RankBand } from "./bands";
import type { HabitTable } from "../../analysis/src/habits";
```

Add beside the other output paths:

```ts
const HABITS_OUT = "../data/habits.json";
/**
 * Boards a band needs before its habits are worth publishing. Far below
 * MIN_BAND_BOARDS: a tier list needs 50 comps each resting on their own boards,
 * while a habit is a single rate — Silver's 1,032 boards give +/-1.5% on a 33%
 * rate, which is plenty, and its tier list is empty at the same time.
 */
const MIN_HABIT_BOARDS = Number(process.env.MIN_HABIT_BOARDS ?? "500");
```

Change `buildBand` to return what it measured instead of `void`:

```ts
function buildBand(
  band: RankBand,
  lobbies: LobbyRecord[],
  catalog: Catalog | null,
  now: string,
  patch: string
): { boards: number; matches: number; habits: HabitTable } | null {
```

Inside `buildBand`, immediately after `const boards = grouped.flat();`, add:

```ts
  const costOf = costLookup(catalog);
  // Measured before the sample gate below: a band too thin for a tier list can
  // still be thick enough for a rate, and the coach is the reason the bands were
  // split in the first place.
  const habits =
    boards.length >= MIN_HABIT_BOARDS
      ? { boards: boards.length, matches: lobbies.length, habits: aggregateHabits(grouped, costOf) }
      : null;
  if (habits) {
    const shown = Object.entries(habits.habits)
      .map(([id, s]) => `${id} ${(s.rate * 100).toFixed(1)}%`)
      .join("  ");
    console.log(`${band.id.padEnd(16)} habits: ${shown}`);
  }
```

Then delete the now-duplicated `const costOf = costLookup(catalog);` further down,
and make both the thin-band early return and the normal path end with
`return habits;`.

In `main`, collect and write the file after the band loop:

```ts
  const measured: Record<string, { boards: number; matches: number; habits: HabitTable }> = {};
  for (const band of targets) {
    const lobbies = usable.filter((l) => bandCovers(band.id, l.tier));
    const habits = buildBand(band, lobbies, catalog, now, patch);
    // Only the bands that partition the ladder: the coach compares one rung to
    // the next, and the overlapping default band is on no rung.
    if (habits && BAND_LADDER.includes(band.id)) measured[band.id] = habits;
  }

  // Written only on a full run. A single-band rebuild would otherwise drop the
  // other three bands from the file and blank the coach for everyone else.
  if (!requested) {
    writeHabits(HABITS_OUT, {
      generatedAt: now,
      patch,
      patchLabel: patchLabel(SET, patch),
      bands: measured,
    });
    console.log(`habits.json: ${Object.keys(measured).join(", ")}`);
  }
```

- [ ] **Step 3: Run the build**

Run: `npm --prefix games/tft/pipeline run build:comps`
Expected: the usual per-band lines, plus one `habits:` line per band and a final
`habits.json: silver-below, platinum-gold, diamond-emerald, apex`.

- [ ] **Step 4: Check the published file against the numbers in the spec**

Run:

```bash
node -e "const h=require('./games/tft/data/habits.json');for(const[b,v]of Object.entries(h.bands))console.log(b,v.boards,JSON.stringify(Object.fromEntries(Object.entries(v.habits).map(([k,s])=>[k,+(s.rate*100).toFixed(1)]))))"
```

Expected: four bands; `hoardsGold` rising from roughly 13% at apex to roughly 33%
at silver-below, and `rerolls` roughly 36% at apex against roughly 54% at
platinum-gold. If `hoardsGold` does not rise as the band falls, the adapter or
the band filter is wrong — stop and fix it before going on.

- [ ] **Step 5: Commit**

```bash
git add games/tft/pipeline/src/output.ts games/tft/pipeline/src/build.ts games/tft/data/habits.json
git commit -m "feat: publish each rank band's habits in one small file"
```

---

### Task 5: The coach and its three gates

**Files:**
- Create: `games/tft/analysis/src/coach.ts`
- Test: `games/tft/analysis/test/coach.test.ts`
- Modify: `games/tft/analysis/src/index.ts` (exports)

**Interfaces:**
- Consumes: `HABIT_IDS`, `HabitId`, `HabitTable`, `PLACEMENT_SD` from Task 1.
- Produces: `CoachFinding`, `CoachInput`, `coachFindings(input: CoachInput): CoachFinding[]`, and the constants `MIN_PREVALENCE`, `MAX_PREVALENCE`, `MIN_BAND_GAP`, `MIN_COST`, `MIN_BAND_BOARDS`, `MIN_PLAYER_GAMES`, `MAX_FINDINGS`.

- [ ] **Step 1: Write the failing test**

Create `games/tft/analysis/test/coach.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { coachFindings } from "../src/coach";
import type { HabitTable } from "../src/habits";

/** A band whose numbers are deliberately unremarkable. */
const stat = (over: Partial<HabitTable["hoardsGold"]> = {}) => ({
  rate: 0.2,
  boards: 4000,
  withN: 800,
  avgWith: 4.5,
  avgWithout: 4.5,
  ...over,
});

describe("coachFindings", () => {
  // The flagship case, with the figures measured on patch 16.14.
  it("reports a habit the band above does less and that costs places here", () => {
    const found = coachFindings({
      mine: { hoardsGold: stat({ rate: 0.45, boards: 20, withN: 9 }) },
      myGames: 20,
      band: { hoardsGold: stat({ rate: 0.213, boards: 4168, withN: 888, avgWith: 5.22, avgWithout: 4.31 }) },
      above: { hoardsGold: stat({ rate: 0.135, boards: 15648, withN: 2112 }) },
    });
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe("hoardsGold");
    expect(found[0].yourRate).toBe(0.45);
    expect(found[0].bandRate).toBe(0.213);
    expect(found[0].aboveRate).toBe(0.135);
    expect(found[0].costInBand).toBeCloseTo(0.91, 2);
  });

  // REGRESSION. Measured on patch 16.14: the band above rerolls LESS (41.9%
  // against 53.6%) but rerolling IMPROVES placement inside platinum-gold
  // (4.00 against 5.07). Telling a Gold player to reroll less would be advice
  // this project's own data contradicts. Gate 3 exists for exactly this.
  it("stays silent when the band gap and the placement cost disagree", () => {
    const found = coachFindings({
      mine: { rerolls: stat({ rate: 0.7, boards: 20, withN: 14 }) },
      myGames: 20,
      band: { rerolls: stat({ rate: 0.536, boards: 4168, withN: 2234, avgWith: 4.0, avgWithout: 5.07 }) },
      above: { rerolls: stat({ rate: 0.419, boards: 15648, withN: 6556 }) },
    });
    expect(found).toEqual([]);
  });

  // REGRESSION. Items held off the carry sat on 95% of apex boards with an
  // apparent effect of -2.4 places, because it measures having survived long
  // enough to hold items rather than a decision. Gate 1 kills it.
  it("stays silent for a habit almost every board has", () => {
    const found = coachFindings({
      mine: { carryShort: stat({ rate: 0.99, boards: 20, withN: 20 }) },
      myGames: 20,
      band: { carryShort: stat({ rate: 0.95, boards: 17464, withN: 16591, avgWith: 4.39, avgWithout: 6.77 }) },
      above: { carryShort: stat({ rate: 0.84, boards: 15648, withN: 13144 }) },
    });
    expect(found).toEqual([]);
  });

  it("stays silent for a habit almost no board has", () => {
    const found = coachFindings({
      mine: { carryShort: stat({ rate: 0.3, boards: 20, withN: 6 }) },
      myGames: 20,
      band: { carryShort: stat({ rate: 0.008, boards: 17464, withN: 140, avgWith: 6.4, avgWithout: 4.48 }) },
      above: { carryShort: stat({ rate: 0.005, boards: 15648, withN: 78 }) },
    });
    expect(found).toEqual([]);
  });

  it("stays silent when the two bands barely differ", () => {
    const found = coachFindings({
      mine: { hoardsGold: stat({ rate: 0.45, boards: 20, withN: 9 }) },
      myGames: 20,
      band: { hoardsGold: stat({ rate: 0.21, avgWith: 5.2, avgWithout: 4.3 }) },
      above: { hoardsGold: stat({ rate: 0.19 }) },
    });
    expect(found).toEqual([]);
  });

  it("stays silent when the player already behaves like the band above", () => {
    const found = coachFindings({
      mine: { hoardsGold: stat({ rate: 0.12, boards: 20, withN: 2 }) },
      myGames: 20,
      band: { hoardsGold: stat({ rate: 0.213, boards: 4168, withN: 888, avgWith: 5.22, avgWithout: 4.31 }) },
      above: { hoardsGold: stat({ rate: 0.135, boards: 15648, withN: 2112 }) },
    });
    expect(found).toEqual([]);
  });

  it("says nothing at all with too few games to call anything a habit", () => {
    expect(
      coachFindings({
        mine: { hoardsGold: stat({ rate: 0.6, boards: 5, withN: 3 }) },
        myGames: 5,
        band: { hoardsGold: stat({ rate: 0.213, boards: 4168, withN: 888, avgWith: 5.22, avgWithout: 4.31 }) },
        above: { hoardsGold: stat({ rate: 0.135, boards: 15648, withN: 2112 }) },
      })
    ).toEqual([]);
  });

  // An apex player has no rung above them; the panel says so rather than
  // inventing a comparison.
  it("says nothing when there is no band above", () => {
    expect(
      coachFindings({
        mine: { hoardsGold: stat({ rate: 0.45, boards: 20, withN: 9 }) },
        myGames: 20,
        band: { hoardsGold: stat({ rate: 0.213, boards: 4168, withN: 888, avgWith: 5.22, avgWithout: 4.31 }) },
        above: null,
      })
    ).toEqual([]);
  });

  it("skips a habit the band could not measure instead of guessing", () => {
    const found = coachFindings({
      mine: { offMeta: stat({ rate: 0.5, boards: 20, withN: 10 }) },
      myGames: 20,
      band: {},
      above: { offMeta: stat({ rate: 0.2 }) },
    });
    expect(found).toEqual([]);
  });

  it("orders by the places on offer and shows at most three", () => {
    const cheap = {
      rate: 0.3,
      boards: 4000,
      withN: 1200,
      avgWith: 4.7,
      avgWithout: 4.3,
    };
    const dear = {
      rate: 0.3,
      boards: 4000,
      withN: 1200,
      avgWith: 6.0,
      avgWithout: 4.0,
    };
    const found = coachFindings({
      mine: {
        hoardsGold: stat({ rate: 0.6, boards: 20, withN: 12 }),
        lowLevel: stat({ rate: 0.6, boards: 20, withN: 12 }),
        carryShort: stat({ rate: 0.6, boards: 20, withN: 12 }),
        contestedCarry: stat({ rate: 0.6, boards: 20, withN: 12 }),
      },
      myGames: 20,
      band: {
        hoardsGold: cheap,
        lowLevel: dear,
        carryShort: cheap,
        contestedCarry: cheap,
      },
      above: {
        hoardsGold: stat({ rate: 0.15 }),
        lowLevel: stat({ rate: 0.15 }),
        carryShort: stat({ rate: 0.15 }),
        contestedCarry: stat({ rate: 0.15 }),
      },
    });
    expect(found).toHaveLength(3);
    expect(found[0].id).toBe("lowLevel");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix games/tft/analysis test -- coach`
Expected: FAIL — cannot resolve `../src/coach`.

- [ ] **Step 3: Write the implementation**

Create `games/tft/analysis/src/coach.ts`:

```ts
import { HABIT_IDS, PLACEMENT_SD, type HabitId, type HabitTable } from "./habits";

/**
 * What the players one rung up do differently — and only that.
 *
 * Three gates, all mandatory. Each one exists because a real measurement over
 * the store would otherwise have put something false on screen:
 *
 *  1. A habit on 95% of boards is not a choice, it is a description of having
 *     survived. Items held off the carry looked like the strongest effect in the
 *     whole dataset (-2.4 places) and is nothing.
 *  2. The bands have to actually differ, by more than a rounding error and by
 *     more than noise.
 *  3. And it has to cost placements INSIDE the player's own band, in the same
 *     direction. Rerolling is the case that forces this: the band above does it
 *     less, yet it improves placement at every rank, and more the lower you go.
 *     Without gate 3 the coach would tell a Gold player to stop doing the thing
 *     that is working for them.
 *
 * Returns ids and numbers, never prose, like tags.ts: the same figures have to
 * read in two languages, and the wording belongs with the screen that shows it.
 */

/** Outside this window a band's habit is not a decision players make. */
export const MIN_PREVALENCE = 0.05;
export const MAX_PREVALENCE = 0.85;
/** Worth a sentence: percentage points between two bands, and places lost. */
export const MIN_BAND_GAP = 0.05;
export const MIN_COST = 0.3;
/** Below this a band's rate is not steady enough to compare against. */
export const MIN_BAND_BOARDS = 500;
/** Below this many games of your own, a rate is noise. Same bar as the tags. */
export const MIN_PLAYER_GAMES = 8;
/** How many findings before the panel stops being scannable. Same as metaGap. */
export const MAX_FINDINGS = 3;
/** How many standard errors a difference must clear to be more than noise. */
const SIGMA = 2;

export interface CoachFinding {
  id: HabitId;
  /** The player's own rate, and the games it rests on. */
  yourRate: number;
  yourGames: number;
  bandRate: number;
  aboveRate: number;
  /** Places the habit costs inside your band. Positive means it costs. */
  costInBand: number;
  /** Boards behind the band's figures, printed so the claim can be checked. */
  bandBoards: number;
  /** Places on offer if the gap closed. Sets the order, never displayed raw. */
  upside: number;
}

export interface CoachInput {
  mine: HabitTable;
  myGames: number;
  band: HabitTable;
  /** Null for an apex player: there is no rung above, and we do not invent one. */
  above: HabitTable | null;
}

/** Standard error of a difference of two proportions. */
function proportionSe(p1: number, n1: number, p2: number, n2: number): number {
  return Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
}

/**
 * Standard error of the placement gap between the two sides of a split.
 *
 * PLACEMENT_SD is known rather than fitted: placements inside a band are uniform
 * on 1..8 because bands are whole lobbies. See habits.ts.
 */
function placementSe(withN: number, withoutN: number): number {
  if (withN === 0 || withoutN === 0) return Infinity;
  return PLACEMENT_SD * Math.sqrt(1 / withN + 1 / withoutN);
}

export function coachFindings({ mine, myGames, band, above }: CoachInput): CoachFinding[] {
  if (myGames < MIN_PLAYER_GAMES || !above) return [];

  const found: CoachFinding[] = [];
  for (const id of HABIT_IDS) {
    const yours = mine[id];
    const ours = band[id];
    const theirs = above[id];
    if (!yours || !ours || !theirs) continue;
    if (ours.boards < MIN_BAND_BOARDS || theirs.boards < MIN_BAND_BOARDS) continue;

    // Gate 1 — a choice, not survival.
    if (ours.rate < MIN_PREVALENCE || ours.rate > MAX_PREVALENCE) continue;

    // Gate 2 — the band above really differs.
    const bandGap = ours.rate - theirs.rate;
    if (Math.abs(bandGap) < MIN_BAND_GAP) continue;
    if (
      Math.abs(bandGap) <
      SIGMA * proportionSe(ours.rate, ours.boards, theirs.rate, theirs.boards)
    ) {
      continue;
    }

    // Gate 3 — and it costs places here, the same way round.
    const costInBand = ours.avgWith - ours.avgWithout;
    if (Math.abs(costInBand) < MIN_COST) continue;
    if (Math.abs(costInBand) < SIGMA * placementSe(ours.withN, ours.boards - ours.withN)) {
      continue;
    }
    if (Math.sign(costInBand) !== Math.sign(bandGap)) continue;

    // And the player has to be on the wrong side of it. No statistical bar on
    // this one: twenty games cannot clear one, which is why the panel prints
    // the game count beside the figure instead.
    const yourGap = yours.rate - theirs.rate;
    if (Math.sign(yourGap) !== Math.sign(bandGap) || Math.abs(yourGap) < MIN_BAND_GAP) {
      continue;
    }

    found.push({
      id,
      yourRate: yours.rate,
      yourGames: yours.boards,
      bandRate: ours.rate,
      aboveRate: theirs.rate,
      costInBand,
      bandBoards: ours.boards,
      upside: Math.abs(yourGap) * Math.abs(costInBand),
    });
  }

  return found
    .sort((a, b) => b.upside - a.upside || a.id.localeCompare(b.id))
    .slice(0, MAX_FINDINGS);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix games/tft/analysis test -- coach`
Expected: PASS, 10 tests.

- [ ] **Step 5: Export from the package index**

Append to `games/tft/analysis/src/index.ts`:

```ts
export { measureHabits, HABITS, HABIT_IDS, habitCarry } from "./habits";
export type { HabitBoard, HabitUnit, HabitId, HabitStat, HabitTable } from "./habits";
export { coachFindings, MIN_PLAYER_GAMES } from "./coach";
export type { CoachFinding, CoachInput } from "./coach";
```

- [ ] **Step 6: Run the whole analysis suite**

Run: `npm --prefix games/tft/analysis test`
Expected: PASS, every file.

- [ ] **Step 7: Commit**

```bash
git add games/tft/analysis/src/coach.ts games/tft/analysis/test/coach.test.ts games/tft/analysis/src/index.ts
git commit -m "feat: gate coaching findings on band gap and in-band cost agreeing"
```

---

### Task 6: Feeding the coach from the browser

**Files:**
- Modify: `games/tft/ui/src/data.ts` (habits loader)
- Modify: `games/tft/ui/src/analyzer.ts` (`MatchView` fields, `PlayerProfile.coach`, drop `buildSplits`)
- Modify: `games/tft/ui/src/PlayerView.tsx:354` (pass the real band)
- Test: `games/tft/ui/test/coachWiring.test.ts`

**Interfaces:**
- Consumes: `coachFindings`, `measureHabits`, `CoachFinding`, `HabitBoard` from Task 5; `bandAbove` from Task 2; `habits.json` from Task 4.
- Produces: `MatchView.contested`, `MatchView.compExact`, `MatchView.compTier`; `PlayerProfile.coach: CoachFinding[]`; `PlayerProfile.coachBand: { own: BandId | null; above: BandId | null }`; `buildProfile(views, lang, band, ownBand)`.

- [ ] **Step 1: Load habits.json**

Append to `games/tft/ui/src/data.ts`:

```ts
import habitsJson from "@data/habits.json";
import type { HabitTable } from "@analysis/index";

interface HabitsFile {
  patchLabel?: string;
  bands: Record<string, { boards: number; matches: number; habits: HabitTable }>;
}

/**
 * Every band's habits, in the bundle rather than fetched.
 *
 * All four bands together are a few KB — the coach needs two of them at once, so
 * a per-band fetch would cost two round trips to read thirty numbers.
 */
export const habitsFor = (band: string): HabitTable | null =>
  (habitsJson as unknown as HabitsFile).bands[band]?.habits ?? null;
```

- [ ] **Step 2: Carry the three lobby facts into MatchView**

In `games/tft/ui/src/analyzer.ts`, add to the `MatchView` interface after `compKey`:

```ts
  /** Whether another board in the lobby ran the same carry. */
  contested: boolean;
  /** Whether the board's own signature named a comp in the band's tier list. */
  compExact: boolean;
  /** That comp's tier letter, when there was one. */
  compTier?: string;
```

Add the import of `matchComp` to the existing `@analysis/index` import list, and
inside `analyzeMatch`, before the `return`:

```ts
  // The same three facts the pipeline stamped on the band's boards. Being
  // contested is a fact about the lobby; which comp you played depends on the
  // band's tier list — neither can be read off the board alone.
  const match = matchComp(board, metaFor(band).comps);
  const carryId = primaryCarry(board);
  const contested =
    carryId !== "" &&
    lobby.boards.some((b) => b.puuid !== puuid && primaryCarry(b) === carryId);
```

and add to the returned object:

```ts
    contested,
    compExact: match?.exact ?? false,
    compTier: match?.exact ? match.comp.tier : undefined,
```

- [ ] **Step 3: Replace buildSplits with the coach**

In `games/tft/ui/src/analyzer.ts`:

Delete the `Split` interface, `splitBy`, `buildSplits`, `MIN_GAMES_PER_SIDE`,
`LEVEL_SPLIT` and `GOLD_FALLBACK`, and the `splits` field on `PlayerProfile`.
Replace them with:

```ts
/** One player's games in the shape the habit predicates read. */
function toHabitBoards(views: MatchView[]): HabitBoard[] {
  return views.map((v) => ({
    placement: v.placement,
    level: v.level,
    goldLeft: v.goldLeft,
    units: v.units.map((u) => ({
      id: u.id,
      stars: u.stars,
      cost: u.cost,
      items: u.items.map((i) => i.id),
    })),
    contested: v.contested,
    compExact: v.compExact,
    compTier: v.compTier,
  }));
}
```

Add to `PlayerProfile`:

```ts
  /** What the players one rung up do differently. Empty is a valid answer. */
  coach: CoachFinding[];
  /** Which bands the comparison used, so the panel can name them. */
  coachBand: { own: BandId | null; above: BandId | null };
```

Change the signature of `buildProfile` and its `return`:

```ts
export function buildProfile(
  views: MatchView[],
  lang: Lang,
  band: BandId = DEFAULT_BAND,
  /**
   * The player's REAL band, which is not always the one the report is measured
   * against. A Silver player falls back to the default band for comps because
   * theirs publishes none — but their habits are published, so the coach must
   * use the real band or it would compare them against Platinum+.
   */
  ownBand: BandId | null = null
): PlayerProfile {
```

and inside, replacing `splits: buildSplits(standard, band)`:

```ts
    ...coachFor(standard, ownBand),
```

Add the helper:

```ts
function coachFor(
  standard: MatchView[],
  ownBand: BandId | null
): Pick<PlayerProfile, "coach" | "coachBand"> {
  const above = ownBand ? bandAbove(ownBand) : null;
  const bandHabits = ownBand ? habitsFor(ownBand) : null;
  const aboveHabits = above ? habitsFor(above) : null;
  if (!ownBand || !bandHabits) return { coach: [], coachBand: { own: ownBand, above } };
  return {
    coach: coachFindings({
      mine: measureHabits(toHabitBoards(standard)),
      myGames: standard.length,
      band: bandHabits,
      above: aboveHabits,
    }),
    coachBand: { own: ownBand, above },
  };
}
```

Import `bandAbove` from `./bands`, `habitsFor` from `./data`, and
`coachFindings`, `measureHabits`, `CoachFinding`, `HabitBoard` from
`@analysis/index`.

- [ ] **Step 4: Pass the real band from PlayerView**

In `games/tft/ui/src/PlayerView.tsx`, change line 354 to:

```tsx
      {views.length > 0 && <ProfilePanel profile={buildProfile(views, lang, band, ownBand)} />}
```

- [ ] **Step 5: Write the wiring test**

Create `games/tft/ui/test/coachWiring.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { habitsFor } from "../src/data";
import { BAND_LADDER, bandAbove } from "../src/bands";

// The coach reads two bands out of one file. If a band the ladder names is
// missing from it, the panel silently disappears for every player of that rank.
describe("habits.json covers the ladder", () => {
  it("publishes habits for every band a player can be in", () => {
    for (const band of BAND_LADDER) {
      expect(habitsFor(band), `${band} habits`).not.toBeNull();
    }
  });

  it("gives every band except apex something to be compared against", () => {
    for (const band of BAND_LADDER) {
      const above = bandAbove(band);
      if (above === null) {
        expect(band).toBe("apex");
      } else {
        expect(habitsFor(above), `${above} habits`).not.toBeNull();
      }
    }
  });

  // The signal the whole feature rests on. If this inverts, the adapter or the
  // band filter in the pipeline is wrong.
  it("still finds players hoarding more gold the lower the band", () => {
    const apex = habitsFor("apex")!.hoardsGold!.rate;
    const silver = habitsFor("silver-below")!.hoardsGold!.rate;
    expect(silver).toBeGreaterThan(apex);
  });
});
```

- [ ] **Step 6: Run the tests and the type check**

Run: `npm --prefix games/tft/ui test`
Expected: PASS, including the new file.

Run: `npm --prefix games/tft/ui exec tsc -b`
Expected: no output. Any error here is a leftover reference to `Split` — the
panel still imports it and is fixed in Task 7.

- [ ] **Step 7: Commit**

```bash
git add games/tft/ui/src/data.ts games/tft/ui/src/analyzer.ts games/tft/ui/src/PlayerView.tsx games/tft/ui/test/coachWiring.test.ts
git commit -m "feat: measure a player's habits against their own band and the one above"
```

---

### Task 7: The panel and its copy

**Files:**
- Modify: `games/tft/ui/src/ProfilePanel.tsx` (replace `SplitRows`)
- Modify: `games/tft/ui/src/i18n.ts` (replace `profile.splits` with `profile.coach`, EN and ES)
- Modify: `games/tft/ui/src/styles/` (the sheet holding `.split`, `.splits`)

**Interfaces:**
- Consumes: `PlayerProfile.coach`, `PlayerProfile.coachBand`, `CoachFinding` from Task 6; `copy.meta.bands.names` which already exists.
- Produces: nothing other modules read.

- [ ] **Step 1: Write the copy**

In `games/tft/ui/src/i18n.ts`, replace the whole `splits: { ... }` block in the
English `profile` object with:

```ts
    coach: {
      heading: "What the players above you do differently",
      note:
        "Only habits that are a real choice, that the band above makes less often, and " +
        "that cost placements at your own rank. All three, or it is not here.",
      you: "You",
      cost: (places: string, boards: string) =>
        `At your rank this costs ${places} places (${boards} boards).`,
      games: (n: number) => `${n} ${n === 1 ? "game" : "games"}`,
      habits: {
        hoardsGold: "You end games with gold still in the bank",
        lowLevel: "You go out at a lower level",
        carryShort: "Your carry finishes without its three items",
        rerolls: "You roll for three stars on cheap units",
        contestedCarry: "You commit to a carry someone else is on",
        offMeta: "You play boards that match no comp in the list",
        lowTierComp: "You play comps from the bottom of the list",
      },
      empty:
        "On everything we measure, your habits already look like the band above yours.",
      emptyList: (habits: string) => `Measured: ${habits}.`,
      top: "You are in the top band, so there is no rank above to compare you with.",
      thin: (n: number) =>
        `Needs ${n} games before a rate says anything. Play a few more and check back.`,
    },
```

and the Spanish one with (neutral Latin American, no voseo):

```ts
    coach: {
      heading: "Qué hacen distinto los que están arriba",
      note:
        "Solo hábitos que son una decisión real, que la banda de arriba hace menos seguido, y " +
        "que cuestan posiciones en tu propio rango. Los tres, o no aparece acá.",
      you: "Tú",
      cost: (places, boards) =>
        `En tu rango esto cuesta ${places} posiciones (${boards} tableros).`,
      games: (n) => `${n} ${n === 1 ? "partida" : "partidas"}`,
      habits: {
        hoardsGold: "Terminas las partidas con oro en el banco",
        lowLevel: "Caes con menos nivel",
        carryShort: "Tu carry termina sin sus tres ítems",
        rerolls: "Rolleas por tres estrellas en unidades baratas",
        contestedCarry: "Te comprometes con un carry que otro también juega",
        offMeta: "Juegas tableros que no coinciden con ninguna comp de la lista",
        lowTierComp: "Juegas comps del fondo de la lista",
      },
      empty:
        "En todo lo que medimos, tus hábitos ya se parecen a los de la banda de arriba.",
      emptyList: (habits) => `Se midió: ${habits}.`,
      top: "Estás en la banda más alta, así que no hay un rango arriba con el cual compararte.",
      thin: (n) =>
        `Hacen falta ${n} partidas para que una tasa diga algo. Juega algunas más y volvé a mirar.`,
    },
```

Note: the last ES string must read "vuelve a mirar", not "volvé a mirar" — fix it
while typing. The rule is no voseo anywhere in product copy.

- [ ] **Step 2: Replace the panel block**

In `games/tft/ui/src/ProfilePanel.tsx`, delete `SplitRows` entirely and the
`Split` import, and add:

```tsx
const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * What the band above does differently.
 *
 * Three rates on one line — yours, your band's, theirs — and under them what the
 * habit costs at your own rank with the boards behind it. Every claim carries
 * its own number, because a coaching line the reader cannot check is a horoscope.
 */
function CoachRows({
  coach,
  coachBand,
  matches,
}: {
  coach: CoachFinding[];
  coachBand: PlayerProfile["coachBand"];
  matches: number;
}) {
  const copy = useCopy();
  const say = copy.profile.coach;
  // No band means unranked: we cannot say whose habits to compare against, and
  // guessing would be worse than staying quiet.
  if (!coachBand.own) return null;

  const bandName = (b: string) => copy.meta.bands.names[b as keyof typeof copy.meta.bands.names];

  return (
    <div className="profile-block">
      <h4 className="detail-heading">{say.heading}</h4>
      <p className="detail-note">{say.note}</p>

      {!coachBand.above ? (
        <p className="coach-empty">{say.top}</p>
      ) : matches < MIN_PLAYER_GAMES ? (
        <p className="coach-empty">{say.thin(MIN_PLAYER_GAMES)}</p>
      ) : coach.length === 0 ? (
        <p className="coach-empty">
          {say.empty}{" "}
          <span className="coach-inventory">
            {say.emptyList(HABIT_IDS.map((h) => say.habits[h]).join(" · "))}
          </span>
        </p>
      ) : (
        <ul className="coach">
          {coach.map((f) => (
            <li className="coach-row" key={f.id}>
              <p className="coach-habit">{say.habits[f.id]}</p>
              <p className="coach-rates">
                <span className="coach-rate" data-mine>
                  {say.you} <b>{pct(f.yourRate)}</b>
                  <em>{say.games(f.yourGames)}</em>
                </span>
                <span className="coach-rate">
                  {bandName(coachBand.own!)} <b>{pct(f.bandRate)}</b>
                </span>
                <span className="coach-rate">
                  {bandName(coachBand.above!)} <b>{pct(f.aboveRate)}</b>
                </span>
              </p>
              <p className="coach-cost">
                {say.cost(
                  Math.abs(f.costInBand).toFixed(1),
                  f.bandBoards.toLocaleString()
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

Update the imports at the top of the file:

```tsx
import type { PlayerProfile, PlayerTag, Tally } from "./analyzer";
import { HABIT_IDS, MIN_PLAYER_GAMES, type CoachFinding } from "@analysis/index";
```

and replace the render site (was line 327):

```tsx
        <CoachRows
          coach={profile.coach}
          coachBand={profile.coachBand}
          matches={profile.matches}
        />
```

- [ ] **Step 3: Restyle**

Find the sheet under `games/tft/ui/src/styles/` that defines `.splits` and
`.split` (`grep -rn "\.split" games/tft/ui/src/styles/`). Rename those rules to
`.coach` / `.coach-row` and add:

```css
.coach-rates {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
}
.coach-rate {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
}
.coach-rate[data-mine] b {
  color: var(--gold);
}
.coach-rate em {
  font-style: normal;
  color: var(--vellum-dim);
}
.coach-cost,
.coach-inventory {
  color: var(--vellum-dim);
}
```

Use the variable names the sheet already uses; if `--gold` does not exist there,
use whatever token the file uses for an emphasised figure.

- [ ] **Step 4: Type check and test**

Run: `npm --prefix games/tft/ui exec tsc -b`
Expected: no output.

Run: `npm --prefix games/tft/ui test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add games/tft/ui/src/ProfilePanel.tsx games/tft/ui/src/i18n.ts games/tft/ui/src/styles
git commit -m "feat: show what the band above does differently on the profile"
```

---

### Task 8: Verify it in the running app

**Files:** none changed unless a defect turns up.

- [ ] **Step 1: Start the dev server**

Use the preview tooling, not a raw shell: `preview_start` with the dev server
entry from `.claude/launch.json`. If that file has no entry for the TFT UI, add
one with `runtimeExecutable: "npm"`, `runtimeArgs: ["--prefix", "games/tft/ui",
"run", "dev"]`, `port: 5173`.

- [ ] **Step 2: Search a player whose band is not apex**

Navigate to the TFT tab, open **Player**, and search `Nombre#TAG` — a known Gold
account, so the coach compares Platinum/Gold against Diamond/Emerald.

- [ ] **Step 3: Check the panel against the published numbers**

Read the page and confirm:
- the block "What the players above you do differently" is present;
- each row shows three percentages and a cost line ending in a board count;
- the band names on the row match the searched player's rank and one rung up;
- **no row says the player should reroll less.** If one does, gate 3 is broken —
  stop and fix `coach.ts` before continuing.

- [ ] **Step 4: Check the console and the empty state**

Run `read_console_messages` with `onlyErrors: true`. Expected: nothing from the
profile. Then search a player with fewer than 8 standard games and confirm the
panel shows the "needs N games" line rather than an empty box.

- [ ] **Step 5: Check it at 375px**

Resize to mobile and confirm the three rates wrap instead of overflowing. Type
size changes have twice broken this layout, so it is checked every time.

- [ ] **Step 6: Screenshot and commit any fix**

Take a screenshot for the record. If steps 3-5 needed a fix:

```bash
git add -A
git commit -m "fix: <what was wrong> in the coaching panel"
```

---

## Self-Review

**Spec coverage.** Every section of the design maps to a task: the vocabulary and
the one-definition rule (Task 1), the ladder (Task 2), per-band measurement and
the adapter (Task 3), `habits.json` and its single-file decision (Task 4), the
three gates with both named regressions (Task 5), absorbing `buildSplits` and the
real-band wiring (Task 6), the panel, ordering, cap, empty state and copy rules
(Task 7), and the border cases in Task 8.

**Known gap, deliberate.** `offMeta` and `lowTierComp` are measured on the player
side but not on the band side: the band's tier list does not exist yet at the
point in `build.ts` where habits are aggregated. Both habits are therefore skipped
by the coach — correctly, since a habit with no band figure cannot be compared.
Closing it means a second aggregation pass after `tierComps`, which is a change to
the comps build this plan promised not to make. It belongs to the same phase 2 as
the rule miner.

**Types.** `HabitTable` is the single currency between all four packages;
`CoachFinding` is produced only in Task 5 and consumed in Tasks 6 and 7 under the
same field names. `buildProfile` gains a fourth parameter with a default, so no
other caller breaks.
