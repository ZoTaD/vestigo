import type { Board, Lobby, Trait, Unit } from "./types";

/**
 * Riot's `rarity` index to real shop cost. Measured across the stored boards by
 * joining every observed rarity against the CommunityDragon catalog: the index
 * skips, so `rarity + 1` reports a 4-cost as a 5-cost. Rarity 9 is the
 * summoned/PvE units, which never come from the shop.
 *
 * An APPROXIMATION, not the authority. Re-measured over 400 matches, rarity
 * agrees with the catalog for every unit except Morgana, who is reported at
 * rarity 6 (a 5-cost by this table) while the catalog — generated from the
 * game's own data — has her at 4. Anything that displays or reasons about cost
 * should read the catalog and fall back here, not the other way round.
 */
export const RARITY_TO_COST: Record<number, number> = {
  0: 1,
  1: 2,
  2: 3,
  4: 4,
  6: 5,
};

interface RawUnit {
  character_id?: string;
  tier?: number;
  rarity?: number;
  itemNames?: string[];
}

interface RawTrait {
  name?: string;
  num_units?: number;
  tier_current?: number;
  tier_total?: number;
  style?: number;
}

interface RawParticipant {
  puuid?: string;
  riotIdGameName?: string;
  riotIdTagline?: string;
  placement?: number;
  level?: number;
  gold_left?: number;
  last_round?: number;
  players_eliminated?: number;
  time_eliminated?: number;
  total_damage_to_players?: number;
  units?: RawUnit[];
  traits?: RawTrait[];
}

interface RawMatch {
  metadata?: { match_id?: string };
  info?: {
    tft_set_number?: number;
    tft_game_type?: string;
    game_datetime?: number;
    queueId?: number;
    queue_id?: number;
    participants?: RawParticipant[];
  };
}

/**
 * A board can legitimately field the same champion twice — 6.6% of real boards
 * do (247 of 3758). Keep the most-invested copy so per-unit figures stay "per
 * board", matching how the pipeline aggregates comps.
 */
function collapseDuplicates(units: RawUnit[]): Unit[] {
  const best = new Map<string, Unit>();
  for (const raw of units) {
    const id = raw.character_id;
    if (!id) continue;
    const unit: Unit = {
      id,
      stars: raw.tier ?? 1,
      cost: RARITY_TO_COST[raw.rarity ?? -1] ?? 0,
      items: raw.itemNames ?? [],
    };
    const prev = best.get(id);
    const better =
      !prev ||
      unit.items.length > prev.items.length ||
      (unit.items.length === prev.items.length && unit.stars > prev.stars);
    if (better) best.set(id, unit);
  }
  return [...best.values()];
}

function toTraits(traits: RawTrait[]): Trait[] {
  const out: Trait[] = [];
  for (const t of traits) {
    // An inactive trait is just a unit that happens to be on the board; it says
    // nothing about the comp.
    if (!t.name || (t.tier_current ?? 0) < 1) continue;
    out.push({
      id: t.name,
      units: t.num_units ?? 0,
      tier: t.tier_current ?? 0,
      maxTier: t.tier_total ?? 0,
      // Left undefined rather than zeroed: zero is Riot's "no style", which is a
      // different statement from "the payload did not say".
      ...(t.style !== undefined ? { style: t.style } : {}),
    });
  }
  return out;
}

function toBoard(p: RawParticipant): Board {
  return {
    puuid: p.puuid ?? "",
    gameName: p.riotIdGameName ?? "",
    tagLine: p.riotIdTagline ?? "",
    placement: p.placement ?? 0,
    level: p.level ?? 0,
    goldLeft: p.gold_left ?? 0,
    lastRound: p.last_round ?? 0,
    units: collapseDuplicates(p.units ?? []),
    traits: toTraits(p.traits ?? []),
    // Same rule as trait style: absent stays absent. Zero eliminations is the
    // most common real answer there is, so defaulting would erase the
    // difference between "knocked nobody out" and "the payload was silent".
    ...(p.players_eliminated !== undefined ? { eliminations: p.players_eliminated } : {}),
    ...(p.time_eliminated !== undefined ? { survivedFor: p.time_eliminated } : {}),
    ...(p.total_damage_to_players !== undefined ? { damageDealt: p.total_damage_to_players } : {}),
  };
}

/**
 * Turn a raw Riot match payload into the shape the analyzer works with. Every
 * field is optional on the way in: the store already holds 6 matches with fewer
 * than 8 players, and a set change can move fields around without warning.
 */
export function toLobby(match: unknown): Lobby {
  const m = (match ?? {}) as RawMatch;
  const info = m.info ?? {};
  return {
    matchId: m.metadata?.match_id ?? "",
    set: info.tft_set_number ?? 0,
    playedAt: info.game_datetime ?? 0,
    queueId: info.queueId ?? info.queue_id ?? 0,
    gameType: info.tft_game_type ?? "",
    boards: (info.participants ?? []).map(toBoard),
  };
}

/** The board belonging to one player, or undefined when they were not in it. */
export function boardOf(lobby: Lobby, puuid: string): Board | undefined {
  return lobby.boards.find((b) => b.puuid === puuid);
}
