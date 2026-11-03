/**
 * Los textos de la sección CS2 (2026-11-03), en inglés y español. Fuera de un componente (prerender, buscador de la
 * barra) se usa `CS2_COPY[lang]`; adentro, `useCs2Copy()`.
 *
 * Los nombres de skins, cajas y colecciones van en inglés en los dos idiomas (decisión de ZoTaD): están en los datos.
 * Acá va la interfaz y lo que se traduce: rarezas, desgastes y categorías, con sus nombres oficiales del juego.
 */
import { useLang } from "./i18n";
import type { Cs2Section, Cs2Tab } from "./route";

/** El orden de las pestañas en la barra. */
export const CS2_TABS: Cs2Section[] = ["home", "skins", "cases", "collections"];

/** Las rarezas como las deja `site_data.py` (`RARITY` de `cs2.py`), de la más alta a la más baja. */
export type Cs2Rarity = "contraband" | "extraordinary" | "covert" | "classified" | "restricted" | "milspec" | "industrial" | "consumer";
export const CS2_RARITIES: Cs2Rarity[] = ["contraband", "extraordinary", "covert", "classified", "restricted", "milspec", "industrial", "consumer"];
/** Las categorías de `CATS` en `site_data.py`, en el orden de los filtros. */
export type Cs2Cat = "rifles" | "pistols" | "smgs" | "heavy" | "knives" | "gloves" | "equipment";
export const CS2_CATS: Cs2Cat[] = ["rifles", "pistols", "smgs", "heavy", "knives", "gloves", "equipment"];
/** Los contenedores de `_kind` en `site_data.py`. */
export type Cs2Kind = "case" | "terminal" | "souvenir" | "package";

/** Los cinco desgastes en el orden de los precios (`WEARS` de `cs2.py`): abreviatura del mercado y cortes de float. */
export const WEARS = [
  { ab: "FN", from: 0, to: 0.07 },
  { ab: "MW", from: 0.07, to: 0.15 },
  { ab: "FT", from: 0.15, to: 0.38 },
  { ab: "WW", from: 0.38, to: 0.45 },
  { ab: "BS", from: 0.45, to: 1 },
] as const;

/** La probabilidad de cada grupo de una caja de armas (`ODDS` de `prices.py`), y la del objeto especial. */
export const CASE_ODDS: Partial<Record<Cs2Rarity, number>> = { covert: 0.0064, classified: 0.032, restricted: 0.1598, milspec: 0.7992 };
export const SPECIAL_ODDS = 0.0026;
export const KEY_PRICE = 2.49;

type Seo = { title: string; description: string };
/** Una descripción entra en 160 caracteres: lo que sobra se corta en una palabra entera. */
const clip = (s: string): string => (s.length <= 160 ? s : `${s.slice(0, 157).replace(/[\s,;:]+\S*$/, "")}…`);

export interface Cs2Copy {
  tabs: Record<Cs2Section, string>;
  loading: string;
  loadError: string;
  retry: string;
  seo: Record<Cs2Section, Seo>;
  detailSeo: Record<Cs2Tab, (name: string) => Seo>;
  rarity: Record<Cs2Rarity, string>;
  wear: [string, string, string, string, string];
  cat: Record<Cs2Cat, string>;
  kind: Record<Cs2Kind, string>;
  home: {
    kicker: string;
    h1: string;
    lede: string;
    ribbon: string;
    cards: Record<Cs2Tab, (n: string) => string>;
    pricesOf: (date: string) => string;
  };
  t: {
    skin: string;
    weapon: string;
    rarityCol: string;
    catCol: string;
    float: string;
    price: string;
    normal: string;
    stattrak: string;
    souvenir: string;
    suggested: string;
    suggestedHint: string;
    wearCol: string;
    odds: string;
    oddsEach: string;
    caseCol: string;
    key: string;
    ev: string;
    returns: string;
    returnsHint: string;
    openCost: string;
    missing: string;
    special: (n: number) => string;
    skinsN: (n: number) => string;
    date: string;
    type: string;
    fromCases: string;
    fromCollections: string;
    noCases: string;
    variants: string;
    terminalNote: string;
    noOdds: string;
    pricesNote: (date: string) => string;
    search: string;
    all: string;
    sort: string;
    sortRarity: string;
    sortPrice: string;
    sortReturn: string;
    sortDate: string;
    sortName: string;
    onlySt: string;
    onlySv: string;
    count: (n: string) => string;
    none: string;
    open: string;
  };
}

