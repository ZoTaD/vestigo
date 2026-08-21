import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { TieredComp } from "./aggregate/tier";
import type { Calibration } from "./aggregate/calibrate";
import type { UnitStat } from "./aggregate/units";
import type { ItemStat } from "./aggregate/items";
import type { HabitTable } from "../../analysis/src/habits";

/** Fields every dataset carries, whichever rank band it was built from. */
interface BandedDataset {
  generatedAt: string;
  /** Riot's client version the figures were measured on, e.g. "16.14". */
  patch: string;
  /**
   * The same patch as a player would say it: "17.7", Set 17's seventh. Optional
   * so files written before the meta was cut by patch still parse.
   */
  patchLabel?: string;
  /**
   * Rank band behind the figures. Optional so files written before the meta was
   * split still parse; a run always sets it.
   */
  band?: string;
  /**
   * True when this band did not have enough of the patch behind it to publish.
   * The file is written anyway, empty, so a band never 404s — it fills itself in
   * once the puller brings more of the current patch.
   */
  insufficient?: boolean;
  /**
   * True cuando la banda publica con menos muestra de la habitual porque el parche
   * recién empezó. Mostrar el meta del parche anterior sería peor: entre parches
   * cambian de letra 14 de cada 30 comps.
   */
  provisional?: boolean;
  /** Boards behind the figures — this band's, never the whole store's. */
  sampleSize: number;
}

/**
 * One band per file, written on a single line.
 *
 * Indentation cost 46% of the file and no human reads these; with four bands
 * shipping instead of one, that whitespace was the difference between fitting
 * and not.
 */
function write(path: string, dataset: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(dataset), "utf-8");
}

export interface CompsDataset extends BandedDataset {
  /** The figures the analyzer quotes. Optional so older files still parse. */
  calibration?: Calibration;
  comps: TieredComp[];
}

export function writeComps(path: string, dataset: CompsDataset): void {
  write(path, dataset);
}

export interface UnitsDataset extends BandedDataset {
  units: UnitStat[];
}

/** Kept in its own file so the comps payload the tier list loads stays small. */
export function writeUnits(path: string, dataset: UnitsDataset): void {
  write(path, dataset);
}

export interface ItemsDataset extends BandedDataset {
  items: ItemStat[];
}

export function writeItems(path: string, dataset: ItemsDataset): void {
  write(path, dataset);
}

export interface BandHabits {
  boards: number;
  matches: number;
  habits: HabitTable;
}

export interface HabitsDataset {
  generatedAt: string;
  patch: string;
  patchLabel?: string;
  /** Keyed by band id, and only the bands that partition the ladder. */
  bands: Record<string, BandHabits>;
}

/**
 * Every band in ONE file, unlike comps, units and items.
 *
 * A deliberate break from bandPath: the coach reads two bands at once — yours
 * and the rung above — and with one file per band the profile would download two
 * ~450 KB payloads to read thirty numbers. All four bands together are a few KB,
 * so they ride in the bundle instead.
 */
export function writeHabits(path: string, dataset: HabitsDataset): void {
  write(path, dataset);
}
