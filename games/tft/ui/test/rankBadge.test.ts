import { describe, expect, it } from "vitest";
import { rankLabel, rankOf } from "../src/deadlockReportData";

/**
 * El 2026-08-13 llegó a producción un perfil que decía, debajo del avatar:
 *
 *   Emissary https://api.deadlock-api.com/v1/assets/ranks/7/4/image?format=webp
 *
 * `rankOf` devolvía la URL de la imagen del subnivel en un campo llamado `sub`,
 * y cuatro lugares distintos lo interpolaban como si fuera el número. Estos
 * tests fijan el contrato que evita que vuelva: **lo que se puede imprimir es un
 * número o un numeral, y lo que es una URL se llama `img`.**
 */
describe("la insignia de rango", () => {
  it("devuelve el subnivel como número, nunca como texto", () => {
    const r = rankOf(74);
    expect(r).not.toBeNull();
    expect(typeof r!.sub).toBe("number");
    expect(r!.sub).toBe(4);
  });

  it("nunca deja una URL en un campo que se pueda imprimir", () => {
    // El barrido es sobre TODOS los badges reales: 11 rangos x 6 subniveles.
    for (let tier = 1; tier <= 11; tier++) {
      for (let sub = 1; sub <= 6; sub++) {
        const r = rankOf(tier * 10 + sub);
        if (!r) continue;
        expect(String(r.sub)).not.toMatch(/https?:/);
        expect(r.roman).not.toMatch(/https?:/);
        expect(r.img).toMatch(/^https?:/);
      }
    }
  });

  /**
   * **El numeral tiene que cambiar con el subnivel y la imagen no.** Es lo que
   * separa "Eternus" de "Eternus IV": la insignia es una sola por rango y lo que
   * dice cuál de los seis es el numeral que dibujamos encima. Si el numeral se
   * repitiera, la lista de partidas volvería a mostrar seis manchas iguales, que
   * es el defecto que este cambio arregla.
   */
  it("da un numeral distinto por subnivel, y una sola imagen por rango", () => {
    for (let tier = 1; tier <= 11; tier++) {
      const romanos = new Set<string>();
      const imgs = new Set<string>();
      for (let sub = 1; sub <= 6; sub++) {
        const r = rankOf(tier * 10 + sub);
        if (!r) continue;
        romanos.add(r.roman);
        imgs.add(r.img);
      }
      expect([...romanos]).toEqual(["I", "II", "III", "IV", "V", "VI"]);
      expect(imgs.size).toBe(1);
    }
  });

  /**
   * **La placa donde se apoya el numeral está MEDIDA por rango**, restándole a
   * la insignia compuesta del juego la lisa. Un valor fijo dejaría el numeral
   * flotando fuera de la placa en la mitad de los rangos: el rango va de 72,8%
   * (Acólito) a 92,6% (Fantasma). Este test no re-mide — fija que la tabla
   * existe, que cubre los once rangos y que nadie la aplane sin querer.
   */
  it("sabe dónde va el numeral en cada rango, y no es el mismo lugar", () => {
    const bases = new Set<number>();
    for (let tier = 1; tier <= 11; tier++) {
      const r = rankOf(tier * 10 + 1);
      expect(r).not.toBeNull();
      expect(r!.subBase).toBeGreaterThan(0.6);
      expect(r!.subBase).toBeLessThan(1);
      // El numeral no puede caer fuera de la insignia ni a mitad del dibujo.
      expect(r!.ratio).toBeGreaterThan(1.2);
      expect(r!.ratio).toBeLessThan(1.3);
      bases.add(r!.subBase);
    }
    expect(bases.size).toBeGreaterThan(5);
  });

  it("separa el rango del subnivel como lo hace el juego", () => {
    // 74 = Emissary 4. La división entera es la que decide el rango: ojo con
    // `badge / 10` en motores donde eso redondea (ver `deadlock-ranked-y-reset`).
    expect(rankOf(74)!.sub).toBe(4);
    expect(rankOf(76)!.sub).toBe(6);
    expect(rankOf(11)!.sub).toBe(1);
  });

  it("no inventa una insignia cuando no hay rango", () => {
    // 0 no es Obscurus: es "todavía no calibró".
    expect(rankOf(0)).toBeNull();
    expect(rankOf(-1)).toBeNull();
  });
});

/**
 * **La escalera no termina en Eternus VI: el contador sigue.**
 *
 * Visto en producción el 2026-08-17 en el perfil del #1 del mundo (888853854),
 * que decía *"No ranked matches yet"* al lado de 104 clasificatorias y con la
 * columna de rango vacía en las 104 filas. Su badge es **123**, y llegó ahí
 * subiendo: `116 → 121` el 2026-08-15 a las 20:25 UTC, dos días antes.
 *
 * El rango 12 **no existe en ninguna fuente**: `assets/ranks` devuelve doce
 * entradas (0 Obscurus … 11 Eternus) en v1, en v2 y **también en la versión más
 * nueva del cliente** (6679), y `rank12_lg.webp` da 404. Lo que sí existe es la
 * prueba de que el juego lo llama Eternus igual:
 * `player_rank_initial_display_rank` —el rango que el juego MUESTRA— vale
 * **111 para todos los que pasan de 111**, badge 112, 113, 115 y 123 incluidos,
 * mientras que abajo de Eternus muestra el badge exacto (106 → 106, 105 → 105).
 *
 * O sea: arriba del último rango publicado no hay otro rango, hay **el mismo
 * rango** y un contador interno que ordena la cima de la escalera. Se dibuja el
 * último rango publicado y **sin numeral**, porque "Eternus III" sobre un badge
 * de 123 sería inventar un subnivel que el jugador ya pasó.
 */
describe("arriba del último rango publicado", () => {
  /**
   * **El bug de fondo, y el que no puede volver**: `rankOf` devolvía `null`
   * para dos cosas distintas —"no tiene rango" y "no sé nombrar este rango"—, y
   * el perfil leía ese `null` como lo primero. Con el badge en la mano, la
   * respuesta nunca puede ser "todavía no jugó clasificatorias".
   */
  it("nunca devuelve null con un badge encima", () => {
    for (let badge = 1; badge <= 200; badge++) {
      expect(rankOf(badge), `badge ${badge}`).not.toBeNull();
    }
  });

  it("dice Eternus, con la insignia de Eternus", () => {
    const cima = rankOf(116)!;
    for (const badge of [121, 122, 123, 126, 131, 200]) {
      const r = rankOf(badge)!;
      expect(r.name).toEqual(cima.name);
      expect(r.img).toBe(cima.img);
      expect(r.ratio).toBe(cima.ratio);
    }
  });

  it("no le pone numeral, porque ya pasó los seis", () => {
    for (const badge of [121, 123, 126, 200]) {
      const r = rankOf(badge)!;
      expect(r.roman).toBe("");
      expect(r.sub).toBe(0);
    }
    // Y el nombre que se imprime es el rango pelado, no "Eternus 0".
    expect(rankLabel(rankOf(123)!, "en")).toBe("Eternus");
    expect(rankLabel(rankOf(113)!, "en")).toBe("Eternus III");
  });

  /** Los seis subniveles de verdad siguen intactos: esto no toca a nadie más. */
  it("no le cambia el numeral a nadie que sí lo tenga", () => {
    for (let tier = 0; tier <= 11; tier++) {
      for (let sub = 1; sub <= 6; sub++) {
        expect(rankOf(tier * 10 + sub)!.sub).toBe(sub);
      }
    }
  });
});
