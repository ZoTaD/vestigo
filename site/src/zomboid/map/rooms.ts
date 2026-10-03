/**
 * Los nombres de las habitaciones y los tonos de los edificios del Mapa de Project Zomboid (2026-09-30, Task 4), y las
 * habitaciones de un piso tal como las lista la hoja del edificio. Lógica pura, probada en `test/zomboidRooms.test.ts`.
 *
 * Viaja sólo en el chunk de la hoja del edificio (que se pide al montarse el visor, antes del primer toque): ni en el de
 * la pestaña ni en el del visor, que no necesitan estas tablas para mostrar el mapa. La geometría (qué edificio hay en
 * una casilla, sus pisos) está en `buildings.ts`, que sí va con el visor.
 *
 * **Los nombres de las habitaciones** son los tipos de cuarto del juego (`bedroom`, `livingroom`, `depositboxes`…): hay
 * 586 distintos, pero 58 suman el 95 % de las 90.827 habitaciones del mapa (contadas el 30/9, 42.21). Esos van escritos
 * a mano en inglés y en español rioplatense (`ROOM_NAMES`), y el test los recalcula con los datos: si un parche cambia
 * cuáles son, falla hasta que se escriban. El juego sólo traduce como etiqueta de llave los cuartos de negocios ("Tienda
 * de cámaras"); esos se usan donde el nombre del juego es el mismo cuarto dicho en palabras, pasados al rioplatense
 * (papas y no patatas, estación de servicio y no gasolinera). El resto se muestra con el nombre del juego separado en
 * palabras (`splitWords`), igual en los dos idiomas.
 *
 * **El tamaño** de una habitación es la cantidad de casillas que ocupa (las coordenadas del mapa son casillas): una
 * habitación puede ser varios rectángulos, y se suman.
 */
import type { Lang } from "../../i18n";
import { rectsOf, roomTiles, type Building } from "./buildings";
import { humanize } from "./layerMeta";

/** Un tipo de habitación en un piso: cuántas hay, cuántas casillas suman y sus rectángulos (`[x, y, ancho, alto]`). */
export interface RoomGroup {
  key: string;
  /**
   * Los nombres del juego de esas habitaciones, sin repetir y en el orden en que aparecen: "Dormitorio ×3" puede ser
   * `["bedroom", "bedroom4"]`. El botín va por nombre exacto (`bedroom4` no usa la tabla de `bedroom`), así que "Qué hay"
   * los mira todos.
   */
  raws: string[];
  count: number;
  tiles: number;
  rects: [number, number, number, number][];
}

/**
 * Los nombres escritos a mano, `[inglés, español]`. Primero los 58 que suman el 95 % de las habitaciones del mapa, en el
 * orden en que aparecen más (el test lo exige); después los que completan un edificio que se busca seguido (el banco,
 * la casa) y los cuartos de negocios que el juego traduce.
 */
