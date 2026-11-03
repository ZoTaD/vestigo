/**
 * El intermediario del inventario de CS2 (2026-11-03, etapa 3): Steam no deja leer un inventario desde el navegador
 * (no manda CORS), así que esta función lo pide y devuelve la lista compacta. Toda la lógica está en
 * `src/cs2/inventory/handler.ts` (con tests); acá sólo se conecta. No registra nada.
 */
import { handleInventory } from "../../src/cs2/inventory/handler";

export default (req: Request): Promise<Response> => handleInventory(new URL(req.url));

export const config = { path: "/api/cs2/inventory" };
