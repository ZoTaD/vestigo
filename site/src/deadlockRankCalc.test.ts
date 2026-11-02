import { describe, expect, it } from "vitest";
import { badgeAt, badgeStart, lossesToDrop, nextBadge, nextTier, winsTo } from "./deadlockRankCalc";

// La escalera medida en rank-points.json el 2/11: +300, +300, +370, +390, +410, +430.
const POINTS = [300, 300, 370, 390, 410, 430];

describe("progreso de rango", () => {
  it("lee el caso medido: 44.370 es Arconte III", () => {
    expect(badgeAt(44370)).toBe(73);
    expect(badgeStart(73)).toBe(44000);
  });

  it("el sexto subnivel abarca 2.000", () => {
    expect(badgeAt(47000 - 1)).toBe(75);
    expect(badgeAt(47000)).toBe(76);
    expect(badgeAt(49000 - 1)).toBe(76);
    expect(badgeAt(49000)).toBe(81);
  });

  it("Iniciado I arranca en cero y Eternus es el techo", () => {
    expect(badgeAt(0)).toBe(11);
    expect(badgeAt(999_999)).toBe(111);
    expect(nextBadge(116)).toBe(null);
    expect(nextTier(105)).toBe(111);
  });

  it("pasa de VI al I del rango siguiente", () => {
    expect(nextBadge(76)).toBe(81);
    expect(nextBadge(73)).toBe(74);
  });
});

describe("victorias que faltan", () => {
  it("cuenta la racha: 630 puntos sin racha son 3 victorias", () => {
    // 300 + 300 = 600 < 630; la tercera (con 2 previas) suma 370.
    expect(winsTo(44370, 0, 74, POINTS)).toBe(3);
  });

  it("con racha de 2 la primera ya vale 370", () => {
    expect(winsTo(44370, 2, 74, POINTS)).toBe(2);
  });

  it("cero si ya llegó", () => {
    expect(winsTo(45000, 0, 74, POINTS)).toBe(0);
  });

  it("derrotas que aguanta antes de bajar", () => {
    expect(lossesToDrop(44370, -300)).toBe(2);
    expect(lossesToDrop(44000, -300)).toBe(1);
  });
});
