import { describe, expect, it } from "vitest";
import { accountIdOf, checkAuthBody, claimedSteamId, isValidResponse, loginUrl, safeReturn } from "../src/steam";

const ORIGIN = "https://vestigo.gg";
const ID = "76561198012345678";

function steamReply(over: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "id_res",
    "openid.op_endpoint": "https://steamcommunity.com/openid/login",
    "openid.claimed_id": `https://steamcommunity.com/openid/id/${ID}`,
    "openid.identity": `https://steamcommunity.com/openid/id/${ID}`,
    "openid.return_to": `${ORIGIN}/api/auth/steam/callback?r=%2Fen%2Fdeadlock`,
    "openid.response_nonce": "2026-11-04T12:00:00Zabc",
    "openid.assoc_handle": "1234567890",
    "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    "openid.sig": "c2ln",
    ...over,
  });
}

describe("safeReturn", () => {
  it("deja pasar rutas del sitio", () => {
    expect(safeReturn("/en/deadlock/heroes?x=1#y")).toBe("/en/deadlock/heroes?x=1#y");
    expect(safeReturn("/")).toBe("/");
  });
  it("manda a la portada todo lo que podría salir del sitio", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil", "", null, undefined, "/a\nb", `/${"a".repeat(600)}`]) {
      expect(safeReturn(bad)).toBe("/");
    }
  });
});

describe("loginUrl", () => {
  it("pide el login con nuestro realm y una vuelta segura", () => {
    const u = new URL(loginUrl(ORIGIN, "//evil.com"));
    expect(u.origin + u.pathname).toBe("https://steamcommunity.com/openid/login");
    expect(u.searchParams.get("openid.realm")).toBe(ORIGIN);
    expect(u.searchParams.get("openid.mode")).toBe("checkid_setup");
    expect(u.searchParams.get("openid.return_to")).toBe(`${ORIGIN}/api/auth/steam/callback?r=%2F`);
  });
});

describe("claimedSteamId", () => {
  it("lee el ID de una respuesta bien formada", () => {
    expect(claimedSteamId(steamReply(), ORIGIN)).toBe(ID);
  });
  it("rechaza respuestas de otro lado o para otro sitio", () => {
    expect(claimedSteamId(steamReply({ "openid.op_endpoint": "https://evil.com/openid/login" }), ORIGIN)).toBeNull();
    expect(claimedSteamId(steamReply({ "openid.return_to": "https://evil.com/api/auth/steam/callback" }), ORIGIN)).toBeNull();
    expect(claimedSteamId(steamReply({ "openid.mode": "cancel" }), ORIGIN)).toBeNull();
  });
  it("rechaza IDs que no son de Steam o que no coinciden", () => {
    expect(claimedSteamId(steamReply({ "openid.claimed_id": "https://evil.com/openid/id/76561198012345678" }), ORIGIN)).toBeNull();
    expect(claimedSteamId(steamReply({ "openid.identity": "https://steamcommunity.com/openid/id/76561198000000000" }), ORIGIN)).toBeNull();
    expect(
      claimedSteamId(
        steamReply({
          "openid.claimed_id": "https://steamcommunity.com/openid/id/123",
          "openid.identity": "https://steamcommunity.com/openid/id/123",
        }),
        ORIGIN,
      ),
    ).toBeNull();
  });
});

describe("check_authentication", () => {
  it("reenvía sólo los openid.* con el mode cambiado", () => {
    const p = steamReply();
    p.set("extra", "x");
    const body = checkAuthBody(p);
    expect(body.get("openid.mode")).toBe("check_authentication");
    expect(body.get("openid.sig")).toBe("c2ln");
    expect(body.has("extra")).toBe(false);
  });
  it("sólo acepta is_valid:true", () => {
    expect(isValidResponse("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n")).toBe(true);
    expect(isValidResponse("ns:http://specs.openid.net/auth/2.0\nis_valid:false\n")).toBe(false);
    expect(isValidResponse("")).toBe(false);
  });
});

describe("accountIdOf", () => {
  it("pasa del ID de 64 bits al account_id", () => {
    expect(accountIdOf("76561197960265729")).toBe(1);
    expect(accountIdOf(ID)).toBe(52079950);
  });
});
