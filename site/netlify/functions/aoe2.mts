/**
 * El intermediario de Age of Empires II (2026-11-20): la API de World's Edge no manda CORS, así que el ranking, el
 * jugador, la partida y la búsqueda pasan por acá. Toda la lógica está en `src/aoe2/api/handler.ts` (con tests); acá
 * sólo se conecta. No registra nada.
 */
import { handleAoe2 } from "../../src/aoe2/api/handler";

export default (req: Request): Promise<Response> => handleAoe2(new URL(req.url), fetch, req.method);

export const config = { path: "/api/aoe2/*" };
