import { describe, it, expect } from "vitest";
import { buildCatalog, isPlayable, isShopItem, parseLoc, buildDetail, unidad, tiposDe } from "../src/catalog";

const heroe = (id: number, name: string, extra = {}) => ({
  id,
  name,
  player_selectable: true,
  images: { icon_image_small_webp: `h${id}.webp`, icon_hero_card_webp: `c${id}.webp` },
  ...extra,
});

const item = (id: number, name: string, extra = {}) => ({
  id,
  name,
  type: "upgrade" as const,
  shopable: true,
  cost: 3200,
  item_tier: 3,
  item_slot_type: "spirit" as const,
  shop_image: `i${id}.png`,
  ...extra,
});

/**
 * El filtro de ítems de tienda se validó igual que el de héroes: contra los
 * datos, no contra una lista escrita a mano.
 *
 * `shopable === true` deja **23 / 43 / 46 / 44** ítems para 800 / 1600 / 3200 /
 * 6400, que son exactamente los 156 que aparecen comprados en el snapshot. Dos
 * fuentes que nadie cruzó y que coinciden.
 */
describe("qué ítems entran al catálogo", () => {
  it("se queda con los de tienda", () => {
    expect(isShopItem(item(1, "Torment Pulse"))).toBe(true);
  });

  it("deja afuera los que no se compran en la tienda", () => {
    expect(isShopItem(item(2, "Interno", { shopable: false }))).toBe(false);
  });

  it("deja afuera las habilidades, que comparten la tabla con los ítems", () => {
    expect(isShopItem(item(3, "Bomba", { type: "ability", cost: null }))).toBe(false);
  });

  /**
   * Los de 9999 son los ítems de Street Brawl. Se caen acá **y** en el filtro de
   * modo del pipeline: la lista y los números tienen que hablar del mismo juego,
   * y que un ítem exista en el catálogo pero nunca en los datos dejaría una fila
   * vacía esperando.
   */
  it("deja afuera los de coste 9999, que son de Street Brawl", () => {
    expect(isShopItem(item(4, "Mystic Conduit", { cost: 9999, item_tier: 5 }))).toBe(false);
  });

  it("deja afuera el que no tiene imagen de tienda, en vez de dibujar una fila rota", () => {
    expect(isShopItem(item(5, "Sin dibujo", { shop_image: undefined }))).toBe(false);
  });
});

describe("el catálogo cruza los dos idiomas", () => {
  const cat = buildCatalog(
    [heroe(1, "Infernus")],
    [heroe(1, "Infernus")],
    [{ tier: 9, name: "Phantom", images: { small_subrank1_webp: "p.webp" }, color: "#fff" }],
    [{ tier: 9, name: "Fantasma", images: { small_subrank1_webp: "p.webp" }, color: "#fff" }],
    [item(10, "Extended Magazine", { cost: 800, item_tier: 1, item_slot_type: "weapon" })],
    [item(10, "Cargador Ampliado", { cost: 800, item_tier: 1, item_slot_type: "weapon" })],
    "2026-07-30T00:00:00Z"
  );

  it("trae el nombre del ítem en los dos idiomas", () => {
    expect(cat.items["10"].name).toEqual({ en: "Extended Magazine", es: "Cargador Ampliado" });
  });

  it("guarda precio, tier y categoría, que es por lo que se agrupa", () => {
    expect(cat.items["10"]).toMatchObject({ cost: 800, tier: 1, slot: "weapon", img: "i10.png" });
  });

  // La mitad de los ítems se llaman igual en los dos idiomas, así que la
  // ausencia de traducción cae al inglés en vez de dejar el nombre vacío.
  it("cae al inglés cuando falta la traducción", () => {
    const sinEs = buildCatalog([], [], [], [], [item(11, "Warp Stone")], [], "2026-07-30T00:00:00Z");
    expect(sinEs.items["11"].name).toEqual({ en: "Warp Stone", es: "Warp Stone" });
  });

  it("sigue armando los héroes como antes", () => {
    expect(isPlayable(heroe(1, "Infernus"))).toBe(true);
    expect(Object.keys(cat.heroes)).toEqual(["1"]);
  });
});

/**
 * El texto de las descripciones viene con HTML del juego adentro, y **nada de
 * eso puede llegar al DOM**. Medido sobre los 156 ítems: 39 traen `<svg>`,
 * `<img>` o `<path>` incrustados, y 125 usan `<span class="highlight">`.
 *
 * Estos tests fijan las dos mitades del trato: el resaltado sobrevive como una
 * bandera, y todo lo demás se descarta acá, en el build.
 */
