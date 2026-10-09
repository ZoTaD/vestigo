/**
 * Los textos de la pestaña Granjas de Rust (2026-10-09), en inglés y español. Los nombres del juego (plantas, objetos,
 * genes, razas) salen de los datos; acá va lo nuestro. Aparte de `rustCopy.ts` para que la pestaña no infle la copia de
 * la sección (y el prerender la importa para el `<head>` de cada planta).
 */
import { useLang } from "../../i18n";

export type StageKey = "seed" | "seedling" | "sapling" | "crossbreed" | "mature" | "fruiting" | "ripe" | "dying";
type Seo = { title: string; description: string };

export interface FarmingCopy {
  h1: string;
  lede: (plants: number) => string;
  missing: string;
  plantsTitle: string;
  ripeIn: (t: string) => string;
  gives: (n: number, what: string) => string;
  geneticsCard: { title: string; text: string; cta: string };
  genesTitle: string;
  genesNote: string;
  good: string;
  bad: string;
  geneEffect: Record<"X" | "W" | "G" | "Y" | "H", string>;
  plantersTitle: string;
  plantersNote: (sat: string) => string;
  planter: string;
  waterCap: string;
  pot: string;
  compostTitle: string;
  compostNote: (slots: number, minutes: number) => string;
  compostItem: string;
  compostPer: string;
  compostNeeded: string;
  careTitle: string;
  sprinkler: (water: number, every: number) => string;
  lights: (range: number) => string;
  heater: (range: number) => string;
  chickensTitle: string;
  chickens: (max: number, hatch: number, lo: number, hi: number) => string;
  beesTitle: string;
  bees: string;
  livestockTitle: string;
  species: Record<"cow" | "sheep" | "chicken", string>;
  livestock: { product: string; every: (t: string) => string; grow: (t: string) => string; pregnant: (t: string) => string; herd: (a: number, b: number) => string; dung: (t: string) => string };
  livestockGenes: string;
  horsesTitle: string;
  horsesNote: string;
  horse: { breed: string; health: string; speed: string; stamina: string };
  biofuel: string;
  // La ficha de una planta.
  back: string;
  stages: Record<StageKey, string>;
  stagesTitle: string;
  stageCol: string;
  minutesCol: string;
  fixedNote: string;
  facts: { ripe: string; harvest: string; water: string; temp: string; light: string; clones: string; seed: string; clone: string; market: string };
  perTick: (n: string) => string;
  tempRange: (lo: string, hi: string, best: string) => string;
  lightText: string;
  perfectNote: string;
  openCalc: string;
  // La calculadora.
  calc: {
    h1: string;
    lede: string;
    plant: string;
    center: string;
    neighbours: string;
    neighbour: (i: number) => string;
    add: string;
    remove: string;
    invalid: string;
    result: string;
    noChange: string;
    chance: (p: string) => string;
    slot: (i: number) => string;
    slotsTitle: string;
    keeps: string;
    stats: string;
    share: string;
    copied: string;
    copyFailed: string;
    how: string[];
    finder: string;
    finderLede: string;
    target: string;
    owned: string;
    ownedHelp: string;
    find: string;
    plan: (center: string, n: number) => string;
    noPlan: string;
    already: string;
    use: string;
    tooMany: (max: number) => string;
  };
  seo: { plant: (name: string) => Seo; genetics: Seo };
}

