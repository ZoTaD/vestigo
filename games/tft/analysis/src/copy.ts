/**
 * Every sentence the analyzer can say, in both languages.
 *
 * This package is pure logic with its own tests, so its prose lives here rather
 * than in the UI's i18n.ts — the analyzer has to be runnable and testable
 * without a React app around it. The rule that prose lives in exactly one file
 * still holds; there are simply two such files, one per package.
 *
 * Templates take whole sentences rather than concatenated fragments, because
 * word order, pluralisation and ordinals differ between the two languages and
 * gluing pieces together produces text that reads translated.
 */

export type Lang = "en" | "es";

export const DEFAULT_LANG: Lang = "en";

interface CompDetail {
  list: string;
  trait: string;
  carry: string;
  count: number;
  placement: number;
  beatYou: number;
}

const EN = {
  /** 1st, 2nd, 3rd… English needs the suffix; Spanish just takes a degree sign. */
  ordinal: (n: number): string => {
    const suffix = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
    return `${n}${suffix}`;
  },

  mistakes: {
    goldTitle: (gold: number) => `You finished holding ${gold} gold`,
    goldDetail: (round: string, gold: number, rolls: number, xp: number) =>
      `You went out on ${round} with ${gold} gold in the bank: ${rolls} rolls or ` +
      `${xp} XP buys you never used.`,
    goldDead: (cap: number, dead: number) =>
      ` Interest also caps at ${cap}, so ${dead} of that was not even earning ` +
      `interest — it was dead gold.`,
    goldEvidence: (
      matches: number, from: number, severeFrom: number,
      wastedAvg: number, severeAvg: number, lowAvg: number
    ) =>
      `Across ${matches} matches: going out on ${from}-${severeFrom - 1} gold averages ` +
      `${wastedAvg} placement and ${severeFrom}+ averages ${severeAvg}, against ` +
      `${lowAvg} with 10 or less.`,
    carryTitle: (champion: string) => `${champion} never finished their items`,
    carryDetail: (has: number, full: number) =>
      `Your carry ended with ${has} of ${full} items.`,
    carryEvidence: (rate: string, shortAvg: number, fullAvg: number, full: number) =>
      `Only ${rate}% of boards end that way, and they average ${shortAvg} placement ` +
      `against ${fullAvg} for those that complete all ${full} items.`,
  },

  history: {
    /** Phrased to complete "your most repeated mistake is …". */
    habits: {
      "mistake-gold": "going out with gold unspent",
      "mistake-carry-items": "leaving your carry short of items",
      "metagap-missing": "missing units from your comp's core",
      "metagap-dragging": "carrying units the winning boards leave out",
      "metagap-items": "building your carry items other than the winning ones",
      "metagap-level": "finishing short on level",
      "contested-comp": "playing the same comp as someone else in the lobby",
      "contested-carry": "sharing your carry with another player",
      "contested-crowd": "fighting over pieces half the lobby wanted",
    } as Record<string, string>,
    habitTitle: (habit: string) => `Your most repeated mistake: ${habit}`,
    habitDetail: (count: number, total: number) =>
      `It happened in ${count} of your last ${total} matches.`,
    habitRunnerUp: (habit: string, n: number) => ` Next comes ${habit}, in ${n}.`,
    habitNoOther: " Nothing else repeats as often.",
    habitEvidence: "Counted once per match, across the standard matches in your history.",
    compWorstTitle: (label: string) => `${label} is not working for you`,
    compWorstDetail: (avg: string, games: number, overall: string) =>
      `You average ${avg} placement across your ${games} games with that comp, against ` +
      `${overall} overall. It can be a strong comp and still not be yours.`,
    compBestTitle: (label: string) => `${label} is your best comp`,
    compBestDetail: (avg: string, games: number, overall: string) =>
      `You average ${avg} across your ${games} games with it, against ${overall} overall.`,
    compEvidence: "From your own matches, not from the meta.",
  },

  contested: {
    evidence: (matches: number, cost: string) =>
      `Measured across ${matches} matches: sharing your carry costs +${cost} placements ` +
      `on average.`,
    compTitle: (n: number) =>
      n === 1 ? "Someone else built your comp" : `${n} players built your comp`,
    compDetail: ({ list, trait, carry, count, placement, beatYou }: CompDetail) => {
      const played = `${list} played ${trait} with ${carry} as carry, just like you. `;
      const me = EN.ordinal(placement);
      if (beatYou > 0) {
        const who = beatYou === 1 ? "that rival" : `${beatYou} of them`;
        return `${played}You finished ${me}, below ${who}.`;
      }
      const who = count === 1 ? "that rival" : "all of them";
      return `${played}You finished ${me}, above ${who}.`;
    },
    carryTitle: (champion: string) => `${champion} was contested`,
    carryDetail: (list: string, champion: string, count: number) =>
      `${list} also finished with ${champion} as carry, out of a different comp.` +
      (count > 1 ? "" : ""),
    crowdTitle: "You were fighting over pieces half the lobby wanted",
    crowdUnit: (champion: string, held: number, others: number, expected: string) =>
      `${champion}: ${held} of the other ${others} held it, when the normal number is ${expected}`,
    crowdEvidence: (matches: number, crowdedAvg: number, clearAvg: number) =>
      `Across ${matches} matches: boards more contested than normal average ` +
      `${crowdedAvg} placement; uncontested ones, ${clearAvg}.`,
  },

  metaGap: {
    compTitleExact: (trait: string, carries: string) => `You were playing ${trait} ${carries}`,
    compTitleLoose: (trait: string, carries: string) =>
      `Your board looked like ${trait} ${carries}`,
    compDetailExact: (tier: string, avg: string) =>
      `It is tier ${tier}, averaging ${avg} placement.`,
    compDetailLoose: (overlap: number) =>
      `You shared ${overlap} units, but your comp matches none in the dataset.`,
    compEvidence: (count: number) => `Measured across ${count} boards in our dataset.`,
    missingTitle: (champion: string) => `You were missing ${champion}`,
    missingDetail: (winnerRate: string, loserRate: string, withAvg: string, withoutAvg: string) =>
      `${winnerRate} of the boards that made top 4 with this comp held it, against ` +
      `${loserRate} of those that fell 5th-8th. With it the comp averages ${withAvg} ` +
      `placement; without it, ${withoutAvg}.`,
    draggingTitle: (champion: string) => `${champion} does not appear on the winning boards`,
    draggingDetail: (winnerRate: string, loserRate: string, gain: string) =>
      `Only ${winnerRate} of top-4 boards with this comp carry it, against ${loserRate} ` +
      `of those that fall. Without it the comp averages ${gain} places better. That slot ` +
      `belongs to another unit.`,
    splitEvidence: (winnerBoards: number, loserBoards: number) =>
      `Across ${winnerBoards} top-4 boards and ${loserBoards} from the bottom.`,
    itemsTitle: (champion: string) => `${champion} usually carries other items`,
    itemsUnit: (item: string, share: string) => `${item} (${share} of the time)`,
    itemsEvidence: (winnerBoards: number) =>
      `Among the ${winnerBoards} boards that made top 4 with this comp.`,
    levelTitle: (level: number) => `You finished on level ${level}`,
    levelDetail: (winnerLevel: string, loserLevel: string | null) =>
      `Those who made top 4 with this comp finish on ${winnerLevel}` +
      (loserLevel ? `; those who fall, on ${loserLevel}.` : "."),
  },

  report: {
    doubleUpTitle: "This match is Double Up",
    nonStandardTitle: "This match is not standard mode",
    modeDetail:
      "Our meta is built from standard matches only, so comparing this one against " +
      "those comps would give conclusions that do not apply to this mode.",
  },
};

