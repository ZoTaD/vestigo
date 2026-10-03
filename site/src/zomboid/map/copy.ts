/**
 * Los textos del Mapa de Project Zomboid (2026-09-30), en inglés y español (con voseo). El título y la descripción
 * para Google están en `zomboidCopy.ts` (`seo.map`), porque los usa el prerender; acá va lo de la página. Viajan en
 * el chunk del Mapa y en ningún otro.
 *
 * Los nombres del mapa (pueblos, calles, ríos) no van acá: salen de los datos, con la traducción del juego donde la
 * tiene. Los de las zonas de las capas (qué auto, qué zombi, qué historia) van en `zoneNames.ts`, que sólo usa el visor:
 * son tablas largas que no hacen falta para el primer dibujo de la página.
 */
import { useLang } from "../../i18n";
import type { SearchHit, SearchKind } from "./search";
import type { LayerId } from "./url";

/** Los tipos de edificio del mapa de papel, con la clave que usa `common.style.buildings`. */
export type PaperKind =
  | "Residential"
  | "RetailAndCommercial"
  | "RestaurantsAndEntertainment"
  | "Hospitality"
  | "Medical"
  | "CommunityServices"
  | "Industrial";

/** Los tipos de recolección del juego (sus zonas de forrajeo), cada uno con su tinte en la leyenda. */
export type ForageKind = "Forest" | "DeepForest" | "Vegitation" | "FarmLand" | "Farm" | "TownZone" | "TrailerPark";

/** Lo que se esconde en un escondite, por su tabla de botín del juego (`GunCache1` → armas). */
export type StashLoot = "survivor" | "gun" | "shotgun" | "tools" | "food" | "medical" | "booze" | "other";