describe("el texto del juego se parsea, no se vuelca", () => {
  it("conserva el resaltado como bandera, no como etiqueta", () => {
    expect(parseLoc('Become <span class="highlight">immune to bullets</span>.')).toEqual([
      { t: "Become " },
      { t: "immune to bullets", hi: true },
      { t: "." },
    ]);
  });

  /**
   * El espacio del medio es información y el de las puntas es basura. Uniendo
   * pedazos recortados con un espacio fijo salía "inmune a las balas ." — el
   * punto separado de la frase.
   */
  it("conserva el espaciado de adentro y recorta el de las puntas", () => {
    expect(parseLoc('  A <span class="highlight">B</span> C  ')).toEqual([
      { t: "A " },
      { t: "B", hi: true },
      { t: " C" },
    ]);
  });

  it("tira el markup incrustado en vez de dejarlo pasar", () => {
    const sucio = 'Gain <svg viewBox="0 0 2 2"><path d="M0 0"/></svg> 12 <img src="x.png"> resist';
    const spans = parseLoc(sucio);
    const texto = spans.map((s) => s.t).join(" ");
    expect(texto).not.toMatch(/[<>]/);
    expect(texto).toContain("12");
    expect(texto).toContain("resist");
  });

  /** La razón de fondo: nada que venga de afuera puede volver a ser markup. */
  it("no deja pasar una etiqueta inyectada", () => {
    const spans = parseLoc('<img src=x onerror="alert(1)">hola<script>alert(2)</script>');
    expect(spans.every((s) => !s.t.includes("<"))).toBe(true);
    expect(spans.map((s) => s.t).join("")).not.toContain("alert");
  });

  it("no devuelve nada cuando no hay texto", () => {
    expect(parseLoc(undefined)).toEqual([]);
    expect(parseLoc("   ")).toEqual([]);
    expect(parseLoc("<span></span>")).toEqual([]);
  });
});

describe("la ficha del ítem copia el agrupamiento del juego", () => {
  const crudo = {
    id: 1,
    name: "Metal Skin",
    type: "upgrade",
    shopable: true,
    cost: 3200,
    item_tier: 3,
    item_slot_type: "vitality" as const,
    shop_image: "i.png",
    is_active_item: true,
    properties: {
      BulletResist: { value: 12, label: "Bullet Resist", postfix: "%", icon: "a.svg", css_class: "bullet_armor_up" },
      AbilityCooldown: { value: 24, label: "Cooldown", postfix: "s", css_class: "cooldown" },
      SinEtiqueta: { value: 9 },
    },
    tooltip_sections: [
      { section_type: "innate", section_attributes: [{ properties: ["BulletResist"] }] },
      {
        section_type: "active",
        section_attributes: [
          {
            loc_string: 'Become <span class="highlight">immune to bullets</span>.',
            properties: ["AbilityCooldown", "SinEtiqueta", "NoExiste"],
          },
        ],
      },
    ],
  };

  const ficha = buildDetail(crudo);

  it("mantiene las secciones que el juego declara, en su orden", () => {
    expect(ficha.sections.map((s) => s.kind)).toEqual(["innate", "active"]);
  });

  it("resuelve cada stat con su etiqueta y su unidad", () => {
    expect(ficha.sections[0].blocks[0].stats).toEqual([
      { label: "Bullet Resist", value: "12", unit: "%", icon: "bullet_armor_up" },
    ]);
  });

  /**
   * El juego dibuja el tiempo de recarga en una pastilla aparte, a la derecha del
   * encabezado de la sección — no como una línea más entre las stats.
   */
  it("saca el tiempo de recarga de la lista y lo pone aparte", () => {
    const activa = ficha.sections[1].blocks[0];
    expect(activa.cooldown).toMatchObject({ label: "Cooldown", value: "24" });
    expect(activa.stats.map((s) => s.label)).not.toContain("Cooldown");
  });

  // Una stat sin etiqueta sería un número suelto sin decir de qué, y una que no
  // existe en `properties` no tiene valor que mostrar.
  it("descarta la stat sin etiqueta y la que no existe", () => {
    const activa = ficha.sections[1].blocks[0];
    const todas = [...activa.stats, ...activa.boxed, ...(activa.cooldown ? [activa.cooldown] : [])];
    expect(todas.map((s) => s.label)).toEqual(["Cooldown"]);
  });

  it("marca el ítem activo, que es lo que el juego dice", () => {
    expect(ficha.active).toBe(true);
    expect(buildDetail({ ...crudo, is_active_item: false }).active).toBeUndefined();
  });

  it("no inventa secciones para un ítem sin ficha", () => {
    expect(buildDetail({ id: 2, name: "x" }).sections).toEqual([]);
  });
});

