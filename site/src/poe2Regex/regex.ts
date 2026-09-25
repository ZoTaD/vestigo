/**
 * Arma el regex de la búsqueda del juego (sin DOM, para probarlo solo).
 *
 * Sintaxis que acepta el juego (la misma que usan poe2.re y las guías): cada
 * término entre comillas; varios términos separados por espacio tienen que
 * cumplirse todos; `|` es "o"; `!` al principio niega; `^` y `$` anclan a la
 * línea; `.` es cualquier letra, `\d` un dígito, `[3-9]` y `( | )` como siempre.
 * Sin mayúsculas y hasta 250 caracteres (0.5.0).
 *
 * Los pedazos de cada modificador los calcula `games/poe2/pipeline/regex.py`.
 */

export type GameLang = "en" | "es";
export type Pool = "waystone" | "tablet" | "gear" | "relic";

export interface RxLine {
  en: string;
  es: string;
  /** Mín. y máx. del primer número entre todos los grados, si tiene. */
  range: [number, number] | null;
  tags: string[];
  tok: Record<GameLang, string>;
  /** Dónde cae el pedazo dentro de la línea (en minúscula). */
  at: Record<GameLang, [number, number]>;
}

export interface RxData {
  pools: Record<Pool, RxLine[]>;
  header: Record<string, { en: string; es: string; tok_en: string; tok_es: string }>;
  rarity: { label: Record<GameLang, string>; values: Record<string, Record<GameLang, string>> };
  tier: Record<GameLang, string>;
  corrupted: Record<GameLang, string>;
}

export const MAX_CHARS = 250;

/** Un número entero ≥ n (hasta 999), sin ceros a la izquierda. */
export function geq(n: number): string {
  n = Math.floor(n);
  if (n <= 1) return "\\d+";
  const s = String(n);
  const L = s.length;
  const alts: string[] = [];
  for (let i = 0; i < L; i++) {
    const d = Number(s[i]);
    const pre = s.slice(0, i);
    const rest = "\\d".repeat(L - i - 1);
    if (i === L - 1) {
      alts.push(pre + (d === 9 ? "9" : `[${d}-9]`));
    } else if (d < 9) {
      alts.push(pre + (d + 1 === 9 ? "9" : `[${d + 1}-9]`) + rest);
    }
  }
  // más cifras siempre alcanza (hasta 999)
  if (L === 1) alts.push("\\d\\d\\d?");
  if (L === 2) alts.push("\\d\\d\\d");
  return alts.length > 1 ? `(${alts.join("|")})` : alts[0];
}

/** Un número entero entre lo y hi (1 a 99). */
export function between(lo: number, hi: number): string {
  const parts: string[] = [];
  const ones = [];
  for (let x = lo; x <= Math.min(hi, 9); x++) ones.push(x);
  if (ones.length) parts.push(ones.length === 1 ? `${ones[0]}` : `[${ones[0]}-${ones[ones.length - 1]}]`);
  for (let t = 1; t <= 9; t++) {
    const a = Math.max(lo, t * 10), b = Math.min(hi, t * 10 + 9);
    if (a > b) continue;
    parts.push(a === b ? `${a}` : a % 10 === 0 && b % 10 === 9 ? `${t}\\d` : `${t}[${a % 10}-${b % 10}]`);
  }
  return parts.length > 1 ? `(${parts.join("|")})` : parts[0] ?? "";
}

