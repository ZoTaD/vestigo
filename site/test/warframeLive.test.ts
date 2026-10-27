import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cambion, cetus, vallis } from "../src/warframe/cycles";
import { fetchLive, parseLive } from "../src/warframe/live";

/**
 * Tres tomas de `api.warframestat.us/pc/cetusCycle`, `vallisCycle` y `cambionCycle` del 2026-10-27, separadas por ~65 s
 * (`fetchedAt`). Ese día el worldstate de la API estaba congelado desde las 12:15:03 UTC (`timestamp` de `/pc/`, con
 * `timeLeft` de 35 m): las tres tomas devuelven lo mismo, calculado en ese instante. Por eso `now` es el instante en que
 * la API calculó sus ciclos, no la hora de la toma: es contra el que hay que comparar.
 */
const fixtures = JSON.parse(readFileSync(new URL("./fixtures/warframe-cycles.json", import.meta.url), "utf-8")) as {
  fetchedAt: number; now: number; cetusState: string; cetusEnds: number; vallisState: string; vallisEnds: number; cambionState: string; cambionEnds: number;
}[];

describe("ciclos de Warframe", () => {
  it("hay tres tomas separadas de la API", () => {
    expect(fixtures).toHaveLength(3);
    expect(fixtures[1].fetchedAt - fixtures[0].fetchedAt).toBeGreaterThan(50_000);
    expect(fixtures[2].fetchedAt - fixtures[1].fetchedAt).toBeGreaterThan(50_000);
  });

  it("los ciclos coinciden con la API (fixture del día en que se escribió)", () => {
    for (const f of fixtures) {
      expect(cetus(f.now).state).toBe(f.cetusState);
      expect(Math.abs(cetus(f.now).endsAt - f.cetusEnds)).toBeLessThan(60_000);
      expect(cambion(f.now).state).toBe(f.cambionState);
      expect(Math.abs(cambion(f.now).endsAt - f.cambionEnds)).toBeLessThan(60_000);
      expect(vallis(f.now).state).toBe(f.vallisState);
      expect(Math.abs(vallis(f.now).endsAt - f.vallisEnds)).toBeLessThan(60_000);
    }
  });

  it("los bordes que informa la API caen donde los calcula la fórmula (inicio del día de Cetus, del calor del Valle)", () => {
    // `activation` de cetusCycle (11:11:00, redondeado al minuto) y de vallisCycle (12:13:00, con los segundos en cero).
    const c = cetus(Date.parse("2026-10-27T11:12:00Z"));
    expect(c.state).toBe("day");
    expect(Math.abs(c.endsAt - Date.parse("2026-10-27T12:51:00Z"))).toBeLessThan(60_000);
    expect(vallis(Date.parse("2026-10-27T12:13:30Z")).state).toBe("warm");
    expect(Math.abs(vallis(Date.parse("2026-10-27T12:13:30Z")).endsAt - Date.parse("2026-10-27T12:20:08Z"))).toBeLessThan(1000);
  });

  it("la noche de Cetus dura 50 minutos y el día 100", () => {
    const t = Date.UTC(2026, 9, 27, 12, 51, 35); // el fin del día, con los segundos de la época oficial
    expect(cetus(t - 60_000).state).toBe("day");
    expect(cetus(t + 60_000).state).toBe("night");
    expect(Math.abs(cetus(t + 60_000).endsAt - (t + 3_000_000))).toBeLessThan(2000);
    expect(cetus(t + 3_000_000 + 60_000).state).toBe("day");
    // Antes de la época también cierra (resto positivo).
    expect(["day", "night"]).toContain(cetus(t - 9_000_000 * 40).state);
  });
});

