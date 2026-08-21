import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import { freezeBlockers, purgeBlockers } from "../src/close-set";
import { patchesForSetFromR2 } from "../src/r2Summary";
import { BANDS } from "../src/bands";

interface CompsFile {
  band?: string;
  patch?: string;
  patchLabel?: string;
  sampleSize: number;
  insufficient?: boolean;
  comps: unknown[];
}
interface UnitsFile {
  insufficient?: boolean;
  units?: unknown[];
}

/** Una banda publicada y sana. */
const compsOk = (patchLabel = "17.8"): CompsFile => ({
  patchLabel,
  sampleSize: 50_000,
  comps: [{}, {}, {}],
});

const todasLasBandas = <T>(valor: (band: string) => T): Record<string, T> =>
  Object.fromEntries(BANDS.map((b) => [b.id, valor(b.id)]));

describe("freezeBlockers", () => {
  it("deja congelar cuando lo publicado está sano", () => {
    expect(
      freezeBlockers(
        todasLasBandas(() => compsOk()),
        todasLasBandas(() => ({ units: [{}] })),
        17
      )
    ).toEqual([]);
  });

  it("frena si falta una banda entera", () => {
    const comps = todasLasBandas(() => compsOk());
    delete comps["silver-below"];
    const motivos = freezeBlockers(comps, todasLasBandas(() => ({})), 17);
    expect(motivos.join(" ")).toMatch(/falta comps de la banda silver-below/);
  });

  it("frena si una banda quedó sin comps", () => {
    const comps = todasLasBandas(() => compsOk());
    comps["apex"] = { ...compsOk(), comps: [], insufficient: true };
    expect(freezeBlockers(comps, todasLasBandas(() => ({})), 17).join(" ")).toMatch(
      /apex no tiene comps publicadas/
    );
  });

  // La peor equivocación posible acá: archivar bajo "set 17" una tier list que
  // en realidad es del 18. Nada volvería a mirar ese archivo hasta que sea tarde.
  it("frena si lo publicado es de otro set que el que se quiere congelar", () => {
    const motivos = freezeBlockers(
      todasLasBandas(() => compsOk("18.1")),
      todasLasBandas(() => ({ units: [{}] })),
      17
    );
    expect(motivos.join(" ")).toMatch(/no es del set 17/);
  });

  /**
   * El caso que motiva la mitad de este comando. `units`, `items` y `habits`
   * salen de la ventana de crudas, que se renueva entera en medio día: si se
   * congela tarde, salen vacíos y ya no hay de dónde rehacerlos.
   */
  it("frena si la ventana de crudas ya se vació del set que se está cerrando", () => {
    const motivos = freezeBlockers(
      todasLasBandas(() => compsOk()),
      todasLasBandas(() => ({ insufficient: true })),
      17
    );
    expect(motivos.join(" ")).toMatch(/units viene vacío en TODAS las bandas/);
  });

  it("no frena si sólo una banda quedó corta de unidades", () => {
    const units = todasLasBandas((): UnitsFile => ({ units: [{}] }));
    units["silver-below"] = { insufficient: true };
    expect(
      freezeBlockers(
        todasLasBandas(() => compsOk()),
        units,
        17
      )
    ).toEqual([]);
  });
});

describe("purgeBlockers", () => {
  const sano = { set: 17, vivo: 18, hayManifiesto: true, enElIndice: true, patches: ["16.8", "16.14"] };

  it("deja borrar un set cerrado, congelado y publicado", () => {
    expect(purgeBlockers(sano)).toEqual([]);
  });

  it("no borra el set que se está jugando ahora", () => {
    expect(purgeBlockers({ ...sano, vivo: 17 }).join(" ")).toMatch(/está vivo ahora mismo/);
  });

  it("no borra sin congelado: sería tirar el set sin dejar nada", () => {
    expect(purgeBlockers({ ...sano, hayManifiesto: false, patches: [] }).join(" ")).toMatch(
      /--freeze primero/
    );
  });

  // El congelado puede existir en disco y todavía no estar desplegado. Borrar
  // ahí deja al sitio con el set viejo inaccesible y las crudas ya borradas.
  it("no borra si el congelado todavía no está publicado", () => {
    expect(purgeBlockers({ ...sano, enElIndice: false }).join(" ")).toMatch(/no figura en el índice/);
  });

  it("no borra con un manifiesto sin parches: no sabría qué tocar en R2", () => {
    expect(purgeBlockers({ ...sano, patches: [] }).join(" ")).toMatch(/no lista parches/);
  });

  it("junta todos los motivos en vez de frenar en el primero", () => {
    expect(purgeBlockers({ set: 17, vivo: 17, hayManifiesto: false, enElIndice: false, patches: [] }))
      .toHaveLength(3);
  });
});

describe("patchesForSetFromR2", () => {
  const objeto = (set?: number) => gzipSync(Buffer.from(JSON.stringify(set === undefined ? {} : { set })));

  it("junta los parches del set pedido y deja afuera los de otro", async () => {
    const keys = [
      "summary/patch=16.13/pg-apex.json.gz",
      "summary/patch=16.14/pg-apex.json.gz",
      "summary/patch=16.17/pg-apex.json.gz",
    ];
    const sets: Record<string, number> = {
      "summary/patch=16.13/pg-apex.json.gz": 17,
      "summary/patch=16.14/pg-apex.json.gz": 17,
      "summary/patch=16.17/pg-apex.json.gz": 18,
    };
    const patches = await patchesForSetFromR2(
      async () => keys,
      async (key) => objeto(sets[key]),
      17
    );
    expect(patches).toEqual(["16.13", "16.14"]);
  });

  // El campo `set` se agregó el 2026-07-29; todo lo escrito antes es del Set 17.
  // De esto depende un borrado, así que no puede quedar en "se asume".
  it("cuenta como del Set 17 los objetos viejos que no tienen el campo set", async () => {
    const patches = await patchesForSetFromR2(
      async () => ["summary/patch=16.9/pg-apex.json.gz"],
      async () => objeto(undefined),
      17
    );
    expect(patches).toEqual(["16.9"]);
  });

  it("no le adjudica al set nuevo los objetos viejos sin campo", async () => {
    const patches = await patchesForSetFromR2(
      async () => ["summary/patch=16.9/pg-apex.json.gz"],
      async () => objeto(undefined),
      18
    );
    expect(patches).toEqual([]);
  });

  // Un parche tiene un objeto por banda más los de por día; leerlos todos para
  // saber de qué set es sería bajar cuarenta archivos en vez de ocho.
  it("lee un solo objeto por parche, no uno por banda", async () => {
    const leidos: string[] = [];
    await patchesForSetFromR2(
      async () => [
        "summary/patch=16.14/pg-apex.json.gz",
        "summary/patch=16.14/pg-global.json.gz",
        "summary/patch=16.14/day=2026-07-20/abc.json.gz",
      ],
      async (key) => {
        leidos.push(key);
        return objeto(17);
      },
      17
    );
    expect(leidos).toHaveLength(1);
  });

  it("ordena los parches por número y no alfabéticamente", async () => {
    const keys = ["16.9", "16.14", "16.8"].map((p) => `summary/patch=${p}/pg-apex.json.gz`);
    const patches = await patchesForSetFromR2(
      async () => keys,
      async () => objeto(17),
      17
    );
    expect(patches).toEqual(["16.8", "16.9", "16.14"]);
  });

  it("ignora objetos que no son deltas de resumen", async () => {
    const patches = await patchesForSetFromR2(
      async () => ["summary/patch=16.14/README.txt"],
      async () => objeto(17),
      17
    );
    expect(patches).toEqual([]);
  });
});
