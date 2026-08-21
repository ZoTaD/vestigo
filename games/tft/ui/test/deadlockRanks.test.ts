import { describe, expect, it } from "vitest";
import { DEADLOCK_SECTIONS, parseRoute, routePath } from "../src/route";
import { COVERAGE_ENOUGH, leansTo, showsCalibrationNotice } from "../src/deadlockRanksData";

describe("la pestaña de rangos", () => {
  it("está en la lista de secciones de Deadlock", () => {
    expect(DEADLOCK_SECTIONS).toContain("ranks");
  });

  it("va y vuelve de la URL sin cambiar de forma", () => {
    const r = parseRoute("/en/deadlock/ranks");
    expect(r.view).toBe("deadlock");
    expect(r.dlSection).toBe("ranks");
    expect(routePath(r)).toBe("/en/deadlock/ranks");
  });

  it("existe también en español", () => {
    expect(routePath(parseRoute("/es/deadlock/ranks"))).toBe("/es/deadlock/ranks");
  });
});

describe("el cartel de calibración", () => {
  it("se enciende mientras falte gente por calibrar", () => {
    // 47,6% es la cobertura real medida el 2026-08-01.
    expect(showsCalibrationNotice(0.476)).toBe(true);
  });

  it("se apaga solo cuando la cobertura llega, sin deploy de por medio", () => {
    expect(showsCalibrationNotice(COVERAGE_ENOUGH)).toBe(false);
    expect(showsCalibrationNotice(0.98)).toBe(false);
  });

  it("no exige el 100%, que nunca llegaría", () => {
    // Siempre hay cuentas nuevas sin calibrar: un umbral en 1 dejaría el cartel
    // puesto para siempre, y un cartel permanente deja de significar algo.
    expect(COVERAGE_ENOUGH).toBeLessThan(1);
  });
});

describe("leansTo", () => {
  const row = (team0: number, se: number) => ({ tier: 8, matches: 1, team0, se });

  it("no afirma nada cuando el intervalo toca el 50%", () => {
    // 50,56% con error 0,29 es lo que da hoy el corpus ranked: menos de dos
    // errores estándar, así que no se puede decir que un lado gane.
    expect(leansTo(row(0.5056, 0.0029))).toBeNull();
  });

  it("marca el lado cuando la diferencia se sostiene", () => {
    expect(leansTo(row(0.5244, 0.0055))).toBe("team0");
    expect(leansTo(row(0.4868, 0.0034))).toBe("team1");
  });
});
