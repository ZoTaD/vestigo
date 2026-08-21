export interface Unit {
  character_id: string;
  tier: number;   // star level 1-3
  // Riot's internal rarity index. NOT cost-1: measured across the whole store it
  // maps 0,1,2,4,6 to costs 1,2,3,4,5 (and 9 to the special summoned units), so
  // `rarity + 1` is wrong for 4- and 5-costs. Safe to compare for ordering,
  // since the mapping is monotonic; use the catalog when the real cost matters.
  rarity: number;
  items: string[];
}

export interface Trait {
  name: string;
  numUnits: number;
  tierCurrent: number;
  tierTotal: number;
  /** 0 none, 1 bronze, 2 silver, 3 gold, 4 chromatic. Not the same as tier. */
  style?: number;
}

export interface Participant {
  puuid: string;
  placement: number;
  level: number;
  /** Gold still in the bank when this player was knocked out. */
  goldLeft: number;
  units: Unit[];
  traits: Trait[];

  /**
   * Carried so this shape stays a mirror of the analyzer's Board. A field that
   * exists on one side and not the other is the failure the coach is built to
   * avoid: the comparison still runs, and it is simply wrong about a band.
   *
   * Optional because zero is a real answer for most of them, and defaulting
   * would erase the difference between that and a silent payload.
   */
  lastRound?: number;
  eliminations?: number;
  survivedFor?: number;
  damageDealt?: number;
}

// Per-champion "unique" traits (tierTotal === 1) are not comp-defining — every
// champion brings one. Only real, multi-breakpoint traits identify a comp.
export function dominantTrait(participant: Participant): string {
  const active = participant.traits.filter(
    (t) => t.tierCurrent >= 1 && t.tierTotal > 1
  );
  if (active.length === 0) return "";
  return [...active].sort(
    (a, b) =>
      b.tierCurrent - a.tierCurrent ||
      b.numUnits - a.numUnits ||
      a.name.localeCompare(b.name)
  )[0].name;
}

// The carry is whoever the player committed items to. Ties break toward the
// more invested, then more expensive, unit.
export function primaryCarry(participant: Participant): string {
  if (participant.units.length === 0) return "";
  return [...participant.units].sort(
    (a, b) =>
      b.items.length - a.items.length ||
      b.tier - a.tier ||
      b.rarity - a.rarity ||
      a.character_id.localeCompare(b.character_id)
  )[0].character_id;
}

// A comp's identity: its dominant trait plus its primary carry.
export function compSignature(participant: Participant): string {
  const trait = dominantTrait(participant);
  const carry = primaryCarry(participant);
  if (trait === "" || carry === "") return "";
  return `${trait}|${carry}`;
}
