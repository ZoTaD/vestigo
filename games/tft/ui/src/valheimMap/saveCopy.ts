/**
 * Los textos de "Tu partida" y el tutorial de dónde están los archivos
 * (2026-09-25). Las rutas son las del juego en Windows, Steam y Linux, y la del
 * guardado de un servidor dedicado (`worlds_local`).
 */
import { useLang } from "../i18n";

const code = (s: string) => `<code>${s}</code>`;

/** Dónde está cada archivo: igual en los dos idiomas, cada paso traducido. */
const WHERE = [
  {
    title: { en: "Your world, if you host it on your PC", es: "Tu mundo, si lo alojas en tu PC" },
    steps: {
      en: [
        `Press Win + R, paste ${code("%USERPROFILE%\\AppData\\LocalLow\\IronGate\\Valheim\\worlds_local")} and press Enter.`,
        "Drag the folder with your world's name onto the map (or zip it and choose the zip).",
        `If you play with Steam Cloud saves, the world is in ${code("C:\\Program Files (x86)\\Steam\\userdata\\<your id>\\892970\\remote\\worlds")}.`,
      ],
      es: [
        `Aprieta Win + R, pega ${code("%USERPROFILE%\\AppData\\LocalLow\\IronGate\\Valheim\\worlds_local")} y dale Enter.`,
        "Arrastra al mapa la carpeta con el nombre de tu mundo (o comprímela en zip y elige el zip).",
        `Si guardas en la nube de Steam, el mundo está en ${code("C:\\Program Files (x86)\\Steam\\userdata\\<tu id>\\892970\\remote\\worlds")}.`,
      ],
    },
  },
  {
    title: { en: "A world on a server (DatHost, G-Portal, your own…)", es: "Un mundo en un servidor (DatHost, G-Portal, uno propio…)" },
    steps: {
      en: [
        `In your host's panel open the file manager (or FTP) and go to ${code("worlds_local")} — in DatHost it is ${code("SaveDir/worlds_local")}.`,
        "Download the folder with your world's name (most panels download it as a zip) and drop it here.",
      ],
      es: [
        `En el panel de tu hosting abre el administrador de archivos (o el FTP) y entra a ${code("worlds_local")}: en DatHost es ${code("SaveDir/worlds_local")}.`,
        "Descarga la carpeta con el nombre de tu mundo (casi todos los paneles la bajan como zip) y suéltala acá.",
      ],
    },
  },
  {
    title: { en: "Each player's character", es: "El personaje de cada jugador" },
    steps: {
      en: [
        `Press Win + R and paste ${code("%USERPROFILE%\\AppData\\LocalLow\\IronGate\\Valheim\\characters_local")}: your character is ${code("<name>.fch")}.`,
        `With Steam Cloud saves it is in ${code("C:\\Program Files (x86)\\Steam\\userdata\\<your id>\\892970\\remote\\characters")}.`,
        `On Linux and Steam Deck the game folder is ${code("~/.config/unity3d/IronGate/Valheim")}.`,
        "Each friend can send you their .fch and you can drop them all: every player gets a color.",
      ],
      es: [
        `Aprieta Win + R y pega ${code("%USERPROFILE%\\AppData\\LocalLow\\IronGate\\Valheim\\characters_local")}: tu personaje es ${code("<nombre>.fch")}.`,
        `Si guardas en la nube de Steam, está en ${code("C:\\Program Files (x86)\\Steam\\userdata\\<tu id>\\892970\\remote\\characters")}.`,
        `En Linux y Steam Deck la carpeta del juego es ${code("~/.config/unity3d/IronGate/Valheim")}.`,
        "Cada amigo te puede pasar su .fch y los sueltas todos juntos: cada jugador sale de un color.",
      ],
    },
  },
  {
    title: { en: "So the cartography table has everyone's map", es: "Para que la mesa de cartografía tenga el mapa de todos" },
    steps: {
      en: ["Each player has to use the table to record their map on it (and read it to get the others'). Whatever was recorded is what the world file shows."],
      es: ["Cada jugador tiene que usar la mesa para registrar su mapa en ella (y leerla para traerse el de los demás). Lo que quedó registrado es lo que muestra el archivo del mundo."],
    },
  },
];

