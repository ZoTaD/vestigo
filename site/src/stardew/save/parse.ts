/**
 * Lector del archivo de partida de Stardew Valley (etapa 3, tarea 3). TypeScript puro: recibe el XML como texto y
 * devuelve lo que necesitan la perfección, los paquetes, los regalos y "qué hacer hoy". No importa nada del sitio.
 *
 * El archivo es el `SaveGame` que escribe el `XmlSerializer` de .NET: cada etiqueta es una propiedad serializable (o el
 * nombre de su `[XmlElement]`), los diccionarios van como `<item><key><T>…</T></key><value><T>…</T></value></item>` y
 * las subclases llevan `xsi:type` (`<Item xsi:type="MeleeWeapon">`, `<Object xsi:type="Chest">`). El archivo
 * `SaveGameInfo` de la misma carpeta es sólo el granjero (raíz `<Farmer>`): se avisa con `save-info`.
 *
 * Qué se lee y de dónde:
 * - Fecha y clima: `currentSeason`, `dayOfMonth`, `year`, `isRaining`, `weatherForTomorrow` en la raíz.
 * - Granjeros: `<player>` (el anfitrión) y `<farmhands><Farmer>` (1.6) o, en partidas de antes, el `<farmhand>` de
 *   cada cabaña. Las cabañas sin dueño traen un `Farmer` con `isCustomized` en false: se saltan.
 * - Correo: `mailReceived` más `mailbox` y `mailForTomorrow` (sin la marca `%&NL&%`), igual que
 *   `Farmer.hasOrWillReceiveMail`, que es lo que mira el juego para los frutos estelares (`CF_*`).
 * - Cofres de las minas: `chestConsumedLevels` (el `[XmlElement]` de `Farmer.chestConsumedMineLevels`); el del
 *   piso 100 cuenta como fruto estelar en `Utility.foundAllStardrops`.
 * - Paquetes: las definiciones salen de `<bundleData>` de la partida (los remezclados de la 1.5+ quedan como los tiene
 *   esa partida) y lo entregado de `<bundles>` del `CommunityCenter`: un `bool[]` por paquete, con un lugar por cada
 *   número del campo de objetos (3 por objeto); el juego da el paquete por hecho cuando están todos en true
 *   (`CommunityCenter.isBundleComplete`) y, mientras tanto, el lugar `i` es el objeto `i`.
 * - Objetos de la granja: inventarios de todos más el contenido de todo cofre de todos los lugares (cofres sueltos,
 *   heladeras, cofres de edificios como el molino, los que van adentro de un recolector) y los cofres Junimo
 *   (`globalInventories`).
 *
 * Partidas viejas (antes de la 1.6): se leen igual con lo que traigan. Sin `<gameVersion>` la versión se deduce por
 * `hasApplied1_4_UpdateChanges` ("1.4") y `hasApplied1_3_UpdateChanges` ("1.3"); sin ninguna es "<1.3". Antes de la
 * 1.6 los objetos no tienen `itemId` (se usa `parentSheetIndex` y compañía), los monstruos están en el `stats` de la
 * raíz y los cofres Junimo en `<junimoChest>`; antes de la 1.3 la amistad es `friendships` con un arreglo de números; si
 * no hay `<bundleData>` (antes de la 1.5), `defs` queda vacío y manda `bundles.json`.
 */

export type SaveError = { error: "not-xml" | "save-info" | "not-save" };

/** Lo que hace falta del DOMParser: el nativo en el navegador, el de `@xmldom/xmldom` en los tests. */
export interface XmlParser {
  parseFromString(s: string, type: string): Document;
}

export interface Friend {
  points: number;
  giftsWeek: number;
  giftToday: boolean;
  /** `Friendly`, `Dating`, `Engaged`, `Married`, `Divorced`… (`FriendshipStatus`). */
  status: string;
}