const EN = {
  kicker: (version: string) => `Knox County · Build ${version}`,
  h1: "Project Zomboid Map",
  lede: (buildings: string, streets: string, stashes: string) =>
    `All of Knox County, from the Ohio River to Irvington: ${buildings} buildings, ${streets} named streets and ${stashes} stashes. See it from above or as the paper map, and share any spot with a link.`,
  about:
    "The paper map uses the colors of the maps you find in a run: homes, shops, restaurants, hotels, medical, community services and industry, drawn sharp at any zoom.",
  hand: "drag, zoom, share",
  overviewAlt: "Project Zomboid map: all of Knox County seen from above",
  mapLabel: "Interactive map of Knox County. Drag to move, use the wheel or the + and − buttons to zoom, and the arrow keys to pan. Press Enter to open the building in the center.",
  loading: "Unfolding the map…",
  failed: "The map could not be opened.",
  retry: "Try again",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  base: {
    title: "Base",
    sat: "Satellite",
    paper: "Paper map",
    key: "What each color is",
  },
  kinds: {
    Residential: "Homes",
    RetailAndCommercial: "Shops",
    RestaurantsAndEntertainment: "Restaurants and fun",
    Hospitality: "Hotels",
    Medical: "Medical",
    CommunityServices: "Community services",
    Industrial: "Industry",
  } satisfies Record<PaperKind, string>,
  place: {
    title: "This spot",
    cursor: "under the cursor",
    center: "center",
    copy: "Copy link to this spot",
    copied: "Link copied",
    hint: "The link opens the map right here, with this zoom and this base.",
  },
  panel: {
    open: "Map options",
    close: "Close",
  },
  /** Las coordenadas de la nota a mano: la casilla del mundo, como las muestra el juego en modo debug. */
  coords: (x: string, y: string) => `x ${x} · y ${y}`,
  layers: {
    title: "Layers",
    hint: "Hover or tap a zone to see what it is. The small ones show up as you zoom in.",
    names: {
      vehiculos: "Vehicles",
      recoleccion: "Foraging",
      animales: "Farm animals",
      sotanos: "Possible basements",
      zombis: "Zombie types",
      densidad: "Zombie density",
      historias: "Stories",
      botin: "Rich loot",
      edificios: "Named buildings",
      apariciones: "Spawn points",
      escondites: "Stashes",
    } satisfies Record<LayerId, string>,
    about: {
      vehiculos: "Where cars spawn, and which kind.",
      recoleccion: "What kind of ground each spot is when you forage.",
      animales: "Pens and coops, with their animals.",
      sotanos: "Each run picks some of these at random: the basement may or may not be there.",
      zombis: "What the zombies around there are dressed as.",
      densidad:
        "Where the map puts more zombies when the world starts. It's a proportion, not a headcount: how many depends on the run's settings, each world adds a little randomness, and then they roam.",
      historias: "Scenes the world sets up: camps, parties, a baseball game…",
      botin: "Places with better loot.",
      edificios: "Buildings with a name of their own.",
      apariciones: "Where you can wake up on day one.",
      escondites: "The annotated maps, drawn as you find them. Tap one to see what it hides.",
    } satisfies Record<LayerId, string>,
    forage: {
      Forest: "forest",
      DeepForest: "deep forest",
      Vegitation: "vegetation",
      FarmLand: "farmland",
      Farm: "farm",
      TownZone: "town",
      TrailerPark: "trailer park",
    } satisfies Record<ForageKind, string>,
    profession: "Profession",
    allProfessions: "Every profession",
    zoomIn: "Zoom in to see the zones",
    heat: {
      less: "fewer zombies",
      more: "more zombies",
      uniform: "With the “Uniform” zombie distribution setting, the game ignores this and spreads them evenly.",
    },
  },
  spawn: {
    title: (town: string) => (town ? `Spawn point · ${town}` : "Spawn point"),
    all: "every profession",
    allBut: (names: string) => `every profession except ${names}`,
    more: (n: string) => `and ${n} more`,
    rest: "and every profession the town has no list for",
    others: "every profession the town has no list for",
    floor: (floor: string) => `floor ${floor}`,
  },
  stash: {
    title: "Stash",
    near: (town: string) => `near ${town}`,
    map: "The map that marks it",
    loot: "What it hides",
    loots: {
      survivor: "survivor supplies",
      gun: "guns",
      shotgun: "shotguns",
      tools: "tools",
      food: "food",
      medical: "medical supplies",
      booze: "booze",
      other: "supplies",
    } satisfies Record<StashLoot, string>,
    none: "Nothing hidden: the map only tells you about the place.",
    bag: "Packed in",
    zombies: (count: number, n: string) => (count === 1 ? `${n} zombie around the place` : `${n} zombies around the place`),
    barricades: (n: string) => `Doors and windows boarded up (${n}% chance each)`,
    traps: "Booby-trapped",
    days: (from: string, to: string) => `Shows up between day ${from} and day ${to}`,
    onlyZed: "Only zombies carry this map",
    spot: "Spot",
    approx: "approximate",
    close: "Close",
    pin: (town: string) => `Stash, ${town}`,
  },
  /** La hoja de un edificio (Task 4). */
  building: {
    title: "Building",
    /** El tipo de edificio, en singular (la clave del mapa de papel los nombra en plural). */
    kinds: {
      Residential: "Home",
      RetailAndCommercial: "Shop",
      RestaurantsAndEntertainment: "Restaurant or entertainment",
      Hospitality: "Hotel",
      Medical: "Medical",
      CommunityServices: "Community service",
      Industrial: "Industry",
    } satisfies Record<PaperKind, string>,
    /** El piso del juego: 0 es la planta baja; los negativos, sótanos. */
    floor: (f: string) => {
      const n = Number(f);
      if (n === 0) return "Ground floor";
      if (n === -1) return "Basement";
      return n < 0 ? `Basement ${-n}` : `Floor ${n}`;
    },
    floors: (n: number) => (n === 1 ? "1 floor" : `${n} floors`),
    withBasement: "with a basement",
    rooms: (n: number) => (n === 1 ? "1 room" : `${n} rooms`),
    floorPick: "Floor",
    /** El tamaño de una habitación: las casillas que ocupa. */
    tiles: (n: string) => `${n} tiles`,
    size: "Size",
    room: "Room",
    noRooms: "No rooms on this floor.",
    close: "Close",
    hint: "Tap a building to see its floors and rooms.",
    /** "Qué hay" en cada habitación (2026-10-02): lo que puede aparecer en sus muebles. */
    loot: {
      show: "What's here",
      hide: "Hide",
      loading: "Checking the furniture…",
      generic: "No loot of its own: its furniture has what any place has.",
      chance: "Chance that one piece of furniture has it, with loot set to Normal.",
      more: (n: number) => `and ${n} more`,
      /** Las condiciones, como en Objetos; la de zona sin nombrarla (los nombres de zonas no viajan con el mapa). */
      force: {
        t: "only in some furniture",
        r: "only if the building has a certain room",
        i: "only next to certain objects",
        z: "only in certain areas",
      },
    },
  },
  search: {
    label: "Search the map",
    placeholder: "Street, town, building, stash…",
    kinds: {
      town: "Town",
      building: "Building",
      story: "Story",
      street: "Street",
      stash: "Stash",
    } satisfies Record<SearchKind, string>,
    railroad: "Railroad",
    none: "Nothing with that name.",
    results: (n: number) => (n === 1 ? "1 result" : `${n} results`),
    firstResults: (n: number) => `The first ${n} results: type more to narrow it down`,
    loading: "Loading the index…",
  },
};