const EN = {
  title: "Your save",
  private: "Your files are read here, in your browser: nothing is uploaded or stored.",
  tableTitle: "Cartography table",
  recommended: "recommended",
  tableText: "Drop your world's folder: you'll see what everyone shared on the cartography table, portals linked by name, tombstones, beds, ships and bases. The seed loads by itself.",
  pickWorld: "Choose world folder",
  worldHint: "or drag the folder here",
  pickZip: "Choose a .zip",
  zipHint: "the world folder zipped (servers download it like this)",
  playersTitle: "Each player",
  playersText: "Add each player's character to see what they explored and their pins, one color per player.",
  pickChars: "Choose .fch files",
  charsHint: "one or several characters",
  reading: "Reading your files…",
  error: (e: string) => `Couldn't read that: ${e}`,
  seed: "seed",
  portals: (n: number) => `${n} portals`,
  tables: (n: number, pins: number) => `${n} cartography tables · ${pins} shared pins`,
  points: (t: number, b: number, s: number) => `${t} tombstones · ${b} beds · ${s} ships`,
  warnings: (n: number) => `${n} notes while reading`,
  fog: "Darken what no one explored",
  useTable: "Use the cartography table",
  playerPins: (n: number) => `${n} pins`,
  notInWorld: "never visited this world",
  clear: "Remove my files",
  whereTitle: "Where are these files?",
  where: WHERE,
  kinds: { pin: "Pin", portal: "Portal", tombstone: "Tombstone", bed: "Bed", ship: "Ship", cart: "Cart", cartography: "Cartography table", base: "Building" } as Record<string, string>,
  basePieces: (n: string) => `${n} built pieces around here`,
  unnamed: "no name",
  of: (who: string) => `of ${who}`,
};

type SaveCopy = typeof EN;

const ES: SaveCopy = {
  title: "Tu partida",
  private: "Tus archivos se leen acá, en tu navegador: no se suben ni se guardan en ningún lado.",
  tableTitle: "Mesa de cartografía",
  recommended: "recomendado",
  tableText: "Suelta la carpeta de tu mundo: vas a ver lo que todos compartieron en la mesa de cartografía, los portales unidos por nombre, tumbas, camas, barcos y bases. La semilla se carga sola.",
  pickWorld: "Elegir carpeta del mundo",
  worldHint: "o arrastra la carpeta acá",
  pickZip: "Elegir un .zip",
  zipHint: "la carpeta del mundo en zip (así la bajan los servidores)",
  playersTitle: "Cada jugador",
  playersText: "Suma el personaje de cada jugador para ver lo que exploró y sus pines, un color por jugador.",
  pickChars: "Elegir archivos .fch",
  charsHint: "uno o varios personajes",
  reading: "Leyendo tus archivos…",
  error: (e) => `No se pudo leer: ${e}`,
  seed: "semilla",
  portals: (n) => `${n} portales`,
  tables: (n, pins) => `${n} mesas de cartografía · ${pins} pines compartidos`,
  points: (t, b, s) => `${t} tumbas · ${b} camas · ${s} barcos`,
  warnings: (n) => `${n} avisos al leer`,
  fog: "Oscurecer lo que nadie exploró",
  useTable: "Usar la mesa de cartografía",
  playerPins: (n) => `${n} pines`,
  notInWorld: "nunca entró a este mundo",
  clear: "Quitar mis archivos",
  whereTitle: "¿Dónde están estos archivos?",
  where: WHERE,
  kinds: { pin: "Pin", portal: "Portal", tombstone: "Tumba", bed: "Cama", ship: "Barco", cart: "Carro", cartography: "Mesa de cartografía", base: "Construcción" },
  basePieces: (n) => `${n} piezas construidas por acá`,
  unnamed: "sin nombre",
  of: (who) => `de ${who}`,
};

export const useSaveCopy = (): SaveCopy => (useLang().lang === "es" ? ES : EN);
