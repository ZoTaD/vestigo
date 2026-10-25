// Clima contra el juego real: cada caso de `weather.json` lo escribió el oráculo
// (`games/stardew/tools/oracle`, comando `weather`) llamando a
// `LocationWeather.UpdateDailyWeather("Default", ...)` con las 256 combinaciones de
// un `Random` guionado (lo que puede quedar guardado como clima de mañana: más de
// un valor = depende de `RANDOM`) y a `Game1.getWeatherModificationsForDate` con la
// fecha de mañana sobre cada valor guardado posible.
import { describe, expect, it } from "vitest";
import fx from "./fixtures/stardew-predict/weather.json";
import raw from "../../games/stardew/data/predict.json";
import {
  isGreenRainDay,
  seasonWeather,
  updateDailyWeather,
  weatherTomorrow,
  type DayWeather,
} from "../src/stardew/predict/weather";
import type { PredictData } from "../src/stardew/predict/query";

const data = raw as unknown as PredictData;

interface Caso {
  gameId: number;
  legacy: boolean;
  year: number;
  season: 0 | 1 | 2 | 3;
  day: number;
  daysPlayed: number;
  saved: string[];
  mods: string;
}

const casos = fx.cases as Caso[];
const GUARDADOS = fx.saved as string[];

const TIPO: Record<string, DayWeather["kind"]> = {
  Sun: "sun", Rain: "rain", Storm: "storm", Snow: "snow", Wind: "wind", GreenRain: "greenRain", Festival: "festival",
};

/** Lo que se espera mostrar cuando el día puede salir de más de una forma (ver `DayWeather`). */
function esperado(finales: Set<string>): DayWeather {
  const xs = [...finales].sort();
  if (xs.length === 1) return { kind: TIPO[xs[0]] };
  const clave = xs.join("+");
  if (clave === "Rain+Storm") return { kind: "rain", maybe: "storm" };
  if (clave === "Storm+Sun") return { kind: "sun", maybe: "storm" };
  if (clave === "Sun+Wind") return { kind: "sun", maybe: "wind" };
  throw new Error(`combinación inesperada en el fixture: ${clave}`);
}

const hoy = (c: Caso) => ({ season: c.season, day: c.day, year: c.year, daysPlayed: c.daysPlayed });
const semilla = (c: Caso) => ({ gameId: c.gameId, legacy: c.legacy });

describe("clima contra el juego", () => {
  it("el fixture cubre las tres partidas, los dos años, la lluvia verde y lo que depende de RANDOM", () => {
    expect(new Set(casos.map((c) => c.gameId)).size).toBe(3);
    expect(casos.some((c) => c.legacy)).toBe(true);
    expect(casos.filter((c) => c.year === 1).length).toBe(3 * 112);
    const guardados = new Set(casos.map((c) => c.saved.join("+")));
    for (const g of ["Sun", "Rain", "Snow", "Festival", "GreenRain", "Rain+Storm", "Sun+Wind", "Storm+Sun"]) {
      expect(guardados.has(g), g).toBe(true);
    }
  });

  it("los festivales pasivos del valle son los que dice el juego (InValleyContext sobre los mapas)", () => {
    const enDatos = Object.fromEntries(
      data.festivals.passive.filter((p) => p.mapReplacements).map((p) => [p.id, p.inValley ?? false]),
    );
    expect(enDatos).toEqual(fx.passiveInValley);
  });

  it("updateDailyWeather: lo que puede quedar guardado para mañana, día por día", () => {
    for (const c of casos) {
      const nombre = `${c.gameId} ${c.year}-${c.season}-${c.day}`;
      expect([...updateDailyWeather(semilla(c), hoy(c), data)].sort(), nombre).toEqual(c.saved);
    }
  });

  it("weatherTomorrow: getWeatherModificationsForDate sobre cada clima guardado, y la boda", () => {
    for (const c of casos) {
      const mods = c.mods.split(" ");
      GUARDADOS.forEach((g, i) => {
        const nombre = `${c.gameId} ${c.year}-${c.season}-${c.day} guardado ${g}`;
        expect(weatherTomorrow(g, semilla(c), hoy(c), data), nombre).toEqual({
          kind: TIPO[mods[i]],
        });
      });
      expect(weatherTomorrow("Rain", semilla(c), hoy(c), data, { wedding: true })).toEqual({
        kind: "wedding",
      });
    }
  });

  it("seasonWeather: de mañana al 28, con lo guardado y la mañana siguiente", () => {
    const porFecha = new Map(casos.map((c) => [`${c.gameId} ${c.year} ${c.season} ${c.day}`, c]));
    let probados = 0;
    for (const c of casos) {
      if (c.year !== 1 || c.day === 28) continue;
      const esperados: DayWeather[] = [];
      for (let d = c.day; d < 28; d++) {
        // El clima del día d+1 se decide la mañana del día d.
        const x = porFecha.get(`${c.gameId} ${c.year} ${c.season} ${d}`)!;
        const mods = x.mods.split(" ");
        esperados.push(esperado(new Set(x.saved.map((g) => mods[GUARDADOS.indexOf(g)]))));
      }
      expect(seasonWeather(semilla(c), hoy(c), data), `${c.gameId} ${c.season}-${c.day}`).toEqual(esperados);
      probados++;
    }
    expect(probados).toBe(3 * 4 * 27);
  });

  it("isGreenRainDay: un día de verano por año, el de la semilla", () => {
    for (const c of casos.filter((x) => x.saved.includes("GreenRain"))) {
      // Lo guardado para mañana es GreenRain: mañana es el día de lluvia verde.
      const manana = c.day + 1;
      expect(isGreenRainDay(semilla(c), c.year, 1, manana)).toBe(true);
    }
    expect(isGreenRainDay({ gameId: 452435081, legacy: false }, 1, 0, 5)).toBe(false);
  });
});
