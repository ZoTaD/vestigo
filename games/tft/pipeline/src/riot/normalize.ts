import type { Participant } from "../aggregate/signature";

export interface RawUnit {
  character_id: string;
  tier: number;
  rarity: number;
  itemNames: string[];
}
export interface RawTrait {
  name: string;
  num_units: number;
  tier_current: number;
  tier_total: number;
  style?: number;
}
export interface RawParticipant {
  puuid: string;
  placement: number;
  level: number;
  gold_left?: number;
  last_round?: number;
  players_eliminated?: number;
  time_eliminated?: number;
  total_damage_to_players?: number;
  units: RawUnit[];
  traits: RawTrait[];
}
export interface RawMatch { info: { participants: RawParticipant[] }; }

export function toParticipants(match: RawMatch): Participant[] {
  return match.info.participants.map((p) => ({
    puuid: p.puuid,
    placement: p.placement,
    level: p.level,
    goldLeft: p.gold_left ?? 0,
    units: p.units.map((u) => ({
      character_id: u.character_id,
      tier: u.tier,
      rarity: u.rarity,
      items: u.itemNames,
    })),
    traits: p.traits.map((t) => ({
      name: t.name,
      numUnits: t.num_units,
      tierCurrent: t.tier_current,
      tierTotal: t.tier_total,
      // Absent stays absent everywhere below: zero is Riot's "no style" and a
      // real count of eliminations, so defaulting would erase the difference
      // between that and a payload that said nothing.
      ...(t.style !== undefined ? { style: t.style } : {}),
    })),
    ...(p.last_round !== undefined ? { lastRound: p.last_round } : {}),
    ...(p.players_eliminated !== undefined ? { eliminations: p.players_eliminated } : {}),
    ...(p.time_eliminated !== undefined ? { survivedFor: p.time_eliminated } : {}),
    ...(p.total_damage_to_players !== undefined
      ? { damageDealt: p.total_damage_to_players }
      : {}),
  }));
}
