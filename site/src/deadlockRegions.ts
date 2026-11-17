/**
 * La región del servidor donde juega cada cuenta (2026-11-17).
 *
 * Sale de `/v1/players/region`, que la deduce de los servidores de sus
 * partidas: es más fiel que el país de Steam, que la mitad no tiene puesto y
 * que no dice dónde juega nadie.
 *
 * **Tiene que decir lo mismo que `regionOf` de
 * `games/deadlock/pipeline/src/heroBoards.ts`**: las tablas por héroe salen de
 * allá y las de estadísticas se arman acá, en vivo.
 */

export type Region = "NA" | "EU" | "SA" | "AS" | "OC";
export const REGIONS: Region[] = ["NA", "EU", "SA", "AS", "OC"];

export function regionOf(server: string | null | undefined): Region | null {
  if (!server) return null;
  const s = server.toLowerCase();
  if (/^(us_|usa|canada)/.test(s)) return "NA";
  if (/(south_america|argentina|brazil|sao_paulo|chile|santiago|peru|lima|colombia|bogota)/.test(s)) return "SA";
  if (/(australia|sydney|oceania|new_zealand|auckland)/.test(s)) return "OC";
  if (/(hong_kong|singapore|japan|tokyo|korea|seoul|china|shanghai|guangzhou|taiwan|india|mumbai|chennai|asia|dubai|bahrain)/.test(s)) return "AS";
  if (/^(eu_|dpkt-|europe)|london|helsinki|falkenstein|poland|warsaw|stockholm|frankfurt|amsterdam|paris|madrid|vienna|luxembourg/.test(s)) return "EU";
  return null;
}

const API = "https://api.deadlock-api.com/v1";

/** Las regiones de un lote de cuentas, en pedidos de 500. Un pedido que falla deja esas cuentas sin región. */
export async function fetchRegions(accounts: number[]): Promise<Map<number, Region | null>> {
  const out = new Map<number, Region | null>();
  for (let k = 0; k < accounts.length; k += 500) {
    const part = accounts.slice(k, k + 500);
    try {
      const res = await fetch(`${API}/players/region?${part.map((a) => `account_ids=${a}`).join("&")}`);
      if (res.ok) {
        for (const r of (await res.json()) as { account_id: number; region: string | null }[]) {
          out.set(r.account_id, regionOf(r.region));
        }
      }
    } catch {
      /* sin región, pero con tabla */
    }
  }
  return out;
}
