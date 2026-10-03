/**
 * Los textos de la pestaña Servidor de Project Zomboid (2026-10-01), en inglés y español con voseo. Van en un módulo
 * propio y no en `zomboidCopy.ts`, como los de las otras pestañas; el `<head>` sí sigue allá (`seo.server` y
 * `seo.detail.server`): lo escribe el prerender sin bajar la pestaña.
 *
 * Todo esto es texto nuestro. Los nombres de las opciones, su ayuda, las etiquetas de los enum, las hojas y los presets
 * (nombre y descripción) salen de los datos, con la traducción oficial.
 */
import { useLang } from "../../i18n";

export interface PzServerCopy {
  title: string;
  /** `sandbox` y `ini` son las cantidades de opciones, de los datos; `version`, la del juego. */
  intro: (sandbox: string, ini: string, version: string) => string[];
  hand: string;
  notFound: string;
  presetsTitle: string;
  presetsNote: string;
  /** Lo que se pregunta antes de pisar cambios al elegir otro preset. */
  confirmPreset: (name: string, n: number) => string;
  toolbar: string;
  search: string;
  searchHint: string;
  onlyChanged: (n: string) => string;
  serverName: string;
  serverNameNote: string;
  download: string;
  copy: string;
  copied: string;
  copyLink: string;
  linkWhat: string;
  linkNote: string;
  showing: (shown: string, total: string) => string;
  empty: string;
  /** "Sólo lo que cambiaste" sin nada cambiado. */
  emptyChanged: string;
  changedCount: (n: number) => string;
  changed: string;
  resetSandbox: string;
  resetIni: string;
  /** "Default (Apocalipsis): Normal": el valor del preset base, que es el que el juego llama "Default". */
  presetDefault: (preset: string, value: string) => string;
  iniDefault: (value: string) => string;
  yes: string;
  no: string;
  emptyValue: string;
  invalid: { type: string; range: (min: string, max: string) => string; enum: string; equals: string; equalsLoaded: (reads: string) => string };
  iniTitle: (file: string) => string;
  iniIntro: string;
  notes: {
    shutRange: (modifier: string) => string;
    shutDays: { water: string; power: string };
    spawnBefore: string;
    spawnLink: string;
    spawnAfter: string;
    secret: string;
    /** `Seed`: la sortea el servidor; viaja en el link. */
    random: string;
    /** `ResetID` y `ServerPlayerID`: las sortea el servidor, y en uno que ya existe hay que copiarlas. */
    serverIds: string;
    /** La IP anunciada y las rutas de las listas de palabras: no son secretas, pero no viajan en el link. */
    noLink: string;
  };
  /** "Pegá tu archivo" (Task 3). */
  paste: PasteCopy;
  /** Los presets comparados (`/servidor/presets-de-sandbox`, Task 4). */
  presets: PresetsCopy;
  /** La calculadora de cortes de agua y luz (`/servidor/cortes-de-agua-y-luz`, Task 5). */
  shutoff: ShutoffCopy;
}

/** Un corte, para decirlo en una frase: en una fecha, ya al empezar o nunca. */
export type CutSay = { kind: "at"; when: string } | { kind: "start" } | { kind: "never" };

/**
 * La calculadora de cortes. TEXTO PROPIO (2026-10-02), corto: lo que el juego no explica en ningún lado (que en un
 * servidor manda el modificador, que el día se cuenta desde las 7:00, que cada mes resta 30 días y que "0-30 días" es
 * de 0 a 29). Las etiquetas de las opciones (meses, horas, rangos) salen de los datos, con la traducción oficial.
 */