const EN: FarmingCopy = {
  h1: "Rust farming",
  lede: (n) => `The ${n} plants with how long they take and what they give, the crossbreeding calculator, planters, compost and animals.`,
  missing: "That plant doesn't exist (or changed its name). Here's the whole farm.",
  plantsTitle: "Plants",
  ripeIn: (t) => `Ripe in ${t}`,
  gives: (n, what) => `${n} ${what}`,
  geneticsCard: { title: "Genetics calculator", text: "Plant a center clone and up to 8 neighbours: see what comes out, with odds, or find the cross that gets you GGGYYY.", cta: "Open the calculator" },
  genesTitle: "Genes",
  genesNote: "Every plant carries 6 genes. Red genes weigh 1 when crossbreeding and green genes 0.6, so one red neighbour already overrides a green gene, and it takes two greens to override a red one.",
  good: "Good",
  bad: "Bad",
  geneEffect: {
    G: "Grows 25% faster per G.",
    Y: "25% more fruit per Y, and one more clone every two Y.",
    H: "Copes better with cold, heat and poor ground.",
    W: "Drinks 10% more water per W.",
    X: "Does nothing: an empty slot.",
  },
  plantersTitle: "Planters",
  plantersNote: (sat) => `Plants grow at full speed only in a planter. The planter works best kept around ${sat} full of water; fertilizer raises its ground quality to the top.`,
  planter: "Planter",
  waterCap: "Water it holds",
  pot: "One plant",
  compostTitle: "Compost",
  compostNote: (slots, minutes) => `The composter eats one item from each of its ${slots} slots every ${minutes} minutes. Fertilizer per item, from the best:`,
  compostItem: "Item",
  compostPer: "Fertilizer each",
  compostNeeded: "For one fertilizer",
  careTitle: "Water, light and heat",
  sprinkler: (water, every) => `The sprinkler pours ${water} water about every ${every} s on what is under it.`,
  lights: (range) => `Ceiling lights act as sun for plants up to ${range} m below them, day and night.`,
  heater: (range) => `Heaters and fire raise the temperature of plants within ${range} m: winter and snow biomes need them.`,
  chickensTitle: "Chickens",
  chickens: (max, hatch, lo, hi) => `A coop holds ${max} chickens. An egg in it hatches in ${hatch} min; a fed, watered and happy chicken lays an egg every ${lo}–${hi} min.`,
  beesTitle: "Bees",
  bees: "Put a nucleus in the beehive: the bees fill honeycomb near flowers. Take it out wearing something that covers you, or they sting.",
  livestockTitle: "Cows and sheep",
  species: { cow: "Cow", sheep: "Sheep", chicken: "Chicken" },
  livestock: {
    product: "Gives",
    every: (t) => `every ${t}`,
    grow: (t) => `Grows up in ${t}`,
    pregnant: (t) => `Pregnancy: ${t}`,
    herd: (a, b) => `Comfortable in herds of ${a}, crowded from ${b}`,
    dung: (t) => `Drops dung every ${t}`,
  },
  livestockGenes: "Each animal has its own genes for yield, fertility, longevity, hardiness and dung, and passes them on to its young.",
  horsesTitle: "Horse breeds",
  horsesNote: "Compared with a standard horse (1 = the same).",
  horse: { breed: "Breed", health: "Health", speed: "Speed", stamina: "Stamina" },
  biofuel: "The biofuel generator turns dung and spoiled food into fuel; it needs stirring.",
  back: "Farming",
  stages: { seed: "Seed", seedling: "Seedling", sapling: "Sapling", crossbreed: "Crossbreed", mature: "Mature", fruiting: "Fruiting", ripe: "Ripe", dying: "Dying" },
  stagesTitle: "Growth stages",
  stageCol: "Stage",
  minutesCol: "Minutes",
  fixedNote: "Marked stages always take the same time, whatever the genes or conditions. Crossbreeding happens when the plant reaches the crossbreed stage.",
  facts: { ripe: "Ripe in", harvest: "Harvest", water: "Water", temp: "Temperature", light: "Light", clones: "Clones", seed: "Seed", clone: "Clone", market: "Base value" },
  perTick: (n) => `${n} per minute`,
  tempRange: (lo, hi, best) => `${lo} to ${hi} °C, best at ${best} °C`,
  lightText: "Sun or ceiling light; best at midday",
  perfectNote: "Times and amounts with no genes and perfect conditions. Use the calculator to see them with genes.",
  openCalc: "Crossbreed it",
  calc: {
    h1: "Rust Genetics Calculator",
    lede: "Type the genes of the plant in the middle and of its neighbours, the way the game shows them (GGGYYY). You get what the middle plant turns into when it crossbreeds, with odds when there is a tie.",
    plant: "Plant",
    center: "Middle plant",
    neighbours: "Neighbours",
    neighbour: (i) => `Neighbour ${i}`,
    add: "Add neighbour",
    remove: "Remove",
    invalid: "6 letters: G, Y, H, W or X",
    result: "Result",
    noChange: "Nothing changes",
    chance: (p) => `${p} chance`,
    slot: (i) => `Slot ${i}`,
    slotsTitle: "Slot by slot",
    keeps: "keeps",
    stats: "With these genes",
    share: "Copy link",
    copied: "Link copied",
    copyFailed: "Couldn't copy: copy it from the address bar",
    how: [
      "Neighbours count when they are the same plant, in the same planter, alive and within 1.5 m of the middle one.",
      "For each slot the game adds up the neighbours' weights per gene (red 1, green 0.6). The gene with the highest total replaces the middle one only if that total is higher than the weight of the gene it already has.",
      "On a tie, the gene that reaches the total first in the game's list of neighbours wins. That order can't be known, so a tie shows up as a chance.",
    ],
    finder: "Find a cross",
    finderLede: "Type the clone you want and the ones you have: you get which one to plant in the middle and what to put around it, with the fewest neighbours.",
    target: "Clone you want",
    owned: "Clones you have",
    ownedHelp: "One per line, or separated by commas",
    find: "Find",
    plan: (center, n) => `Plant ${center} in the middle with ${n === 1 ? "this neighbour" : `these ${n} neighbours`}:`,
    noPlan: "No single cross gets there with these clones. Try with more clones, or cross in two steps.",
    already: "You already have it.",
    use: "Load in the calculator",
    tooMany: (max) => `Up to ${max} clones`,
  },
  seo: {
    plant: (name) => ({
      title: `${name} — Rust farming: growth time, harvest and genes | Vestigo`,
      description: `How to grow ${name} in Rust: each growth stage and its time, the harvest, the water and heat it needs, and how genes change it.`,
    }),
    genetics: {
      title: "Rust Genetics Calculator: Crossbreeding Odds for GGGYYY | Vestigo",
      description: "Rust plant genetics calculator: type the middle clone and its neighbours to see what it turns into, or find the cross for the clone you want.",
    },
  },
};