/**
 * El juego manda la unidad aparte, pero en 124 de las 958 stats el valor ya la
 * trae adentro. Pegarlas a ciegas dibujaba "8m m".
 */
describe("el valor y su unidad", () => {
  it("no repite la unidad que el valor ya trae", () => {
    expect(unidad("8m", "m")).toEqual({ value: "8m", unit: "" });
    expect(unidad("8m", " m")).toEqual({ value: "8m", unit: "" });
  });

  it("la agrega cuando falta, y sin el espacio de adelante", () => {
    expect(unidad("12", " %")).toEqual({ value: "12", unit: "%" });
    expect(unidad("24", "s")).toEqual({ value: "24", unit: "s" });
  });

  /** "4m" con postfix "m/s" salía "4mm/s": la cola del valor era el principio
   *  de la unidad, no la unidad entera. */
  it("no duplica cuando la cola del valor es el principio de la unidad", () => {
    expect(unidad("4m", "m/s")).toEqual({ value: "4", unit: "m/s" });
    expect(unidad("-1.5m", "m/s")).toEqual({ value: "-1.5", unit: "m/s" });
  });

  it("no inventa unidad donde el juego no manda ninguna", () => {
    expect(unidad("3", undefined)).toEqual({ value: "3", unit: "" });
    expect(unidad("3", "  ")).toEqual({ value: "3", unit: "" });
  });
});

/**
 * Que la propiedad exista no significa que el ítem la dé.
 *
 * Metal Skin declara `tech_damage` con etiqueta "Spirit Power" y valor 0, así que
 * la fila lo anunciaba como daño de espíritu siendo un ítem de inmunidad a balas.
 * El filtro son las dos cosas que usa el propio juego: valor distinto de cero, y
 * que la propiedad esté entre las que muestra para ese ítem.
 */
describe("qué tipo anuncia la fila del ítem", () => {
  const prop = (css: string, value: string | number) => ({
    value,
    label: css,
    icon: `${css}.svg`,
    css_class: css,
  });

  const item = (props: Record<string, ReturnType<typeof prop>>, mostradas: string[]) => ({
    id: 1,
    name: "x",
    properties: props,
    tooltip_sections: [{ section_type: "innate", section_attributes: [{ properties: mostradas }] }],
  });

  it("anuncia la que el juego muestra y tiene valor", () => {
    const icons = new Map<string, string>();
    expect(tiposDe(item({ a: prop("tech_damage", 15) }, ["a"]), icons)).toEqual(["tech_damage"]);
    // La clave del tipo apunta a la etiqueta de build del juego, que es otro set
    // que el ícono de la stat: ése va adentro de la tarjeta, al lado del número.
    expect(icons.get("tag_tech_damage")).toMatch(/citadel_build_tag_spirit\.svg$/);
  });

  it("descarta la que vale cero, que es el caso de Metal Skin", () => {
    expect(tiposDe(item({ a: prop("tech_damage", 0) }, ["a"]), new Map())).toEqual([]);
    expect(tiposDe(item({ a: prop("tech_damage", "0") }, ["a"]), new Map())).toEqual([]);
  });

  it("descarta la que el juego no muestra para ese ítem", () => {
    expect(tiposDe(item({ a: prop("health", 100) }, []), new Map())).toEqual([]);
  });

  it("no anuncia lo que no es daño ni vida", () => {
    expect(tiposDe(item({ a: prop("cooldown", 24) }, ["a"]), new Map())).toEqual([]);
  });

  // Dos ítems que dan lo mismo tienen que mostrar sus íconos en el mismo orden,
  // o el ojo cree que son distintos.
  it("ordena siempre igual, sin importar el orden de las propiedades", () => {
    const a = tiposDe(item({ x: prop("health", 5), y: prop("bullet_damage", 5) }, ["x", "y"]), new Map());
    const b = tiposDe(item({ y: prop("bullet_damage", 5), x: prop("health", 5) }, ["y", "x"]), new Map());
    expect(a).toEqual(["bullet_damage", "health"]);
    expect(a).toEqual(b);
  });
});
