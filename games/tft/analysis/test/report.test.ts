import { describe, it, expect } from "vitest";
import { buildReport } from "../src/report";
import { toLobby } from "../src/normalize";
import type { CompReference } from "../src/metaGap";
import type { Calibration } from "../src/context";

import lobbyFixture from "./fixtures/NA1_5605803885.json";
import compsFile from "../../data/comps.json";

const lobby = toLobby((lobbyFixture as { match: unknown }).match);
const file = compsFile as { comps: CompReference[]; calibration?: Calibration };
const comps = file.comps;
// The real calibration, so the report is exercised the way the UI runs it.
const context = { calibration: file.calibration };
const input = (puuid: string) => ({ lobby, puuid, comps, context });
const boardNamed = (name: string) => lobby.boards.find((b) => b.gameName === name)!;

describe("buildReport", () => {
  it("returns null when the player was not in the lobby", () => {
    expect(buildReport(input("not-a-real-puuid"))).toBeNull();
  });

  it("builds a report for every player in a real lobby", () => {
    for (const board of lobby.boards) {
      const report = buildReport(input(board.puuid));
      expect(report, board.gameName).not.toBeNull();
      expect(report!.matchId).toBe("NA1_5605803885");
      expect(report!.placement).toBe(board.placement);
    }
  });

  it("leads with which comp the board was, then sorts by severity", () => {
    const rank = { high: 0, medium: 1, info: 2 };
    for (const board of lobby.boards) {
      const { findings } = buildReport(input(board.puuid))!;
      if (findings.length === 0) continue;
      // The frame comes first even though it is only informational: the rest of
      // the report is stated against it.
      const rest = findings[0].id === "metagap-comp" ? findings.slice(1) : findings;
      if (findings.some((f) => f.id === "metagap-comp")) {
        expect(findings[0].id, board.gameName).toBe("metagap-comp");
      }
      const ranks = rest.map((f) => rank[f.severity]);
      expect([...ranks].sort((a, b) => a - b), board.gameName).toEqual(ranks);
    }
  });

  it("gives every finding a unique id within a report", () => {
    for (const board of lobby.boards) {
      const ids = buildReport(input(board.puuid))!.findings.map((f) => f.id);
      expect(new Set(ids).size, board.gameName).toBe(ids.length);
    }
  });

  it("draws on all three modules across a lobby", () => {
    const modules = new Set(
      lobby.boards.flatMap((b) => buildReport(input(b.puuid))!.findings.map((f) => f.module))
    );
    expect(modules).toContain("contested");
    expect(modules).toContain("metaGap");
    expect(modules).toContain("mistakes");
  });

  it("catches the 34 gold the seventh-place player sat on", () => {
    const report = buildReport(input(boardNamed("大狗叫叫叫").puuid))!;
    const gold = report.findings.find((f) => f.id === "mistake-gold");
    expect(gold).toBeDefined();
    expect(gold!.detail).toContain("34");
  });

  it("uses the injected names instead of raw ids", () => {
    // Without injection the report prints "TahmKench"; the catalog knows better.
    const labels = {
      champion: (id: string) => `CAMPEÓN(${id})`,
      trait: (id: string) => `TRAIT(${id})`,
      item: (id: string) => `ITEM(${id})`,
    };
    const withNames = lobby.boards.flatMap(
      (b) => buildReport({ ...input(b.puuid), context: { ...context, labels } })!.findings
    );
    const text = withNames.map((f) => `${f.title} ${f.detail}`).join(" ");
    expect(text).toContain("CAMPEÓN(TFT17_");
    // And nothing should leak the bare id anymore.
    expect(text).not.toMatch(/(?<!\()TFT17_\w+(?!\))/);
  });

  it("falls back to stripping the set prefix when no names are injected", () => {
    const text = lobby.boards
      .flatMap((b) => buildReport(input(b.puuid))!.findings)
      .map((f) => `${f.title} ${f.detail}`)
      .join(" ");
    expect(text).not.toContain("TFT17_");
  });

  it("withholds the meta comparison on Double Up instead of guessing", () => {
    const doubleUp = { ...lobby, gameType: "pairs" };
    const r = buildReport({ ...input(lobby.boards[0].puuid), lobby: doubleUp })!;
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].id).toBe("mode-not-comparable");
    expect(r.findings[0].title).toContain("Double Up");
  });

  it("treats a payload with no game type as standard, so nothing regresses", () => {
    const unknown = { ...lobby, gameType: "" };
    const r = buildReport({ ...input(lobby.boards[0].puuid), lobby: unknown })!;
    expect(r.findings.some((f) => f.id === "mode-not-comparable")).toBe(false);
  });

  it("still produces a report when no comps are available", () => {
    const report = buildReport({ ...input(lobby.boards[0].puuid), comps: [] });
    expect(report).not.toBeNull();
    expect(report!.findings.every((f) => f.module !== "metaGap")).toBe(true);
  });
});
