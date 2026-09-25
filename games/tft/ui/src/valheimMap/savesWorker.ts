/**
 * El Web Worker que lee la partida que suelta la persona (`saves/`): la
 * carpeta del mundo, un zip de ella o un personaje. Un mundo grande tarda unos
 * segundos: acá no traba la página. Nada se manda a ningún lado.
 */
import { readCharacter, readWorld, unzip } from "./saves";
import type { InputFile } from "./saves/contract";

type Msg = { kind: "world"; files: InputFile[] } | { kind: "zip"; data: Uint8Array } | { kind: "character"; file: InputFile };

self.onmessage = async (ev: MessageEvent<Msg>) => {
  const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
  try {
    const m = ev.data;
    if (m.kind === "character") post({ ok: true, result: readCharacter(m.file) });
    else if (m.kind === "zip") post({ ok: true, result: readWorld(await unzip(m.data)) });
    else post({ ok: true, result: readWorld(m.files) });
  } catch (e) {
    post({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
