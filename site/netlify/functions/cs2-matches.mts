/**
 * Los partidos de CS2 al día (2026-11-03, etapa 6a): Liquipedia no deja leerse desde el navegador de cada visitante
 * (pide cachear y un pedido cada 30 s), así que esta función lo pide y la CDN lo guarda 10 minutos. La lógica está en
 * `src/cs2/esports/handler.ts` (con tests); acá sólo se conecta.
 */
import { handleMatches } from "../../src/cs2/esports/handler";

export default (): Promise<Response> => handleMatches();

export const config = { path: "/api/cs2/matches" };