export interface Player {
  name: string;
  host: boolean;
  /** Niveles: [cultivo, pesca, recolección, minería, combate, suerte] (el nivel del granjero es la suma / 2). */
  skills: [number, number, number, number, number, number];
  /** Id → veces enviado (`basicShipped`). */
  shipped: Record<string, number>;
  /** Id → cuántos pescó (`fishCaught`; el juego guarda también el tamaño récord, acá no hace falta). */
  fish: Record<string, number>;
  /** Recetas de cocina conocidas, por nombre (`cookingRecipes`). */
  cooking: string[];
  /** Id del plato → veces cocinado (`recipesCooked`). */
  cooked: Record<string, number>;
  /** Receta de fabricación → veces fabricada; 0 = conocida sin hacer (`craftingRecipes`). */
  crafting: Record<string, number>;
  /** Correo recibido, en el buzón o para mañana. */
  mail: string[];
  friends: Record<string, Friend>;
  /** Monstruo (nombre interno) → muertos (`stats/specificMonstersKilled`). */
  kills: Record<string, number>;
  /** Pisos de las minas cuyo cofre ya abrió (`chestConsumedLevels`). */
  minesChests: number[];
  inventory: Record<string, number>;
}

export interface BundleDef {
  /** Sala del Centro Comunitario, en inglés como en `Data/Bundles` (`Pantry`, `Crafts Room`, `Vault`…). */
  room: string;
  index: number;
  /** Nombre interno del paquete (en inglés). */
  name: string;
  /** [id, cantidad, calidad]. En la Bóveda el id es "-1" y la cantidad son oros. */
  items: [id: string, qty: number, quality: number][];
  /** Cuántos objetos pide; si el dato no lo dice, todos. */
  need: number;
}

export interface SaveBundles {
  defs: BundleDef[];
  /** Índice del paquete → lo entregado (ver el comentario de arriba). */
  done: Record<number, boolean[]>;
}

export interface Save {
  version: string;
  farm: string;
  season: 0 | 1 | 2 | 3;
  day: number;
  year: number;
  weatherTomorrow: string;
  raining: boolean;
  /** El anfitrión primero. */
  players: Player[];
  bundles: SaveBundles;
  /** Nueces doradas halladas (`goldenWalnutsFound`). */
  walnuts: number;
  /** Tipo de cada edificio terminado (uno por edificio), en cualquier lugar, como `Game1.IsBuildingConstructed`. */
  buildings: string[];
  joja: boolean;
  ccComplete: boolean;
  /** Id → cantidad, sumando el inventario de todos y todos los cofres de todos los lugares. */
  items: Record<string, number>;
}

const SEASONS: Record<string, 0 | 1 | 2 | 3> = { spring: 0, summer: 1, fall: 2, winter: 3 };
/** Antes de la 1.6 el clima de mañana era un número (`Game1.weather_*`); se pasa al nombre de la 1.6. */
const OLD_WEATHER = ["Sun", "Rain", "Wind", "Storm", "Festival", "Snow", "Wedding"];

// --- Ayudas sobre el DOM (sólo lo que tienen el nativo y xmldom: childNodes, nodeName, textContent) ---

function kids(el: Element | null | undefined): Element[] {
  const out: Element[] = [];
  if (!el) return out;
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n as Element);
  return out;
}

function kid(el: Element | null | undefined, tag: string): Element | null {
  if (!el) return null;
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && n.nodeName === tag) return n as Element;
  return null;
}

function first(el: Element | null | undefined): Element | null {
  if (!el) return null;
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) return n as Element;
  return null;
}

const str = (el: Element | null | undefined): string => (el?.textContent ?? "").trim();
const text = (el: Element | null | undefined, tag: string): string => str(kid(el, tag));
const int = (s: string): number => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
};
const num = (el: Element | null | undefined, tag: string): number => int(text(el, tag));
const bool = (el: Element | null | undefined, tag: string): boolean => text(el, tag) === "true";
const nil = (el: Element): boolean => el.getAttribute("xsi:nil") === "true";
const xsiType = (el: Element): string => el.getAttribute("xsi:type") ?? "";

