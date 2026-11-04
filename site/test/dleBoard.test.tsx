import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import DeadlockDle from "../src/DeadlockDle";
import DleBoard, { type BoardProps } from "../src/dle/DleBoard";
import { LangContext, type Lang } from "../src/i18n";
import { parseRoute } from "../src/route";

const wrap = (node: ReactNode, lang: Lang = "en") =>
  renderToString(<LangContext.Provider value={{ lang, setLang: () => undefined }}>{node}</LangContext.Provider>);

const props = (over: Partial<BoardProps> = {}): BoardProps => ({
  mode: "heroes",
  number: 3,
  rows: [],
  hints: [],
  solved: false,
  error: null,
  busy: false,
  pool: [],
  signedIn: false,
  onGuess: () => undefined,
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("el tablero", () => {
  it("con el juego caído avisa y no pierde las filas", () => {
    const html = wrap(
      <DleBoard
        {...props({
          error: "Couldn't reach the game server, try again",
          rows: [{ guess: { id: "hero:13", name: "Haze", img: "/deadlock/game/images/heroes/haze_card.webp" }, cells: [{ key: "complexity", value: 1, mark: "ok" }] }],
        })}
      />,
    );
    expect(html).toContain("Couldn&#x27;t reach the game server, try again");
    expect(html).toContain("Haze");
  });

  it("marca números con flecha y formatea el winrate", () => {
    const html = wrap(
      <DleBoard
        {...props({
          rows: [
            {
              guess: { id: "hero:13", name: "Haze", img: "/x.webp" },
              cells: [
                { key: "health", value: 730, mark: "near", dir: "up" },
                { key: "winRate", value: 51.2, mark: "near", dir: "down" },
              ],
            },
          ],
        })}
      />,
    );
    expect(html).toContain("dle-c is-near");
    expect(html).toContain("▲");
    expect(html).toContain("51.2%");
  });
});

describe("el prerender de la pestaña", () => {
  it("dibuja el buscador y las columnas sin llamar a la API", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const html = wrap(<DeadlockDle route={parseRoute("/en/deadlock/dle/items")} navigate={() => undefined} />);
    expect(fetch).not.toHaveBeenCalled();
    expect(html).toContain("Type an item name");
    for (const col of ["Category", "Tier", "Cost", "Kind", "Upgrade of", "Gives"]) expect(html).toContain(col);
    expect(html).toContain("Ranking");
  });

  it("en español traduce la interfaz", () => {
    const html = wrap(<DeadlockDle route={parseRoute("/es/deadlock/dle")} navigate={() => undefined} />, "es");
    expect(html).toContain("Adiviná el héroe de hoy");
    expect(html).toContain("Complejidad");
  });
});

describe("el ranking", () => {
  it("lista el top y tu fila, con 'not played' si no jugaste", async () => {
    const { RankList } = await import("../src/dle/DleRanking");
    const data = { players: 2, top: [{ pos: 1, name: "Kaz", avatar: "", guesses: 2, ms: 41_000 }], me: null };
    const html = wrap(<RankList mode="items" data={data} limit={10} you="ZoTaD" />);
    expect(html).toContain("Kaz");
    expect(html).toContain("0:41");
    expect(html).toContain("ZoTaD");
    expect(html).toContain("not played");
    expect(wrap(<RankList mode="items" data={{ players: 0, top: [], me: null }} limit={10} you={null} />)).toContain("Nobody solved it yet");
  });
});

describe("el ranking en construcción", () => {
  it("la pestaña está gris, no es un enlace y dice En construcción", () => {
    const html = wrap(<DeadlockDle route={parseRoute("/en/deadlock/dle")} navigate={() => undefined} />);
    expect(html).toContain("Under construction");
    expect(html).not.toContain('href="/en/deadlock/dle/ranking"');
    expect(wrap(<DeadlockDle route={parseRoute("/es/deadlock/dle")} navigate={() => undefined} />, "es")).toContain("En construcción");
  });

  it("tu puesto sale como porcentaje cuando hay jugadores suficientes", async () => {
    const { standingText } = await import("../src/dle/standing");
    expect(standingText({ pos: 3, players: 600 })).toEqual({ kind: "top", value: "0.5" });
    expect(standingText({ pos: 1, players: 2000 })).toEqual({ kind: "top", value: "0.1" });
    expect(standingText({ pos: 120, players: 400 })).toEqual({ kind: "top", value: "30" });
    expect(standingText({ pos: 2, players: 8 })).toEqual({ kind: "place", value: "2", of: "8" });
  });
});
