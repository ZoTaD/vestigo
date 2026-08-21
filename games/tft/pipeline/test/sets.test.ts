import { describe, it, expect } from "vitest";
import { SETS, currentSet, publishedSet, setDef, setOpeningVersions, setFromEnv } from "../src/sets";
import { SETS as WORKER_SETS, currentSet as workerCurrentSet } from "../../cloudflare/src/sets";

/** El instante de medianoche UTC de un día, que es donde están todos los bordes. */
const utc = (day: string) => new Date(`${day}T00:00:00.000Z`);

describe("currentSet", () => {
  // El borde que importa: el Set 18 abre el 2026-08-26 y ese día la ingesta
  // tiene que dejar de aceptar partidas del 17.
  it("cambia el día que abre el set, ni antes ni después", () => {
    expect(currentSet(utc("2026-08-25"))).toBe(17);
    expect(currentSet(utc("2026-08-26"))).toBe(18);
    expect(currentSet(utc("2026-08-27"))).toBe(18);
  });

  it("el último instante del día anterior todavía es el set viejo", () => {
    expect(currentSet(new Date("2026-08-25T23:59:59.999Z"))).toBe(17);
  });

  // Quien corra esto puede estar en cualquier zona horaria; el corte es UTC y
  // tiene que dar lo mismo desde Buenos Aires que desde Tokio. A las 02:00 UTC
  // del 26 en Argentina (UTC-3) todavía son las 23:00 del 25.
  it("corta en UTC y no en la zona de quien corre el proceso", () => {
    expect(currentSet(new Date("2026-08-26T02:00:00.000Z"))).toBe(18);
  });

  it("antes del primer set conocido cae al primero en vez de inventar un set 0", () => {
    expect(currentSet(utc("2020-01-01"))).toBe(SETS[0].number);
  });
});

describe("publishedSet", () => {
  // El corazón del diseño: que abra el 18 NO mueve lo que el sitio publica. Si
  // lo moviera, el 26 de agosto a las 00:00 UTC el sitio publicaría un set del
  // que no tiene una sola partida y quedaría vacío en las cinco bandas.
  it("sigue publicando el set viejo aunque el nuevo ya haya abierto", () => {
    expect(publishedSet([], utc("2026-08-26"))).toBe(17);
    expect(publishedSet([], utc("2026-09-15"))).toBe(17);
  });

  it("pasa al set nuevo recién cuando el viejo se congela", () => {
    expect(publishedSet([17], utc("2026-08-26"))).toBe(18);
  });

  it("antes de que abra el set nuevo publica el vigente, congelado o no", () => {
    expect(publishedSet([], utc("2026-07-29"))).toBe(17);
  });

  // No se archiva el set vigente, así que esto no debería pasar; si pasa, es
  // mejor publicar algo que devolver un set que no existe.
  it("cae al set vivo si estuvieran todos archivados", () => {
    expect(publishedSet([17, 18], utc("2026-08-26"))).toBe(18);
  });
});

describe("setOpeningVersions", () => {
  it("deriva las versiones de SETS en vez de repetirlas", () => {
    expect(setOpeningVersions()[17]).toBe("16.8");
  });

  // El Set 18 tiene fecha (Riot la anunció) pero no versión de cliente: sale con
  // el parche 18.1, que en versiones de cliente será 16.algo y no lo sabemos.
  // Dejarlo afuera es lo que hace que patchLabel muestre la versión cruda en vez
  // de inventar un "18.1" que podría no corresponder.
  it("omite los sets cuya versión de cliente todavía no se vio", () => {
    expect(setOpeningVersions()[18]).toBeUndefined();
  });
});

describe("setDef", () => {
  it("encuentra un set conocido", () => {
    expect(setDef(18)?.opensAt).toBe("2026-08-26");
  });

  it("no inventa uno que no está en la tabla", () => {
    expect(setDef(99)).toBeUndefined();
  });
});

describe("setFromEnv", () => {
  it("sin variable no hay override", () => {
    expect(setFromEnv(undefined)).toBeNull();
    expect(setFromEnv("")).toBeNull();
    expect(setFromEnv("   ")).toBeNull();
  });

  it("lee un set explícito", () => {
    expect(setFromEnv("17")).toBe(17);
  });

  // Number("diecisiete") es NaN y nada es === NaN: sin esta guarda, un typo
  // descarta el 100% de cada lote sin que falle nada.
  it("tira ante cualquier cosa que no sea un entero", () => {
    expect(() => setFromEnv("diecisiete")).toThrow(/TFT_SET/);
    expect(() => setFromEnv("17.5")).toThrow(/TFT_SET/);
  });
});

describe("la tabla de sets", () => {
  it("está ordenada por número, que es de lo que dependen currentSet y publishedSet", () => {
    const numeros = SETS.map((s) => s.number);
    expect([...numeros].sort((a, b) => a - b)).toEqual(numeros);
  });

  it("está ordenada por fecha de apertura, porque un set no abre antes que el anterior", () => {
    const fechas = SETS.map((s) => s.opensAt);
    expect([...fechas].sort()).toEqual(fechas);
  });

  it("usa fechas UTC en formato YYYY-MM-DD, de las que ordenan como texto", () => {
    for (const s of SETS) expect(s.opensAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/**
 * El Worker lleva su propia copia de la tabla porque `cloudflare/` no importa
 * nada del pipeline (dos despliegues, dos tsconfig). Este archivo es el único
 * motivo por el que esa copia se puede confiar.
 *
 * Sin esto, el síntoma de una divergencia sería el peor posible: el Worker
 * seguiría creyendo que el set vigente es el viejo y tiraría a la basura TODAS
 * las partidas del set nuevo, durante días, sin que falle absolutamente nada.
 * `pull_runs` diría "ok" en cada corrida.
 */
describe("la copia del Worker no puede divergir", () => {
  it("tiene exactamente la misma tabla", () => {
    expect(WORKER_SETS).toEqual(SETS);
  });

  it("responde igual en el borde del cambio de set", () => {
    for (const dia of ["2026-08-25", "2026-08-26", "2026-08-27"]) {
      expect(workerCurrentSet(utc(dia)), dia).toBe(currentSet(utc(dia)));
    }
  });
});