/** Un diccionario serializado: cada `<item>` da [el elemento de adentro de `<key>`, el de adentro de `<value>`]. */
function dict(el: Element | null | undefined): [Element | null, Element | null][] {
  return kids(el).map((it) => [first(kid(it, "key")), first(kid(it, "value"))]);
}

/** Diccionario de clave texto → número (el número es el valor, o el primero de un `ArrayOfInt`). */
function counts(el: Element | null | undefined, id = false): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of dict(el)) {
    if (!k) continue;
    const key = id ? normId(str(k)) : str(k);
    out[key] = v && v.nodeName === "ArrayOfInt" ? int(str(first(v))) : int(str(v));
  }
  return out;
}

// --- Ids ---

/** Normaliza un id como en nuestros datos: sin `(O)` en los objetos, con el prefijo en el resto. */
export function normId(id: string): string {
  return id.startsWith("(O)") ? id.slice(3) : id;
}

const TOOLS = new Set([
  "Axe", "Pickaxe", "Hoe", "WateringCan", "FishingRod", "MilkPail", "Shears", "Pan", "Wand", "GenericTool", "Lantern",
  "Raft", "ReturnScepter", "MagnifyingGlass",
]);
const FURNITURE = new Set(["Furniture", "BedFurniture", "TV", "StorageFurniture", "FishTankFurniture", "RandomizedPlantFurniture"]);

/** El prefijo de tipo de `ItemRegistry` según la clase del objeto (`xsi:type`); "" para los objetos comunes. */
function prefix(el: Element): string {
  const t = xsiType(el);
  if (t === "MeleeWeapon" || t === "Slingshot") return "(W)";
  if (TOOLS.has(t)) return "(T)";
  if (t === "Boots") return "(B)";
  if (t === "Hat") return "(H)";
  if (t === "Trinket") return "(TR)";
  if (t === "Mannequin") return "(M)";
  if (t === "Clothing") {
    const c = text(el, "clothesType");
    return c === "PANTS" || c === "1" ? "(P)" : "(S)";
  }
  if (t === "Wallpaper") return bool(el, "isFloor") ? "(FL)" : "(WP)";
  if (FURNITURE.has(t)) return "(F)";
  // Object y sus subclases (Chest, Cask, ColoredObject…), Ring y CombinedRing (anillos: objetos comunes en la 1.6).
  return bool(el, "bigCraftable") ? "(BC)" : "";
}

/** El id normalizado de un `<Item>`: `itemId` en la 1.6; antes, el índice de la hoja que use esa clase. */
function itemId(el: Element): string {
  const raw =
    text(el, "itemId") || text(el, "parentSheetIndex") || text(el, "which") || text(el, "indexInTileSheet") ||
    text(el, "initialParentTileIndex");
  if (!raw) return "";
  if (raw.startsWith("(")) return normId(raw);
  return prefix(el) + raw;
}

function addItem(out: Record<string, number>, el: Element) {
  if (nil(el)) return;
  const id = itemId(el);
  if (!id) return;
  const stack = int(text(el, "stack") || text(el, "Stack")) || 1;
  out[id] = (out[id] ?? 0) + stack;
}

function addAll(out: Record<string, number>, from: Record<string, number>) {
  for (const [k, v] of Object.entries(from)) out[k] = (out[k] ?? 0) + v;
}

// --- Granjero ---