export const ROOM_NAMES: Record<string, [string, string]> = {
  // ── El 95 % ──
  bathroom: ["Bathroom", "Baño"],
  bedroom: ["Bedroom", "Dormitorio"],
  livingroom: ["Living room", "Living"],
  kitchen: ["Kitchen", "Cocina"],
  empty: ["Empty room", "Ambiente vacío"],
  closet: ["Closet", "Placard"],
  emptyoutside: ["Outdoor area", "Espacio al aire libre"],
  office: ["Office", "Oficina"],
  hall: ["Hall", "Pasillo"],
  garagestorage: ["Garage storage", "Depósito del garaje"],
  kidsbedroom: ["Kids' bedroom", "Cuarto de los chicos"],
  derelict: ["Derelict room", "Ambiente abandonado"],
  laundry: ["Laundry room", "Lavadero"],
  janitor: ["Janitor's closet", "Cuarto de limpieza"],
  motelroom: ["Motel room", "Habitación de motel"],
  diningroom: ["Dining room", "Comedor"],
  storageunit: ["Storage unit", "Baulera"],
  construction: ["Under construction", "En obra"],
  garage: ["Garage", "Garaje"],
  elevator: ["Elevator", "Ascensor"],
  prisoncells: ["Prison cells", "Celdas"],
  breakroom: ["Break room", "Sala de descanso"],
  lobby: ["Lobby", "Hall de entrada"],
  hallway: ["Hallway", "Corredor"],
  storage: ["Storage", "Depósito"],
  policeoffice: ["Police office", "Oficina de policía"],
  barn: ["Barn", "Granero"],
  officestorage: ["Office storage", "Depósito de oficina"],
  farmstorage: ["Farm storage", "Depósito de la granja"],
  clothesstore: ["Clothing store", "Tienda de ropa"],
  stairwell: ["Stairwell", "Escalera"],
  bar: ["Bar", "Bar"],
  changeroom: ["Changing room", "Vestuario"],
  church: ["Church", "Iglesia"],
  medical: ["Medical room", "Enfermería"],
  security: ["Security", "Seguridad"],
  dressingrooms: ["Fitting rooms", "Probadores"],
  horsebox: ["Horse stall", "Box de caballos"],
  shed: ["Shed", "Galpón"],
  kennels: ["Kennels", "Caniles"],
  lockerroom: ["Locker room", "Sala de lockers"],
  restaurantkitchen: ["Restaurant kitchen", "Cocina del restaurante"],
  gasstore: ["Gas station store", "Minimercado de la estación de servicio"],
  gym: ["Gym", "Gimnasio"],
  classroom: ["Classroom", "Aula"],
  laboratory: ["Laboratory", "Laboratorio"],
  mechanic: ["Mechanic's shop", "Taller mecánico"],
  aesthetic: ["Beauty salon", "Centro de estética"],
  grocery: ["Grocery store", "Almacén"],
  grocerystorage: ["Grocery storage", "Depósito del almacén"],
  cafe: ["Café", "Café"],
  elementaryclassroom: ["Elementary classroom", "Aula de primaria"],
  medclinic: ["Clinic", "Consultorio"],
  restaurantdining: ["Restaurant dining room", "Salón del restaurante"],
  garbage: ["Garbage room", "Cuarto de la basura"],
  hospitalroom: ["Hospital room", "Habitación de hospital"],
  secondaryclassroom: ["High school classroom", "Aula de secundaria"],
  attic: ["Attic", "Altillo"],

  // ── Los que completan edificios que se buscan (el banco, la casa, la escuela) ──
  room: ["Room", "Habitación"],
  bank: ["Bank", "Banco"],
  vault: ["Vault", "Bóveda"],
  depositboxes: ["Safe deposit boxes", "Cajas de seguridad"],
  bankstorage: ["Bank storage", "Depósito del banco"],
  toolstore: ["Hardware store", "Ferretería"],
  agriworkerdorm: ["Farmworkers' dorm", "Dormitorio de peones"],
  stable: ["Stable", "Establo"],
  balcony: ["Balcony", "Balcón"],
  porch: ["Porch", "Galería"],
  patio: ["Patio", "Patio"],
  sunroom: ["Sunroom", "Jardín de invierno"],
  pantry: ["Pantry", "Despensa"],
  basement: ["Basement", "Sótano"],
  guestbedroom: ["Guest bedroom", "Cuarto de huéspedes"],
  dining: ["Dining area", "Comedor"],
  outside: ["Outside", "Afuera"],
  showers: ["Showers", "Duchas"],
  locker: ["Lockers", "Lockers"],
  kitchenstorage: ["Kitchen storage", "Depósito de la cocina"],
  medicaloffice: ["Doctor's office", "Consultorio médico"],
  medicalstorage: ["Medical storage", "Depósito médico"],
  hospitalstorage: ["Hospital storage", "Depósito del hospital"],
  morgue: ["Morgue", "Morgue"],
  clinic: ["Clinic", "Clínica"],
  cafeteria: ["Cafeteria", "Comedor"],
  cafeteriakitchen: ["Cafeteria kitchen", "Cocina del comedor"],
  cafekitchen: ["Café kitchen", "Cocina del café"],
  universityclassroom: ["University classroom", "Aula de la universidad"],
  motelroomoccupied: ["Occupied motel room", "Habitación de motel ocupada"],
  motelreception: ["Motel reception", "Recepción del motel"],
  prisonlibrary: ["Prison library", "Biblioteca de la cárcel"],
  prisonlaundry: ["Prison laundry", "Lavadero de la cárcel"],
  prisonarmory: ["Prison armory", "Armería de la cárcel"],
  armory: ["Armory", "Armería"],
  armystorage: ["Army storage", "Depósito del ejército"],
  armytent: ["Army tent", "Carpa del ejército"],
  policestorage: ["Police storage", "Depósito de la policía"],
  policelocker: ["Police lockers", "Lockers de la policía"],
  firestorage: ["Fire station storage", "Depósito de bomberos"],
  firegarage: ["Fire station garage", "Garaje de bomberos"],
  chickencoop: ["Chicken coop", "Gallinero"],
  greenhouse: ["Greenhouse", "Invernadero"],
  woodshed: ["Woodshed", "Leñera"],
  pigsty: ["Pigsty", "Chiquero"],
  traincar: ["Train car", "Vagón"],
  picnic: ["Picnic area", "Zona de picnic"],
  theatre: ["Movie theater", "Cine"],
  producestorage: ["Produce storage", "Depósito de verduras"],
  loggingtruck: ["Logging truck", "Camión maderero"],
  toolstorage: ["Tool storage", "Depósito de herramientas"],
  workshop: ["Workshop", "Taller"],
  maintenance: ["Maintenance", "Mantenimiento"],
  meetingroom: ["Meeting room", "Sala de reuniones"],
  waitingroom: ["Waiting room", "Sala de espera"],
  library: ["Library", "Biblioteca"],
  school: ["School", "Escuela"],

  // ── Cuartos de negocios: la etiqueta de llave del juego (IG_UI), en rioplatense ──
  pharmacy: ["Pharmacy", "Farmacia"],
  gunstore: ["Gun store", "Armería"],
  liquorstore: ["Liquor store", "Vinoteca"],
  gardenstore: ["Garden store", "Vivero"],
  electronicsstore: ["Electronics store", "Casa de electrónica"],
  dentist: ["Dentist", "Dentista"],
  metalshop: ["Metal shop", "Herrería"],
  artstore: ["Art store", "Librería artística"],
  bakery: ["Bakery", "Panadería"],
  sewingstore: ["Sewing store", "Mercería"],
  camerastore: ["Camera store", "Casa de fotografía"],
  giftstore: ["Gift store", "Regalería"],
  toystore: ["Toy store", "Juguetería"],
  shoestore: ["Shoe store", "Zapatería"],
  housewarestore: ["Houseware store", "Bazar"],
  furniturestore: ["Furniture store", "Mueblería"],
  departmentstore: ["Department store", "Tienda por departamentos"],
  pawnshop: ["Pawnshop", "Casa de empeños"],
  musicstore: ["Music store", "Casa de música"],
  bookstore: ["Bookstore", "Librería"],
  warehouse: ["Warehouse", "Depósito"],
  generalstore: ["General store", "Almacén de ramos generales"],
  camping: ["Camping store", "Casa de camping"],
  factory: ["Factory", "Fábrica"],
  butcher: ["Butcher's", "Carnicería"],
  spa: ["Spa", "Spa"],
  gallery: ["Gallery", "Galería de arte"],
  jewelrystore: ["Jewelry store", "Joyería"],
  restaurant: ["Restaurant", "Restaurante"],
  clothingstore: ["Clothing store", "Tienda de ropa"],
  cornerstore: ["Corner store", "Almacén de barrio"],
  conveniencestore: ["Convenience store", "Autoservicio"],
  optometrist: ["Optometrist", "Óptica"],
  dogfoodfactory: ["Dog food factory", "Fábrica de alimento para perros"],
  batteryfactory: ["Battery factory", "Fábrica de pilas"],
  fryshipping: ["Fries shipping", "Envíos de papas fritas"],
  wirefactory: ["Wire factory", "Fábrica de alambre"],
  knifefactory: ["Knife factory", "Fábrica de cuchillos"],
  knifestore: ["Knife store", "Cuchillería"],
  mapfactory: ["Map factory", "Fábrica de mapas"],
  walletshop: ["Wallet shop", "Marroquinería"],
  radiofactory: ["Radio factory", "Fábrica de radios"],
  cabinetfactory: ["Cabinet factory", "Fábrica de muebles de cocina"],
  brewery: ["Brewery", "Cervecería"],
  batfactory: ["Bat factory", "Fábrica de bates"],
  baseballstore: ["Baseball store", "Tienda de béisbol"],
  sodatruck: ["Soda truck", "Camión de gaseosas"],
  lasertag: ["Laser tag", "Laser tag"],
  // Marcas del juego: el nombre queda igual en los dos idiomas.
  gas2go: ["Gas-2-Go", "Gas-2-Go"],
  pizzawhirled: ["Pizza Whirled", "Pizza Whirled"],
  gigamart: ["GigaMart", "GigaMart"],
  fossoil: ["Fossoil", "Fossoil"],
};

