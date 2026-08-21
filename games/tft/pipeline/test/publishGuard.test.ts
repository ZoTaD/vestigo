import { describe, it, expect } from "vitest";
import { meaningfulChange, sampleDrop, sampleDropAborts, keyLooksDead } from "../src/publish-guard";

const file = (sample: number, at: string, top = "Sorcerer|Zoe") =>
  JSON.stringify({ generatedAt: at, patch: "16.14", sampleSize: sample, comps: [{ signature: top }] });

describe("meaningfulChange", () => {
  // generatedAt sigue en los archivos (2abfa4e lo sacó de la pantalla, no del dato),
  // así que un diff a secas nunca da vacío y la Action commitearía todos los días.
  it("ignora la hora de construcción", () => {
    expect(meaningfulChange(file(100, "2026-07-26T06:00:00Z"), file(100, "2026-07-27T06:00:00Z"))).toBe(false);
  });

  it("ve un cambio real", () => {
    expect(meaningfulChange(file(100, "a"), file(120, "a"))).toBe(true);
    expect(meaningfulChange(file(100, "a"), file(100, "a", "Duelist|Yasuo"))).toBe(true);
  });
});

describe("sampleDrop", () => {
  it("no reporta caída cuando la muestra crece", () => {
    expect(sampleDrop(100, 120)).toBe(0);
  });

  it("mide la caída como fracción de lo publicado", () => {
    expect(sampleDrop(100, 60)).toBeCloseTo(0.4);
  });

  it("no divide por cero cuando no había nada publicado", () => {
    expect(sampleDrop(0, 0)).toBe(0);
  });
});

describe("sampleDropAborts", () => {
  // Mismo parche, sin caída: nada que abortar.
  it("no aborta con la misma muestra y el mismo parche", () => {
    expect(
      sampleDropAborts({ patch: "16.14", sampleSize: 54496 }, { patch: "16.14", sampleSize: 54496 })
    ).toBe(false);
  });

  // Dentro del mismo parche, una caída grande sigue siendo una lectura rota
  // y no "hay menos partidas": esta es la guarda que ya existía.
  it("aborta con una caída grande dentro del mismo parche", () => {
    expect(
      sampleDropAborts({ patch: "16.14", sampleSize: 54496 }, { patch: "16.14", sampleSize: 800 })
    ).toBe(true);
  });

  // El caso que rompía la publicación provisional: el build ya escribió el
  // parche nuevo, que arranca con muy pocos tableros por diseño (ver
  // PROVISIONAL_BAND_BOARDS en build.ts). Un cambio de parche ES "hay menos
  // partidas" — para eso está el piso provisional y su aviso en pantalla — así
  // que la caída de muestra no debe abortar acá.
  it("no aborta con una caída grande cuando el parche cambió", () => {
    expect(
      sampleDropAborts({ patch: "16.13", sampleSize: 54496 }, { patch: "16.14", sampleSize: 800 })
    ).toBe(false);
  });
});

describe("keyLooksDead", () => {
  const run = (detail: string) => ({ status: "error", detail });
  const dead = (n: number) => Array.from({ length: n }, () => run("RIOT_401"));

  // La ventana es de TIEMPO y la aplica la consulta: acá llegan solo las corridas
  // de las últimas 24 h. Antes la ventana eran "48 corridas", que valía 24 h con el
  // cron cada 30 minutos y pasó a valer 4 h cuando el cron bajó a cada 5.
  it("avisa cuando TODAS las corridas de la ventana fallaron por la key", () => {
    expect(keyLooksDead(dead(288))).toBe(true);
  });

  // Que la key se venza es la rutina: el cron sigue llamando y en cuanto se sube la
  // nueva vuelve a traer. Un mail por eso todos los días es ruido. Unas horas
  // vencida dentro de la ventana significa que ANTES anduvo, y eso ya no avisa.
  it("no avisa por unas horas vencida dentro de la ventana", () => {
    const ok = { status: "ok", detail: "17 de 20 rankeds" };
    expect(keyLooksDead([...dead(48), ...Array.from({ length: 200 }, () => ok)])).toBe(false);
  });

  it("no avisa si alguna anduvo", () => {
    expect(keyLooksDead([...dead(47), { status: "ok", detail: "17 de 20 rankeds" }])).toBe(false);
  });

  // Un cron detenido deja la ventana casi vacía, y eso no es una key vencida: el
  // mensaje mandaría a renovar algo que no es el problema.
  it("no avisa con muy pocas corridas en la ventana", () => {
    expect(keyLooksDead(dead(3))).toBe(false);
  });

  // Otro error no es una key vencida: la Action no debe pedir que se renueve por,
  // por ejemplo, un 503 de Riot.
  it("no confunde otra falla con la key", () => {
    expect(keyLooksDead(Array.from({ length: 48 }, () => run("RIOT_503")))).toBe(false);
  });
});