function readPlayer(el: Element, host: boolean, rootStats: Element | null): Player {
  const skills: Player["skills"] = [
    num(el, "farmingLevel"), num(el, "fishingLevel"), num(el, "foragingLevel"),
    num(el, "miningLevel"), num(el, "combatLevel"), num(el, "luckLevel"),
  ];

  const mail = new Set<string>();
  for (const tag of ["mailReceived", "mailbox", "mailForTomorrow"]) {
    for (const m of kids(kid(el, tag))) mail.add(str(m).replace("%&NL&%", ""));
  }

  const friends: Record<string, Friend> = {};
  for (const [k, v] of dict(kid(el, "friendshipData"))) {
    if (!k || !v) continue;
    friends[str(k)] = {
      points: num(v, "Points"),
      giftsWeek: num(v, "GiftsThisWeek"),
      giftToday: num(v, "GiftsToday") > 0,
      status: text(v, "Status") || "Friendly",
    };
  }
  // Antes de la 1.3: `friendships`, con [puntos, regalos de la semana, …] por aldeano.
  for (const [k, v] of dict(kid(el, "friendships"))) {
    if (!k || !v || friends[str(k)]) continue;
    const a = kids(v).map((x) => int(str(x)));
    friends[str(k)] = { points: a[0] ?? 0, giftsWeek: a[1] ?? 0, giftToday: false, status: "Friendly" };
  }

  // En la 1.6 los `stats` son del granjero; antes, de la partida (sólo valen para el anfitrión).
  const stats = kid(el, "stats") ?? (host ? rootStats : null);
  const kills = counts(kid(stats, "specificMonstersKilled"));

  const minesChests: number[] = [];
  for (const [k, v] of dict(kid(el, "chestConsumedLevels"))) if (k && str(v) === "true") minesChests.push(int(str(k)));
  minesChests.sort((a, b) => a - b);

  const inventory: Record<string, number> = {};
  for (const it of kids(kid(el, "items"))) addItem(inventory, it);

  return {
    name: text(el, "name"),
    host,
    skills,
    shipped: counts(kid(el, "basicShipped"), true),
    fish: counts(kid(el, "fishCaught"), true),
    cooking: dict(kid(el, "cookingRecipes")).flatMap(([k]) => (k ? [str(k)] : [])),
    cooked: counts(kid(el, "recipesCooked"), true),
    crafting: counts(kid(el, "craftingRecipes")),
    mail: [...mail],
    friends,
    kills,
    minesChests,
    inventory,
  };
}

// --- Paquetes ---

/** Una entrada de `Data/Bundles`: `nombre/premio/objetos/color/cuántos/…/nombre visible`. */
function readBundleDef(key: string, value: string): BundleDef | null {
  const [room, idx] = key.split("/");
  const f = value.split("/");
  if (!room || idx === undefined || f.length < 3) return null;
  const tok = f[2].trim().split(/\s+/).filter(Boolean);
  const items: BundleDef["items"] = [];
  for (let i = 0; i + 2 < tok.length; i += 3) items.push([normId(tok[i]), int(tok[i + 1]), int(tok[i + 2])]);
  const need = f[4] ? int(f[4]) : 0;
  return { room, index: int(idx), name: f[0], items, need: need > 0 ? need : items.length };
}

// --- La partida ---