export interface ShutoffCopy {
  crumbHere: string;
  title: string;
  hand: string;
  intro: (version: string) => string[];
  /** Las dos solapas: servidor dedicado o partida de un jugador. */
  modeLabel: string;
  modeServer: string;
  modeSolo: string;
  modeServerNote: string;
  modeSoloNote: string;
  inputsTitle: string;
  presetsLabel: string;
  startDate: string;
  /** "Arranca el 9 de julio de 1993, 9:00". */
  starts: (when: string) => string;
  /** Debajo de cada modificador: qué quieren decir −1 y 2147483647. */
  modifierHint: string;
  invalid: (min: string, max: string) => string;
  water: string;
  power: string;
  startNow: string;
  never: string;
  /** "13 días y 22 horas después de empezar". */
  after: (days: number, hours: number, num: (n: number) => string) => string;
  /** "≈ 20 h 53 min reales con días de 1 h 30 min". */
  real: (time: string, day: string) => string;
  /** Una duración: "20 h 53 min", "45 min", "1.234 h". */
  duration: (hours: number, minutes: number, num: (n: number) => string) => string;
  /** El rango de una partida de un jugador. */
  earliest: string;
  latest: string;
  /** Con la etiqueta de la opción del juego ("0-30 días"). */
  rangeNote: (label: string) => string;
  howTitle: string;
  how: string[];
  toGenerator: string;
  /** La línea junto a `WaterShutModifier` / `ElecShutModifier` en el generador. */
  line: (what: "water" | "power", cut: CutSay) => string;
  /** El link de esa línea a esta página. */
  lineLink: string;
}

export interface PresetsCopy {
  /** El breadcrumb: "Servidor › Presets de sandbox". */
  crumbServer: string;
  crumbHere: string;
  title: string;
  hand: string;
  /** `changed` de `total` opciones cambian entre los presets; `same` valen lo mismo; `version`, la del juego. */
  intro: (changed: string, total: string, same: string, version: string) => string[];
  presetsTitle: string;
  /** Cuántas opciones del preset difieren de Apocalipsis (0 en Apocalipsis, que es la base). */
  diffs: (n: string, base: string) => string;
  use: string;
  /** El filtro, prendido de entrada. */
  onlyChanging: (n: string) => string;
  /** Qué quiere decir el tinte. */
  legend: (base: string) => string;
  colOption: string;
  /** Desde el generador: el link a esta página y el de cada tarjeta de preset. */
  compare: string;
  compareCard: string;
}

/** Un aviso del lector, ya con lo que se muestra: la clave, lo que decía el archivo y lo que usa el juego. */
export interface IssueText {
  kind: string;
  file: "lua" | "ini";
  /** Un `syntax` con el que el juego no carga el archivo así como está. */
  fatal?: boolean;
  /** Un `syntax` por demasiadas tablas una adentro de otra. */
  deep?: boolean;
  key?: string;
  got?: string;
  used?: string;
}

export interface PasteCopy {
  title: string;
  hand: string;
  intro: string;
  privacy: string;
  label: string;
  placeholder: string;
  choose: string;
  kindLabel: string;
  /** "Automático", con lo que detectó. */
  kindAuto: (detected: string) => string;
  tooBig: string;
  readError: string;
  /** El Lua no tiene una tabla de opciones. */
  noTable: string;
  /** "Se parece a Brote inicial: 3 diferencias". */
  like: (preset: string, n: number) => string;
  /** El `.ini`: cuántas difieren del default. */
  iniLike: (n: number) => string;
  diffTitle: string;
  colOption: string;
  colFile: string;
  colPreset: (preset: string) => string;
  colDefault: string;
  /** Una clave que el archivo no trae: queda en Apocalipsis. */
  notInFile: (baseline: string) => string;
  /** Una clave que el archivo trae con un valor que el juego no acepta. */
  ignored: (baseline: string) => string;
  extraTitle: string;
  extraNote: string;
  issuesTitle: string;
  line: (n: number) => string;
  /** Cuántos avisos más hay, cuando son demasiados para listarlos. */
  more: (n: number) => string;
  issue: (i: IssueText) => string;
  load: string;
  /** Lo que se pregunta antes de pisar cambios hechos a mano. */
  confirmLoad: (n: number) => string;
  loaded: string;
}

