/**
 * El intermediario de CoH3 (2026-11-04): la API de Relic no manda CORS, así que el ranking, el jugador, la partida y la
 * búsqueda pasan por acá. Toda la lógica está en `src/coh3/api/handler.ts` (con tests); acá sólo se conecta.
 * No registra nada.
 */
import { handleCoh3 } from "../../src/coh3/api/handler";

export default (req: Request): Promise<Response> => handleCoh3(new URL(req.url), fetch, req.method);

export const config = { path: "/api/coh3/*" };
