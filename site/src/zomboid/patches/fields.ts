/**
 * Cómo se lee un cambio de un parche de Project Zomboid (2026-10-02): la etiqueta de cada campo, cada valor, los
 * renglones de receta, si un número sube o baja y el resumen automático de una versión sin Crónica. Puro: lo usan la
 * página de cada versión (`PatchDiff`) y el "Qué cambió" de las fichas (Task 5), y se prueba sin dibujar nada.
 */
import skillsJson from "@zomboid/skills.json";
import type { Lang } from "../../i18n";
import type { Loc } from "../items/data";
import { numbers } from "../items/numbers";
import { FIELD_LABELS, PATCHES_COPY, SANDBOX_LABELS, STAT_LABELS } from "./copy";
import type { PatchMeta, Raw } from "./data";
import { KINDS, type Kind } from "./kinds";

const SKILLS = skillsJson as Record<string, Loc>;

/** El nombre de una habilidad del juego (`Woodwork` → Carpintería); una que no conocemos, con su clave. */
const skillName = (perk: string, lang: Lang): string => (Object.hasOwn(SKILLS, perk) ? SKILLS[perk][lang] : perk);

/**
 * El nombre de un campo en la página. `null` si no lo conocemos: la página muestra la clave cruda, que también se
 * entiende y es mejor que inventarle un nombre.
 */
export function fieldLabel(kind: Kind, f: string, lang: Lang): string | null {
  const own = (table: Record<string, string>, key: string) => (Object.hasOwn(table, key) ? table[key] : null);
  if (kind === "sandbox") {
    const label = own(SANDBOX_LABELS[lang], f);
    if (label) return label;
  }
  if (f.startsWith("stats.")) return own(STAT_LABELS[lang], f.slice("stats.".length));
  const p = PATCHES_COPY[lang].pattern;
  let m: RegExpExecArray | null;
  if ((m = /^xpBoosts\.(\w+)$/.exec(f))) return p.xpBoost(skillName(m[1], lang));
  if ((m = /^skills\.(\w+)$/.exec(f))) return p.skillLevel(skillName(m[1], lang));
  // En una habilidad, `xp.<i>` es la XP de cada nivel (del 0 al 9: el nivel que se alcanza es i + 1).
  if (kind === "skills" && (m = /^xp\.(\d+)$/.exec(f))) return p.levelXp(Number(m[1]) + 1);
  if ((m = /^xp\.(\w+)$/.exec(f))) return p.skillXp(skillName(m[1], lang));
  if ((m = /^levels\.(\d+)\.(name|desc)$/.exec(f))) return m[2] === "name" ? p.levelName(m[1]) : p.levelDesc(m[1]);
  if ((m = /^learn\.autoLearnAll\.(\w+)$/.exec(f))) return p.autoLearn(skillName(m[1], lang));
  return own(FIELD_LABELS[lang], f);
}

/** Un valor de un cambio: el número con el formato del idioma, sí/no, "—" para nada, y un id con su nombre. */
export function formatValue(v: Raw, names: Record<string, Loc>, lang: Lang, locale: string): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return numbers(locale).num(v);
  if (typeof v === "boolean") return v ? PATCHES_COPY[lang].yes : PATCHES_COPY[lang].no;
  return Object.hasOwn(names, v) ? names[v][lang] : v;
}

/**
 * Un renglón de receta como lo escribe site.py ("2× Base.Nails|Base.Screws keep") en palabras: "2× Clavos o Tornillos
 * (se conserva)". Un renglón que no tiene esa forma se muestra tal cual.
 */
export function recipeLine(line: string, names: Record<string, Loc>, lang: Lang): string {
  const t = PATCHES_COPY[lang];
  const m = /^(\d+(?:\.\d+)?)× (.+?)( keep)?$/.exec(line);
  if (!m) return line;
  const alt = (token: string) =>
    token.startsWith("tag:") ? t.anyTagged(token.slice(4)) : Object.hasOwn(names, token) ? names[token][lang] : token;
  const count = lang === "es" ? m[1].replace(".", ",") : m[1];
  return `${count}× ${m[2].split("|").map(alt).join(t.or)}${m[3] ? t.kept : ""}`;
}