/** Errores de tipeo y variantes del mapa que son el mismo cuarto. */
const ALIASES: Record<string, string> = {
  liviingroom: "livingroom",
  breakoom: "breakroom",
  sttorage: "storage",
  diningr: "diningroom",
  garage_storage: "garagestorage",
  clothesestorage: "clothesstorage",
  electronicstore: "electronicsstore",
};

/** Una tabla más de nombres (`LOOT_ROOM_NAMES`) que se mira además de `ROOM_NAMES`, para no cargarla donde no hace falta. */
type Extra = Record<string, [string, string]>;
const has = (k: string, extra?: Extra) => Object.hasOwn(ROOM_NAMES, k) || (extra !== undefined && Object.hasOwn(extra, k));
const alias = (k: string) => (Object.hasOwn(ALIASES, k) ? ALIASES[k] : k);

/**
 * El tipo de cuarto, con las variantes juntas: en minúsculas (`Bathroom`), sin el número del final (`bedroom4`) y sin
 * el `ww_` de los cuartos del pueblo del oeste (`ww_bedroom`), cuando lo que queda tiene nombre.
 */
export function roomKey(raw: string, extra?: Extra): string {
  const k = alias(raw.trim().toLowerCase());
  if (has(k, extra)) return k;
  const bare = alias(k.replace(/^ww_/, "").replace(/\d+$/, ""));
  return has(bare, extra) ? bare : k;
}

