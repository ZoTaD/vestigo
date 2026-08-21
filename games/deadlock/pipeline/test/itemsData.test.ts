import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Recorre **los 156 ítems publicados, en los dos idiomas**, buscando lo que sólo
 * se ve abriéndolos de a uno.
 *
 * Existe porque revisar ítem por ítem a ojo encontró cosas reales —una sección
 * con encabezado que el juego no pone, una stat sin valor que dibujaba un "%"
 * suelto, dos stats con la misma etiqueta— y a ojo no escala a 156 × 2. Esto es
 * esa revisión, hecha cada vez que corren los tests en vez de una sola vez.
 *
 * Lee los archivos publicados y no llama al pipeline: lo que importa no es que
 * la función esté bien, es que **lo que se sirve** esté bien.
 */

const leer = <T,>(f: string): T => JSON.parse(readFileSync(`../data/${f}`, "utf8")) as T;

interface Stat {
  label: string;
  value: string;
  unit: string;
  icon?: string;
  big?: true;
}
interface Block {
  text: { t: string; icon?: string; attr?: string }[];
  stats: Stat[];
  boxed: Stat[];
  cooldown?: Stat;
}
interface Detail {
  sections: { kind: string; blocks: Block[] }[];
}

const catalog = leer<{
  items: Record<string, { name: { en: string; es: string }; types?: string[]; upgradesTo?: number[]; upgradesFrom?: number[] }>;
  icons: Record<string, string>;
}>("catalog.json");
const detail = leer<Record<string, { en: Detail; es: Detail }>>("items-detail.json");

const ids = Object.keys(detail);
const nombre = (id: string) => catalog.items[id]?.name.en ?? id;
/** Cada ítem en cada idioma, que es la unidad que hay que revisar. */
const fichas = ids.flatMap((id) =>
  (["en", "es"] as const).map((lang) => [`${nombre(id)} (${lang})`, id, detail[id][lang]] as const)
);
const statsDe = (b: Block): Stat[] => [...b.stats, ...b.boxed, ...(b.cooldown ? [b.cooldown] : [])];
const bloques = fichas.flatMap(([q, id, f]) =>
  f.sections.flatMap((s) => s.blocks.map((b) => [q, id, s.kind, b] as const))
);

describe("las fichas publicadas, ítem por ítem", () => {
  it("cubre los 156 ítems en los dos idiomas", () => {
    expect(ids.length).toBe(Object.keys(catalog.items).length);
    expect(fichas.length).toBe(ids.length * 2);
  });

  it("no deja ninguna sección de un tipo que la UI no sepa dibujar", () => {
    const raros = fichas.flatMap(([q, , f]) =>
      f.sections.filter((s) => !["innate", "active", "passive", ""].includes(s.kind)).map(() => q)
    );
    expect(raros).toEqual([]);
  });

  /** Una stat sin número deja la unidad sola: "%" sin nada adelante. */
  it("no publica una stat sin valor ni sin etiqueta", () => {
    const malas = bloques.flatMap(([q, , , b]) =>
      statsDe(b)
        .filter((s) => !String(s.value).trim() || !s.label.trim())
        .map((s) => `${q}: "${s.label}"`)
    );
    expect(malas).toEqual([]);
  });

  /**
   * El texto del juego trae HTML adentro y se parsea en el build. Si alguna vez
   * sobrevive un `<`, es que algo dejó de parsearse y va a llegar crudo.
   */
  it("no deja markup sobreviviente en ninguna descripción", () => {
    const sucias = bloques.flatMap(([q, , , b]) =>
      b.text.filter((t) => /[<>]/.test(t.t)).map(() => q)
    );
    expect(sucias).toEqual([]);
  });

  it("no deja 'undefined' ni 'NaN' en pantalla", () => {
    const rotas = bloques.flatMap(([q, , , b]) =>
      [...statsDe(b).map((s) => s.label + s.value), ...b.text.map((t) => t.t)]
        .filter((t) => /undefined|NaN/.test(t))
        .map(() => q)
    );
    expect(rotas).toEqual([]);
  });

  it("resuelve todos los íconos que referencia, los de stat y los del texto", () => {
    const perdidos = bloques.flatMap(([q, , , b]) =>
      [...statsDe(b), ...b.text]
        .map((x) => x.icon)
        .filter((k): k is string => !!k && !catalog.icons[k])
        .map((k) => `${q}: ${k}`)
    );
    expect(perdidos).toEqual([]);
  });

  /**
   * La pastilla es el temporizador de una habilidad, así que sólo tiene sentido
   * donde hay una. En la sección innata una stat de clase `cooldown` es una
   * bonificación permanente: Spellslinger da −5% de recarga ahí y se dibujaba
   * como la pastilla de una habilidad que el ítem no tiene.
   */
  it("no pone la pastilla de recarga en una sección innata", () => {
    const malas = bloques
      .filter(([, , kind, b]) => kind === "innate" && b.cooldown)
      .map(([q]) => q);
    expect(malas).toEqual([]);
  });

  it("no publica un bloque sin nada adentro", () => {
    const vacios = bloques
      .filter(([, , kind, b]) => kind !== "innate" && b.text.length === 0 && statsDe(b).length === 0)
      .map(([q]) => q);
    expect(vacios).toEqual([]);
  });
});

describe("el catálogo de ítems", () => {
  it("tiene el ícono de cada tipo que anuncia", () => {
    const perdidos = Object.entries(catalog.items).flatMap(([id, i]) =>
      (i.types ?? []).filter((t) => !catalog.icons[`tag_${t}`]).map((t) => `${nombre(id)}: ${t}`)
    );
    expect(perdidos).toEqual([]);
  });

  /** Una mejora que apunta a un ítem inexistente dibujaría una fila sin nombre. */
  it("no tiene mejoras que apunten a un ítem que no existe", () => {
    const rotas = Object.entries(catalog.items).flatMap(([id, i]) =>
      [...(i.upgradesTo ?? []), ...(i.upgradesFrom ?? [])]
        .filter((o) => !catalog.items[String(o)])
        .map((o) => `${nombre(id)} → ${o}`)
    );
    expect(rotas).toEqual([]);
  });
});
