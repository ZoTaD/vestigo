/**
 * Los circuitos listos (2026-10-09): cada uno con su página (`/en/rust/electricity/<slug>`,
 * `/es/rust/electricidad/<slugEs>`) que abre el editor con el circuito cargado. Los textos son nuestros; los números
 * que nombran salen de simularlos (lo prueba `test/rustElectricCircuits.test.ts`). Plan:
 * docs/superpowers/plans/2026-10-09-rust-electricidad.md.
 */
import { registerCircuitMeta } from "./circuitMeta";
import type { Circuit, Part, PartCfg, Wire } from "./engine/types";

export interface ReadyCircuit {
  slug: string;
  slugEs: string;
  /** Lo que se busca: "solar turret" → "Rust solar turret circuit" / "Circuito de torreta solar en Rust". */
  name: { en: string; es: string };
  /** Una o dos frases: qué hace y por qué así. */
  about: { en: string; es: string };
  circuit: Circuit;
}

const P = (id: string, type: string, x: number, y: number, cfg?: PartCfg): Part => ({ id, type, x, y, ...(cfg ? { cfg } : {}) });
const W = (s: string): Wire[] =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      const [f, t] = w.split(">");
      const [fa, fs] = f.split(".");
      const [ta, ts] = t.split(".");
      return { from: [fa, Number(fs)], to: [ta, Number(ts)] };
    });

/** Columnas del lienzo. */
const X = (i: number): number => i * 190;