/**
 * Las palabras con que se separan los nombres del juego que no tienen traducción: las de los nombres escritos a mano,
 * más las que aparecen en los cuartos de negocios ("gunstorestorage" → gun store storage).
 */
const EXTRA_WORDS =
  "store storage shop shipping factory dining kitchen counter cold freezer display showroom booth game stand smoker class " +
  "music police prison army gun guns fire car supply sport sports ranger rail railroad road repair golf gift candy clothes " +
  "wedding suit dress book comic jerky pork soda tofu whiskey whisky bottling hinge mannequin painting table handle card " +
  "metal welding guitar glass glasses pottery knapping whittler carpentry tailor tailoring leather sewing lighting pet " +
  "florist masonry clock juice jays chicken catfish chili deep fry donut burger pizza sushi seafood mexican chinese italian " +
  "western taco fish chips ice cream steel control main mayor west point location sewer distillery derelict secondary " +
  "elementary school lab outdoor gas fossoil hot dog stand auction cattle slaughterhouse kill box egg hay eggs trash " +
  "gardening decontamination communications electric server dark news photo cd lost found upholstery bowling alley " +
  "waiting cyber cafe boat house access survivor cache vip strip lap dance cabin roller rink ticket judge lounge band merch " +
  "smoking dart hoop ring toss duck shooting throw baggage search contraband anthro medieval pioneer physics maths " +
  "university jockey nursery partyhall party herald newspaper print plumber vet dorm bunker horse washing station " +
  "interrogation evidence detective archive captain backstage arcade pool spa gallery roof access guest stair stairs " +
  "photo daycare drug lab tunnel vacated prisoner belongings coroner baseball antique meeting suits shirts classic " +
  "arena reverend rev peter watts barcounter twiggy stage machinery hairdresser wares museum swat old reception morgue " +
  "showers technical vault deposit boxes firearm training hunting fishing tobacco painter recreation recreational " +
  "change room rooms potato aircraft spiffo spiffos racetrack misc diner army surplus zippee post food court dealership " +
  "barbeque movie rental canned cultist fabrication making aesthetic and water theatre club back plaza bottle empty " +
  "commercial nolans outfit cooking studio jackie jaye joan woodcraft set stripper windows home cinema shoot beer garden " +
  "shack knox whirled";

