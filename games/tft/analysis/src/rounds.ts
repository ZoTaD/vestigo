/**
 * Decoding Riot's flat `last_round` counter into TFT's stage-round notation.
 *
 * The mapping was derived empirically from 3758 real boards rather than copied
 * from a wiki. Eliminations across the whole store cluster into every round
 * EXCEPT 15, 22, 25, 29, 32, 36 and 39, where they drop roughly forty-fold (in
 * round 39, to zero). Those gaps alternate 3-4-3-4-3, which lands exactly on
 * the X-4 and X-7 slots when stage 1 is 4 rounds long and every later stage is
 * 7. The longest game observed, 42, decodes to 7-3.
 *
 * See docs/design/2026-07-22-fase3-buscador-analizador.md section 4.2.
 */

/** Stage 1 is short: 1-1 through 1-4. */
const STAGE_ONE_ROUNDS = 4;
/** Every stage from 2 onward runs X-1 through X-7. */
const ROUNDS_PER_STAGE = 7;
/** Position within a stage where the carousel sits. */
const CAROUSEL_ROUND = 4;
/** Position within a stage where players fight creeps instead of each other. */
const PVE_ROUND = 7;

export interface StageRound {
  stage: number;
  round: number;
}

export function toStageRound(lastRound: number): StageRound {
  if (lastRound <= STAGE_ONE_ROUNDS) {
    return { stage: 1, round: Math.max(1, lastRound) };
  }
  const offset = lastRound - STAGE_ONE_ROUNDS - 1;
  return {
    stage: Math.floor(offset / ROUNDS_PER_STAGE) + 2,
    round: (offset % ROUNDS_PER_STAGE) + 1,
  };
}

/** Human notation, e.g. 22 becomes "4-4". */
export function formatRound(lastRound: number): string {
  const { stage, round } = toStageRound(lastRound);
  return `${stage}-${round}`;
}

/** Carousels have no combat, so nobody is ever eliminated on one. */
export function isCarousel(lastRound: number): boolean {
  const { stage, round } = toStageRound(lastRound);
  return stage >= 2 && round === CAROUSEL_ROUND;
}

/** Creep rounds. Elimination is possible but very rare in the observed data. */
export function isPve(lastRound: number): boolean {
  const { stage, round } = toStageRound(lastRound);
  return stage === 1 || round === PVE_ROUND;
}

/**
 * Whether players realistically get knocked out on this round. Named for what
 * the data shows rather than for a game mechanic we did not verify.
 */
export function eliminatesPlayers(lastRound: number): boolean {
  return !isCarousel(lastRound) && !isPve(lastRound);
}
