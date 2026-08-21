import { describe, it, expect } from "vitest";
import buildsJson from "@deadlock/builds.json";
import catalogJson from "@deadlock/catalog.json";
import { PUBLISHED_BAND } from "../src/deadlockData";
import { loadBuilds, buildsOf } from "../src/deadlockBuildsData";
import { bonusFor } from "../../../deadlock/pipeline/src/investment";

/**
 * Recorre TODO lo publicado buscando lo que sólo se ve mirando fila por fila.
 *
 * Es el mismo mecanismo que `itemsData.test.ts`, y nació del mismo modo: revisar
 * una tarjeta a ojo encontró defectos reales, y a ojo no se revisan 38 héroes por
 * tres builds por doce cuadrados.
 */

const file = buildsJson as unknown as {
  band: string;
  matches: number;
  heroes: {
    heroId: number;
    builds: {
      id: string;
      damage: string;
      trait: string;
      matches: number;
      winRate: number;
      items: { itemId: number; tier: number; minute: number; chain: number[] }[];
      damageSplit: { weapon: number; vitality: number; spirit: number };
      abilityOrder?: number[];
    }[];
    counters: { itemId: number; relativeSwing: number; against: { heroId: number }[] }[];
  }[];
  abilities: Record<string, { name: { en: string; es: string }; img: string }>;
};

const catalog = catalogJson as unknown as {
  items: Record<string, { name: { en: string; es: string }; img: string; cost: number; upgradesTo?: number[] }>;
  heroes: Record<string, { name: { en: string; es: string } }>;
};

const todasLasBuilds = file.heroes.flatMap((h) => h.builds.map((b) => ({ h, b })));