const VOCAB: ReadonlySet<string> = new Set(
  [...Object.values(ROOM_NAMES).flatMap(([en]) => en.toLowerCase().split(/[^a-z]+/)), ...EXTRA_WORDS.split(" ")].filter(
    (w) => w.length >= 2,
  ),
);

/** Un pedazo de letras en palabras del vocabulario, con la menor cantidad posible; `null` si no se puede. */
function segment(s: string): string[] | null {
  const best: (string[] | null)[] = [[]];
  for (let i = 1; i <= s.length; i++) {
    best[i] = null;
    for (let j = Math.max(0, i - 16); j < i; j++) {
      const prev = best[j];
      if (prev && VOCAB.has(s.slice(j, i)) && (!best[i] || prev.length + 1 < best[i]!.length)) best[i] = [...prev, s.slice(j, i)];
    }
  }
  return best[s.length];
}

/**
 * El nombre del juego separado en palabras cuando se puede ("gunstorestorage" → "Gun store storage"): primero por los
 * guiones bajos y los números, y cada pedazo de letras con las palabras conocidas. Lo que no se puede separar queda
 * entero: mejor el nombre del juego que una palabra inventada.
 */
export function splitWords(raw: string): string {
  const words = raw
    .toLowerCase()
    .split(/[_\s-]+|(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/)
    .filter(Boolean)
    .flatMap((part) => (/^[a-z]+$/.test(part) ? segment(part) ?? [part] : [part]));
  const out = words.join(" ");
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** El nombre de un tipo de cuarto del juego en el idioma de la página; `extra` suma una tabla más de nombres escritos a mano. */
export function roomName(raw: string, lang: Lang, extra?: Extra): string {
  const k = roomKey(raw, extra);
  const names = Object.hasOwn(ROOM_NAMES, k) ? ROOM_NAMES : extra !== undefined && Object.hasOwn(extra, k) ? extra : null;
  return names ? names[k][lang === "es" ? 1 : 0] : splitWords(k.replace(/^ww_/, ""));
}

/**
 * Los tonos del juego (qué clase de edificio es, `Farmhouse`, `HouseSuburb`): hay 223, y estos son los que llevan casi
 * todos los edificios del mapa. El resto se separa en palabras.
 */
const TONES: Record<string, [string, string]> = {
  HouseSuburb: ["Suburban house", "Casa de barrio"],
  HouseSmall: ["Small house", "Casa chica"],
  HouseGarage: ["House with garage", "Casa con garaje"],
  Shed: ["Shed", "Galpón"],
  HouseMedium: ["Medium house", "Casa mediana"],
  Barn: ["Barn", "Granero"],
  HouseLarge: ["Large house", "Casa grande"],
  Trailer: ["Trailer home", "Casa rodante"],
  MilitaryHouse: ["Military housing", "Casa militar"],
  Townhouse: ["Townhouse", "Casa en hilera"],
  FarmStorage: ["Farm storage", "Depósito de granja"],
  Farmhouse: ["Farmhouse", "Casa de chacra"],
  Plaza: ["Strip mall", "Galería comercial"],
  TrailerNice: ["Nice trailer home", "Casa rodante cuidada"],
  HouseCountry: ["Country house", "Casa de campo"],
  Restaurant: ["Restaurant", "Restaurante"],
  Gas: ["Gas station", "Estación de servicio"],
  Truck: ["Truck", "Camión"],
  MilitaryTownhouse: ["Military townhouse", "Casa en hilera militar"],
  RedbrickTownhouse: ["Red brick townhouse", "Casa en hilera de ladrillo rojo"],
  Storefront: ["Storefront", "Local"],
  Cabin: ["Cabin", "Cabaña"],
  Garagestorage: ["Storage garage", "Garaje depósito"],
  MilitaryTent: ["Military tent", "Carpa militar"],
  HouseSuburbGarage: ["Suburban house with garage", "Casa de barrio con garaje"],
  BrownbrickTownhouse: ["Brown brick townhouse", "Casa en hilera de ladrillo marrón"],
  Factory: ["Factory", "Fábrica"],
  Traincar: ["Train car", "Vagón"],
  Warehousestorage: ["Warehouse", "Depósito"],
  Busshelter: ["Bus shelter", "Parada de colectivo"],
  Offices: ["Offices", "Oficinas"],
  Office: ["Office", "Oficina"],
  Church: ["Church", "Iglesia"],
  HouseAbandoned: ["Abandoned house", "Casa abandonada"],
  Trainyard: ["Train yard", "Playa de maniobras"],
  ApartmentBuilding: ["Apartment building", "Edificio de departamentos"],
  Outhouse: ["Outhouse", "Letrina"],
  Mechanic: ["Mechanic's shop", "Taller mecánico"],
  HouseMediumDamaged: ["Damaged medium house", "Casa mediana dañada"],
  Portacabin: ["Portable cabin", "Casilla de obra"],
  HouseBurnt: ["Burnt house", "Casa quemada"],
  Grocery: ["Grocery store", "Almacén"],
  School: ["School", "Escuela"],
  Generalstore: ["General store", "Almacén de ramos generales"],
  HouseLake: ["Lake house", "Casa del lago"],
  Security: ["Security", "Seguridad"],
  Farmhousing: ["Farm housing", "Vivienda de granja"],
  Laundromat: ["Laundromat", "Lavandería"],
  Cornerstore: ["Corner store", "Almacén de barrio"],
  Refinery: ["Refinery", "Refinería"],
  Garage: ["Garage", "Garaje"],
  Police: ["Police station", "Comisaría"],
  HouseDestroyed: ["Destroyed house", "Casa destruida"],
  Stables: ["Stables", "Establo"],
  Motel: ["Motel", "Motel"],
  Diner: ["Diner", "Bar de ruta"],
  Bank: ["Bank", "Banco"],
  Hotel: ["Hotel", "Hotel"],
  Hospital: ["Hospital", "Hospital"],
  Firestation: ["Fire station", "Cuartel de bomberos"],
  Medical: ["Medical", "Salud"],
  Post: ["Post office", "Correo"],
  Pharmacy: ["Pharmacy", "Farmacia"],
  Library: ["Library", "Biblioteca"],
  Prison: ["Prison", "Cárcel"],
  Mall: ["Mall", "Shopping"],
};

/** El tono de un edificio en el idioma de la página. */
export function toneName(tone: string, lang: Lang): string {
  return Object.hasOwn(TONES, tone) ? TONES[tone][lang === "es" ? 1 : 0] : humanize(tone);
}

/**
 * Las habitaciones de un piso, agrupadas por tipo (dos baños son una línea, "Baño ×2", con las casillas sumadas) y de la
 * más grande a la más chica: lo que importa del edificio va arriba. `extra` (los nombres de `lootRoomNames.ts`, si ya
 * llegaron) junta también las variantes de los cuartos que sólo tienen nombre ahí (`bandkitchen2` con `bandkitchen`).
 */
export function floorRooms(b: Building, floor: string, names: readonly string[], extra?: Extra): RoomGroup[] {
  const groups = new Map<string, RoomGroup>();
  for (const r of b.floors[floor] ?? []) {
    // Hay un cuarto sin nombre en el mapa (""): se muestra como "Habitación".
    const raw = names[r[0]] || "room";
    const key = roomKey(raw, extra);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, raws: [], count: 0, tiles: 0, rects: [] }));
    if (!g.raws.includes(raw)) g.raws.push(raw);
    g.count++;
    g.tiles += roomTiles(r);
    g.rects.push(...rectsOf(r));
  }
  return [...groups.values()].sort((a, c) => c.tiles - a.tiles || a.key.localeCompare(c.key));
}