export type MapCopy = typeof EN;

const ES: MapCopy = {
  kicker: (version) => `Knox County · Build ${version}`,
  h1: "Mapa de Project Zomboid",
  lede: (buildings, streets, stashes) =>
    `Knox County entero, del río Ohio a Irvington: ${buildings} edificios, ${streets} calles con nombre y ${stashes} escondites. Miralo desde arriba o como el mapa de papel, y compartí cualquier lugar con un link.`,
  about:
    "El mapa de papel usa los colores de los mapas que encontrás en una partida: viviendas, comercios, restaurantes, hoteles, salud, servicios comunitarios e industria, nítidos a cualquier zoom.",
  hand: "arrastrá, acercá, compartí",
  overviewAlt: "Mapa de Project Zomboid: Knox County entero visto desde arriba",
  mapLabel: "Mapa interactivo de Knox County. Arrastrá para moverte, usá la rueda o los botones + y − para acercar o alejar, y las flechas para desplazarte. Con Enter se abre el edificio del centro.",
  loading: "Desplegando el mapa…",
  failed: "No se pudo abrir el mapa.",
  retry: "Reintentar",
  zoomIn: "Acercar",
  zoomOut: "Alejar",
  base: {
    title: "Base",
    sat: "Satélite",
    paper: "Mapa de papel",
    key: "Qué es cada color",
  },
  kinds: {
    Residential: "Viviendas",
    RetailAndCommercial: "Comercios",
    RestaurantsAndEntertainment: "Restaurantes y entretenimiento",
    Hospitality: "Hoteles",
    Medical: "Salud",
    CommunityServices: "Servicios comunitarios",
    Industrial: "Industria",
  },
  place: {
    title: "Este lugar",
    cursor: "bajo el cursor",
    center: "centro",
    copy: "Copiar link de este lugar",
    copied: "Link copiado",
    hint: "El link abre el mapa justo acá, con este zoom y esta base.",
  },
  panel: {
    open: "Opciones del mapa",
    close: "Cerrar",
  },
  coords: (x, y) => `x ${x} · y ${y}`,
  layers: {
    title: "Capas",
    hint: "Pasá el mouse o tocá una zona para ver qué es. Las chicas aparecen cuando acercás.",
    names: {
      vehiculos: "Vehículos",
      recoleccion: "Recolección",
      animales: "Granjas y animales",
      sotanos: "Sótanos posibles",
      zombis: "Zombis por tipo",
      densidad: "Densidad de zombis",
      historias: "Historias",
      botin: "Botín rico",
      edificios: "Edificios con nombre",
      apariciones: "Puntos de aparición",
      escondites: "Escondites",
    },
    about: {
      vehiculos: "Dónde aparecen autos, y de qué tipo.",
      recoleccion: "Qué tipo de terreno es cada lugar cuando salís a recolectar (la habilidad Rebuscar).",
      animales: "Corrales y gallineros, con sus animales.",
      sotanos: "Cada partida elige algunos al azar: el sótano puede estar o no.",
      zombis: "De qué van vestidos los zombis de esa zona.",
      densidad:
        "Dónde el mapa pone más zombis al arrancar el mundo. Es una proporción, no una cuenta: cuántos hay depende de la configuración de la partida, cada mundo le suma un poco de azar y después caminan.",
      historias: "Escenas que arma el mundo: campamentos, fiestas, un partido de béisbol…",
      botin: "Lugares con mejor botín.",
      edificios: "Edificios con nombre propio.",
      apariciones: "Dónde podés despertarte el primer día.",
      escondites: "Los mapas anotados, dibujados como los encontrás. Tocá uno para ver qué esconde.",
    },
    forage: {
      Forest: "bosque",
      DeepForest: "bosque profundo",
      Vegitation: "vegetación",
      FarmLand: "campo de cultivo",
      Farm: "granja",
      TownZone: "pueblo",
      TrailerPark: "parque de casas rodantes",
    },
    profession: "Profesión",
    allProfessions: "Todas las profesiones",
    zoomIn: "Acercá para ver las zonas",
    heat: {
      less: "menos zombis",
      more: "más zombis",
      uniform: "Con la distribución de zombis «Uniforme», el juego no usa esto y los reparte parejo.",
    },
  },
  spawn: {
    title: (town) => (town ? `Punto de aparición · ${town}` : "Punto de aparición"),
    all: "todas las profesiones",
    allBut: (names) => `todas menos ${names}`,
    more: (n) => `y ${n} más`,
    rest: "y las que el pueblo no tiene en su lista",
    others: "las profesiones que el pueblo no tiene en su lista",
    floor: (floor) => `piso ${floor}`,
  },
  stash: {
    title: "Escondite",
    near: (town) => `cerca de ${town}`,
    map: "El mapa que lo marca",
    loot: "Qué esconde",
    loots: {
      survivor: "provisiones de un sobreviviente",
      gun: "armas",
      shotgun: "escopetas",
      tools: "herramientas",
      food: "comida",
      medical: "insumos médicos",
      booze: "bebidas",
      other: "provisiones",
    },
    none: "Nada escondido: el mapa sólo te cuenta del lugar.",
    bag: "Guardado en",
    zombies: (count, n) => (count === 1 ? `${n} zombi alrededor` : `${n} zombis alrededor`),
    barricades: (n) => `Puertas y ventanas con tablas (${n} % de chance cada una)`,
    traps: "Con trampas",
    days: (from, to) => `Aparece entre el día ${from} y el ${to}`,
    onlyZed: "Este mapa sólo lo llevan los zombis",
    spot: "Lugar",
    approx: "aproximado",
    close: "Cerrar",
    pin: (town) => `Escondite, ${town}`,
  },
  building: {
    title: "Edificio",
    kinds: {
      Residential: "Vivienda",
      RetailAndCommercial: "Comercio",
      RestaurantsAndEntertainment: "Restaurante o entretenimiento",
      Hospitality: "Hotel",
      Medical: "Salud",
      CommunityServices: "Servicio comunitario",
      Industrial: "Industria",
    },
    floor: (f) => {
      const n = Number(f);
      if (n === 0) return "Planta baja";
      if (n === -1) return "Sótano";
      return n < 0 ? `Sótano ${-n}` : `Piso ${n}`;
    },
    floors: (n) => (n === 1 ? "1 piso" : `${n} pisos`),
    withBasement: "con sótano",
    rooms: (n) => (n === 1 ? "1 habitación" : `${n} habitaciones`),
    floorPick: "Piso",
    tiles: (n) => `${n} casillas`,
    size: "Tamaño",
    room: "Habitación",
    noRooms: "Este piso no tiene habitaciones.",
    close: "Cerrar",
    hint: "Tocá un edificio para ver sus pisos y habitaciones.",
    loot: {
      show: "Qué hay",
      hide: "Ocultar",
      loading: "Revisando los muebles…",
      generic: "No tiene botín propio: sus muebles traen lo de cualquier lugar.",
      chance: "Chance de que un mueble lo traiga, con el botín en Normal.",
      more: (n) => `y ${n} más`,
      force: {
        t: "sólo en algunos muebles",
        r: "sólo si el edificio tiene cierto cuarto",
        i: "sólo junto a ciertos objetos",
        z: "sólo en ciertas zonas",
      },
    },
  },
  search: {
    label: "Buscar en el mapa",
    placeholder: "Calle, pueblo, edificio, escondite…",
    kinds: {
      town: "Pueblo",
      building: "Edificio",
      story: "Historia",
      street: "Calle",
      stash: "Escondite",
    },
    railroad: "Vía del tren",
    none: "No hay nada con ese nombre.",
    results: (n) => (n === 1 ? "1 resultado" : `${n} resultados`),
    firstResults: (n) => `Los primeros ${n} resultados: escribí más para afinar`,
    loading: "Cargando el índice…",
  },
};

export const MAP_COPY: Record<"en" | "es", MapCopy> = { en: EN, es: ES };
export const useMapCopy = (): MapCopy => MAP_COPY[useLang().lang];

/**
 * El tipo que se lee al lado de cada resultado del buscador. Las vías del tren vienen de `map.py` como calles con nombre
 * (es la clase del mapa de donde salen); acá se las llama por lo que son.
 */
export const searchKindLabel = (h: Pick<SearchHit, "k" | "en">, t: MapCopy): string =>
  h.k === "street" && /\brailroad\b/i.test(h.en) ? t.search.railroad : t.search.kinds[h.k];