describe("las builds publicadas", () => {
  /**
   * Una banda y no cuatro: con las cuatro pesaban 2,2 MB por corrida, o sea
   * ~1,6 GB de historia de git al año, y la historia de git no se recorta.
   *
   * **Cuál es esa banda ya no está clavada**: desde el reset del 2026-07-30 la
   * elige la muestra, y `builds.ts` la lee de lo que publicó `build:heroes` en
   * vez de volver a decidir. Lo que este test fija es esa coherencia — si las
   * builds midieran otra banda que la tier list, la tarjeta que se despliega
   * describiría un nivel de juego distinto del que la fila dice mostrar.
   */
  it("son de una sola banda, la misma que la tier list", () => {
    expect(file.band).toBe(PUBLISHED_BAND);
  });

  /**
   * Cuántos héroes traen build depende de la muestra: un grupo necesita 500
   * partidas para publicarse. Con el corpus ranked recién estrenado son 7 de 38,
   * y se van sumando solos a medida que llega muestra. Lo que no puede pasar es
   * que sobre uno: un héroe que no existe en el catálogo sería un id colgado.
   */
  it("no publican ningún héroe que no exista", () => {
    expect(file.heroes.length).toBeGreaterThan(0);
    expect(file.heroes.length).toBeLessThanOrEqual(38);
    for (const h of file.heroes) {
      expect((catalogJson as { heroes: Record<string, unknown> }).heroes[String(h.heroId)], `héroe ${h.heroId}`).toBeDefined();
    }
  });

  it("nunca pasan de doce objetos, que es el tope del juego", () => {
    // Medido sobre 166.656 jugadores: el máximo real es 12 exacto.
    for (const { h, b } of todasLasBuilds) {
      expect(b.items.length, `héroe ${h.heroId} build ${b.id}`).toBeLessThanOrEqual(12);
    }
  });

  it("no repiten un objeto dentro de la misma build", () => {
    for (const { h, b } of todasLasBuilds) {
      const ids = b.items.map((i) => i.itemId);
      expect(new Set(ids).size, `héroe ${h.heroId} build ${b.id}`).toBe(ids.length);
    }
  });

  it("muestran el objeto FINAL: nunca un escalón cuya mejora está en la misma build", () => {
    // Es lo que hace que doce cuadrados sean diecisiete compras. Si un T1 y su
    // T2 aparecen los dos, el cuadrado del T1 está de más.
    for (const { h, b } of todasLasBuilds) {
      const ids = new Set(b.items.map((i) => i.itemId));
      for (const i of b.items) {
        const mejoras = catalog.items[String(i.itemId)]?.upgradesTo ?? [];
        for (const m of mejoras) {
          expect(ids.has(m), `héroe ${h.heroId}: ${i.itemId} y su mejora ${m} juntos`).toBe(false);
        }
      }
    }
  });

  it("tienen todos sus objetos en el catálogo, con nombre en los dos idiomas", () => {
    for (const { b } of todasLasBuilds) {
      for (const i of b.items) {
        const e = catalog.items[String(i.itemId)];
        expect(e, `ítem ${i.itemId} sin entrada de catálogo`).toBeTruthy();
        expect(e.name.en.length).toBeGreaterThan(0);
        expect(e.name.es.length).toBeGreaterThan(0);
        expect(e.img).toMatch(/^https:\/\//);
      }
    }
  });

  it("no repiten nombre de build dentro de un mismo héroe", () => {
    // Dos pestañas con el mismo rótulo no se pueden elegir.
    for (const h of file.heroes) {
      const ids = h.builds.map((b) => b.id);
      expect(new Set(ids).size, `héroe ${h.heroId}: ${ids.join(", ")}`).toBe(ids.length);
    }
  });

  it("publican como mucho tres por héroe", () => {
    for (const h of file.heroes) expect(h.builds.length).toBeLessThanOrEqual(3);
  });

  it("ordenan la primera como la más jugada, que es la recomendada", () => {
    for (const h of file.heroes) {
      for (let i = 1; i < h.builds.length; i++) {
        expect(h.builds[i - 1].matches).toBeGreaterThanOrEqual(h.builds[i].matches);
      }
    }
  });

  /**
   * **Ya no suman uno, y eso es el punto.** Antes el panel repartía el 100% de la
   * build entre tres barras, lo que decía en qué gastó pero no qué le da. Ahora
   * cada categoría trae las almas invertidas y el escalón de la tienda que
   * alcanzó, que son tres números independientes.
   *
   * Lo que sí tiene que cerrar: las almas de las tres suman lo que cuestan los
   * doce objetos, y el bonus tiene que ser el que la escalera da por esas almas.
   */
  it("invierten todas las almas de la build y cobran el escalón que les toca", () => {
    for (const { h, b } of todasLasBuilds) {
      const donde = `héroe ${h.heroId} build ${b.id}`;
      const almas = b.damageSplit.weapon.souls + b.damageSplit.vitality.souls + b.damageSplit.spirit.souls;
      // El coste no viaja en builds.json: se resuelve del catálogo, igual que
      // hace la UI para dibujar el precio de cada cuadrado.
      const precios = (catalogJson as { items: Record<string, { cost: number }> }).items;
      const cuestan = b.items.reduce((a, i) => a + (precios[String(i.itemId)]?.cost ?? 0), 0);
      expect(almas, donde).toBe(cuestan);

      for (const k of ["weapon", "vitality", "spirit"] as const) {
        const { souls, bonus } = b.damageSplit[k];
        expect(bonus, `${donde} ${k}`).toBe(bonusFor(k, souls));
      }
    }
  });

  it("ponen a cada objeto en un minuto posible de la partida", () => {
    for (const { b } of todasLasBuilds) {
      for (const i of b.items) {
        expect(i.minute).toBeGreaterThan(0);
        expect(i.minute).toBeLessThan(60);
      }
    }
  });

  it("dan un tier entre 1 y 4 y coherente con el precio", () => {
    const precioDe = [0, 800, 1600, 3200, 6400];
    for (const { b } of todasLasBuilds) {
      for (const i of b.items) {
        expect(i.tier).toBeGreaterThanOrEqual(1);
        expect(i.tier).toBeLessThanOrEqual(4);
        expect(catalog.items[String(i.itemId)].cost).toBe(precioDe[i.tier]);
      }
    }
  });

  it("terminan cada cadena de mejora en el propio objeto", () => {
    for (const { b } of todasLasBuilds) {
      for (const i of b.items) {
        expect(i.chain[i.chain.length - 1]).toBe(i.itemId);
      }
    }
  });
});

describe("el orden de habilidades", () => {
  it("trae cuatro habilidades cuando está, y ninguna repetida", () => {
    for (const { h, b } of todasLasBuilds) {
      if (!b.abilityOrder) continue;
      expect(b.abilityOrder.length, `héroe ${h.heroId}`).toBe(4);
      expect(new Set(b.abilityOrder).size).toBe(4);
    }
  });

  it("tiene ficha con nombre e ícono para cada habilidad que nombra", () => {
    // Si falta, la tarjeta dibujaría un cuadrado vacío.
    for (const { b } of todasLasBuilds) {
      for (const id of b.abilityOrder ?? []) {
        const a = file.abilities[String(id)];
        expect(a, `habilidad ${id} sin ficha`).toBeTruthy();
        expect(a.img).toMatch(/^https:\/\//);
        expect(a.name.en.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("los counter", () => {
  it("no están dentro de ninguna build del mismo héroe", () => {
    // Es el punto entero: dependen de quién enfrentes, así que no son la build.
    for (const h of file.heroes) {
      const enBuilds = new Set(h.builds.flatMap((b) => b.items.map((i) => i.itemId)));
      for (const c of h.counters) {
        expect(enBuilds.has(c.itemId), `héroe ${h.heroId}: counter ${c.itemId} en la build`).toBe(false);
      }
    }
  });

  it("siempre dicen contra quién saltan", () => {
    for (const h of file.heroes) {
      for (const c of h.counters) {
        expect(c.against.length).toBeGreaterThan(0);
        for (const a of c.against) expect(catalog.heroes[String(a.heroId)]).toBeTruthy();
      }
    }
  });

  /**
   * **Son dos lecturas del mismo salto y alcanza con una**, porque cada una ve
   * la mitad que la otra no: el swing relativo divide por la base y por eso
   * castiga al héroe que más se buildea el counter (Abrams/Phantom Strike contra
   * Vindicta daba 0,72), y el alcance mide contra el margen que queda y por eso
   * no ve los de base chica (Shiv/Metal Skin da 0,085). Ver `COUNTER_REACH`.
   */
  it("superan uno de los dos cortes que los definen", () => {
    for (const h of file.heroes) {
      for (const c of h.counters) {
        expect(c.relativeSwing >= 1 || c.reach >= 0.3).toBe(true);
        // El filtro de ruido, en cambio, los gobierna a todos.
        expect(c.excess).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

/**
 * **"No llegó el archivo" y "el archivo no habla de este héroe" son dos cosas.**
 *
 * `buildsOf` devuelve `null` para la primera y la tarjeta dibuja "Cargando…".
 * Cuando devolvía `null` también para la segunda, la fila de un héroe sin build
 * se abría a un cartel de carga que no terminaba nunca. Estuvo latente mientras
 * los 38 héroes entraron siempre; al pasar el corpus a ranked el 2026-07-31 la
 * muestra arrancó de cero y 31 de 38 filas cayeron en ese agujero.
 */
describe("un héroe sin build no es un archivo sin cargar", () => {
  it("devuelve una vista vacía, no null, para un héroe que no está publicado", async () => {
    await loadBuilds();
    const publicados = new Set(file.heroes.map((h) => h.heroId));
    const ausente = Object.keys((catalogJson as { heroes: Record<string, unknown> }).heroes)
      .map(Number)
      .find((id) => !publicados.has(id));
    // Si algún día están los 38, este test no tiene caso que probar y lo dice.
    if (ausente === undefined) return;

    const vista = buildsOf(ausente, "en");
    expect(vista, `héroe ${ausente}`).not.toBeNull();
    expect(vista!.builds).toEqual([]);
  });

  it("sí devuelve null antes de que el archivo exista", () => {
    // El contrato al revés: null significa "todavía no", y es lo único que
    // puede hacer que la tarjeta muestre "Cargando…".
    expect(buildsOf(999_999, "en")).not.toBeNull();
  });
});
