/**
 * Las ligas del ranking de CoH3 (2026-11-05): el `ranklevel` que da Relic (0 sin rango, 1–20) con su nombre (el de los
 * textos del juego) y el ELO que la pide. De Latón III a Oro I van por ELO; Rival V a I, por puesto entre los que
 * tienen Oro I (los 50, 25, 10 y 5 primeros, y el 1.º).
 */
import type { Lang } from "../i18n";

export type Metal = "none" | "brass" | "bronze" | "iron" | "silver" | "gold" | "rival";
export interface League {
  level: number;
  metal: Metal;
  name: { en: string; es: string };
  /** ELO mínimo y máximo (null = sin tope), o el puesto más bajo que entra (`top`) en las ligas Rival. */
  min: number | null;
  max: number | null;
  top?: number;
}

const ROMAN = ["", "I", "II", "III", "IV", "V"];
const METAL_NAME: Record<Exclude<Metal, "none">, { en: string; es: string }> = {
  brass: { en: "Brass", es: "Latón" },
  bronze: { en: "Bronze", es: "Bronce" },
  iron: { en: "Iron", es: "Hierro" },
  silver: { en: "Silver", es: "Plata" },
  gold: { en: "Gold", es: "Oro" },
  rival: { en: "Challenger", es: "Rival" },
};
const l = (level: number, metal: Exclude<Metal, "none">, n: number, min: number | null, max: number | null, top?: number): League => ({
  level,
  metal,
  name: { en: `${METAL_NAME[metal].en} ${ROMAN[n]}`, es: `${METAL_NAME[metal].es} ${ROMAN[n]}` },
  min,
  max,
  ...(top ? { top } : {}),
});

export const LEAGUES: League[] = [
  { level: 0, metal: "none", name: { en: "Placement", es: "Sin clasificar" }, min: null, max: null },
  l(1, "brass", 3, 0, 299),
  l(2, "brass", 2, 300, 599),
  l(3, "brass", 1, 600, 799),
  l(4, "bronze", 3, 800, 999),
  l(5, "bronze", 2, 1000, 1049),
  l(6, "bronze", 1, 1050, 1099),
  l(7, "iron", 3, 1100, 1149),
  l(8, "iron", 2, 1150, 1199),
  l(9, "iron", 1, 1200, 1249),
  l(10, "silver", 3, 1250, 1299),
  l(11, "silver", 2, 1300, 1349),
  l(12, "silver", 1, 1350, 1399),
  l(13, "gold", 3, 1400, 1499),
  l(14, "gold", 2, 1500, 1599),
  l(15, "gold", 1, 1600, null),
  l(16, "rival", 5, 1600, null, 50),
  l(17, "rival", 4, 1600, null, 25),
  l(18, "rival", 3, 1600, null, 10),
  l(19, "rival", 2, 1600, null, 5),
  l(20, "rival", 1, 1600, null, 1),
];

export const leagueOf = (level: number | null | undefined): League => LEAGUES[Math.max(0, Math.min(20, level ?? 0))];
export const leagueName = (level: number | null | undefined, lang: Lang): string => leagueOf(level).name[lang];

/** CoH1 y CoH2 no nombran sus niveles (2026-11-06): "Nivel 17" / "Level 17". */
export const levelName = (level: number, lang: Lang): string => (lang === "es" ? `Nivel ${level}` : `Level ${level}`);
