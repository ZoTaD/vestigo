# TFT Data Pipeline (Fase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node/TypeScript pipeline that pulls high-elo TFT matches from the Riot API, aggregates them into a tiered list of comps with stats, and writes the result to `games/tft/data/comps.json`.

**Architecture:** Pure logic (normalization, comp-signature, aggregation, tiering) is separated from I/O (the Riot API client). Pure logic is unit-tested with fixtures via TDD. The I/O client is thin and validated with a manual smoke script. An orchestration script ties them together.

**Tech Stack:** Node.js 20+, TypeScript (ESM), Vitest (tests), tsx (run TS directly), native `fetch`.

---

## Prerequisites

- Node.js 20+ installed (`node -v`).
- A Riot API key in `games/tft/pipeline/.env` as `RIOT_API_KEY=...` (dev keys expire ~24h; regenerate at https://developer.riotgames.com when needed).
- All commands below are run from `games/tft/pipeline/` unless noted.

**v1 honesty note:** The comp signature is a simple heuristic (a comp = its set of 2★+ units). On a small dev-key sample few comps will clear the count threshold; richness improves with more data (production key) and a smarter signature later. The pipeline is correct and complete regardless — it just needs volume to shine.

---

## File Structure

```
ProBuilds/
├─ .gitignore                        ← ignores node_modules, .env, dist
└─ games/tft/
   ├─ data/                          ← comps.json is generated here
   └─ pipeline/
      ├─ package.json
      ├─ tsconfig.json
      ├─ .env.example
      ├─ src/
      │  ├─ config.ts                ← load + validate env
      │  ├─ riot/
      │  │  ├─ routing.ts            ← platform → regional routing (pure)
      │  │  ├─ normalize.ts          ← raw match → Participant[] (pure)
      │  │  └─ client.ts             ← Riot API client (I/O)
      │  ├─ aggregate/
      │  │  ├─ signature.ts          ← comp signature (pure)
      │  │  ├─ group.ts              ← group + stats (pure)
      │  │  └─ tier.ts               ← assign tiers (pure)
      │  ├─ output.ts                ← write comps.json
      │  ├─ smoke.ts                 ← manual API smoke test
      │  └─ run.ts                   ← orchestration
      └─ test/
         ├─ config.test.ts
         ├─ routing.test.ts
         ├─ normalize.test.ts
         ├─ signature.test.ts
         ├─ group.test.ts
         ├─ tier.test.ts
         └─ fixtures/match.sample.ts
```

---

## Task 1: Scaffold the pipeline project

**Files:**
- Create: `.gitignore` (repo root)
- Create: `games/tft/pipeline/package.json`
- Create: `games/tft/pipeline/tsconfig.json`
- Create: `games/tft/pipeline/.env.example`

- [ ] **Step 1: Initialize git at the repo root**

Run (from `C:\Users\usuario\Desktop\ProBuilds`):
```bash
git init
```
Expected: `Initialized empty Git repository...`

- [ ] **Step 2: Create root `.gitignore`**

Create `.gitignore` (repo root):
```
node_modules/
dist/
.env
*.log
```

- [ ] **Step 3: Create `games/tft/pipeline/package.json`**

```json
{
  "name": "tft-pipeline",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "smoke": "tsx src/smoke.ts",
    "pipeline": "tsx src/run.ts"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 4: Create `games/tft/pipeline/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 5: Create `games/tft/pipeline/.env.example`**

```
# Copy this file to .env and paste your key. .env is gitignored.
RIOT_API_KEY=RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
RIOT_REGION=na1
RIOT_ROUTING=americas
```

- [ ] **Step 6: Install dependencies**

Run (from `games/tft/pipeline/`):
```bash
npm install
```
Expected: `node_modules/` created, no errors.

- [ ] **Step 7: Commit**

```bash
git add .gitignore games/tft/pipeline/package.json games/tft/pipeline/tsconfig.json games/tft/pipeline/.env.example
git commit -m "chore: scaffold tft data pipeline project"
```

---

## Task 2: Config loader

**Files:**
- Create: `games/tft/pipeline/src/config.ts`
- Test: `games/tft/pipeline/test/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/config.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("throws when RIOT_API_KEY is missing", () => {
    expect(() => loadConfig({})).toThrow(/RIOT_API_KEY/);
  });

  it("returns config with defaults when key is present", () => {
    const cfg = loadConfig({ RIOT_API_KEY: "abc" });
    expect(cfg.riotApiKey).toBe("abc");
    expect(cfg.region).toBe("na1");
    expect(cfg.routingRegion).toBe("americas");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/config.test.ts`
Expected: FAIL — cannot find module `../src/config`.

- [ ] **Step 3: Write minimal implementation**

Create `src/config.ts`:
```ts
export interface Config {
  riotApiKey: string;
  region: string;        // platform routing, e.g. "na1"
  routingRegion: string; // regional routing, e.g. "americas"
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const riotApiKey = env.RIOT_API_KEY;
  if (!riotApiKey) {
    throw new Error("RIOT_API_KEY is not set. Copy .env.example to .env and add your key.");
  }
  return {
    riotApiKey,
    region: env.RIOT_REGION ?? "na1",
    routingRegion: env.RIOT_ROUTING ?? "americas",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts test/config.test.ts
git commit -m "feat: config loader with env validation"
```

---

## Task 3: Routing helpers

**Files:**
- Create: `games/tft/pipeline/src/riot/routing.ts`
- Test: `games/tft/pipeline/test/routing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/routing.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { platformToRegion, platformHost, regionHost } from "../src/riot/routing";

describe("routing", () => {
  it("maps a platform to its regional routing value", () => {
    expect(platformToRegion("na1")).toBe("americas");
    expect(platformToRegion("euw1")).toBe("europe");
    expect(platformToRegion("kr")).toBe("asia");
  });

  it("throws on an unknown platform", () => {
    expect(() => platformToRegion("zz9")).toThrow(/Unknown platform/);
  });

  it("builds hosts", () => {
    expect(platformHost("na1")).toBe("https://na1.api.riotgames.com");
    expect(regionHost("americas")).toBe("https://americas.api.riotgames.com");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/routing.test.ts`
Expected: FAIL — cannot find module `../src/riot/routing`.

- [ ] **Step 3: Write minimal implementation**

Create `src/riot/routing.ts`:
```ts
const PLATFORM_TO_REGION: Record<string, string> = {
  na1: "americas", br1: "americas", la1: "americas", la2: "americas",
  euw1: "europe", eun1: "europe", tr1: "europe", ru: "europe",
  kr: "asia", jp1: "asia",
  oc1: "sea", ph2: "sea", sg2: "sea", th2: "sea", tw2: "sea", vn2: "sea",
};

export function platformToRegion(platform: string): string {
  const region = PLATFORM_TO_REGION[platform.toLowerCase()];
  if (!region) throw new Error(`Unknown platform: ${platform}`);
  return region;
}

export function platformHost(platform: string): string {
  return `https://${platform}.api.riotgames.com`;
}