describe("Cetus contra el worldstate oficial (fuente independiente)", () => {
  const of = JSON.parse(readFileSync(new URL("./fixtures/warframe-cetus-oficial.json", import.meta.url), "utf-8")) as { activation: number; expiry: number };

  it("el fin de la noche (Expiry de CetusSyndicate) es el vencimiento calculado", () => {
    expect(cetus(of.expiry - 5 * 60_000)).toMatchObject({ state: "night" });
    expect(Math.abs(cetus(of.expiry - 5 * 60_000).endsAt - of.expiry)).toBeLessThan(60_000);
    expect(cetus(of.expiry + 1000).state).toBe("day");
  });

  it("el inicio del ciclo (Activation) cae en un día que termina 100 min después", () => {
    const t = of.activation + 60_000;
    expect(cetus(t).state).toBe("day");
    expect(Math.abs(cetus(t).endsAt - (of.activation + 6_000_000))).toBeLessThan(60_000);
  });
});

describe("la API en vivo", () => {
  const real = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = real;
  });

  it("sin red la portada no rompe", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("caída"))) as never;
    expect(await fetchLive("en")).toBeNull();
  });

  it("una respuesta con error o rota da null", async () => {
    globalThis.fetch = (() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })) as never;
    expect(await fetchLive("es")).toBeNull();
    globalThis.fetch = (() => Promise.resolve({ ok: true, json: () => Promise.reject(new Error("no es JSON")) })) as never;
    expect(await fetchLive("es")).toBeNull();
  });

  it("las tormentas del Vacío no son fisuras", () => {
    const now = Date.parse("2026-10-27T12:00:00Z");
    const ws = { fissures: [{ node: "Tormenta", missionType: "Skirmish", tier: "Neo", expiry: "2026-10-27T13:00:00Z", isStorm: true }] };
    expect(parseLive(ws, now)!.fissures).toEqual([]);
  });

  it("pide el idioma pedido y mapea fisuras, Baro y la incursión", async () => {
    const now = Date.parse("2026-10-27T12:00:00Z");
    const ws = {
      fissures: [
        { node: "Spear (Mars)", missionType: "Defense", tier: "Lith", expiry: "2026-10-27T12:16:53.195Z", isHard: false },
        { node: "Vieja (Mars)", missionType: "Spy", tier: "Axi", expiry: "2026-10-27T11:00:00.000Z", isHard: true },
        { node: "Acero (Venus)", missionType: "Capture", tier: "Neo", expiry: "2026-10-27T13:00:00.000Z", isHard: true },
      ],
      voidTrader: { activation: "2026-10-30T13:00:00.000Z", expiry: "2026-11-01T13:00:00.000Z", location: "Larunda Relay (Mercury)" },
      sortie: {
        expiry: "2026-10-27T16:00:00.000Z",
        boss: "Lephantis",
        variants: [{ missionType: "Rescue", modifier: "Environmental Hazard: Radiation Pockets", node: "War (Mars)" }],
      },
    };
    let url = "";
    globalThis.fetch = ((u: string) => ((url = u), Promise.resolve({ ok: true, json: () => Promise.resolve(ws) }))) as never;
    expect(await fetchLive("es")).not.toBeNull();
    expect(url).toBe("https://api.warframestat.us/pc/?language=es");
    const live = parseLive(ws, now)!;
    expect(live.fissures).toEqual([
      { node: "Spear (Mars)", mission: "Defense", era: "Lith", endsAt: Date.parse("2026-10-27T12:16:53.195Z"), hard: false },
      { node: "Acero (Venus)", mission: "Capture", era: "Neo", endsAt: Date.parse("2026-10-27T13:00:00.000Z"), hard: true },
    ]);
    expect(live.baro).toEqual({ active: false, location: "Larunda Relay (Mercury)", startsAt: Date.parse("2026-10-30T13:00:00.000Z") });
    expect(live.sortie).toEqual({ boss: "Lephantis", missions: [{ node: "War (Mars)", type: "Rescue", modifier: "Environmental Hazard: Radiation Pockets" }] });
    // Baro ya en el Relé: activo, con su hora de salida.
    expect(parseLive(ws, Date.parse("2026-10-31T00:00:00Z"))!.baro).toMatchObject({ active: true, endsAt: Date.parse("2026-11-01T13:00:00.000Z") });
    expect(parseLive(null, now)).toBeNull();
  });
});
