/**
 * El contrato de Trade-up en la dirección (2026-11-03), para compartirlo o recargar sin perderlo:
 * `?t=st&f=15&i=<slug>~<float>,<slug>~<float>…`. `t`: n (normal, por defecto), st o sv; `f`: comisión en %. Lo que no se
 * entiende (un slug que no existe, un float que no es número) se ignora sin romper la página.
 */
import type { Input, Kind } from "./engine";

export interface ContractState {
  kind: Kind;
  /** De 0 a 1. */
  fee: number;
  inputs: Input[];
}

export const DEFAULT_FEE = 0.12;
const MAX = 10;

export function readContract(search: string, known: (slug: string) => boolean): ContractState {
  const p = new URLSearchParams(search);
  const t = p.get("t");
  const kind: Kind = t === "st" || t === "sv" ? t : "n";
  const f = Number(p.get("f"));
  const fee = p.has("f") && Number.isFinite(f) && f >= 0 && f < 100 ? f / 100 : DEFAULT_FEE;
  const inputs = (p.get("i") ?? "")
    .split(",")
    .flatMap((part) => {
      const [slug, raw] = part.split("~");
      const float = Number(raw);
      return slug && raw && Number.isFinite(float) && known(slug) ? [{ slug, float }] : [];
    })
    .slice(0, MAX);
  return { kind, fee, inputs };
}

export function writeContract(c: ContractState): string {
  const p = new URLSearchParams();
  if (c.kind !== "n") p.set("t", c.kind);
  if (Math.abs(c.fee - DEFAULT_FEE) > 1e-9) p.set("f", String(Math.round(c.fee * 1000) / 10));
  if (c.inputs.length) p.set("i", c.inputs.map((i) => `${i.slug}~${Math.round(i.float * 1e4) / 1e4}`).join(","));
  const s = p.toString().replace(/%7E/gi, "~").replace(/%2C/gi, ",");
  return s ? `?${s}` : "";
}
