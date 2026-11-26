/**
 * El país de un jugador de AoE2 (2026-11-26): el que puso en su perfil, salvo los profesionales, que van con el país que
 * representan (Nicov vive en Italia y compite por Argentina). La tabla la arma `games/aoe2/tools/pros.py`.
 */
import pros from "../../../../games/aoe2/data/pro_countries.json";

const PROS = pros as Record<string, string>;

export const paisDe = (profileId: number, pais: string | null | undefined): string | null => PROS[profileId] ?? (pais || null);