const EN: PzServerCopy = {
  title: "Project Zomboid Server Settings Generator",
  intro: (sandbox, ini, v) => [
    `Set up your Project Zomboid dedicated server here: all ${sandbox} sandbox options and the ${ini} options of servertest.ini in Build ${v}, grouped as in the game's server settings screen and with help for every option.`,
    "Start from one of the game's presets, change what you want and download the two files: they go in the Zomboid/Server folder of the computer that runs the server, and with the same name they replace that server's files (servertest is the game's default name). The link keeps your settings to share them; passwords, tokens, your IP and the server's IDs never go in it.",
    "If you already have a server, copy its ResetID and ServerPlayerID from your current .ini into the .ini sheet below before replacing it: if they're missing, the server picks new ones and players will need new characters.",
  ],
  hand: "pick a preset, change anything",
  notFound: "We couldn't find that page. Here's the server generator.",
  presetsTitle: "Start from a preset",
  presetsNote: "the game's five",
  confirmPreset: (name, n) => `Start from ${name}? You'll lose ${n} sandbox change${n === 1 ? "" : "s"} (the .ini stays as it is).`,
  toolbar: "Your files",
  search: "Search an option",
  searchHint: "zombies, speed, PVP, ZombieLore.Speed…",
  onlyChanged: (n) => `Only what you changed (${n})`,
  serverName: "Server name",
  serverNameNote: "it names the two files",
  download: "Download",
  copy: "Copy",
  copied: "Copied!",
  copyLink: "Copy link",
  linkWhat: "to these settings",
  linkNote: "no passwords or tokens",
  showing: (shown, total) => `Showing ${shown} of ${total} options`,
  empty: "No option by that name. Try its key (ZombieLore.Speed) or the name in Spanish.",
  emptyChanged: "You haven't changed anything yet: everything is as in the preset.",
  changedCount: (n) => `${n} changed`,
  changed: "changed",
  resetSandbox: "Back to the preset's value",
  resetIni: "Back to the default",
  presetDefault: (preset, value) => `Default (${preset}): ${value}`,
  iniDefault: (value) => `Default: ${value}`,
  yes: "Yes",
  no: "No",
  emptyValue: "(empty)",
  invalid: {
    type: "That's not a valid value: the file keeps the previous one.",
    range: (min, max) => `It has to be between ${min} and ${max}: the file keeps the previous one.`,
    enum: "That value isn't on the list: the file keeps the previous one.",
    equals: "It can't have an \"=\": the server cuts the text at the first one. The file keeps the previous one.",
    equalsLoaded: (reads) => `It has an "=": the server cuts the text there and reads "${reads}". Take it out.`,
  },
  iniTitle: (file) => file,
  iniIntro:
    "The server's own options: name and password, players, PVP, safehouses, chat, Discord, mods and the anti-cheat. They go by their name in the game, as in its settings screen.",
  notes: {
    shutRange: (modifier) => `On a server this range isn't used: ${modifier} sets the day.`,
    shutDays: {
      water: "On a server this is the one that counts: the days until the water shuts off.",
      power: "On a server this is the one that counts: the days until the power shuts off.",
    },
    spawnBefore: "Pick the spot on the ",
    spawnLink: "Map",
    spawnAfter: ".",
    secret: "It never goes in the link.",
    random: "The server picks it at random the first time: it's only written if you change it.",
    serverIds:
      "The server picks it at random the first time: it's only written if you change it. If you already have a server, copy yours from your .ini here first: if it's missing, the server picks a new one and players will need new characters. It never goes in the link.",
    noLink: "It's not a secret, but it never goes in the link: it belongs to your server or your computer.",
  },
  paste: {
    title: "Paste your file",
    hand: "already have a server?",
    intro:
      "Paste your <name>_SandboxVars.lua or your <name>.ini (from the Zomboid/Server folder), or pick the file. You'll see which preset it's closest to, what it changes, and what the game would ignore; then load it into the generator and keep editing.",
    privacy: "Your file never leaves your browser.",
    label: "Your SandboxVars.lua or .ini",
    placeholder: "SandboxVars = {\n    VERSION = 6,\n    Zombies = 4,\n    …",
    choose: "Choose file",
    kindLabel: "It's a",
    kindAuto: (detected) => `Automatic (${detected})`,
    tooBig: "That file is over 512 KB: it isn't a server's SandboxVars.lua or .ini.",
    readError: "We couldn't read that file.",
    noTable:
      "There's no table of options to read here. The file to paste is the one the server writes, Zomboid/Server/<name>_SandboxVars.lua, which starts with \"SandboxVars = {\".",
    like: (preset, n) => `Closest to ${preset}: ${n === 0 ? "no differences" : `${n} difference${n === 1 ? "" : "s"}`}`,
    iniLike: (n) => (n === 0 ? "Everything as by default" : `${n} option${n === 1 ? "" : "s"} different from the default`),
    diffTitle: "What changes",
    colOption: "Option",
    colFile: "Your file",
    colPreset: (preset) => preset,
    colDefault: "Default",
    notInFile: (baseline) => `not in your file: stays as in ${baseline}`,
    ignored: (baseline) => `the game ignores the one in your file: stays as in ${baseline}`,
    extraTitle: "Keys that aren't from the game (they're kept)",
    extraNote: "From a mod or an older version: they go back into the file you download, as they were.",
    issuesTitle: "Warnings",
    line: (n) => `Line ${n}`,
    more: (n) => `…and ${n} more.`,
    issue: ({ kind, file, fatal, deep, key, got, used }) => {
      switch (kind) {
        case "syntax":
          if (deep) return "Too many tables one inside another: that key is skipped whole.";
          return file === "ini"
            ? "A line without \"=\": the server skips it."
            : fatal
              ? "As it is, the game won't load this file: it isn't valid Lua (an unclosed text, a missing comma or bracket). We read what we could, and the file you download comes out fixed."
              : "That isn't a plain value but a function call or some math: it isn't run here, so it's skipped and the file you download won't have it.";
        case "type":
          return key === "VERSION" || key === "Version"
            ? "VERSION isn't a number."
            : used === undefined
              ? `${key} = ${got}: it should be a table; the game won't find its options.`
              : `${key} = ${got}: not the right kind of value; the game ignores it and uses ${used}.`;
        case "range":
          return `${key} = ${got}: out of range; the game ignores it and uses ${used}.`;
        case "enum":
          return `${key} = ${got}: not on the list; the game ignores it and uses ${used}.`;
        case "equals":
          return `${key}: the text has an "=" and the server cuts it there: it reads "${used}". Take it out.`;
        case "after":
          return "What follows the table is ignored.";
        case "version":
          return `File from an older version (VERSION = ${got}): the game updates it when it loads it.`;
        case "size":
          return "The file is over 512 KB: it isn't read.";
        default:
          return key ?? "";
      }
    },
    load: "Load into the generator",
    confirmLoad: (n) => `Load your file? You'll lose ${n} change${n === 1 ? "" : "s"} made here.`,
    loaded: "Loaded: you can keep editing below and download your files.",
  },
  presets: {
    crumbServer: "Server",
    crumbHere: "Sandbox Presets",
    title: "Project Zomboid Sandbox Presets",
    hand: "the game's five, side by side",
    intro: (changed, total, same, v) => [
      `The five sandbox presets of Project Zomboid Build ${v}, compared option by option: ${changed} of ${total} options change from one preset to another, and the other ${same} are the same in all five.`,
      "Apocalypse is the baseline: it's the one the game loads by default, and the one a new dedicated server gets without a SandboxVars.lua. Whatever another preset sets differently is tinted.",
    ],
    presetsTitle: "The five presets",
    diffs: (n, base) => (n === "0" ? "the baseline" : `${n} options differ from ${base}`),
    use: "Use it in the generator",
    onlyChanging: (n) => `Only the ones that change (${n})`,
    legend: (base) => `tinted: different from ${base}`,
    colOption: "Option",
    compare: "Compare the presets",
    compareCard: "how it differs",
  },
  shutoff: {
    crumbHere: "Water and Power Shutoff",
    title: "Project Zomboid Water and Power Shutoff",
    hand: "the exact date and time",
    intro: (v) => [
      `When the water and power shut off in your Project Zomboid Build ${v} world: the in-game date and time, how many days after you start, and how long that is in real time.`,
      "Set the start date and hour, the months since the apocalypse and your server's shutoff values, or start from a preset. If you come from the generator, your values are already here.",
    ],
    modeLabel: "Where do you play?",
    modeServer: "Server",
    modeSolo: "Single player",
    modeServerNote: "A dedicated server uses the days in WaterShutModifier and ElecShutModifier as they are.",
    modeSoloNote: "When you create the world, the game picks the day at random within the range you chose.",
    inputsTitle: "Your world",
    presetsLabel: "Start from a preset",
    startDate: "Start date",
    starts: (when) => `It starts on ${when}`,
    modifierHint: "days · −1: off from the start · 2147483647: never",
    invalid: (min, max) => `It has to be a whole number from ${min} to ${max}.`,
    water: "Water",
    power: "Power",
    startNow: "Already off when you start",
    never: "Never",
    after: (d, h, num) =>
      d === 0 && h === 0
        ? "right when you start"
        : `${[d ? `${num(d)} day${d === 1 ? "" : "s"}` : "", h ? `${num(h)} hour${h === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ")} after you start`,
    real: (time, day) => `≈ ${time} of real time with ${day} days`,
    // La cifra no se separa de su unidad: "1 h" no termina un renglón con el "30 min" en el siguiente partido.
    duration: (h, m, num) => [h ? `${num(h)}\u00a0h` : "", m || !h ? `${num(m)}\u00a0min` : ""].filter(Boolean).join(" "),
    earliest: "At the earliest",
    latest: "At the latest",
    rangeNote: (label) => `${label}: the game picks a day between these two when you create the world.`,
    howTitle: "How it's counted",
    how: [
      "On a server the modifier is what counts (WaterShutModifier, ElecShutModifier): the days until the shutoff. The range (WaterShut, ElecShut) isn't used there; it only picks the modifier when you create a single-player world.",
      "The day is counted from 7:00 AM: the shutoff always lands at 7:00 AM, and if the game starts at 7 AM or earlier, it counts from 7:00 AM the day before.",
      "Each month since the apocalypse takes 30 days off: with 1 month and a shutoff at 14 days, there's no water or power from the start.",
      "The \"0 - 30 Days\" range is really 0 to 29 (and \"14 - 30 Days\", 14 to 29): the game never picks the last day.",
    ],
    toGenerator: "Take these values to the generator",
    line: (what, cut) => {
      const thing = what === "water" ? "the water" : "the power";
      if (cut.kind === "never") return `With these settings, ${thing} never shuts off.`;
      if (cut.kind === "start") return `With these settings, ${thing} is off from the start.`;
      return `With these settings, ${thing} shuts off on ${cut.when}.`;
    },
    lineLink: "Shutoff calculator",
  },
};

const ES: PzServerCopy = {
  title: "Generador de servidor de Project Zomboid",
  intro: (sandbox, ini, v) => [
    `Armá acá tu servidor dedicado de Project Zomboid: las ${sandbox} opciones de sandbox y las ${ini} del servertest.ini de la Build ${v}, agrupadas como en la pantalla de configuración del juego y con la ayuda de cada opción.`,
    "Empezá de uno de los presets del juego, cambiá lo que quieras y descargá los dos archivos: van en la carpeta Zomboid/Server de la compu que corre el servidor, y con el mismo nombre reemplazan a los de ese servidor (servertest es el nombre por defecto del juego). El link guarda tu configuración para compartirla; las contraseñas, los tokens, tu IP y los IDs del servidor nunca van en él.",
    "Si ya tenés un servidor, antes de reemplazar su .ini copiá su ResetID y su ServerPlayerID en la hoja del .ini de acá abajo: si faltan, el servidor sortea otros y los jugadores van a tener que crear otro personaje.",
  ],
  hand: "elegí un preset y cambiá lo que quieras",
  notFound: "No encontramos esa página. Acá tenés el generador de servidor.",
  presetsTitle: "Empezá de un preset",
  presetsNote: "los cinco del juego",
  confirmPreset: (name, n) =>
    `¿Empezar de ${name}? Se pierde${n === 1 ? "" : "n"} ${n} cambio${n === 1 ? "" : "s"} de sandbox (el .ini queda como está).`,
  toolbar: "Tus archivos",
  search: "Buscar una opción",
  searchHint: "zombis, velocidad, PVP, ZombieLore.Speed…",
  onlyChanged: (n) => `Sólo lo que cambiaste (${n})`,
  serverName: "Nombre del servidor",
  serverNameNote: "le da nombre a los dos archivos",
  download: "Descargar",
  copy: "Copiar",
  copied: "¡Copiado!",
  copyLink: "Copiar link",
  linkWhat: "a esta configuración",
  linkNote: "sin contraseñas ni tokens",
  showing: (shown, total) => `Mostrando ${shown} de ${total} opciones`,
  empty: "Ninguna opción con ese nombre. Probá con la clave (ZombieLore.Speed) o en inglés.",
  emptyChanged: "Todavía no cambiaste nada: todo está como en el preset.",
  changedCount: (n) => `${n} cambiada${n === 1 ? "" : "s"}`,
  changed: "cambiada",
  resetSandbox: "Volver al valor del preset",
  resetIni: "Volver al valor por defecto",
  presetDefault: (preset, value) => `Por defecto (${preset}): ${value}`,
  iniDefault: (value) => `Por defecto: ${value}`,
  yes: "Sí",
  no: "No",
  emptyValue: "(vacío)",
  invalid: {
    type: "Ése no es un valor válido: el archivo se queda con el anterior.",
    range: (min, max) => `Tiene que ir de ${min} a ${max}: el archivo se queda con el anterior.`,
    enum: "Ese valor no está en la lista: el archivo se queda con el anterior.",
    equals: "No puede llevar un \"=\": el servidor corta el texto en el primero. El archivo se queda con el anterior.",
    equalsLoaded: (reads) => `Lleva un "=": el servidor corta el texto ahí y lee "${reads}". Sacalo.`,
  },
  iniTitle: (file) => file,
  iniIntro:
    "Las opciones del servidor en sí: nombre y contraseña, jugadores, PVP, refugios, chat, Discord, mods y el antitrampas. Van con su nombre del juego, como en su pantalla de configuración.",
  notes: {
    shutRange: (modifier) => `En un servidor, este rango no se usa: el día lo pone ${modifier}.`,
    shutDays: {
      water: "En un servidor, éste es el que manda: los días hasta que se corta el agua.",
      power: "En un servidor, éste es el que manda: los días hasta que se corta la luz.",
    },
    spawnBefore: "Elegí el punto en el ",
    spawnLink: "Mapa",
    spawnAfter: ".",
    secret: "Nunca va en el link.",
    random: "El servidor la sortea la primera vez: sólo se escribe si la cambiás.",
    serverIds:
      "El servidor la sortea la primera vez: sólo se escribe si la cambiás. Si ya tenés un servidor, copiá acá antes la de tu .ini: si falta, el servidor sortea otra y los jugadores van a tener que crear otro personaje. Nunca va en el link.",
    noLink: "No es secreta, pero nunca va en el link: es de tu servidor o de tu compu.",
  },
  paste: {
    title: "Pegá tu archivo",
    hand: "¿ya tenés un servidor?",
    intro:
      "Pegá tu <nombre>_SandboxVars.lua o tu <nombre>.ini (de la carpeta Zomboid/Server), o elegí el archivo. Vas a ver a qué preset se parece, qué cambia y qué ignoraría el juego; después lo cargás en el generador y seguís editando.",
    privacy: "Tu archivo no sale de tu navegador.",
    label: "Tu SandboxVars.lua o tu .ini",
    placeholder: "SandboxVars = {\n    VERSION = 6,\n    Zombies = 4,\n    …",
    choose: "Elegir archivo",
    kindLabel: "Es un",
    kindAuto: (detected) => `Automático (${detected})`,
    tooBig: "Ese archivo pasa de 512 KB: no es el SandboxVars.lua ni el .ini de un servidor.",
    readError: "No pudimos leer ese archivo.",
    noTable:
      "Acá no hay una tabla de opciones para leer. El archivo que va es el que escribe el servidor, Zomboid/Server/<nombre>_SandboxVars.lua, que arranca con \"SandboxVars = {\".",
    like: (preset, n) => `Se parece a ${preset}: ${n === 0 ? "sin diferencias" : `${n} diferencia${n === 1 ? "" : "s"}`}`,
    iniLike: (n) => (n === 0 ? "Todo como por defecto" : `${n} opci${n === 1 ? "ón distinta" : "ones distintas"} de las por defecto`),
    diffTitle: "Qué cambia",
    colOption: "Opción",
    colFile: "Tu archivo",
    colPreset: (preset) => preset,
    colDefault: "Por defecto",
    notInFile: (baseline) => `no está en tu archivo: queda como en ${baseline}`,
    ignored: (baseline) => `el juego ignora el de tu archivo: queda como en ${baseline}`,
    extraTitle: "Claves que no son del juego (se conservan)",
    extraNote: "De un mod o de una versión anterior: vuelven tal cual al archivo que descargues.",
    issuesTitle: "Avisos",
    line: (n) => `Renglón ${n}`,
    more: (n) => `…y ${n} más.`,
    issue: ({ kind, file, fatal, deep, key, got, used }) => {
      switch (kind) {
        case "syntax":
          if (deep) return "Demasiadas tablas una adentro de otra: esa clave se saltea entera.";
          return file === "ini"
            ? "Un renglón sin \"=\": el servidor lo saltea."
            : fatal
              ? "Así como está, el juego no carga este archivo: no es Lua válido (un texto sin cerrar, una coma o una llave que falta). Leímos lo que se pudo, y el que descargues sale arreglado."
              : "Eso no es un valor sino una llamada o una cuenta: acá no se ejecuta, así que se saltea y el archivo que descargues no la lleva.";
        case "type":
          return key === "VERSION" || key === "Version"
            ? "VERSION no es un número."
            : used === undefined
              ? `${key} = ${got}: va una tabla; el juego no va a encontrar sus opciones.`
              : `${key} = ${got}: no es un valor de su tipo; el juego lo ignora y usa ${used}.`;
        case "range":
          return `${key} = ${got}: fuera de rango; el juego lo ignora y usa ${used}.`;
        case "enum":
          return `${key} = ${got}: no está en la lista; el juego lo ignora y usa ${used}.`;
        case "equals":
          return `${key}: el texto lleva un "=" y el servidor lo corta ahí: lee "${used}". Sacalo.`;
        case "after":
          return "Lo que sigue a la tabla se ignora.";
        case "version":
          return `Archivo de una versión anterior (VERSION = ${got}): el juego lo actualiza al cargarlo.`;
        case "size":
          return "El archivo pasa de 512 KB: no se lee.";
        default:
          return key ?? "";
      }
    },
    load: "Cargar en el generador",
    confirmLoad: (n) => `¿Cargar tu archivo? Se pierde${n === 1 ? "" : "n"} ${n} cambio${n === 1 ? "" : "s"} hecho${n === 1 ? "" : "s"} acá.`,
    loaded: "Cargado: podés seguir editando abajo y descargar tus archivos.",
  },
  presets: {
    crumbServer: "Servidor",
    crumbHere: "Presets de sandbox",
    title: "Presets de sandbox de Project Zomboid",
    hand: "los cinco del juego, lado a lado",
    intro: (changed, total, same, v) => [
      `Los cinco presets de sandbox de Project Zomboid Build ${v}, comparados opción por opción: ${changed} de ${total} opciones cambian de un preset a otro, y las otras ${same} valen lo mismo en los cinco.`,
      "Apocalipsis es la base: es el que el juego carga por defecto, y el que tiene un servidor dedicado nuevo sin SandboxVars.lua. Lo que otro preset pone distinto va con tinte.",
    ],
    presetsTitle: "Los cinco presets",
    diffs: (n, base) => (n === "0" ? "la base" : `${n} opciones distintas de ${base}`),
    use: "Usarlo en el generador",
    onlyChanging: (n) => `Sólo las que cambian (${n})`,
    legend: (base) => `con tinte: distinto de ${base}`,
    colOption: "Opción",
    compare: "Comparar los presets",
    compareCard: "en qué cambia",
  },
  shutoff: {
    crumbHere: "Cortes de agua y luz",
    title: "Cortes de agua y luz en Project Zomboid",
    hand: "la fecha y la hora exactas",
    intro: (v) => [
      `Cuándo se cortan el agua y la luz en tu partida de Project Zomboid Build ${v}: la fecha y la hora del juego, cuántos días después de empezar y cuánto es eso en tiempo real.`,
      "Poné la fecha y la hora de inicio, los meses desde el apocalipsis y los valores de corte de tu servidor, o empezá de un preset. Si venís del generador, ya están tus valores.",
    ],
    modeLabel: "¿Dónde jugás?",
    modeServer: "Servidor",
    modeSolo: "Partida de un jugador",
    modeServerNote: "Un servidor dedicado usa los días de WaterShutModifier y ElecShutModifier tal cual.",
    modeSoloNote: "Al crear la partida, el juego sortea el día dentro del rango que elegiste.",
    inputsTitle: "Tu partida",
    presetsLabel: "Empezá de un preset",
    startDate: "Fecha de inicio",
    starts: (when) => `Arranca el ${when}`,
    modifierHint: "días · −1: cortada desde el principio · 2147483647: nunca",
    invalid: (min, max) => `Tiene que ser un número entero de ${min} a ${max}.`,
    water: "Agua",
    power: "Luz",
    startNow: "Ya no hay al empezar",
    never: "Nunca",
    after: (d, h, num) =>
      d === 0 && h === 0
        ? "justo al empezar"
        : `${[d ? `${num(d)} día${d === 1 ? "" : "s"}` : "", h ? `${num(h)} hora${h === 1 ? "" : "s"}` : ""].filter(Boolean).join(" y ")} después de empezar`,
    real: (time, day) => `≈ ${time} reales con días de ${day}`,
    // La cifra no se separa de su unidad: "1 h" no termina un renglón con el "30 min" en el siguiente partido.
    duration: (h, m, num) => [h ? `${num(h)}\u00a0h` : "", m || !h ? `${num(m)}\u00a0min` : ""].filter(Boolean).join(" "),
    earliest: "Lo antes",
    latest: "Lo más tarde",
    rangeNote: (label) => `${label}: el juego sortea un día entre estos dos al crear la partida.`,
    howTitle: "Cómo se cuenta",
    how: [
      "En un servidor manda el modificador (WaterShutModifier, ElecShutModifier): son los días hasta el corte. El rango (WaterShut, ElecShut) ahí no se usa; sólo sortea el modificador al crear una partida de un jugador.",
      "El día se cuenta desde las 7:00: el corte cae siempre a las 7:00 de la mañana, y si la partida arranca a las 7 o antes, cuenta desde las 7:00 del día anterior.",
      "Cada mes desde el apocalipsis resta 30 días: con 1 mes y un corte a los 14 días, ya no hay agua ni luz al empezar.",
      "El rango \"0-30 días\" es en realidad de 0 a 29 (y \"14 a 30 días\", de 14 a 29): el juego nunca sortea el último día.",
    ],
    toGenerator: "Llevar estos valores al generador",
    line: (what, cut) => {
      const thing = what === "water" ? "el agua" : "la luz";
      if (cut.kind === "never") return `Con esta configuración, ${thing} no se corta nunca.`;
      if (cut.kind === "start") return `Con esta configuración, ya no hay ${what === "water" ? "agua" : "luz"} al empezar.`;
      return `Con esta configuración, ${thing} se corta el ${cut.when}.`;
    },
    lineLink: "Calculadora de cortes",
  },
};

export const SERVER_COPY: Record<"en" | "es", PzServerCopy> = { en: EN, es: ES };
export const usePzServerCopy = (): PzServerCopy => SERVER_COPY[useLang().lang];
