/**
 * Los textos del editor de electricidad (2026-10-09), en inglés y español. Viajan con la pestaña (no con el área): el
 * `<head>` y el nombre de la pestaña están en `rustCopy.ts`.
 */
import type { Category } from "./engine/types";

export interface ElectricCopy {
  h1: string;
  lede: string;
  circuitH1: (name: string) => string;
  palette: string;
  search: string;
  cats: Record<Category, string>;
  inspector: string;
  nothing: string;
  play: string;
  pause: string;
  speed: string;
  hour: string;
  wind: string;
  height: string;
  rain: string;
  fog: string;
  undo: string;
  redo: string;
  remove: string;
  duplicate: string;
  clear: string;
  clearConfirm: string;
  reset: string;
  share: string;
  copied: string;
  copyFailed: string;
  explain: string;
  sockets: string;
  inputs: string;
  outputs: string;
  uses: string;
  makes: string;
  noUse: string;
  openItem: string;
  wire: string;
  materials: string;
  materialsNote: string;
  wireTool: string;
  notCraftable: string;
  issuesTitle: string;
  issues: { unpowered: string; short: string; unwired: string; uphill: string; overload: string };
  wireErrors: { type: string; taken: string; self: string; missing: string };
  readonly: string;
  ready: string;
  readyLede: string;
  howTo: string;
  steps: (from: string, out: string, to: string, inp: string) => string;
  partsList: string;
  openEditor: string;
  backToEditor: string;
  aboutTitle: string;
  about: string[];
  readouts: Record<string, string>;
  actions: Record<string, string>;
  yes: string;
  no: string;
  on: string;
  off: string;
  seconds: (s: string) => string;
  /** "8 h 27 min". */
  lasts: (t: string) => string;
  emptyCanvas: string;
  canvas: string;
  starter: string;
}

const EN: ElectricCopy = {
  h1: "Rust Electricity Simulator",
  lede: "Wire Rust circuits and watch the power flow in real time. Batteries, splitters, branches, logic gates and timers follow the game's own rules, and every circuit gets a link you can share.",
  circuitH1: (name) => `Rust ${name} circuit`,
  palette: "Components",
  search: "Search components",
  cats: { source: "Power", battery: "Batteries", route: "Splitting", logic: "Logic", switch: "Switches", sensor: "Sensors", defense: "Defense & doors", light: "Lights", appliance: "Appliances", water: "Water", industrial: "Industrial" },
  inspector: "Inspector",
  nothing: "Select a component or a wire to see what it does and why.",
  play: "Play",
  pause: "Pause",
  speed: "Speed",
  hour: "Time of day",
  wind: "Wind",
  height: "Turbine height",
  rain: "Rain",
  fog: "Fog",
  undo: "Undo",
  redo: "Redo",
  remove: "Delete",
  duplicate: "Duplicate",
  clear: "Clear",
  clearConfirm: "Clear the whole circuit?",
  reset: "Restart",
  share: "Copy link",
  copied: "Link copied",
  copyFailed: "Couldn't copy: the link is in the address bar",
  explain: "Why",
  sockets: "Sockets",
  inputs: "Inputs",
  outputs: "Outputs",
  uses: "Uses",
  makes: "Makes up to",
  noUse: "Uses nothing",
  openItem: "Item page",
  wire: "Wire",
  materials: "Materials",
  materialsNote: "What it takes to craft every component. Wires only need the wire tool.",
  wireTool: "Wire Tool",
  notCraftable: "not craftable",
  issuesTitle: "Warnings",
  issues: {
    unpowered: "gets power, but not enough to work",
    short: "feeds its own output back into an input: the game counts that input as 0",
    unwired: "has nothing plugged into its power input",
    uphill: "doesn't get water: it sits too high for the water to reach it without a pump",
    overload: "A loop keeps changing every frame: the game would flicker here.",
  },
  wireErrors: {
    type: "Those sockets are different kinds (power, water or industrial).",
    taken: "That socket already has a wire.",
    self: "A component can't be wired to itself.",
    missing: "That socket doesn't exist.",
  },
  readonly: "On a phone the circuit is view-only: tap switches and buttons, press play and open any component. Edit it on a computer.",
  ready: "Ready circuits",
  readyLede: "Open one in the editor, test it and change it.",
  howTo: "How to wire it",
  steps: (from, out, to, inp) => `${from} "${out}" → ${to} "${inp}"`,
  partsList: "Components",
  openEditor: "Open a blank editor",
  backToEditor: "Electricity simulator",
  aboutTitle: "How Rust electricity works",
  about: [
    "Power in Rust is pushed, not pulled: a source sends everything it makes down the wire, and each component decides what to pass on. A splitter divides what comes in evenly between the outputs that have a wire, without looking at what each one needs; whatever isn't used is lost. A branch sends a fixed amount out of Branch Out and the rest straight on.",
    "Batteries are the exception that makes bases work: a battery always pushes its full output (15, 50 or 100), but it only spends what the things wired after it actually use. That's why a battery feeding a turret and a light through a splitter drains 11 per second, not 50. It charges at 80% of what comes in.",
    "Most components that only route power use none: splitters, branches, switches, timers, counters and logic gates. Lights, sensors, RF and door controllers use 1, the auto turret 10, the SAM site 25. A component that gets less than it needs doesn't run and doesn't spend anything.",
  ],
  readouts: {
    generating: "Making",
    fuel: "Low grade fuel",
    fuelPerHour: "Fuel per hour",
    charge: "Charge (rWm)",
    input: "In",
    drain: "Out",
    lasts: "Lasts",
    outputsUsed: "Outputs in use",
    output: "Out",
    blocked: "Blocked",
    passing: "Passing power",
    state: "On",
    count: "Count",
    timer: "Timer (s)",
    left: "Left (s)",
    pressed: "Pressed",
    broadcasting: "Broadcasting",
    receiving: "Receiving",
    detecting: "Detecting",
    players: "Players seen",
    vibration: "Vibration",
    pulse: "Pulse",
    needs: "Needs",
    gets: "Gets",
    online: "Running",
    dps: "Damage per second",
    door: "Door open",
    knocked: "Knocked down",
    playing: "Playing",
    approx: "Approximate (set it by hand)",
    liquid: "Water",
    kind: "Kind",
    flow: "Flow",
    drainWater: "Being used (per second)",
    pushTo: "Pushing to",
    fresh: "Fresh water in the tank",
    spraying: "Watering",
    pump: "Pump",
  },
  actions: {
    power: "On / off",
    fuel: "Low grade fuel",
    charge: "Charge (rWm)",
    branchAmount: "Branch amount",
    target: "Target",
    passthroughMode: "Show passthrough",
    press: "Press",
    timerLength: "Seconds",
    frequency: "Frequency",
    detect: "Something in front",
    players: "Players in range",
    vibrate: "Vibration level",
    shake: "Shake",
    itemChange: "Move an item",
    ammo: "Ammo",
    knock: "Knock down",
    play: "Play music",
    water: "Water inside",
    salt: "Salt water",
    fresh: "Fresh water source (river or lake)",
    height: "Height (m)",
    output: "Power it gives",
  },
  yes: "yes",
  no: "no",
  on: "on",
  off: "off",
  seconds: (s) => `${s} s`,
  lasts: (t) => t,
  emptyCanvas: "Drag a component here, or click one in the list.",
  canvas: "Circuit",
  starter: "Start from a ready circuit",
};