export const CIRCUITS: ReadyCircuit[] = [
  {
    slug: "solar-turret",
    slugEs: "torreta-solar",
    name: { en: "solar turret", es: "torreta solar" },
    about: {
      en: "Two large solar panels charge a medium battery through a combiner; the battery runs an auto turret day and night. The battery pushes 50 but only spends the 10 the turret uses.",
      es: "Dos paneles solares grandes cargan una batería mediana por un combinador; la batería mantiene la torreta de día y de noche. La batería empuja 50 pero sólo gasta los 10 que usa la torreta.",
    },
    circuit: {
      parts: [P("s1", "electric.solarpanel.large", X(0), 0), P("s2", "electric.solarpanel.large", X(0), 140), P("c", "electrical.combiner", X(1), 70), P("b", "electric.battery.rechargable.medium", X(2), 70, { charge: 3000 }), P("t", "autoturret", X(3), 70)],
      wires: W("s1.0>c.0 s2.0>c.1 c.0>b.0 b.0>t.0"),
      env: { hour: 12 },
    },
  },
  {
    slug: "sam-site",
    slugEs: "sam",
    name: { en: "SAM site", es: "SAM" },
    about: {
      en: "A wind turbine charges a large battery that feeds a SAM site. The SAM needs 25; whatever is left goes out of its Passthrough to a light.",
      es: "Un molino carga una batería grande que alimenta un SAM. El SAM necesita 25; lo que sobra sale por su Passthrough a una luz.",
    },
    circuit: {
      parts: [P("m", "generator.wind.scrap", X(0), 0), P("b", "electric.battery.rechargable.large", X(1), 0, { charge: 12000 }), P("s", "samsite", X(2), 0), P("l", "electric.simplelight", X(3), 60)],
      wires: W("m.0>b.0 b.0>s.0 s.3>l.0"),
      env: { gust: 0.5, height: 20 },
    },
  },
  {
    slug: "button-door",
    slugEs: "puerta-con-boton",
    name: { en: "button door", es: "puerta con botón" },
    about: {
      en: "A button starts a timer that keeps a door controller powered for 5 seconds: the door opens and closes by itself. A button alone gives a half-second pulse, too short to open a door.",
      es: "Un botón arranca un temporizador que alimenta un controlador de puerta 5 segundos: la puerta se abre y se cierra sola. Un botón solo da un pulso de medio segundo, poco para abrir una puerta.",
    },
    circuit: {
      parts: [P("b", "electric.battery.rechargable.small", X(0), 60, { charge: 400 }), P("sp", "electric.splitter", X(1), 60), P("bt", "electric.button", X(2), 0), P("t", "electric.timer", X(3), 60, { timerLength: 5 }), P("d", "electric.doorcontroller", X(4), 60)],
      wires: W("b.0>sp.0 sp.0>bt.0 sp.1>t.0 bt.0>t.1 t.0>d.0"),
    },
  },
  {
    slug: "hbhf-tesla-trap",
    slugEs: "trampa-hbhf-tesla",
    name: { en: "HBHF tesla trap", es: "trampa con HBHF y Tesla" },
    about: {
      en: "An HBHF sensor feeds one input of an AND switch and a branch gives 25 to the other: when someone walks in, the AND gives the larger of the two and the tesla coil fires at full power.",
      es: "Un sensor HBHF va a una entrada de una compuerta AND y una rama le da 25 a la otra: cuando entra alguien, la AND da lo mayor de las dos y la bobina Tesla descarga a pleno.",
    },
    circuit: {
      parts: [P("b", "electric.battery.rechargable.medium", X(0), 60, { charge: 9000 }), P("r", "electrical.branch", X(1), 60, { branchAmount: 25 }), P("h", "electric.hbhfsensor", X(2), 0, { players: 1 }), P("a", "electric.andswitch", X(3), 60), P("t", "electric.teslacoil", X(4), 60)],
      wires: W("b.0>r.0 r.0>h.0 r.1>a.1 h.0>a.0 a.0>t.0"),
    },
  },
  {
    slug: "night-lights",
    slugEs: "luces-de-noche",
    name: { en: "night lights", es: "luces de noche" },
    about: {
      en: "A small solar panel's output goes into a blocker's Block Passthrough: during the day the sun blocks the lights, at night the battery lights them up.",
      es: "La salida de un panel solar va al Block Passthrough de un bloqueador: de día el sol corta las luces y de noche la batería las prende.",
    },
    circuit: {
      parts: [P("s", "electric.solarpanel.large", X(0), 140), P("b", "electric.battery.rechargable.small", X(0), 0, { charge: 400 }), P("bl", "electric.blocker", X(1), 40), P("l1", "electric.simplelight", X(2), 0), P("l2", "electric.simplelight", X(3), 0), P("l3", "electric.simplelight", X(4), 0)],
      wires: W("b.0>bl.0 s.0>bl.1 bl.0>l1.0 l1.0>l2.0 l2.0>l3.0"),
      env: { hour: 22 },
    },
  },
  {
    slug: "battery-backup",
    slugEs: "respaldo-de-bateria",
    name: { en: "battery backup", es: "respaldo de batería" },
    about: {
      en: "Solar and wind add up in a combiner and charge a large battery; the base hangs off the battery, so it keeps running when the sun sets or the wind drops.",
      es: "El sol y el viento se suman en un combinador y cargan una batería grande; la base cuelga de la batería, así que sigue andando cuando se va el sol o baja el viento.",
    },
    circuit: {
      parts: [
        P("s", "electric.solarpanel.large", X(0), 0),
        P("m", "generator.wind.scrap", X(0), 140),
        P("c", "electrical.combiner", X(1), 70),
        P("b", "electric.battery.rechargable.large", X(2), 70, { charge: 6000 }),
        P("sp", "electric.splitter", X(3), 70),
        P("t", "autoturret", X(4), 0),
        P("h", "electric.heater", X(4), 140),
        P("f", "fridge", X(4), 280),
      ],
      wires: W("s.0>c.0 m.0>c.1 c.0>b.0 b.0>sp.0 sp.0>t.0 sp.1>h.0 sp.2>f.0"),
      env: { hour: 15, gust: 0.4, height: 10 },
    },
  },
  {
    slug: "fuel-generator-smart-switch",
    slugEs: "generador-con-interruptor-inteligente",
    name: { en: "fuel generator smart switch", es: "generador con interruptor inteligente" },
    about: {
      en: "A smart switch starts the fuel generator through Force Start and, through a blocker that inverts it, stops it with Force Stop: turn it on from the app and the generator only burns fuel when you need it.",
      es: "Un interruptor inteligente prende el generador por Force Start y, con un bloqueador que lo invierte, lo apaga por Force Stop: lo prendés desde la app y el generador sólo quema combustible cuando hace falta.",
    },
    circuit: {
      parts: [
        P("b", "electric.battery.rechargable.small", X(0), 60, { charge: 400 }),
        P("sp", "electric.splitter", X(1), 60),
        P("ss", "smart.switch", X(2), 0, { on: 1 }),
        P("s2", "electric.splitter", X(3), 0),
        P("bl", "electric.blocker", X(3), 160),
        P("g", "electric.fuelgenerator.small", X(4), 60),
        P("l", "electric.fluorescentlight", X(5), 60),
      ],
      wires: W("b.0>sp.0 sp.0>ss.0 sp.1>bl.0 ss.0>s2.0 s2.0>g.0 s2.1>bl.1 bl.0>g.1 g.0>l.0"),
    },
  },
  {
    slug: "and-gate",
    slugEs: "compuerta-and",
    name: { en: "AND gate", es: "compuerta AND" },
    about: {
      en: "The light only turns on with both switches on. An AND switch gives the larger of its two inputs, not the sum.",
      es: "La luz sólo se prende con los dos interruptores prendidos. La compuerta AND da la mayor de sus dos entradas, no la suma.",
    },
    circuit: gateCircuit("electric.andswitch", 1, 1),
  },
  {
    slug: "or-gate",
    slugEs: "compuerta-or",
    name: { en: "OR gate", es: "compuerta OR" },
    about: {
      en: "The light turns on with either switch. Useful to open one door from two places.",
      es: "La luz se prende con cualquiera de los dos interruptores. Sirve para abrir una puerta desde dos lugares.",
    },
    circuit: gateCircuit("electric.orswitch", 1, 0),
  },
  {
    slug: "xor-gate",
    slugEs: "compuerta-xor",
    name: { en: "XOR gate", es: "compuerta XOR" },
    about: {
      en: "The light turns on with one switch on, but not with both: the classic stair light that two switches control.",
      es: "La luz se prende con un interruptor, pero no con los dos: la luz de escalera de toda la vida, con dos interruptores.",
    },
    circuit: gateCircuit("electric.xorswitch", 1, 0),
  },
  {
    slug: "memory-cell",
    slugEs: "celda-de-memoria",
    name: { en: "memory cell", es: "celda de memoria" },
    about: {
      en: "One button sets the memory cell and the other resets it: it remembers the last one pressed. Output lights one lamp and Inverted Output the other.",
      es: "Un botón prende la celda de memoria y el otro la apaga: se acuerda del último que apretaste. Output prende una luz e Inverted Output la otra.",
    },
    circuit: {
      parts: [
        P("g", "electric.battery.rechargable.small", X(0), 100, { charge: 400 }),
        P("sp", "electric.splitter", X(1), 100),
        P("bs", "electric.button", X(2), 0),
        P("br", "electric.button", X(2), 200),
        P("m", "electrical.memorycell", X(3), 100),
        P("o", "electric.simplelight", X(4), 40),
        P("i", "electric.simplelight", X(4), 180),
      ],
      wires: W("g.0>sp.0 sp.0>m.0 sp.1>bs.0 sp.2>br.0 bs.0>m.1 br.0>m.2 m.0>o.0 m.1>i.0"),
    },
  },
  {
    slug: "counter",
    slugEs: "contador",
    name: { en: "counter", es: "contador" },
    about: {
      en: "Each button press adds one to the counter; at 3 it lets power through and the light turns on. Press the second button to reset it.",
      es: "Cada vez que apretás el botón el contador suma uno; al llegar a 3 deja pasar la energía y se prende la luz. El segundo botón lo vuelve a cero.",
    },
    circuit: {
      parts: [
        P("g", "electric.battery.rechargable.small", X(0), 100, { charge: 400 }),
        P("sp", "electric.splitter", X(1), 100),
        P("bt", "electric.button", X(2), 0),
        P("br", "electric.button", X(2), 200),
        P("k", "electric.counter", X(3), 100, { target: 3 }),
        P("l", "electric.simplelight", X(4), 100),
      ],
      wires: W("g.0>sp.0 sp.0>k.0 sp.1>bt.0 sp.2>br.0 bt.0>k.1 br.0>k.3 k.0>l.0"),
    },
  },
  {
    slug: "seismic-alarm",
    slugEs: "alarma-sismica",
    name: { en: "seismic sensor alarm", es: "alarma con sensor sísmico" },
    about: {
      en: "A seismic sensor gives power while it feels raiding nearby and holds it 3 seconds after the last hit: it sounds an alarm and turns on a siren light.",
      es: "Un sensor sísmico da energía mientras siente un raideo cerca y la sostiene 3 segundos después del último golpe: hace sonar una alarma y prende una luz de sirena.",
    },
    circuit: {
      parts: [
        P("b", "electric.battery.rechargable.small", X(0), 60, { charge: 400 }),
        P("s", "electric.seismicsensor", X(1), 60, { vibration: 10 }),
        P("sp", "electric.splitter", X(2), 60),
        P("a", "electric.audioalarm", X(3), 0),
        P("l", "electric.sirenlight", X(3), 140),
      ],
      wires: W("b.0>s.0 s.0>sp.0 sp.0>a.0 sp.1>l.0"),
    },
  },
  {
    slug: "turrets-with-branches",
    slugEs: "torretas-con-ramas",
    name: { en: "turrets with branches", es: "torretas con ramas" },
    about: {
      en: "Electrical branches send exactly 10 to each turret and pass the rest along: three turrets from one battery without a splitter dividing the power.",
      es: "Las ramas mandan 10 justos a cada torreta y pasan el resto: tres torretas con una sola batería, sin un splitter que divida la energía.",
    },
    circuit: {
      parts: [
        P("b", "electric.battery.rechargable.large", X(0), 0, { charge: 12000 }),
        P("r1", "electrical.branch", X(1), 0, { branchAmount: 10 }),
        P("r2", "electrical.branch", X(2), 0, { branchAmount: 10 }),
        P("t1", "autoturret", X(2), 160),
        P("t2", "autoturret", X(3), 160),
        P("t3", "autoturret", X(3), 0),
      ],
      wires: W("b.0>r1.0 r1.1>t1.0 r1.0>r2.0 r2.1>t2.0 r2.0>t3.0"),
    },
  },
  {
    slug: "rf-door",
    slugEs: "puerta-por-rf",
    name: { en: "RF door", es: "puerta por RF" },
    about: {
      en: "A switch powers an RF broadcaster; a receiver on the same frequency lets power through to a door controller. Turn it off and the door closes within a second.",
      es: "Un interruptor alimenta un emisor de RF; un receptor en la misma frecuencia deja pasar la energía a un controlador de puerta. Apagalo y la puerta se cierra en menos de un segundo.",
    },
    circuit: {
      parts: [
        P("b", "electric.battery.rechargable.small", X(0), 80, { charge: 400 }),
        P("sp", "electric.splitter", X(1), 80),
        P("sw", "electric.switch", X(2), 0, { on: 1 }),
        P("tx", "electric.rf.broadcaster", X(3), 0, { frequency: 4765 }),
        P("rx", "electric.rf.receiver", X(2), 180, { frequency: 4765 }),
        P("d", "electric.doorcontroller", X(3), 180),
      ],
      wires: W("b.0>sp.0 sp.0>sw.0 sw.0>tx.0 sp.1>rx.0 rx.0>d.0"),
    },
  },
  // ---- Agua (2026-10-09) ----
  {
    slug: "farm-irrigation",
    slugEs: "riego-de-granja",
    name: { en: "farm irrigation", es: "riego de granja" },
    about: {
      en: "A water pump on a river fills a barrel on the roof; a fluid splitter feeds three sprinklers below. The powered pump pushes uphill, and each sprinkler uses 2 water per second while it gets any flow.",
      es: "Una bomba en un río llena un barril en el techo y un splitter de agua alimenta tres aspersores abajo. La bomba con energía empuja para arriba, y cada aspersor gasta 2 de agua por segundo mientras le llegue caudal.",
    },
    circuit: {
      parts: [
        P("s", "electric.solarpanel.large", X(0), 0),
        P("p", "waterpump", X(1), 0, { fresh: 1, water: 500 }),
        P("b", "water.barrel", X(2), 0, { height: 4 }),
        P("sp", "fluid.splitter", X(3), 0),
        P("k1", "electric.sprinkler", X(4), -120),
        P("k2", "electric.sprinkler", X(4), 20),
        P("k3", "electric.sprinkler", X(4), 160),
      ],
      wires: W("s.0>p.0 p.0>b.0 b.0>sp.0 sp.0>k1.0 sp.1>k2.0 sp.2>k3.0"),
      env: { hour: 12 },
    },
  },
  {
    slug: "water-purifier-with-pump",
    slugEs: "purificador-con-bomba",
    name: { en: "water purifier with pump", es: "purificador con bomba" },
    about: {
      en: "A water pump in the sea fills a powered water purifier with salt water; the purifier turns it into fresh water at 2 to 1 and its tank pushes it into a barrel. Pump and purifier use 5 power each.",
      es: "Una bomba en el mar llena de agua salada un purificador con energía; el purificador la convierte en agua dulce a razón de 2 a 1 y su depósito la empuja a un barril. Bomba y purificador consumen 5 cada uno.",
    },
    circuit: {
      parts: [
        P("w", "generator.wind.scrap", X(0), 0),
        P("sp", "electric.splitter", X(1), 0),
        P("p", "waterpump", X(2), -100),
        P("u", "powered.water.purifier", X(3), 40),
        P("b", "water.barrel", X(4), 40, { height: -1 }),
      ],
      wires: W("w.0>sp.0 sp.0>p.0 sp.1>u.1 p.0>u.0 u.0>b.0"),
      env: { gust: 0.5, height: 20 },
    },
  },
  {
    slug: "water-catcher-to-barrel",
    slugEs: "colector-a-barril",
    name: { en: "water catcher to barrel", es: "colector de agua a barril" },
    about: {
      en: "A large water catcher on the roof drops what it collects straight into a barrel below, every minute; rain fills it much faster. Water only flows down without a pump.",
      es: "Un colector de agua grande en el techo deja lo que junta directo en un barril de abajo, cada minuto; con lluvia se llena mucho más rápido. Sin bomba, el agua sólo baja.",
    },
    circuit: {
      parts: [P("k", "water.catcher.large", X(0), 0, { height: 3 }), P("b", "water.barrel", X(1), 0)],
      wires: W("k.0>b.0"),
      env: { rain: 0.2 },
    },
  },
  {
    slug: "fluid-switch-pump",
    slugEs: "interruptor-de-fluidos-como-bomba",
    name: { en: "fluid switch pump", es: "interruptor de fluidos como bomba" },
    about: {
      en: "A fluid switch with power on Pump Power works as a pump: it sends water from a barrel on the ground up to a barrel 6 m higher. Cut the pump power and the water stops going up.",
      es: "Un interruptor de fluidos con energía en Pump Power hace de bomba: manda el agua de un barril en el piso a otro 6 m más arriba. Sin energía en la bomba, el agua deja de subir.",
    },
    circuit: {
      parts: [
        P("a", "water.barrel", X(0), 100, { water: 5000 }),
        P("g", "electric.battery.rechargable.small", X(0), -40, { charge: 400 }),
        P("sw", "electric.switch", X(1), -40, { on: 1 }),
        P("f", "fluid.switch", X(2), 60, { on: 1 }),
        P("b", "water.barrel", X(3), 60, { height: 6 }),
      ],
      wires: W("g.0>sw.0 sw.0>f.2 a.0>f.0 f.0>b.0"),
    },
  },
  // ---- Industrial (2026-10-09) ----
  {
    slug: "item-sorter",
    slugEs: "clasificador",
    name: { en: "item sorter", es: "clasificador de objetos" },
    about: {
      en: "An industrial splitter feeds two conveyors from the same box: one filters metal and sulfur ore into the ore box, the other is set to Not with the same filter and takes everything else. Each conveyor moves every 5 seconds.",
      es: "Un splitter industrial alimenta dos cintas desde la misma caja: una filtra la mena de metal y la de azufre hacia la caja de menas, y la otra, en modo No con el mismo filtro, se lleva todo lo demás. Cada cinta mueve cada 5 segundos.",
    },
    circuit: {
      parts: [
        P("g", "electric.battery.rechargable.medium", X(0), -160, { charge: 9000 }),
        P("sp", "electric.splitter", X(1), -160),
        { ...P("a", "box.wooden.large", X(0), 60), inv: [{ id: "metal.ore", slot: 0, n: 500 }, { id: "sulfur.ore", slot: 1, n: 500 }, { id: "wood", slot: 2, n: 300 }, { id: "scrap", slot: 3, n: 100 }] },
        P("is", "industrial.splitter", X(1), 60),
        { ...P("k1", "industrial.conveyor", X(2), -20, { on: 1 }), filters: [{ item: "metal.ore" }, { item: "sulfur.ore" }] },
        { ...P("k2", "industrial.conveyor", X(2), 140, { on: 1, mode: 2 }), filters: [{ item: "metal.ore" }, { item: "sulfur.ore" }] },
        P("b1", "box.wooden.large", X(3), -20),
        P("b2", "box.wooden.large", X(3), 140),
      ],
      wires: W("g.0>sp.0 sp.0>k1.1 sp.1>k2.1 a.0>is.0 is.0>k1.0 is.1>k2.0 k1.0>b1.0 k2.0>b2.0"),
    },
  },
  {
    slug: "auto-furnace",
    slugEs: "horno-automatico",
    name: { en: "auto furnace", es: "horno automático" },
    about: {
      en: "A conveyor fills a furnace from a box: wood goes into the fuel slot and ore into the input slots on their own. A second conveyor empties the output slots into another box. The furnace has to be lit with wood inside and goes out when it runs out.",
      es: "Una cinta llena un horno desde una caja: la leña va sola a la ranura de combustible y la mena a las de entrada. Otra cinta vacía las ranuras de salida en otra caja. El horno se prende con leña adentro y se apaga cuando se le acaba.",
    },
    circuit: {
      parts: [
        P("g", "electric.battery.rechargable.medium", X(0), -160, { charge: 9000 }),
        P("sp", "electric.splitter", X(1), -160),
        { ...P("a", "box.wooden.large", X(0), 60), inv: [{ id: "wood", slot: 0, n: 1000 }, { id: "metal.ore", slot: 1, n: 1000 }] },
        P("k1", "industrial.conveyor", X(1), 60, { on: 1 }),
        { ...P("f", "furnace", X(2), 60, { on: 1 }), inv: [{ id: "wood", slot: 0, n: 20 }] },
        P("k2", "industrial.conveyor", X(3), 60, { on: 1 }),
        P("b", "box.wooden.large", X(4), 60),
      ],
      wires: W("g.0>sp.0 sp.0>k1.1 sp.1>k2.1 a.0>k1.0 k1.0>f.0 f.0>k2.0 k2.0>b.0"),
    },
  },
  {
    slug: "auto-crafting",
    slugEs: "autocrafteo",
    name: { en: "auto crafting", es: "autocrafteo" },
    about: {
      en: "A conveyor feeds charcoal and sulfur to an industrial crafter with the gun powder blueprint; every 5 seconds it starts a batch of 10 if it has 30 charcoal and 20 sulfur, and a second conveyor takes the gun powder to a box.",
      es: "Una cinta le lleva carbón y azufre a un crafteador industrial con el plano de la pólvora; cada 5 segundos arranca una tanda de 10 si tiene 30 de carbón y 20 de azufre, y otra cinta se lleva la pólvora a una caja.",
    },
    circuit: {
      parts: [
        P("g", "electric.battery.rechargable.medium", X(0), -160, { charge: 9000 }),
        P("sp", "electric.splitter", X(1), -160),
        { ...P("a", "box.wooden.large", X(0), 60), inv: [{ id: "charcoal", slot: 0, n: 1000 }, { id: "sulfur", slot: 1, n: 1000 }] },
        P("k1", "industrial.conveyor", X(1), 60, { on: 1 }),
        { ...P("x", "industrial.crafter", X(2), 60, { on: 1 }), inv: [{ id: "bp:gunpowder", slot: 0, n: 1 }] },
        P("k2", "industrial.conveyor", X(3), 60, { on: 1 }),
        P("b", "box.wooden.large", X(4), 60),
      ],
      wires: W("g.0>sp.0 sp.0>k1.1 sp.1>k2.1 sp.2>x.1 a.0>k1.0 k1.0>x.0 x.0>k2.0 k2.0>b.0"),
    },
  },
];

function gateCircuit(gate: string, a: number, b: number): Circuit {
  return {
    parts: [
      P("g", "electric.battery.rechargable.small", X(0), 100, { charge: 400 }),
      P("sp", "electric.splitter", X(1), 100),
      P("sa", "electric.switch", X(2), 0, { on: a }),
      P("sb", "electric.switch", X(2), 200, { on: b }),
      P("x", gate, X(3), 100),
      P("l", "electric.simplelight", X(4), 100),
    ],
    wires: W("g.0>sp.0 sp.0>sa.0 sp.1>sb.0 sa.0>x.0 sb.0>x.1 x.0>l.0"),
  };
}

export const circuitBySlug = (slug: string | undefined): ReadyCircuit | undefined => (slug ? CIRCUITS.find((c) => c.slug === slug) : undefined);

registerCircuitMeta(CIRCUITS);

/** Los slugs en español de los circuitos, para `registerRustSlugs` (los que cambian). */
export const circuitSlugsEs = (): Record<string, string> => Object.fromEntries(CIRCUITS.filter((c) => c.slugEs !== c.slug).map((c) => [c.slug, c.slugEs]));