const ES: typeof EN = {
  ordinal: (n: number) => `${n}°`,

  mistakes: {
    goldTitle: (gold) => `Te quedaste con ${gold} de oro sin gastar`,
    goldDetail: (round, gold, rolls, xp) =>
      `Caíste en ${round} con ${gold} de oro en el banco: ${rolls} tiradas o ` +
      `${xp} compras de XP que nunca usaste.`,
    goldDead: (cap, dead) =>
      ` Además el interés topea a los ${cap}, así que ${dead} de esos no estaban ni ` +
      `generando intereses: era oro muerto.`,
    goldEvidence: (matches, from, severeFrom, wastedAvg, severeAvg, lowAvg) =>
      `En ${matches} partidas: morir con ${from}-${severeFrom - 1} de oro promedia ` +
      `${wastedAvg} de puesto y con ${severeFrom}+ promedia ${severeAvg}, contra ` +
      `${lowAvg} con 10 o menos.`,
    carryTitle: (champion) => `${champion} nunca completó sus ítems`,
    carryDetail: (has, full) => `Tu carry terminó con ${has} de ${full} ítems.`,
    carryEvidence: (rate, shortAvg, fullAvg, full) =>
      `Solo el ${rate}% de los tableros termina así, y promedian ${shortAvg} de puesto ` +
      `contra ${fullAvg} de los que completan los ${full} ítems.`,
  },

  history: {
    habits: {
      "mistake-gold": "morir con oro sin gastar",
      "mistake-carry-items": "dejar al carry sin completar sus ítems",
      "metagap-missing": "que te falten unidades del núcleo de tu comp",
      "metagap-dragging": "llevar unidades que los tableros ganadores dejan afuera",
      "metagap-items": "construirle al carry ítems distintos de los que ganan",
      "metagap-level": "quedarte corto de nivel",
      "contested-comp": "jugar la misma comp que otro de la lobby",
      "contested-carry": "compartir tu carry con otro jugador",
      "contested-crowd": "pelear por piezas que media lobby quería",
    },
    habitTitle: (habit) => `Tu error más repetido: ${habit}`,
    habitDetail: (count, total) => `Pasó en ${count} de tus últimas ${total} partidas.`,
    habitRunnerUp: (habit, n) => ` Después viene ${habit}, en ${n}.`,
    habitNoOther: " Ningún otro se repite tanto.",
    habitEvidence: "Contado una vez por partida, sobre las partidas estándar del historial.",
    compWorstTitle: (label) => `${label} no te está saliendo`,
    compWorstDetail: (avg, games, overall) =>
      `Promedias ${avg} de puesto en tus ${games} partidas con esa comp, contra ` +
      `${overall} en general. Puede ser una comp fuerte y aun así no ser la tuya.`,
    compBestTitle: (label) => `${label} es tu mejor comp`,
    compBestDetail: (avg, games, overall) =>
      `Promedias ${avg} en tus ${games} partidas con ella, contra ${overall} en general.`,
    compEvidence: "Sobre tus propias partidas, no sobre el meta.",
  },

  contested: {
    evidence: (matches, cost) =>
      `Medido en ${matches} partidas: compartir el carry cuesta +${cost} puestos en promedio.`,
    compTitle: (n) =>
      n === 1 ? "Alguien más armó tu misma comp" : `${n} jugadores armaron tu misma comp`,
    compDetail: ({ list, trait, carry, count, placement, beatYou }) => {
      const verb = count === 1 ? "jugó" : "jugaron";
      const played = `${list} ${verb} ${trait} con ${carry} de carry, igual que tú. `;
      if (beatYou > 0) {
        const who = beatYou === 1 ? "ese rival" : `${beatYou} de ellos`;
        return `${played}Terminaste ${placement}°, por debajo de ${who}.`;
      }
      const who = count === 1 ? "de ese rival" : "de todos ellos";
      return `${played}Terminaste ${placement}°, por encima ${who}.`;
    },
    carryTitle: (champion) => `Te disputaban a ${champion}`,
    carryDetail: (list, champion, count) =>
      `${list} también ${count === 1 ? "terminó" : "terminaron"} con ${champion} de carry, ` +
      `desde otra comp.`,
    crowdTitle: "Peleabas por piezas que media lobby quería",
    crowdUnit: (champion, held, others, expected) =>
      `${champion}: la tenían ${held} de los otros ${others}, cuando lo normal para ella es ${expected}`,
    crowdEvidence: (matches, crowdedAvg, clearAvg) =>
      `En ${matches} partidas: los tableros más disputados de lo normal promedian ` +
      `${crowdedAvg} de puesto; los despejados, ${clearAvg}.`,
  },

  metaGap: {
    compTitleExact: (trait, carries) => `Estabas jugando ${trait} ${carries}`,
    compTitleLoose: (trait, carries) => `Tu tablero se parecía a ${trait} ${carries}`,
    compDetailExact: (tier, avg) => `Es tier ${tier} con ${avg} de puesto promedio.`,
    compDetailLoose: (overlap) =>
      `Compartían ${overlap} unidades, pero tu comp no coincide con ninguna del dataset.`,
    compEvidence: (count) => `Medido sobre ${count} tableros de nuestro dataset.`,
    missingTitle: (champion) => `Te faltó ${champion}`,
    missingDetail: (winnerRate, loserRate, withAvg, withoutAvg) =>
      `La llevaban ${winnerRate} de los que hicieron top 4 con esta comp, contra ` +
      `${loserRate} de los que cayeron 5.º-8.º. Con ella la comp promedia ${withAvg} ` +
      `de puesto; sin ella, ${withoutAvg}.`,
    draggingTitle: (champion) => `${champion} no aparece en los tableros que ganan`,
    draggingDetail: (winnerRate, loserRate, gain) =>
      `Solo ${winnerRate} de los top 4 con esta comp la llevan, contra ${loserRate} de los ` +
      `que caen. Sin ella la comp promedia ${gain} puestos mejor. Ese hueco es para otra unidad.`,
    splitEvidence: (winnerBoards, loserBoards) =>
      `Sobre ${winnerBoards} tableros de top 4 y ${loserBoards} del fondo.`,
    itemsTitle: (champion) => `${champion} suele llevar otros ítems`,
    itemsUnit: (item, share) => `${item} (${share} de las veces)`,
    itemsEvidence: (winnerBoards) =>
      `Entre los ${winnerBoards} tableros que hicieron top 4 con esta comp.`,
    levelTitle: (level) => `Terminaste en nivel ${level}`,
    levelDetail: (winnerLevel, loserLevel) =>
      `Los que hicieron top 4 con esta comp terminan en ${winnerLevel}` +
      (loserLevel ? `; los que caen, en ${loserLevel}.` : "."),
  },

  report: {
    doubleUpTitle: "Esta partida es de Doble Up",
    nonStandardTitle: "Esta partida no es del modo estándar",
    modeDetail:
      "Nuestro meta se calcula solo con partidas estándar, así que compararla contra esas " +
      "comps daría conclusiones que no aplican a este modo.",
  },
};

export const COPY: Record<Lang, typeof EN> = { en: EN, es: ES };
