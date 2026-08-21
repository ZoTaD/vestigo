import { describe, it, expect, vi, afterEach } from "vitest";
import { RiotClient } from "../src/riot/client";

const cfg = { riotApiKey: "k", region: "na1", routingRegion: "americas" };
// No throttle, ~instant backoff: the retry logic is what we are testing, not timing.
const fast = () => new RiotClient(cfg, { minIntervalMs: 0, maxRetries: 4, backoffBaseMs: 1 });

function respond(...statuses: number[]) {
  let i = 0;
  return vi.fn(async () => {
    const status = statuses[Math.min(i++, statuses.length - 1)];
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: () => null },
      json: async () => [{ puuid: "p1" }],
      text: async () => `body ${status}`,
    } as unknown as Response;
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("RiotClient gateway-error handling", () => {
  it("retries a 520 and succeeds once Riot recovers", async () => {
    const fetchMock = respond(520, 520, 200);
    vi.stubGlobal("fetch", fetchMock);

    const out = await fast().challenger();
    expect(out).toEqual([{ puuid: "p1" }]);
    // Two failures then the win: three calls, not one.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a 504 gateway timeout the same way", async () => {
    const fetchMock = respond(504, 200);
    vi.stubGlobal("fetch", fetchMock);
    await expect(fast().challenger()).resolves.toEqual([{ puuid: "p1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry cap so a real outage cannot spin forever", async () => {
    const fetchMock = respond(520);
    vi.stubGlobal("fetch", fetchMock);
    await expect(fast().challenger()).rejects.toThrow(/520/);
    // Initial try plus maxRetries, no more.
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("does not retry a 404, which is an answer, not an outage", async () => {
    const fetchMock = respond(404);
    vi.stubGlobal("fetch", fetchMock);
    await expect(fast().challenger()).rejects.toThrow(/404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * The startTime filter is the puller's biggest lever on quota, and it fails
 * silently when it is wrong: Riot answers an unfiltered list, or an empty one,
 * with a 200 either way. So the URL is asserted rather than trusted.
 */
describe("matchIdsByPuuid query string", () => {
  const urlOf = (mock: ReturnType<typeof respond>) => String(mock.mock.calls[0][0]);

  it("asks only for count when no window is given", async () => {
    const fetchMock = respond(200);
    vi.stubGlobal("fetch", fetchMock);
    await fast().matchIdsByPuuid("puuid-1", 50);
    const url = urlOf(fetchMock);
    expect(url).toContain("/tft/match/v1/matches/by-puuid/puuid-1/ids");
    expect(url).toContain("count=50");
    expect(url).not.toContain("startTime");
  });

  it("passes startTime through as given, in seconds", async () => {
    const fetchMock = respond(200);
    vi.stubGlobal("fetch", fetchMock);
    await fast().matchIdsByPuuid("puuid-1", 100, 1784116732);
    const url = urlOf(fetchMock);
    expect(url).toContain("count=100");
    expect(url).toContain("startTime=1784116732");
  });

  // Zero is a real epoch, not "unset", and dropping it would quietly widen the
  // window to all of history.
  it("keeps a startTime of zero rather than treating it as absent", async () => {
    const fetchMock = respond(200);
    vi.stubGlobal("fetch", fetchMock);
    await fast().matchIdsByPuuid("puuid-1", 20, 0);
    expect(urlOf(fetchMock)).toContain("startTime=0");
  });
});