const ES: FarmingCopy = {
  h1: "Granjas en Rust",
  lede: (n) => `Las ${n} plantas con lo que tardan y lo que dan, la calculadora de cruzas, las jardineras, el compost y los animales.`,
  missing: "Esa planta no existe (o cambió de nombre). Acá está toda la granja.",
  plantsTitle: "Plantas",
  ripeIn: (t) => `Madura en ${t}`,
  gives: (n, what) => `${n} de ${what}`,
  geneticsCard: { title: "Calculadora de genética", text: "Plantá un esqueje en el medio y hasta 8 vecinos: mirá qué sale, con probabilidades, o buscá la cruza que te da GGGYYY.", cta: "Abrir la calculadora" },
  genesTitle: "Genes",
  genesNote: "Cada planta tiene 6 genes. En la cruza los genes rojos pesan 1 y los verdes 0,6: un solo vecino rojo ya pisa un gen verde, y hacen falta dos verdes para pisar uno rojo.",
  good: "Buenos",
  bad: "Malos",
  geneEffect: {
    G: "Crece un 25 % más rápido por cada G.",
    Y: "Un 25 % más de fruto por cada Y, y un esqueje más cada dos Y.",
    H: "Aguanta mejor el frío, el calor y el suelo pobre.",
    W: "Toma un 10 % más de agua por cada W.",
    X: "No hace nada: un casillero vacío.",
  },
  plantersTitle: "Jardineras",
  plantersNote: (sat) => `Las plantas crecen a toda velocidad sólo en una jardinera. La jardinera rinde al máximo con el agua cerca del ${sat}; el fertilizante lleva la calidad del suelo al tope.`,
  planter: "Jardinera",
  waterCap: "Agua que guarda",
  pot: "Una planta",
  compostTitle: "Compost",
  compostNote: (slots, minutes) => `El compostador consume un objeto de cada una de sus ${slots} ranuras cada ${minutes} minutos. Fertilizante por objeto, del que más da al que menos:`,
  compostItem: "Objeto",
  compostPer: "Fertilizante por unidad",
  compostNeeded: "Para un fertilizante",
  careTitle: "Agua, luz y calor",
  sprinkler: (water, every) => `El aspersor tira ${water} de agua cada ${every} s, más o menos, sobre lo que tiene abajo.`,
  lights: (range) => `Las lámparas de techo hacen de sol para las plantas que tienen hasta ${range} m abajo, de día y de noche.`,
  heater: (range) => `Los calefactores y el fuego suben la temperatura de las plantas a menos de ${range} m: en invierno y en la nieve hacen falta.`,
  chickensTitle: "Gallinas",
  chickens: (max, hatch, lo, hi) => `Un gallinero tiene lugar para ${max} gallinas. Un huevo adentro nace en ${hatch} min; una gallina con comida, agua y contenta pone un huevo cada ${lo} a ${hi} min.`,
  beesTitle: "Abejas",
  bees: "Poné un núcleo en la colmena: las abejas llenan panales si hay flores cerca. Sacalos con algo que te cubra, o pican.",
  livestockTitle: "Vacas y ovejas",
  species: { cow: "Vaca", sheep: "Oveja", chicken: "Gallina" },
  livestock: {
    product: "Da",
    every: (t) => `cada ${t}`,
    grow: (t) => `Crece en ${t}`,
    pregnant: (t) => `Preñez: ${t}`,
    herd: (a, b) => `Cómoda en rebaños de ${a}, apretada desde ${b}`,
    dung: (t) => `Deja estiércol cada ${t}`,
  },
  livestockGenes: "Cada animal tiene sus genes de rendimiento, fertilidad, longevidad, robustez y estiércol, y se los pasa a sus crías.",
  horsesTitle: "Razas de caballo",
  horsesNote: "Comparadas con un caballo común (1 = igual).",
  horse: { breed: "Raza", health: "Vida", speed: "Velocidad", stamina: "Aguante" },
  biofuel: "El generador de biocombustible convierte estiércol y comida podrida en combustible; hay que revolverlo.",
  back: "Granjas",
  stages: { seed: "Semilla", seedling: "Brote", sapling: "Planta joven", crossbreed: "Cruza", mature: "Madura", fruiting: "Con fruto", ripe: "Lista", dying: "Muriendo" },
  stagesTitle: "Etapas",
  stageCol: "Etapa",
  minutesCol: "Minutos",
  fixedNote: "Las etapas marcadas duran siempre lo mismo, con cualquier gen o condición. La cruza pasa cuando la planta llega a la etapa de cruza.",
  facts: { ripe: "Madura en", harvest: "Cosecha", water: "Agua", temp: "Temperatura", light: "Luz", clones: "Esquejes", seed: "Semilla", clone: "Esqueje", market: "Valor base" },
  perTick: (n) => `${n} por minuto`,
  tempRange: (lo, hi, best) => `De ${lo} a ${hi} °C, mejor a ${best} °C`,
  lightText: "Sol o lámpara de techo; mejor al mediodía",
  perfectNote: "Tiempos y cantidades sin genes y con condiciones perfectas. En la calculadora los ves con genes.",
  openCalc: "Cruzarla",
  calc: {
    h1: "Calculadora de genética de Rust",
    lede: "Escribí los genes de la planta del medio y de sus vecinas, como los muestra el juego (GGGYYY). Te dice en qué se convierte la del medio al cruzarse, con probabilidades si hay empate.",
    plant: "Planta",
    center: "Planta del medio",
    neighbours: "Vecinas",
    neighbour: (i) => `Vecina ${i}`,
    add: "Sumar vecina",
    remove: "Sacar",
    invalid: "6 letras: G, Y, H, W o X",
    result: "Resultado",
    noChange: "No cambia nada",
    chance: (p) => `${p} de probabilidad`,
    slot: (i) => `Casillero ${i}`,
    slotsTitle: "Casillero por casillero",
    keeps: "se queda",
    stats: "Con estos genes",
    share: "Copiar link",
    copied: "Link copiado",
    copyFailed: "No se pudo copiar: copialo de la barra de direcciones",
    how: [
      "Cuentan las vecinas de la misma planta, en la misma jardinera, vivas y a 1,5 m o menos de la del medio.",
      "Por cada casillero el juego suma los pesos de las vecinas por gen (rojo 1, verde 0,6). El gen con la suma más alta reemplaza al de la del medio sólo si esa suma es mayor que el peso del gen que ya tiene.",
      "Si empatan, gana el gen que llega primero a esa suma en la lista de vecinas del juego. Ese orden no se puede saber, así que un empate se muestra como probabilidad.",
    ],
    finder: "Buscar una cruza",
    finderLede: "Escribí el esqueje que querés y los que tenés: te dice cuál plantar en el medio y qué poner alrededor, con la menor cantidad de vecinas.",
    target: "Esqueje que querés",
    owned: "Esquejes que tenés",
    ownedHelp: "Uno por renglón, o separados por comas",
    find: "Buscar",
    plan: (center, n) => `Plantá ${center} en el medio con ${n === 1 ? "esta vecina" : `estas ${n} vecinas`}:`,
    noPlan: "Con estos esquejes ninguna cruza llega de una. Probá con más esquejes, o cruzá en dos pasos.",
    already: "Ya lo tenés.",
    use: "Cargar en la calculadora",
    tooMany: (max) => `Hasta ${max} esquejes`,
  },
  seo: {
    plant: (name) => ({
      title: `${name} en Rust: tiempo de crecimiento, cosecha y genes | Vestigo`,
      description: `Cómo cultivar ${name.toLowerCase()} en Rust: cada etapa y su tiempo, la cosecha, el agua y el calor que pide, y cómo la cambian los genes.`,
    }),
    genetics: {
      title: "Calculadora de genética de Rust: cruzas y probabilidades para GGGYYY | Vestigo",
      description: "Calculadora de genética de Rust: escribí el esqueje del medio y sus vecinas para ver en qué se convierte, o buscá la cruza del esqueje que querés.",
    },
  },
};

export const FARMING_COPY: Record<"en" | "es", FarmingCopy> = { en: EN, es: ES };
export const useFarmingCopy = (): FarmingCopy => FARMING_COPY[useLang().lang];