const EN: Cs2Copy = {
  tabs: { home: "Home", skins: "Skins", cases: "Cases", collections: "Collections" },
  loading: "Loading…",
  loadError: "Couldn't load this page.",
  retry: "Retry",
  seo: {
    home: { title: "CS2 skins, cases & prices", description: "Every CS2 skin, case and collection with today's price in each wear, case odds and expected value. Free, no gambling." },
    skins: { title: "CS2 skins: prices, float ranges & cases", description: "All CS2 weapon, knife and glove skins with their price in each wear, StatTrak and Souvenir, float range and the case they drop from." },
    cases: { title: "CS2 cases: odds, expected value & prices", description: "Every CS2 case, souvenir package and terminal with its price, the odds of each rarity and what opening it returns on average." },
    collections: { title: "CS2 collections: every skin & price", description: "Every CS2 weapon collection with its skins by rarity, their float ranges and prices, and the case or package it comes from." },
  },
  detailSeo: {
    skins: (n) => ({ title: `${n} price, float & cases`, description: clip(`${n}: price in every wear (normal, StatTrak and Souvenir), float range, rarity and the cases and collections it drops from.`) }),
    cases: (n) => ({ title: `${n} odds & expected value`, description: clip(`${n}: every skin inside with its price in each wear, the odds of each rarity, the knives and what opening it returns on average.`) }),
    collections: (n) => ({ title: `${n} skins & prices`, description: clip(`${n}: every skin by rarity with its float range and price, and where the collection drops from.`) }),
  },
  rarity: {
    contraband: "Contraband", extraordinary: "Extraordinary", covert: "Covert", classified: "Classified",
    restricted: "Restricted", milspec: "Mil-Spec", industrial: "Industrial Grade", consumer: "Consumer Grade",
  },
  wear: ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"],
  cat: { rifles: "Rifles", pistols: "Pistols", smgs: "SMGs", heavy: "Heavy", knives: "Knives", gloves: "Gloves", equipment: "Equipment" },
  kind: { case: "Case", terminal: "Terminal", souvenir: "Souvenir package", package: "Collection package" },
  home: {
    kicker: "Counter-Strike 2",
    h1: "Skins, cases and prices",
    lede: "Every skin with its price in each wear, every case with its odds and what it returns on average, every collection. No gambling, no case opening, nothing to sell.",
    ribbon: "Cases that return the most today",
    cards: {
      skins: (n) => `${n} weapon, knife and glove skins with float ranges and prices.`,
      cases: (n) => `${n} cases, terminals and souvenir packages with odds and expected value.`,
      collections: (n) => `${n} collections with every skin by rarity.`,
    },
    pricesOf: (d) => `Prices of ${d}`,
  },
  t: {
    skin: "Skin",
    weapon: "Weapon",
    rarityCol: "Rarity",
    catCol: "Type",
    float: "Float",
    price: "Price",
    normal: "Normal",
    stattrak: "StatTrak™",
    souvenir: "Souvenir",
    suggested: "sugg.",
    suggestedHint: "No listings: suggested price",
    wearCol: "Wear",
    odds: "Odds",
    oddsEach: "Each",
    caseCol: "Case",
    key: "Key",
    ev: "Expected value",
    returns: "Returns",
    returnsHint: "Expected value ÷ (case + key)",
    openCost: "Case + key",
    missing: "missing prices",
    special: (n) => `Rare special item · ${n}`,
    skinsN: (n) => `${n} skins`,
    date: "Released",
    type: "Type",
    fromCases: "Drops from",
    fromCollections: "Collection",
    noCases: "Doesn't drop from cases",
    variants: "Other phases",
    terminalNote: "Terminals don't open with a key: they offer skins one at a time at a fixed price, so they have no odds or expected value.",
    noOdds: "Valve doesn't publish odds for this container.",
    pricesNote: (d) => `Before fees, with the lowest Skinport listing of ${d}. StatTrak drops 10% of the time.`,
    search: "Search",
    all: "All",
    sort: "Sort",
    sortRarity: "Rarity",
    sortPrice: "Price",
    sortReturn: "Returns",
    sortDate: "Newest",
    sortName: "Name",
    onlySt: "StatTrak",
    onlySv: "Souvenir",
    count: (n) => `${n} results`,
    none: "Nothing matches.",
    open: "Open",
  },
};

