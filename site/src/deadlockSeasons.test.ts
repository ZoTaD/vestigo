import { describe, expect, it } from "vitest";
import { SEASONS, defaultSeason, inSeason, ladderSeason, seasonAt, seasonParams } from "./deadlockSeasons";

const S2 = SEASONS[1].start;
const DAY = 86400;

describe("temporadas", () => {
  it("el corte del 5/11 22:00 UTC separa la 1 de la 2", () => {
    expect(seasonAt(S2 - 1)?.id).toBe(1);
    expect(seasonAt(S2)?.id).toBe(2);
    expect(seasonAt(SEASONS[0].start - 1)).toBeNull();
  });

  it("la escalera sigue en la 1 la primera semana de la 2", () => {
    expect(ladderSeason(S2 + DAY)).toEqual({ season: SEASONS[0], final: true });
    expect(ladderSeason(S2 + 8 * DAY)).toEqual({ season: SEASONS[1], final: false });
    expect(ladderSeason(S2 - DAY)).toEqual({ season: SEASONS[0], final: false });
  });

  it("cada temporada pide su fin; la 2 cierra el 11/3/2027", () => {
    expect(seasonParams(SEASONS[0]).max_unix_timestamp).toBe(String(S2));
    expect(seasonParams(SEASONS[1]).max_unix_timestamp).toBe(String(Date.UTC(2027, 2, 11, 22) / 1000));
  });

  it("el perfil abre en la más nueva con 5 partidas", () => {
    const s1 = [1, 2, 3, 4, 5, 6].map((i) => S2 - i * DAY);
    expect(defaultSeason([...s1, S2 + 10])).toBe(1);
    expect(defaultSeason([...s1, ...[1, 2, 3, 4, 5].map((i) => S2 + i)])).toBe(2);
    expect(defaultSeason([S2 + 1])).toBe(2);
    expect(defaultSeason([SEASONS[0].start - DAY])).toBe("all");
  });

  it("'all' deja pasar todo", () => {
    expect(inSeason(0, "all")).toBe(true);
    expect(inSeason(S2, 1)).toBe(false);
  });
});