export function parseSave(xml: string, parser?: XmlParser): Save | SaveError {
  const src = xml.replace(/^﻿/, "").trim();
  if (!src.startsWith("<")) return { error: "not-xml" };
  let doc: Document;
  try {
    doc = (parser ?? new DOMParser()).parseFromString(src, "text/xml");
  } catch {
    return { error: "not-xml" };
  }
  const root = doc?.documentElement;
  // El DOMParser del navegador no tira: devuelve un <parsererror>, como raíz (Firefox) o al principio de la raíz
  // (Chrome). Se mira sólo ahí: buscarlo en todo el documento recorre los megas de una partida buena.
  if (!root || root.nodeName === "parsererror") return { error: "not-xml" };
  let n = 0;
  for (let c = root.firstChild; c && n < 3; c = c.nextSibling) {
    if (c.nodeType !== 1) continue;
    if (c.nodeName === "parsererror") return { error: "not-xml" };
    n++;
  }
  if (root.nodeName === "Farmer") return { error: "save-info" };
  if (root.nodeName !== "SaveGame") return { error: "not-save" };

  // Una sola pasada por los hijos de la raíz.
  const top = new Map<string, Element>();
  for (const c of kids(root)) if (!top.has(c.nodeName)) top.set(c.nodeName, c);
  const t = (tag: string) => top.get(tag) ?? null;
  const tt = (tag: string) => str(t(tag));

  const hostEl = t("player");
  // Sin anfitrión no hay partida que mostrar (la perfección y lo demás leen players[0]).
  if (!hostEl) return { error: "not-save" };
  const locations = t("locations");

  // Granjeros: los de `<farmhands>` (1.6) o el `<farmhand>` de cada cabaña (antes).
  let hands = kids(t("farmhands"));
  if (hands.length === 0 && locations) hands = Array.from(locations.getElementsByTagName("farmhand"));
  const players: Player[] = [];
  players.push(readPlayer(hostEl, true, t("stats")));
  for (const h of hands) {
    if (nil(h) || text(h, "isCustomized") === "false" || !text(h, "name")) continue;
    players.push(readPlayer(h, false, null));
  }

  // Objetos: inventarios + todo `<items>` cuyo dueño es un cofre (por clase, por etiqueta o la heladera).
  const items: Record<string, number> = {};
  for (const p of players) addAll(items, p.inventory);
  const buildings: string[] = [];
  let ccEl: Element | null = null;
  if (locations) {
    const lists = locations.getElementsByTagName("items");
    for (let i = 0; i < lists.length; i++) {
      const list = lists[i];
      const owner = list.parentNode as Element | null;
      if (!owner || owner.nodeType !== 1) continue;
      if (xsiType(owner) !== "Chest" && owner.nodeName !== "Chest" && owner.nodeName !== "fridge") continue;
      // La caja de envíos chica es un Chest, pero lo de adentro se vende a la noche: no es almacenamiento.
      if (text(owner, "specialChestType") === "MiniShippingBin") continue;
      for (const it of kids(list)) addItem(items, it);
    }
    const blds = locations.getElementsByTagName("Building");
    for (let i = 0; i < blds.length; i++) {
      const type = text(blds[i], "buildingType");
      if (type && num(blds[i], "daysOfConstructionLeft") <= 0) buildings.push(type);
    }
    for (const loc of kids(locations)) {
      if (text(loc, "name") === "CommunityCenter") ccEl = loc;
    }
  }
  // Cofres Junimo: un inventario global por id.
  for (const [, v] of dict(t("globalInventories"))) for (const it of kids(v)) addItem(items, it);
  // Antes de la 1.6 los cofres Junimo eran una lista suelta en la raíz (`SaveGame.junimoChest`, hoy obsoleta).
  for (const it of kids(t("junimoChest"))) addItem(items, it);

  // Paquetes.
  const defs: BundleDef[] = [];
  for (const [k, v] of dict(t("bundleData"))) {
    const d = k && v ? readBundleDef(str(k), str(v)) : null;
    if (d) defs.push(d);
  }
  const done: Record<number, boolean[]> = {};
  for (const [k, v] of dict(kid(ccEl, "bundles"))) {
    if (!k) continue;
    done[int(str(k))] = kids(v).map((b) => str(b) === "true");
  }

  const mailAll = new Set(players.flatMap((p) => p.mail));
  // El granjero puede traer "-1", el valor por defecto de `Farmer.gameVersion`: no dice nada.
  const hostVersion = text(hostEl, "gameVersion");
  const version =
    tt("gameVersion") || (hostVersion && hostVersion !== "-1" ? hostVersion : "") ||
    (tt("hasApplied1_4_UpdateChanges") === "true" ? "1.4" : tt("hasApplied1_3_UpdateChanges") === "true" ? "1.3" : "<1.3");

  return {
    version,
    farm: text(hostEl, "farmName"),
    season: SEASONS[tt("currentSeason").toLowerCase()] ?? 0,
    day: int(tt("dayOfMonth")),
    year: int(tt("year")),
    weatherTomorrow: /^\d+$/.test(tt("weatherForTomorrow"))
      ? OLD_WEATHER[int(tt("weatherForTomorrow"))] ?? "Sun"
      : tt("weatherForTomorrow"),
    raining: tt("isRaining") === "true",
    players,
    bundles: { defs, done },
    walnuts: int(tt("goldenWalnutsFound")),
    buildings,
    joja: mailAll.has("JojaMember"),
    ccComplete: mailAll.has("ccIsComplete"),
    items,
  };
}