/**
 * Una fecha `AAAA-MM-DD` con el idioma de la página ("28 de septiembre de 2026"), como en Diablo II. Al mediodía UTC y
 * en UTC: el mismo día en el servidor y en el navegador, sin corrimiento por la zona horaria.
 */
export const fmtDate = (d: string, lang: Lang): string =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(lang === "es" ? "es-AR" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/** Si un número subió o bajó. Sólo números: un texto que cambió no sube ni baja. */
export function direction(b: Raw | undefined, a: Raw | undefined): "up" | "down" | null {
  if (typeof b !== "number" || typeof a !== "number" || a === b) return null;
  return a > b ? "up" : "down";
}

/** "a, b y c" / "a, b and c". */
function listOf(parts: string[], and: string): string {
  return parts.length < 2 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} ${and} ${parts.at(-1)}`;
}

/** Los adjetivos de cada cuenta, por idioma y género. */
const ADJ: Record<Lang, Record<"added" | "removed" | "changed", { m: [string, string]; f: [string, string] }>> = {
  en: {
    added: { m: ["new", "new"], f: ["new", "new"] },
    removed: { m: ["removed", "removed"], f: ["removed", "removed"] },
    changed: { m: ["changed", "changed"], f: ["changed", "changed"] },
  },
  es: {
    added: { m: ["nuevo", "nuevos"], f: ["nueva", "nuevas"] },
    removed: { m: ["quitado", "quitados"], f: ["quitada", "quitadas"] },
    changed: { m: ["cambiado", "cambiados"], f: ["cambiada", "cambiadas"] },
  },
};

/**
 * El resumen de una versión con diff y sin Crónica: "12 objetos nuevos, 3 quitados y 40 cambiados; 2 recetas
 * cambiadas." Sólo nombra lo que no es 0, y el tipo va con la primera cuenta de cada uno.
 */
export function autoLede(counts: NonNullable<PatchMeta["counts"]>, lang: Lang, locale: string): string {
  const t = PATCHES_COPY[lang];
  const { num } = numbers(locale);
  const clauses = KINDS.flatMap((kind) => {
    const c = counts[kind];
    if (!c) return [];
    const noun = t.nouns[kind];
    const parts = (["added", "removed", "changed"] as const)
      .filter((k) => c[k] > 0)
      .map((k, i) => {
        const n = c[k];
        const adj = ADJ[lang][k][noun.fem ? "f" : "m"][n === 1 ? 0 : 1];
        if (i > 0) return `${num(n)} ${adj}`;
        const name = n === 1 ? noun.one : noun.many;
        // En inglés, "new" va adelante ("12 new items"); lo demás, atrás ("3 items removed"), como en español.
        return lang === "en" && k === "added" ? `${num(n)} ${adj} ${name}` : `${num(n)} ${name} ${adj}`;
      });
    return parts.length ? [listOf(parts, t.and)] : [];
  });
  return clauses.length ? `${clauses.join("; ")}.` : "";
}

/** "4.878 objetos, 1.170 recetas… y 269 opciones de sandbox": las cifras de la primera versión guardada. */
export function firstCounts(first: NonNullable<PatchMeta["first"]>, lang: Lang, locale: string): string {
  const t = PATCHES_COPY[lang];
  const { num } = numbers(locale);
  const parts = KINDS.flatMap((kind) => {
    const n = first[kind];
    return n ? [`${num(n)} ${n === 1 ? t.nouns[kind].one : t.nouns[kind].many}`] : [];
  });
  return listOf(parts, t.and);
}

/**
 * Una clave cruda partida después de cada punto: "stats.maxDamage" → ["stats.", "maxDamage"]. Se dibujan con `<wbr>`
 * entre medio, así una clave larga (`stats.conditionLowerChanceOneIn`) baja de renglón en un punto y nunca adentro de
 * una palabra.
 */
export function rawKey(f: string): string[] {
  return f.match(/[^.]*\.|[^.]+$/g) ?? [f];
}