const ES: ElectricCopy = {
  h1: "Simulador de electricidad de Rust",
  lede: "Cableá circuitos de Rust y mirá cómo corre la energía en tiempo real. Baterías, splitters, ramas, compuertas y temporizadores siguen las reglas del juego, y cada circuito tiene un link para compartir.",
  circuitH1: (name) => `Circuito de ${name} en Rust`,
  palette: "Componentes",
  search: "Buscar componentes",
  cats: { source: "Energía", battery: "Baterías", route: "Reparto", logic: "Lógica", switch: "Interruptores", sensor: "Sensores", defense: "Defensa y puertas", light: "Luces", appliance: "Aparatos", water: "Agua", industrial: "Industrial" },
  inspector: "Inspector",
  nothing: "Elegí un componente o un cable para ver qué hace y por qué.",
  play: "Play",
  pause: "Pausa",
  speed: "Velocidad",
  hour: "Hora del día",
  wind: "Viento",
  height: "Altura del molino",
  rain: "Lluvia",
  fog: "Niebla",
  undo: "Deshacer",
  redo: "Rehacer",
  remove: "Borrar",
  duplicate: "Duplicar",
  clear: "Vaciar",
  clearConfirm: "¿Vaciar todo el circuito?",
  reset: "Reiniciar",
  share: "Copiar link",
  copied: "Link copiado",
  copyFailed: "No se pudo copiar: el link está en la barra de direcciones",
  explain: "Por qué",
  sockets: "Enchufes",
  inputs: "Entradas",
  outputs: "Salidas",
  uses: "Consume",
  makes: "Genera hasta",
  noUse: "No consume",
  openItem: "Ficha del objeto",
  wire: "Cable",
  materials: "Materiales",
  materialsNote: "Lo que lleva craftear cada componente. Los cables sólo piden la herramienta de cableado.",
  wireTool: "Herramienta de cableado",
  notCraftable: "no se craftea",
  issuesTitle: "Avisos",
  issues: {
    unpowered: "recibe energía, pero no le alcanza para funcionar",
    short: "recibe en una entrada su propia salida: el juego la cuenta como 0",
    unwired: "no tiene nada enchufado en la entrada de energía",
    uphill: "no recibe agua: está demasiado alto para que llegue sin bomba",
    overload: "Un lazo cambia en cada cuadro: en el juego esto parpadearía.",
  },
  wireErrors: {
    type: "Esos enchufes son de distinto tipo (energía, agua o industrial).",
    taken: "Ese enchufe ya tiene un cable.",
    self: "Un componente no se puede cablear consigo mismo.",
    missing: "Ese enchufe no existe.",
  },
  readonly: "En el celular el circuito es sólo para mirar: tocá interruptores y botones, dale play y abrí cualquier componente. Para editarlo, usá la compu.",
  ready: "Circuitos listos",
  readyLede: "Abrí uno en el editor, probalo y cambialo.",
  howTo: "Cómo cablearlo",
  steps: (from, out, to, inp) => `${from} "${out}" → ${to} "${inp}"`,
  partsList: "Componentes",
  openEditor: "Abrir el editor vacío",
  backToEditor: "Simulador de electricidad",
  aboutTitle: "Cómo funciona la electricidad en Rust",
  about: [
    "En Rust la energía se empuja, no se pide: una fuente manda todo lo que genera por el cable y cada componente decide qué deja pasar. Un splitter reparte lo que le entra en partes iguales entre las salidas que tienen cable, sin mirar lo que pide cada una; lo que no se usa se pierde. Una rama saca una cantidad fija por Branch Out y el resto sigue de largo.",
    "Las baterías son la excepción que hace andar una base: una batería siempre empuja su salida máxima (15, 50 o 100), pero sólo gasta lo que de verdad usan los que cuelgan de ella. Por eso una batería que alimenta una torreta y una luz por un splitter gasta 11 por segundo, no 50. Carga el 80 % de lo que le entra.",
    "Casi todo lo que sólo reparte energía no consume nada: splitters, ramas, interruptores, temporizadores, contadores y compuertas. Las luces, los sensores, el RF y los controladores de puerta consumen 1, la torreta 10 y el SAM 25. Un componente al que le llega menos de lo que necesita no anda y no gasta nada.",
  ],
  readouts: {
    generating: "Genera",
    fuel: "Combustible",
    fuelPerHour: "Combustible por hora",
    charge: "Carga (rWm)",
    input: "Entra",
    drain: "Sale",
    lasts: "Dura",
    outputsUsed: "Salidas en uso",
    output: "Sale",
    blocked: "Bloqueado",
    passing: "Deja pasar",
    state: "Prendido",
    count: "Cuenta",
    timer: "Tiempo (s)",
    left: "Faltan (s)",
    pressed: "Apretado",
    broadcasting: "Emitiendo",
    receiving: "Recibiendo",
    detecting: "Detecta",
    players: "Jugadores",
    vibration: "Vibración",
    pulse: "Pulso",
    needs: "Necesita",
    gets: "Le llega",
    online: "Funciona",
    dps: "Daño por segundo",
    door: "Puerta abierta",
    knocked: "Caído",
    playing: "Sonando",
    approx: "Aproximado (se ajusta a mano)",
    liquid: "Agua",
    kind: "Tipo",
    flow: "Caudal",
    drainWater: "Se gasta (por segundo)",
    pushTo: "Empuja a",
    fresh: "Agua dulce en el depósito",
    spraying: "Riega",
    pump: "Bomba",
  },
  actions: {
    power: "Prender / apagar",
    fuel: "Combustible",
    charge: "Carga (rWm)",
    branchAmount: "Cantidad de la rama",
    target: "Objetivo",
    passthroughMode: "Mostrar lo que pasa",
    press: "Apretar",
    timerLength: "Segundos",
    frequency: "Frecuencia",
    detect: "Algo adelante",
    players: "Jugadores en rango",
    vibrate: "Nivel de vibración",
    shake: "Sacudir",
    itemChange: "Mover un objeto",
    ammo: "Munición",
    knock: "Voltear",
    play: "Poner música",
    water: "Agua adentro",
    salt: "Agua salada",
    fresh: "Agua dulce (río o lago)",
    height: "Altura (m)",
    output: "Energía que da",
  },
  yes: "sí",
  no: "no",
  on: "prendido",
  off: "apagado",
  seconds: (s) => `${s} s`,
  lasts: (t) => t,
  emptyCanvas: "Arrastrá un componente acá o hacé clic en uno de la lista.",
  canvas: "Circuito",
  starter: "Empezar con un circuito listo",
};

export const ELECTRIC_COPY = { en: EN, es: ES };