const ES: Cs2Copy = {
  tabs: { home: "Inicio", skins: "Skins", cases: "Cajas", collections: "Colecciones" },
  loading: "Cargando…",
  loadError: "No se pudo cargar esta página.",
  retry: "Reintentar",
  seo: {
    home: { title: "CS2: skins, cajas y precios", description: "Cada skin, caja y colección de CS2 con el precio de hoy en cada desgaste, las probabilidades y el valor esperado de cada caja. Gratis, sin apuestas." },
    skins: { title: "Skins de CS2: precios, float y cajas", description: "Todas las skins de armas, cuchillos y guantes de CS2 con su precio en cada desgaste, StatTrak y Souvenir, rango de float y la caja de donde salen." },
    cases: { title: "Cajas de CS2: probabilidades, valor esperado y precios", description: "Cada caja, paquete de souvenir y terminal de CS2 con su precio, la probabilidad de cada rareza y cuánto devuelve abrirla en promedio." },
    collections: { title: "Colecciones de CS2: cada skin y su precio", description: "Cada colección de armas de CS2 con sus skins por rareza, su rango de float y precio, y la caja o el paquete de donde sale." },
  },
  detailSeo: {
    skins: (n) => ({ title: `${n}: precio, float y cajas`, description: clip(`${n}: precio en cada desgaste (normal, StatTrak y Souvenir), rango de float, rareza y las cajas y colecciones de donde sale.`) }),
    cases: (n) => ({ title: `${n}: probabilidades y valor esperado`, description: clip(`${n}: cada skin que trae con su precio en cada desgaste, la probabilidad de cada rareza, los cuchillos y cuánto devuelve abrirla en promedio.`) }),
    collections: (n) => ({ title: `${n}: skins y precios`, description: clip(`${n}: cada skin por rareza con su rango de float y precio, y de dónde sale la colección.`) }),
  },
  rarity: {
    contraband: "Contrabando", extraordinary: "Extraordinario", covert: "Encubierto", classified: "Clasificado",
    restricted: "Restringido", milspec: "Grado militar", industrial: "Grado industrial", consumer: "Grado de consumo",
  },
  wear: ["Recién fabricado", "Casi nuevo", "Algo desgastado", "Bastante desgastado", "Deplorable"],
  cat: { rifles: "Rifles", pistols: "Pistolas", smgs: "Subfusiles", heavy: "Pesadas", knives: "Cuchillos", gloves: "Guantes", equipment: "Equipo" },
  kind: { case: "Caja", terminal: "Terminal", souvenir: "Paquete de souvenir", package: "Paquete de colección" },
  home: {
    kicker: "Counter-Strike 2",
    h1: "Skins, cajas y precios",
    lede: "Cada skin con su precio en cada desgaste, cada caja con sus probabilidades y cuánto devuelve en promedio, cada colección. Sin apuestas, sin abrir cajas, nada para vender.",
    ribbon: "Las cajas que más devuelven hoy",
    cards: {
      skins: (n) => `${n} skins de armas, cuchillos y guantes con su float y precio.`,
      cases: (n) => `${n} cajas, terminales y paquetes de souvenir con probabilidades y valor esperado.`,
      collections: (n) => `${n} colecciones con cada skin por rareza.`,
    },
    pricesOf: (d) => `Precios del ${d}`,
  },
  t: {
    skin: "Skin",
    weapon: "Arma",
    rarityCol: "Rareza",
    catCol: "Tipo",
    float: "Float",
    price: "Precio",
    normal: "Normal",
    stattrak: "StatTrak™",
    souvenir: "Souvenir",
    suggested: "sug.",
    suggestedHint: "Sin publicaciones: precio sugerido",
    wearCol: "Desgaste",
    odds: "Prob.",
    oddsEach: "Cada una",
    caseCol: "Caja",
    key: "Llave",
    ev: "Valor esperado",
    returns: "Devuelve",
    returnsHint: "Valor esperado ÷ (caja + llave)",
    openCost: "Caja + llave",
    missing: "faltan precios",
    special: (n) => `Objeto especial · ${n}`,
    skinsN: (n) => `${n} skins`,
    date: "Salió",
    type: "Tipo",
    fromCases: "Sale de",
    fromCollections: "Colección",
    noCases: "No sale de cajas",
    variants: "Otras fases",
    terminalNote: "Las terminales no se abren con llave: ofrecen skins de a una a un precio fijo, así que no tienen probabilidades ni valor esperado.",
    noOdds: "Valve no publica probabilidades para este contenedor.",
    pricesNote: (d) => `Antes de comisiones, con la publicación más barata de Skinport del ${d}. StatTrak sale el 10 % de las veces.`,
    search: "Buscar",
    all: "Todas",
    sort: "Orden",
    sortRarity: "Rareza",
    sortPrice: "Precio",
    sortReturn: "Devuelve",
    sortDate: "Más nuevas",
    sortName: "Nombre",
    onlySt: "StatTrak",
    onlySv: "Souvenir",
    count: (n) => `${n} resultados`,
    none: "No hay nada con eso.",
    open: "Abrir",
  },
};

export const CS2_COPY: Record<"en" | "es", Cs2Copy> = { en: EN, es: ES };
export const useCs2Copy = (): Cs2Copy => CS2_COPY[useLang().lang];