const OK = /[a-z0-9 %+\-',:]/;
const esc = (ch: string) => (/[+]/.test(ch) ? "\\" + ch : ch);

/** Un pedazo de plantilla como regex: igual que `to_rx` del pipeline. */
export function toRx(sub: string, numFor?: (k: number) => string | null): string {
  let out = "";
  for (let k = 0; k < sub.length; k++) {
    const ch = sub[k];
    if (ch === "#") {
      const n = numFor?.(k);
      out += `.?${n ?? "\\d+"}` + (k < sub.length - 1 ? "\\S*" : "");
    } else out += OK.test(ch) ? esc(ch) : ".";
  }
  return out;
}

/**
 * El regex de una línea; con `min`, pide que su primer número llegue a ese
 * valor. El número va siempre con algo de texto antes (o anclado al principio)
 * para no confundirlo con los extremos del rango de la tirada: "12(10-30)%".
 */
export function lineRx(it: RxLine, lang: GameLang, min?: number | null): string {
  const tok = it.tok[lang];
  const line = it[lang].toLowerCase();
  const p = line.indexOf("#");
  if (!min || p < 0) return tok;
  const [i, j] = it.at[lang];
  const a = Math.max(0, Math.min(i, p - 3));
  const b = Math.max(j, p + 1);
  // si el pedazo ya es "principio .* final" y trae el número, alcanza con ponerle el mínimo
  if (tok.includes(".*") && tok.includes(".?\\d+") && tok.startsWith("^")) {
    return tok.replace(".?\\d+", `.?${geq(min)}`);
  }
  let first = true;
  const body = toRx(line.slice(a, b), (k) => {
    if (a + k === p && first) { first = false; return geq(min); }
    return null;
  });
  return (a === 0 ? "^" : "") + body + (b === line.length && tok.endsWith("$") ? "$" : "");
}

export interface Pick {
  line: RxLine;
  want: boolean;
  min?: number | null;
}

export interface Options {
  lang: GameLang;
  picks: Pick[];
  /** Los que quiero: alcanza con uno ("any") o tienen que estar todos. */
  match: "any" | "all";
  tier?: [number, number] | null;
  corrupted?: "yes" | "no" | null;
  rarity?: ("Normal" | "Magic" | "Rare")[] | null;
  header?: Record<string, number | null | undefined>;
}

export function buildRegex(D: RxData, o: Options): string {
  const L = o.lang;
  const parts: string[] = [];
  if (o.tier) {
    const [lo, hi] = o.tier;
    if (lo > 1 || hi < 16) parts.push(`"${L === "es" ? "do" : "er"} ${between(lo, hi)}\\)"`);
  }
  if (o.rarity?.length && o.rarity.length < 3) {
    const tail = D.rarity.label[L].toLowerCase().slice(-2);
    const first = o.rarity.map((r) => toRx(D.rarity.values[r][L].toLowerCase()[0]));
    parts.push(`"${tail}: ${first.length > 1 ? `(${first.join("|")})` : first[0]}"`);
  }
  if (o.corrupted === "yes") parts.push(`"corr"`);
  if (o.corrupted === "no") parts.push(`"!corr"`);
  for (const [key, v] of Object.entries(o.header ?? {})) {
    const h = D.header[key];
    if (!h || !v || v < 1) continue;
    parts.push(`"${L === "es" ? h.tok_es : h.tok_en}.*${geq(v)}%"`);
  }
  const want = o.picks.filter((p) => p.want).map((p) => lineRx(p.line, L, p.min));
  const avoid = o.picks.filter((p) => !p.want).map((p) => lineRx(p.line, L));
  if (want.length) {
    if (o.match === "any") parts.push(`"${want.join("|")}"`);
    else for (const w of want) parts.push(`"${w}"`);
  }
  if (avoid.length) parts.push(`"!${avoid.join("|")}"`);
  return parts.join(" ");
}

/**
 * Cómo busca el juego, para los tests y para probar en el sitio: cada término
 * entre comillas se busca en las líneas del objeto; `!` pide que no aparezca.
 */
export function gameMatches(regex: string, itemText: string): boolean {
  const lines = itemText.toLowerCase().split("\n");
  const terms = regex.match(/"[^"]*"/g) ?? [];
  return terms.every((q) => {
    let t = q.slice(1, -1);
    const neg = t.startsWith("!");
    if (neg) t = t.slice(1);
    const rx = new RegExp(t);
    const hit = lines.some((l) => rx.test(l));
    return neg ? !hit : hit;
  });
}