export function regionHost(region: string): string {
  return `https://${region}.api.riotgames.com`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/routing.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/riot/routing.ts test/routing.test.ts
git commit -m "feat: riot routing helpers"
```

---

## Task 4: Match normalization

**Files:**
- Create: `games/tft/pipeline/src/riot/normalize.ts`
- Create: `games/tft/pipeline/test/fixtures/match.sample.ts`
- Test: `games/tft/pipeline/test/normalize.test.ts`

- [ ] **Step 1: Create the fixture**

Create `test/fixtures/match.sample.ts` (mirrors the Riot TFT match-v1 shape, trimmed):
```ts
export const sampleMatch = {
  info: {
    tft_set_number: 17,
    participants: [
      {
        puuid: "p1",
        placement: 1,
        units: [
          { character_id: "TFT14_Zoe", tier: 3 },
          { character_id: "TFT14_Viktor", tier: 2 },
          { character_id: "TFT14_Poppy", tier: 1 },
        ],
      },
      {
        puuid: "p2",
        placement: 5,
        units: [{ character_id: "TFT14_Aatrox", tier: 2 }],
      },
    ],
  },
};
```

- [ ] **Step 2: Write the failing test**

Create `test/normalize.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { toParticipants } from "../src/riot/normalize";
import { sampleMatch } from "./fixtures/match.sample";

describe("toParticipants", () => {
  it("extracts puuid, placement and units from a raw match", () => {
    const result = toParticipants(sampleMatch);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      puuid: "p1",
      placement: 1,
      units: [
        { character_id: "TFT14_Zoe", tier: 3 },
        { character_id: "TFT14_Viktor", tier: 2 },
        { character_id: "TFT14_Poppy", tier: 1 },
      ],
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/normalize.test.ts`
Expected: FAIL — cannot find module `../src/riot/normalize`.

- [ ] **Step 4: Write minimal implementation**

Create `src/riot/normalize.ts`:
```ts
import type { Participant } from "../aggregate/signature";

export interface RawUnit { character_id: string; tier: number; }
export interface RawParticipant { puuid: string; placement: number; units: RawUnit[]; }
export interface RawMatch { info: { participants: RawParticipant[] }; }

export function toParticipants(match: RawMatch): Participant[] {
  return match.info.participants.map((p) => ({
    puuid: p.puuid,
    placement: p.placement,
    units: p.units.map((u) => ({ character_id: u.character_id, tier: u.tier })),
  }));
}
```

> Note: `Participant`/`Unit` are defined in Task 5 (`src/aggregate/signature.ts`). If executing strictly in order, create that file's interfaces first, or run Task 5 Step 3 before this compiles. Vitest compiles per-test-file, so run tasks 4 and 5 together if needed.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/normalize.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add src/riot/normalize.ts test/normalize.test.ts test/fixtures/match.sample.ts
git commit -m "feat: normalize raw match into participants"
```

---

## Task 5: Comp signature

**Files:**
- Create: `games/tft/pipeline/src/aggregate/signature.ts`
- Test: `games/tft/pipeline/test/signature.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/signature.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { compSignature } from "../src/aggregate/signature";

describe("compSignature", () => {
  it("uses only 2-star-or-higher units, deduped and sorted", () => {
    const sig = compSignature({
      puuid: "p1",
      placement: 1,
      units: [
        { character_id: "TFT14_Zoe", tier: 3 },
        { character_id: "TFT14_Viktor", tier: 2 },
        { character_id: "TFT14_Poppy", tier: 1 },
      ],
    });
    expect(sig).toBe("TFT14_Viktor,TFT14_Zoe");
  });

  it("returns empty string when no unit is 2-star", () => {
    const sig = compSignature({
      puuid: "p2",
      placement: 8,
      units: [{ character_id: "TFT14_Poppy", tier: 1 }],
    });
    expect(sig).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/signature.test.ts`
Expected: FAIL — cannot find module `../src/aggregate/signature`.

- [ ] **Step 3: Write minimal implementation**

Create `src/aggregate/signature.ts`:
```ts
export interface Unit {
  character_id: string;
  tier: number; // star level 1-3
}

export interface Participant {
  puuid: string;
  placement: number;
  units: Unit[];
}

// A comp's identity (v1 heuristic): the sorted, deduped character_ids of its 2★+ units.
export function compSignature(participant: Participant): string {
  const carries = participant.units
    .filter((u) => u.tier >= 2)
    .map((u) => u.character_id);
  return Array.from(new Set(carries)).sort().join(",");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/signature.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/aggregate/signature.ts test/signature.test.ts
git commit -m "feat: comp signature from 2-star units"
```

---

## Task 6: Aggregate comps + stats

**Files:**
- Create: `games/tft/pipeline/src/aggregate/group.ts`
- Test: `games/tft/pipeline/test/group.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/group.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { aggregateComps } from "../src/aggregate/group";
import type { Participant } from "../src/aggregate/signature";

function p(placement: number, ids: string[]): Participant {
  return { puuid: "x", placement, units: ids.map((id) => ({ character_id: id, tier: 2 })) };
}

describe("aggregateComps", () => {
  it("groups by signature and computes stats, dropping groups below minCount", () => {
    const participants: Participant[] = [
      p(1, ["A", "B"]),
      p(3, ["A", "B"]),
      p(4, ["A", "B"]),
      p(8, ["C"]),        // different comp, below minCount
    ];
    const comps = aggregateComps(participants, 3);
    expect(comps).toHaveLength(1);
    const comp = comps[0];
    expect(comp.units).toEqual(["A", "B"]);
    expect(comp.count).toBe(3);
    expect(comp.avgPlacement).toBeCloseTo(2.667, 2);
    expect(comp.top4Rate).toBe(1);
    expect(comp.winRate).toBeCloseTo(1 / 3, 5);
    expect(comp.playRate).toBeCloseTo(3 / 4, 5);
  });

  it("skips participants with an empty signature", () => {
    const participants: Participant[] = [
      { puuid: "y", placement: 8, units: [{ character_id: "Z", tier: 1 }] },
    ];
    expect(aggregateComps(participants, 1)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/group.test.ts`
Expected: FAIL — cannot find module `../src/aggregate/group`.

- [ ] **Step 3: Write minimal implementation**

Create `src/aggregate/group.ts`:
```ts
import { compSignature, type Participant } from "./signature";

export interface CompStats {
  signature: string;
  units: string[];
  count: number;
  avgPlacement: number;
  top4Rate: number;
  winRate: number;
  playRate: number;
}

export function aggregateComps(participants: Participant[], minCount = 5): CompStats[] {
  const total = participants.length;
  const groups = new Map<string, Participant[]>();

  for (const p of participants) {
    const sig = compSignature(p);
    if (sig === "") continue;
    const arr = groups.get(sig) ?? [];
    arr.push(p);
    groups.set(sig, arr);
  }

  const stats: CompStats[] = [];
  for (const [signature, members] of groups) {
    if (members.length < minCount) continue;
    const count = members.length;
    const sumPlace = members.reduce((s, m) => s + m.placement, 0);
    const top4 = members.filter((m) => m.placement <= 4).length;
    const wins = members.filter((m) => m.placement === 1).length;
    stats.push({
      signature,
      units: signature.split(","),
      count,
      avgPlacement: sumPlace / count,
      top4Rate: top4 / count,
      winRate: wins / count,
      playRate: total > 0 ? count / total : 0,
    });
  }
  return stats;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/group.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/aggregate/group.ts test/group.test.ts
git commit -m "feat: aggregate comps with placement stats"
```

---

## Task 7: Tiering

**Files:**
- Create: `games/tft/pipeline/src/aggregate/tier.ts`
- Test: `games/tft/pipeline/test/tier.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/tier.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { assignTier, tierComps } from "../src/aggregate/tier";
import type { CompStats } from "../src/aggregate/group";

describe("tier", () => {
  it("maps avg placement to a tier letter", () => {
    expect(assignTier(3.9)).toBe("S");
    expect(assignTier(4.2)).toBe("A");
    expect(assignTier(4.5)).toBe("B");
    expect(assignTier(4.9)).toBe("C");
    expect(assignTier(6.0)).toBe("D");
  });

  it("sorts comps best-first and attaches tiers", () => {
    const comps: CompStats[] = [
      { signature: "b", units: ["b"], count: 5, avgPlacement: 4.8, top4Rate: 0.4, winRate: 0.1, playRate: 0.2 },
      { signature: "a", units: ["a"], count: 5, avgPlacement: 3.9, top4Rate: 0.7, winRate: 0.3, playRate: 0.2 },
    ];
    const tiered = tierComps(comps);
    expect(tiered[0].signature).toBe("a");
    expect(tiered[0].tier).toBe("S");
    expect(tiered[1].tier).toBe("C");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tier.test.ts`
Expected: FAIL — cannot find module `../src/aggregate/tier`.

- [ ] **Step 3: Write minimal implementation**

Create `src/aggregate/tier.ts`:
```ts
import type { CompStats } from "./group";

export interface TieredComp extends CompStats {
  tier: string;
}

// Lower avg placement is better (4.5 is the lobby average). Fixed v1 thresholds.
export function assignTier(avgPlacement: number): string {
  if (avgPlacement <= 4.0) return "S";
  if (avgPlacement <= 4.3) return "A";
  if (avgPlacement <= 4.6) return "B";
  if (avgPlacement <= 5.0) return "C";
  return "D";
}

export function tierComps(comps: CompStats[]): TieredComp[] {
  return comps
    .map((c) => ({ ...c, tier: assignTier(c.avgPlacement) }))
    .sort((a, b) => a.avgPlacement - b.avgPlacement);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tier.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/aggregate/tier.ts test/tier.test.ts
git commit -m "feat: assign comp tiers by avg placement"
```

---

## Task 8: Output writer

**Files:**
- Create: `games/tft/pipeline/src/output.ts`
- Test: `games/tft/pipeline/test/output.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/output.test.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { writeComps } from "../src/output";

const tmp = "test/.tmp/comps.json";
afterAll(() => { if (existsSync("test/.tmp")) rmSync("test/.tmp", { recursive: true, force: true }); });

describe("writeComps", () => {
  it("writes a JSON dataset to disk, creating folders", () => {
    writeComps(tmp, {
      generatedAt: "2026-07-22T00:00:00.000Z",
      patch: "test",
      sampleSize: 1,
      comps: [{ signature: "a", units: ["a"], count: 5, avgPlacement: 4, top4Rate: 0.5, winRate: 0.2, playRate: 0.1, tier: "S" }],
    });
    const parsed = JSON.parse(readFileSync(tmp, "utf-8"));
    expect(parsed.comps[0].tier).toBe("S");
    expect(parsed.sampleSize).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/output.test.ts`
Expected: FAIL — cannot find module `../src/output`.

- [ ] **Step 3: Write minimal implementation**

Create `src/output.ts`:
```ts
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { TieredComp } from "./aggregate/tier";

export interface CompsDataset {
  generatedAt: string;
  patch: string;
  sampleSize: number;
  comps: TieredComp[];
}

export function writeComps(path: string, dataset: CompsDataset): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(dataset, null, 2), "utf-8");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/output.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/output.ts test/output.test.ts
git commit -m "feat: write comps dataset to json"
```

---

## Task 9: Riot API client + smoke test

The client is thin I/O — validated by a manual smoke script, not unit tests.

**Files:**
- Create: `games/tft/pipeline/src/riot/client.ts`
- Create: `games/tft/pipeline/src/smoke.ts`

- [ ] **Step 1: Write the client**

Create `src/riot/client.ts`:
```ts
import type { Config } from "../config";
import { platformHost, regionHost } from "./routing";
import type { RawMatch } from "./normalize";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface LeagueEntry { puuid?: string; summonerId?: string; }
export interface LeagueList { entries: LeagueEntry[]; }

export class RiotClient {
  private last = 0;
  constructor(private cfg: Config, private minIntervalMs = 1300) {}

  private async throttle() {
    const wait = this.minIntervalMs - (Date.now() - this.last);
    if (wait > 0) await sleep(wait);
    this.last = Date.now();
  }

  private async get<T>(url: string): Promise<T> {
    await this.throttle();
    const res = await fetch(url, { headers: { "X-Riot-Token": this.cfg.riotApiKey } });
    if (res.status === 429) {
      const retry = Number(res.headers.get("retry-after") ?? "5");
      await sleep((retry + 1) * 1000);
      return this.get<T>(url);
    }
    if (!res.ok) throw new Error(`Riot API ${res.status} for ${url}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  challenger(): Promise<LeagueList> {
    return this.get<LeagueList>(`${platformHost(this.cfg.region)}/tft/league/v1/challenger`);
  }

  matchIdsByPuuid(puuid: string, count = 20): Promise<string[]> {
    return this.get<string[]>(
      `${regionHost(this.cfg.routingRegion)}/tft/match/v1/matches/by-puuid/${puuid}/ids?count=${count}`
    );
  }

  match(matchId: string): Promise<RawMatch> {
    return this.get<RawMatch>(`${regionHost(this.cfg.routingRegion)}/tft/match/v1/matches/${matchId}`);
  }
}
```

- [ ] **Step 2: Write the smoke script**

Create `src/smoke.ts`:
```ts
import { loadConfig } from "./config";
import { RiotClient } from "./riot/client";

// Loads .env via Node's built-in --env-file flag (see run command below).
async function main() {
  const client = new RiotClient(loadConfig());
  const league = await client.challenger();
  console.log(`challenger entries: ${league.entries.length}`);
  console.log("first entry:", JSON.stringify(league.entries[0], null, 2));

  const puuid = league.entries[0]?.puuid;
  if (!puuid) {
    console.warn("No puuid on the league entry — we will need a summoner lookup step. Inspect the entry above.");
    return;
  }
  const ids = await client.matchIdsByPuuid(puuid, 3);
  console.log("match ids:", ids);
  const match = await client.match(ids[0]);
  console.log("participants in first match:", match.info.participants.length);
  console.log("first unit of first participant:", match.info.participants[0]?.units[0]);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Create `.env` and run the smoke test**

Copy `.env.example` to `.env`, paste your current Riot key, then run:
```bash
node --env-file=.env node_modules/tsx/dist/cli.mjs src/smoke.ts
```
Expected: prints challenger entry count, a sample entry, match ids, and a sample unit like `{ character_id: 'TFT14_...', tier: 2 }`.

**Validation gate:** Confirm the real `units` have `character_id` and `tier` fields (matching our fixture in Task 4). If `puuid` is absent from league entries, STOP and add a summoner-lookup step (`/tft/summoner/v1/summoners/{summonerId}` → `puuid`) before Task 10.

- [ ] **Step 4: Commit**

```bash
git add src/riot/client.ts src/smoke.ts
git commit -m "feat: riot api client and smoke test"
```

---

## Task 10: Orchestration + first real data pull

**Files:**
- Create: `games/tft/pipeline/src/run.ts`

- [ ] **Step 1: Write the orchestration script**

Create `src/run.ts`:
```ts
import { loadConfig } from "./config";
import { RiotClient } from "./riot/client";
import { toParticipants, type RawMatch } from "./riot/normalize";
import { aggregateComps } from "./aggregate/group";
import { tierComps } from "./aggregate/tier";
import { writeComps } from "./output";
import type { Participant } from "./aggregate/signature";

const PLAYERS = Number(process.env.PLAYERS ?? "20");
const MATCHES_PER_PLAYER = Number(process.env.MATCHES ?? "10");
const MIN_COUNT = Number(process.env.MIN_COUNT ?? "3");
const OUT = "../data/comps.json";

async function main() {
  const client = new RiotClient(loadConfig());

  console.log("fetching challenger league...");
  const league = await client.challenger();
  const puuids = league.entries
    .map((e) => e.puuid)
    .filter((x): x is string => Boolean(x))
    .slice(0, PLAYERS);
  console.log(`using ${puuids.length} players`);

  const matchIds = new Set<string>();
  for (const puuid of puuids) {
    const ids = await client.matchIdsByPuuid(puuid, MATCHES_PER_PLAYER);
    ids.forEach((id) => matchIds.add(id));
    console.log(`collected ${matchIds.size} unique match ids...`);
  }

  const participants: Participant[] = [];
  let done = 0;
  for (const id of matchIds) {
    try {
      const match: RawMatch = await client.match(id);
      participants.push(...toParticipants(match));
    } catch (e) {
      console.warn(`skip match ${id}: ${(e as Error).message}`);
    }
    if (++done % 10 === 0) console.log(`processed ${done}/${matchIds.size} matches`);
  }

  const comps = tierComps(aggregateComps(participants, MIN_COUNT));
  writeComps(OUT, {
    generatedAt: new Date().toISOString(),
    patch: "set17",
    sampleSize: participants.length,
    comps,
  });
  console.log(`wrote ${comps.length} comps from ${participants.length} boards to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the full pipeline**

Run (this is slow on a dev key — throttled to ~1 req/1.3s; expect several minutes):
```bash
node --env-file=.env node_modules/tsx/dist/cli.mjs src/run.ts
```
Expected: progress logs, then `wrote N comps from M boards to ../data/comps.json`.

- [ ] **Step 3: Verify the output exists and is valid**

Run:
```bash
node -e "const d=require('./games/tft/data/comps.json'); console.log(d.comps.length, 'comps, sample:', d.comps[0])"
```
(from repo root)
Expected: a comp count and a sample comp object with `tier`, `units`, `avgPlacement`.

- [ ] **Step 4: Commit**

```bash
git add src/run.ts
git commit -m "feat: orchestrate full data pipeline run"
```

> Do NOT commit `games/tft/data/comps.json` if it is large or you prefer generated data out of git. If you want it in git for the Phase 2 UI to import, add it explicitly: `git add -f games/tft/data/comps.json`.

---

## Self-Review Notes

- **Spec coverage:** Fase 1 of the design doc (pull high-elo matches → aggregate comps + stats → local JSON) is covered end-to-end. Positioning/build-paths are correctly out of scope (deferred to Fase 4).
- **Type consistency:** `Participant`/`Unit` (signature.ts) are the shared shape; `normalize.ts`, `group.ts`, `run.ts` all consume them. `CompStats` (group.ts) → `TieredComp` (tier.ts) → `CompsDataset` (output.ts) form a consistent chain.
- **Known v1 limitations (intentional):** simple 2★-set comp signature; fixed tier thresholds; dev-key rate limits keep samples small. All flagged; refined with more data later.
