import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { RANKS } from "./bands";

/**
 * El vocabulario de Deadlock: nombres e imágenes de héroes y rangos, en los dos
 * idiomas del sitio.
 *
 *   npm run catalog
 *
 * **Nada de esto se escribe a mano, ni siquiera el español.** El juego ya está
 * traducido y su API de assets lo sirve por idioma, así que se baja: "Seven" es
 * "Siete", "Ivy" es "Hiedra" y "Phantom" es "Fantasma" porque así los llama el
 * cliente del jugador, no porque alguien haya elegido esas palabras acá. Es la
 * misma regla que en TFT con CommunityDragon, y existe por el mismo motivo: una
 * traducción propia le enseña al lector un vocabulario que no va a encontrar
 * dentro del juego.
 *
 * Los nombres en español traen la forma con género del propio juego
 * ("Emisario/a", "Eterno/a"). Queda como viene: es el texto que el jugador ve en
 * su cliente, y "arreglarlo" sería justamente inventar vocabulario.
 *
 * **Las imágenes se referencian, no se re-alojan.** El catálogo guarda la URL del
 * bucket de deadlock-api. La licencia MIT de ese proyecto cubre su código, no el
 * arte de Valve, y Valve no tiene una política escrita sobre extraer y
 * redistribuir assets del juego — que es la diferencia grande contra Riot, que sí
 * la tiene. Guardar la URL en vez de la imagen deja esa decisión abierta: el día
 * que convenga alojarlas, cambia esta función y nada más.
 */

const ASSETS = "https://assets.deadlock-api.com/v2";
/** Donde vive el arte de la tienda, que es de la interfaz y no de los ítems. */
const SHOP_ART = "https://assets-bucket.deadlock-api.com/assets-api-res/images/shop/catalog";
const ICON_ART = "https://assets-bucket.deadlock-api.com/assets-api-res/icons";

/**
 * El ícono con el que se anuncia cada tipo en la fila.
 *
 * **No son los íconos que el juego le pone a cada stat**, y esa es la corrección.
 * Los de stat (`damage_magic_color.svg` y compañía) son los que van *adentro* de
 * la tarjeta, al lado de cada número. Para decir de un vistazo "esto da daño de
 * espíritu" el juego usa otro set: las **etiquetas de build**, que son los
 * cuadrados de color con el símbolo de la categoría. Salen del catálogo de
 * íconos (`/v2/icons`), que es un árbol de 1.321 URLs que este archivo no miraba.
 */
const ICONO_DE_TIPO: Record<string, string> = {
  bullet_damage: `${ICON_ART}/builds/citadel_build_tag_weapon.svg`,
  tech_damage: `${ICON_ART}/builds/citadel_build_tag_spirit.svg`,
  melee_damage: `${ICON_ART}/builds/citadel_build_tag_melee.svg`,
  health: `${ICON_ART}/builds/citadel_build_tag_vitality.svg`,
  healing: `${ICON_ART}/builds/citadel_build_tag_healing.svg`,
};

/** El alma, que es como el juego escribe un precio. */
const SOUL_ICON = `${ICON_ART}/gold.svg`;
const PROP_ICON = `${ICON_ART}/icons/properties`;

/**
 * Los atributos que el juego nombra **adentro** del texto, con su ícono.
 *
 * En la descripción vienen como `<span class="inline-attribute-label
 * SpiritDamage">daño espiritual</span>`, precedidos por un **SVG incrustado con
 * el path entero** — no una URL. Ese SVG no se puede volcar en la página, así que
 * se descarta y en su lugar la UI dibuja **nuestra referencia al mismo ícono**
 * del catálogo: se ve igual y no entra markup de un tercero.
 *
 * Las clases salieron de recorrer las descripciones de los 156 ítems, y las
 * catorce rutas de ícono se verificaron una por una contra el bucket.
 */
const ATRIBUTOS: Record<string, string> = {
  SpiritDamage: "damage_magic_color.svg",
  BonusSpiritDamage: "damage_magic_color.svg",
  SpiritDPS: "damage_magic_color.svg",
  Spirit: "damage_magic_color.svg",
  WeaponDamage: "damage_weapon_color.svg",
  BonusWeaponDamage: "damage_weapon_color.svg",
  MeleeDamage: "melee.svg",
  Heal: "heal.svg",
  Regen: "heal.svg",
  MoveSpeed: "move_speed.svg",
  BonusMoveSpeed: "move_speed.svg",
  FireRate: "fire_rate.svg",
  BonusFireRate: "fire_rate.svg",
  SpiritResist: "resist_spirit_color.svg",
  BulletResist: "resist_bullet_color.svg",
  Slow: "condition_slow.svg",
  Stun: "condition_stun.svg",
};
const LANGS = { en: "english", es: "spanish" } as const;
const OUT_DIR = "../data";
const OUT = `${OUT_DIR}/catalog.json`;

/**
 * Las fichas de los ítems van en su propio archivo, no en el catálogo.
 *
 * Pesan **99 KB en los dos idiomas** contra los 43 del catálogo entero, y sólo
 * hacen falta cuando alguien abre un ítem. En el catálogo viajarían siempre, en
 * el bundle principal, para el visitante que nunca hace clic. Acá se piden con
 * `import()` en el primer clic, que es el mismo reparto que ya usan las bandas.
 */
const OUT_DETAIL = `${OUT_DIR}/items-detail.json`;

/** Un texto en todos los idiomas del sitio. El inglés es el fallback. */
export interface Localized {
  en: string;
  es: string;
}

interface RawHero {
  id: number;
  name: string;
  player_selectable?: boolean;
  disabled?: boolean;
  in_development?: boolean;
  images?: Record<string, string>;
  /**
   * Los colores con los que el juego pinta a este héroe.
   *
   * `style_hex` es el que usa su tarjeta y su ficha; `ui` es el mismo tono
   * subido de brillo para dibujar encima de un fondo oscuro. Nos alcanza el
   * primero: el ajuste de brillo lo hace el CSS, que es donde se puede corregir
   * sin re-publicar el catálogo.
   */
  colors?: { style_hex?: string };
}

interface RawRank {
  tier: number;
  name: string;
  color?: string;
  images?: Record<string, string>;
}

interface RawProperty {
  value?: string | number;
  label?: string;
  postfix?: string;
  /** El ícono que el juego le pone a esta stat. */
  icon?: string;
  /** La clave con la que el juego la clasifica ("tech_damage", "health"…). */
  css_class?: string;
}

/**
 * Los tipos que se anuncian en la fila del ítem, y por qué sólo estos cinco.
 *
 * **La categoría de la tienda no dice de qué tipo es el ítem.** Medido sobre los
 * 156: 132 tienen algún tipo identificable y **57 tienen más de uno**, con casos
 * como un ítem del estante de vitalidad que da curación *y* espíritu, o uno del
 * de arma que da espíritu. La fila mostraba el estante y eso es otra cosa.
 *
 * De los 24 íconos que publica el juego, estos cinco son los que contestan "¿qué
 * me da?". El resto —recarga, alcance, duración— describe *cómo* funciona, y eso
 * vive en la ficha, no en la fila.
 */
const TIPOS_EN_FILA = ["bullet_damage", "tech_damage", "melee_damage", "health", "healing"] as const;

/**
 * Un bloque de la ficha, tal como lo manda el juego.
 *
 * **Las stats vienen repartidas en cuatro arrays, no en uno.** Leyendo sólo
 * `properties` se mostraban 480 de 804: faltaban las 63 destacadas
 * (`elevated_properties`, la línea grande de la tarjeta del juego), las 251
 * importantes y 10 más. Lo agarró ZoTaD comparando una tarjeta real: Spirit
 * Lifesteal muestra tres líneas en el juego y nosotros dibujábamos dos.
 */
interface RawSection {
  section_type?: string;
  section_attributes?: {
    loc_string?: string;
    properties?: string[];
    elevated_properties?: string[];
    important_properties?: string[];
    important_properties_with_icon?: string[];
  }[];
}

interface RawItem {
  id: number;
  name: string;
  type?: string;
  /** Si se puede comprar en la tienda. Es el filtro que importa. */
  shopable?: boolean;
  cost?: number | null;
  item_tier?: number;
  item_slot_type?: "weapon" | "vitality" | "spirit";
  shop_image?: string;
  shop_image_webp?: string;
  is_active_item?: boolean;
  /** El nombre interno, que es como los otros ítems lo referencian. */
  class_name?: string;
  /** Los ítems de los que este se construye, por `class_name`. */
  component_items?: string[];
  /** Las stats del ítem, por clave interna. */
  properties?: Record<string, RawProperty>;
  /** Cómo el propio juego agrupa esas stats para mostrarlas. */
  tooltip_sections?: RawSection[];
}

export interface CatalogHero {
  name: Localized;
  /** Retrato chico, el que usa una fila de la tier list. */
  img: string;
  /** Ilustración grande, para cuando una vista quiera abrir el héroe. */
  card: string;
  /**
   * El color con el que el JUEGO pinta a este héroe (`colors.style_hex`).
   *
   * **Es lo que evita elegir una paleta a mano para 38 héroes.** Una fila, una
   * tarjeta o una barra teñida con esto no es una decisión de diseño nuestra:
   * es el mismo color que el jugador ya vio en la pantalla de selección.
   *
   * Cadena vacía si el juego no lo declara, para que la vista pueda caer al
   * color del tema en vez de dibujar `undefined`.
   */
  color: string;
}

export interface CatalogRank {
  tier: number;
  name: Localized;
  /**
   * La insignia del rango, que es como el juego lo dibuja.
   *
   * La versión **chica** (`badge_sm`), que pesa 8,9 KB contra los 146 KB de la
   * grande: esto se dibuja al lado de una letra de tier, no como ilustración.
   * El juego sólo publica las chicas por subrango, así que se toma la del
   * subrango 1 — la puerta de entrada al rango, que es lo que la banda nombra.
   */
  img: string;
  /**
   * Las seis insignias de subrango, de la I a la estrella.
   *
   * **El juego numera los subrangos con romanos y el sexto NO es un "VI": es una
   * estrella de seis puntas.** Verificado mirando las imágenes una por una —
   * `badge_sm_subrank5` dibuja una V y `badge_sm_subrank6` la estrella—. Por eso
   * el marcador de cada escalón del histograma es **la imagen del juego** y no un
   * numeral escrito por nosotros: escribirlo obligaría a inventar la tipografía y
   * a decidir con qué representar el sexto, que es justo lo que no hay que hacer
   * con el vocabulario del juego.
   *
   * Van las **chicas** (5-11 KB): se dibujan a 20 px arriba de una columna.
   * Indexadas 0..5, o sea `subranks[0]` es el subrango 1.
   *
   * Obscurus no las tiene —el juego no publica subrangos para el rango 0— y queda
   * con el array vacío. No se dibuja igual: la escalera arranca en Iniciado.
   */
  subranks: string[];
  /** El color con el que el juego lo pinta, para no elegir uno propio. */
  color: string;
}

export interface CatalogItem {
  name: Localized;
  /** La imagen de tienda, que es como el jugador reconoce el ítem. */
  img: string;
  /** Almas. Es por lo que se agrupa la tier list. */
  cost: number;
  /** 1-4. Redundante con `cost` en el juego de hoy, y por eso se guardan los dos:
   *  si Valve algún día cambia un precio, el tier sigue diciendo de qué escalón
   *  era. */
  tier: number;
  slot: "weapon" | "vitality" | "spirit";
  /**
   * Qué da el ítem, por clave de ícono. Vacío cuando no da ninguno de los cinco.
   * Son claves y no URLs: las URLs viven una sola vez en `catalog.icons`.
   */
  types?: string[];
  /**
   * Los ítems que se construyen a partir de éste, por id.
   *
   * Sale de invertir `component_items`: cada ítem declara de qué se construye, y
   * la tarjeta del juego muestra la relación al revés ("mejora a"). Verificado
   * contra una tarjeta real: Spirit Lifesteal mejora a Leech, Spiritual Overflow
   * e Infuser, que son exactamente los tres que dice el juego.
   */
  upgradesTo?: number[];
  /**
   * De qué ítems se construye éste, por id.
   *
   * Es `component_items` resuelto a ids. El juego lo muestra abajo de la tarjeta
   * como "MEJORA DE", y es la relación inversa de `upgradesTo`.
   */
  upgradesFrom?: number[];
}

/**
 * Un pedazo de texto de la descripción, ya parseado.
 *
 * **El texto del juego viene con HTML adentro y no se puede volcar en el DOM.**
 * Medido sobre los 156 ítems: 39 descripciones traen `<svg>`, `<img>` o `<path>`
 * incrustados, y 125 usan `<span class="highlight">` para marcar la frase que
 * importa. Volcarlo con `dangerouslySetInnerHTML` sería inyectar markup de un
 * tercero en nuestra página; tirarlo entero perdería el resaltado en el 80% de
 * los ítems.
 *
 * Así que se parsea acá, en el build: el resaltado sobrevive como una bandera y
 * **todo el resto de las etiquetas se descarta**. La UI recibe texto plano y lo
 * dibuja con elementos de React.
 */
export interface TextSpan {
  t: string;
  /** True cuando el juego marcó este pedazo como lo importante de la frase. */
  hi?: true;
  /** True cuando el juego lo marca como aclaración secundaria (`diminish`). */
  dim?: true;
  /** El atributo que nombra este pedazo, cuando el juego lo etiqueta como tal. */
  attr?: string;
  /** La clave del ícono de ese atributo, para resolver contra `catalog.icons`. */
  icon?: string;
}

/** Una stat con su etiqueta y su unidad, como la muestra el juego. */
export interface DetailStat {
  label: string;
  value: string;
  /** "%", "s", "m"… Ya viene del juego; no se inventa ninguna. */
  unit: string;
  /** Clave del ícono del juego, si lo tiene. Se resuelve con `catalog.icons`. */
  icon?: string;
  /** True cuando el juego la marca como la línea grande del bloque. */
  big?: true;
}

/**
 * Un bloque de la ficha: una frase y las stats que la acompañan.
 *
 * Las stats van en dos listas porque **el juego las dibuja distinto**, y eso se
 * copió de una tarjeta real (Frenzy): `stats` son las líneas corridas de arriba
 * y `boxed` son las condicionales, que van en cajas una al lado de la otra.
 * `cooldown` sale aparte porque el juego lo pone en una pastilla a la derecha
 * del encabezado de la sección, no entre las stats.
 */
export interface DetailBlock {
  text: TextSpan[];
  stats: DetailStat[];
  boxed: DetailStat[];
  cooldown?: DetailStat;
}

export interface DetailSection {
  /** "innate" | "active" | "passive", o vacío cuando el juego no lo dice. */
  kind: string;
  blocks: DetailBlock[];
}

export interface ItemDetail {
  /** True cuando el ítem tiene botón, según el propio juego. */
  active?: true;
  sections: DetailSection[];
}

export interface Catalog {
  generatedAt: string;
  langs: string[];
  heroes: Record<string, CatalogHero>;
  ranks: CatalogRank[];
  items: Record<string, CatalogItem>;
  /**
   * El arte de la tarjeta de la tienda, por categoría.
   *
   * **El efecto de la tarjeta del juego no es un degradado: son dos texturas**,
   * una para el encabezado y otra para el cuerpo, y el juego tiene un par por
   * categoría. Aproximarlo con CSS quedaba parecido y no igual. Verificado que
   * las seis responden 200 en el bucket que ya usamos para todo lo demás.
   *
   * La ruta se arma acá y no viene de la API —son assets de la interfaz de la
   * tienda, no de los ítems— pero la URL termina en el catálogo igual que las
   * otras: el día que convenga alojarlas, se cambia en un solo lugar.
   */
  cardArt: Record<string, { head: string; body: string }>;
  /** El símbolo de alma del juego, para escribir un precio como lo escribe él. */
  soulIcon: string;
  /**
   * Los íconos del juego, una vez cada uno, por clave.
   *
   * Internados a propósito: son 24 URLs de ~90 caracteres que aparecen en 958
   * stats. Repetirlas en cada una engordaría el archivo de fichas por nada.
   */
  icons: Record<string, string>;
}

async function fetchJson<T>(path: string, lang: string): Promise<T> {
  const res = await fetch(`${ASSETS}/${path}?language=${lang}`, { redirect: "follow" });
  if (!res.ok) throw new Error(`la API de assets contestó ${res.status} para ${path} (${lang})`);
  return (await res.json()) as T;
}

/**
 * Los héroes que se pueden jugar de verdad.
 *
 * La API lista 57 y sólo 38 aparecen en las partidas: el resto está en
 * desarrollo, deshabilitado o es de pruebas. Filtrarlos acá evita una tier list
 * con veinte filas en cero, y se hace por las banderas que trae el propio juego
 * en vez de por una lista escrita a mano que habría que mantener con cada héroe
 * nuevo.
 */
export const isPlayable = (h: RawHero): boolean =>
  h.player_selectable === true && h.disabled !== true && h.in_development !== true;

/** El coste de los ítems que sólo existen en Street Brawl. */
const BRAWL_COST = 9999;

/**
 * Los ítems que se compran de verdad en la tienda.
 *
 * **El filtro se validó igual que el de héroes: contra los datos.** La API lista
 * 726 ítems, de los cuales 251 son mejoras con precio; `shopable === true` deja
 * **23 / 43 / 46 / 44** para 800 / 1600 / 3200 / 6400, que son **exactamente los
 * 156 que aparecen comprados en el snapshot**. Dos fuentes independientes que
 * coinciden, igual que pasó con los 38 héroes jugables.
 *
 * Los de coste 9999 se caen acá **y** en el filtro de modo del pipeline
 * (`PLAYED_GAME_MODE`), porque sólo existen en Street Brawl. Sacarlos en un solo
 * lado dejaría una fila esperando datos que nunca llegan, o números de otro juego
 * en una lista que dice medir éste.
 */
export const isShopItem = (i: RawItem): boolean =>
  i.type === "upgrade" &&
  i.shopable === true &&
  typeof i.cost === "number" &&
  i.cost !== BRAWL_COST &&
  typeof i.item_tier === "number" &&
  i.item_slot_type !== undefined &&
  // Sin imagen la fila se dibujaría rota; mejor que el ítem no esté, igual que
  // un héroe sin retrato.
  Boolean(i.shop_image_webp ?? i.shop_image);

/**
 * Saca toda etiqueta HTML y normaliza los espacios.
 *
 * `script` y `style` se borran **con su contenido adentro**, no sólo sus
 * etiquetas. Sacar la etiqueta y dejar el cuerpo convertiría el código en texto
 * visible en la ficha: no es peligroso —React lo dibuja como texto, nunca como
 * markup— pero sería basura en pantalla. Lo agarró un test.
 */
const sinEtiquetas = (s: string): string => aplanar(s).trim();

/**
 * Igual, pero **sin recortar los extremos**.
 *
 * El espacio de los bordes es la única pista de si el resaltado estaba pegado a
 * lo de al lado. Recortando cada pedazo y volviendo a unirlos con un espacio
 * fijo, la UI dibujaba "inmune a las balas ." — el punto separado de la frase.
 */
const aplanar = (s: string): string =>
  s
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");

/**
 * De la frase del juego a pedazos de texto plano, conservando qué está resaltado.
 *
 * El resaltado se saca primero, con su contenido ya limpio, y recién después se
 * descarta todo el resto del markup. Hacerlo al revés perdería los límites del
 * resaltado; hacer sólo lo segundo perdería el énfasis en 125 de 156 ítems.
 */
export function parseLoc(raw: string | undefined, icons?: Map<string, string>): TextSpan[] {
  if (!raw) return [];
  const spans: TextSpan[] = [];
  const push = (t: string, extra: Partial<TextSpan> = {}) => {
    if (t) spans.push({ t, ...extra });
  };

  /**
   * Las tres marcas que el juego usa adentro de una frase:
   *
   * - `highlight`  — la frase que define al ítem, en blanco fuerte.
   * - `diminish`   — la aclaración secundaria, apagada ("No puedes usar
   *                  habilidades mientras invocas la alfombra").
   * - `inline-attribute-label Xxx` — nombra un atributo, y el juego le pone su
   *                  color y su ícono. El `<svg>` que viene antes se descarta:
   *                  el ícono vuelve del catálogo por su clave.
   */
  const re = /<span[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/span>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    push(aplanar(raw.slice(last, m.index)));

    const clases = m[1].split(/\s+/);
    const texto = aplanar(m[2]).trim();
    const attr = clases.find((c) => c in ATRIBUTOS);
    if (clases.includes("highlight")) push(texto, { hi: true });
    else if (clases.includes("diminish")) push(texto, { dim: true });
    else if (attr) {
      const key = `attr_${attr}`;
      if (icons && !icons.has(key)) icons.set(key, `${PROP_ICON}/${ATRIBUTOS[attr]}`);
      push(texto, { attr, icon: key });
    } else push(texto);
    last = m.index + m[0].length;
  }
  push(aplanar(raw.slice(last)));

  // Los bordes de la frase entera sí se recortan: el espacio del medio es
  // información, el de las puntas es basura del original.
  if (spans.length > 0) {
    spans[0] = { ...spans[0], t: spans[0].t.replace(/^\s+/, "") };
    const z = spans.length - 1;
    spans[z] = { ...spans[z], t: spans[z].t.replace(/\s+$/, "") };
  }
  return spans.filter((s) => s.t !== "");
}

/**
 * El valor y su unidad, sin repetirla.
 *
 * El juego manda la unidad por separado (`postfix`), pero en **124 de las 958
 * stats el valor ya la trae adentro**: "8m" con postfix "m" se dibujaría "8m m".
 * Pegarlas a ciegas era el bug; se detecta y se deja una sola.
 *
 * El postfix además viene con un espacio adelante a veces (" %"), así que se
 * normaliza acá y la UI decide cómo separarlo.
 */
export function unidad(value: string, postfix: string | undefined): { value: string; unit: string } {
  const v = value.trim();
  const u = (postfix ?? "").trim();
  if (!u) return { value: v, unit: "" };
  if (v.toLowerCase().endsWith(u.toLowerCase())) return { value: v, unit: "" };

  /**
   * La cola del valor puede ser el **principio** de la unidad, no toda.
   *
   * "4m" con postfix "m/s" no termina en "m/s", así que la comprobación de arriba
   * lo dejaba pasar y salía **"4mm/s"**. Se saca la cola de letras del valor
   * cuando la unidad arranca con ella, que deja "4" + "m/s".
   */
  const cola = v.match(/[a-z]+$/i)?.[0];
  if (cola && u.toLowerCase().startsWith(cola.toLowerCase())) {
    return { value: v.slice(0, -cola.length), unit: u };
  }
  return { value: v, unit: u };
}

/**
 * La ficha de un ítem: qué hace y qué stats da.
 *
 * **El agrupamiento no se inventa: es el del propio juego.** `tooltip_sections`
 * dice qué frase va con qué stats y bajo qué encabezado (innata, activa, pasiva),
 * que es exactamente como el jugador lo ve en la tienda. Elegir nosotros qué
 * mostrar sería enseñarle una lectura del ítem distinta a la que tiene adentro
 * del juego — el mismo motivo por el que los nombres se bajan en vez de
 * escribirse.
 */
export function buildDetail(item: RawItem, icons?: Map<string, string>): ItemDetail {
  const props = item.properties ?? {};
  const sections: DetailSection[] = [];

  for (const sec of item.tooltip_sections ?? []) {
    const blocks: DetailBlock[] = [];
    for (const attr of sec.section_attributes ?? []) {
      const stats: DetailStat[] = [];
      const destacadas = destacadasDe(attr);
      const enCaja = new Set([
        ...(attr.important_properties ?? []),
        ...(attr.important_properties_with_icon ?? []),
      ]);
      const boxed: DetailStat[] = [];
      let cooldown: DetailStat | undefined;

      for (const key of clavesDe(attr)) {
        const p = props[key];
        if (!p || p.value === undefined || p.value === null) continue;
        // Un valor vacío deja la unidad sola en pantalla: Intensifying Magazine
        // manda "Weapon Damage" sin número y se dibujaba un "%" suelto.
        if (String(p.value).trim() === "") continue;
        const label = sinEtiquetas(p.label ?? "");
        // Sin etiqueta la stat sería un número suelto sin decir de qué.
        if (!label) continue;
        const icon = p.css_class && p.icon ? p.css_class : undefined;
        if (icon && icons && !icons.has(icon)) icons.set(icon, p.icon!);
        const stat: DetailStat = {
          label,
          ...unidad(String(p.value), p.postfix),
          ...(icon ? { icon } : {}),
          ...(destacadas.has(key) ? { big: true as const } : {}),
        };
        /**
         * El tiempo de recarga va en una pastilla a la derecha del encabezado,
         * **pero sólo en una sección activa o pasiva**.
         *
         * En la innata una stat de clase `cooldown` es otra cosa: una
         * bonificación permanente. Spellslinger da "−5% de tiempo de recarga de
         * habilidades" ahí, y se dibujaba como la pastilla de una habilidad que
         * el ítem no tiene — con el encabezado vacío al lado. Lo agarró ZoTaD
         * abriendo el ítem.
         */
        if (p.css_class === "cooldown" && sec.section_type !== "innate") cooldown = stat;
        else if (enCaja.has(key)) boxed.push(stat);
        else stats.push(stat);
      }

      const text = parseLoc(attr.loc_string, icons);
      if (text.length === 0 && stats.length === 0 && boxed.length === 0 && !cooldown) continue;
      blocks.push({ text, stats, boxed, ...(cooldown ? { cooldown } : {}) });
    }
    if (blocks.length > 0) sections.push({ kind: sec.section_type ?? "", blocks });
  }

  return { ...(item.is_active_item ? { active: true as const } : {}), sections };
}

/**
 * Qué da el ítem, en el orden en que se anuncia.
 *
 * El orden es el de `TIPOS_EN_FILA` y no el de aparición: dos ítems que dan lo
 * mismo tienen que mostrar sus íconos igual, o el ojo cree que son distintos.
 * Registra de paso la URL de cada ícono en el diccionario compartido.
 */
export function tiposDe(item: RawItem, icons: Map<string, string>): string[] {
  /**
   * **Que la propiedad exista no significa que el ítem la dé.** Metal Skin
   * declara `tech_damage` con etiqueta "Spirit Power" y **valor 0**, así que la
   * fila lo anunciaba como daño de espíritu siendo un ítem de inmunidad a balas.
   * Lo agarró ZoTaD mirando la página.
   *
   * El filtro son las dos cosas que el propio juego usa: que el valor sea
   * distinto de cero, y que la propiedad esté **entre las que el juego muestra**
   * para ese ítem (`tooltip_sections`). Medido, eso baja de 205 íconos a 119 y
   * corrige 77 de los 156 ítems.
   */
  const mostradas = new Set(
    (item.tooltip_sections ?? []).flatMap((s) => (s.section_attributes ?? []).flatMap(clavesDe))
  );

  const presentes = new Set<string>();
  for (const [key, p] of Object.entries(item.properties ?? {})) {
    if (!p.css_class || !p.icon) continue;
    if (!(TIPOS_EN_FILA as readonly string[]).includes(p.css_class)) continue;
    if (!mostradas.has(key) || esCero(p.value)) continue;
    presentes.add(p.css_class);
    // La clave de tipo apunta a la etiqueta de build, no al ícono de la stat: son
    // dos sets distintos y cada uno sirve en un lugar distinto de la tarjeta.
    const tag = `tag_${p.css_class}`;
    if (!icons.has(tag)) icons.set(tag, ICONO_DE_TIPO[p.css_class]);
  }
  return TIPOS_EN_FILA.filter((t) => presentes.has(t));
}

/**
 * Todas las claves de stat de un bloque, en el orden en que el juego las lee.
 *
 * Primero las normales y después las destacadas, que es el orden de la tarjeta
 * del juego: Spirit Lifesteal muestra "Bonus Health, Spirit Power" y recién
 * entonces "Spirit Lifesteal", que es la destacada.
 */
const clavesDe = (a: NonNullable<RawSection["section_attributes"]>[number]): string[] => [
  ...new Set([
    ...(a.properties ?? []),
    ...(a.elevated_properties ?? []),
    ...(a.important_properties ?? []),
    ...(a.important_properties_with_icon ?? []),
  ]),
];

/** Las que el juego marca como la línea grande del bloque. */
const destacadasDe = (a: NonNullable<RawSection["section_attributes"]>[number]): Set<string> =>
  new Set([...(a.elevated_properties ?? []), ...(a.important_properties_with_icon ?? [])]);

/** Un valor que no aporta nada: ausente, vacío o cero. */
const esCero = (v: string | number | undefined): boolean =>
  v === undefined || v === null || String(v).trim() === "" || parseFloat(String(v)) === 0;

/**
 * Cruza las dos descargas en un catálogo.
 *
 * Separado del `main` para que se pueda probar sin red — es donde vive la única
 * decisión con filo, que es qué hacer cuando falta la traducción.
 */
export function buildCatalog(
  heroesEn: RawHero[],
  heroesEs: RawHero[],
  ranksEn: RawRank[],
  ranksEs: RawRank[],
  itemsEn: RawItem[],
  itemsEs: RawItem[],
  generatedAt: string
): Catalog {
  const esHero = new Map(heroesEs.map((h) => [h.id, h.name]));
  const esRank = new Map(ranksEs.map((r) => [r.tier, r.name]));
  const esItem = new Map(itemsEs.map((i) => [i.id, i.name]));

  const heroes: Record<string, CatalogHero> = {};
  for (const h of heroesEn.filter(isPlayable)) {
    const img = h.images?.icon_image_small_webp ?? h.images?.icon_image_small;
    const card = h.images?.icon_hero_card_webp ?? h.images?.icon_hero_card ?? img;
    // Un héroe sin retrato dibujaría una fila rota; mejor que no esté.
    if (!img) continue;
    heroes[String(h.id)] = {
      // Sin traducción cae al inglés en vez de dejar el nombre vacío: la mitad
      // de los héroes se llaman igual en los dos idiomas de todos modos.
      name: { en: h.name, es: esHero.get(h.id) ?? h.name },
      img,
      card: card ?? img,
      color: h.colors?.style_hex ?? "",
    };
  }

  const ranks: CatalogRank[] = ranksEn
    .filter((r) => r.tier >= 0 && r.tier < RANKS.length)
    .sort((a, b) => a.tier - b.tier)
    .map((r) => ({
      tier: r.tier,
      name: { en: r.name, es: esRank.get(r.tier) ?? r.name },
      /**
       * La insignia grande, **que es por rango y no por subrango**.
       *
       * Antes se tomaba `small_subrank1` porque el juego sólo publicaba badges
       * por subrango y elegir uno era arbitrario. Con el parche del 2026-07-30
       * apareció `large`/`large_webp`, que es la insignia del rango a secas: ya
       * no hay que elegir un subrango que la página no usa para nada.
       *
       * Pesa 14-85 KB contra 5-11 de la chica, y se paga porque **la insignia ES
       * el encabezado de tier** —no lleva el nombre de la banda al lado— así que
       * chica no se reconocía. Son 4 imágenes por pantalla, no 12: se referencian
       * del bucket, no se re-alojan.
       *
       * De paso arregla a Obscurus, que no tenía versión chica y por eso nunca se
       * dibujaba.
       */
      img:
        r.images?.large_webp ??
        r.images?.large ??
        r.images?.small_subrank1_webp ??
        r.images?.small_subrank1 ??
        "",
      // Las seis del rango, en orden. Si falta alguna queda "" y la columna
      // simplemente no dibuja su marca, en vez de romper la fila entera.
      subranks: [1, 2, 3, 4, 5, 6].map(
        (s) =>
          (r.images as Record<string, string | undefined> | undefined)?.[`small_subrank${s}_webp`] ??
          (r.images as Record<string, string | undefined> | undefined)?.[`small_subrank${s}`] ??
          ""
      ),
      color: r.color ?? "",
    }));

  const tienda = itemsEn.filter(isShopItem);
  const porClase = new Map(tienda.filter((i) => i.class_name).map((i) => [i.class_name!, i.id]));
  // El índice inverso de `component_items`: de qué ítem sale cada mejora.
  const mejorasDe = new Map<string, number[]>();
  for (const i of tienda) {
    for (const comp of i.component_items ?? []) {
      mejorasDe.set(comp, [...(mejorasDe.get(comp) ?? []), i.id]);
    }
  }

  const items: Record<string, CatalogItem> = {};
  const icons = new Map<string, string>();
  for (const i of tienda) {
    const types = tiposDe(i, icons);
    items[String(i.id)] = {
      name: { en: i.name, es: esItem.get(i.id) ?? i.name },
      img: i.shop_image_webp ?? i.shop_image!,
      cost: i.cost!,
      tier: i.item_tier!,
      slot: i.item_slot_type!,
      ...(types.length > 0 ? { types } : {}),
      ...(i.class_name && mejorasDe.has(i.class_name)
        ? { upgradesTo: mejorasDe.get(i.class_name) }
        : {}),
      ...(() => {
        const desde = (i.component_items ?? []).flatMap((c) =>
          porClase.has(c) ? [porClase.get(c)!] : []
        );
        return desde.length > 0 ? { upgradesFrom: desde } : {};
      })(),
    };
  }

  return {
    generatedAt,
    langs: Object.keys(LANGS),
    heroes,
    ranks,
    items,
    soulIcon: SOUL_ICON,
    cardArt: Object.fromEntries(
      (["weapon", "vitality", "spirit"] as const).map((slot) => [
        slot,
        { head: `${SHOP_ART}/catalog_tooltip_header_${slot}.webp`, body: `${SHOP_ART}/catalog_tooltip_bg_${slot}.webp` },
      ])
    ),
    icons: Object.fromEntries(icons),
  };
}

async function main() {
  console.log(`bajando el catálogo de Deadlock (${Object.values(LANGS).join(", ")})...`);
  const [heroesEn, heroesEs, ranksEn, ranksEs, itemsEn, itemsEs] = await Promise.all([
    fetchJson<RawHero[]>("heroes", LANGS.en),
    fetchJson<RawHero[]>("heroes", LANGS.es),
    fetchJson<RawRank[]>("ranks", LANGS.en),
    fetchJson<RawRank[]>("ranks", LANGS.es),
    fetchJson<RawItem[]>("items", LANGS.en),
    fetchJson<RawItem[]>("items", LANGS.es),
  ]);

  const catalog = buildCatalog(
    heroesEn, heroesEs, ranksEn, ranksEs, itemsEn, itemsEs, new Date().toISOString()
  );
  const traducidos = Object.values(catalog.heroes).filter((h) => h.name.es !== h.name.en).length;
  const itemsTraducidos = Object.values(catalog.items).filter((i) => i.name.es !== i.name.en).length;
  const porPrecio = Object.values(catalog.items).reduce<Record<number, number>>(
    (a, i) => ({ ...a, [i.cost]: (a[i.cost] ?? 0) + 1 }), {}
  );

  // Las fichas, por idioma, sólo de los ítems que el catálogo dejó adentro.
  const esItems = new Map(itemsEs.map((i) => [i.id, i]));
  // El mismo diccionario que ya trae el catálogo: las fichas suman los íconos que
  // la fila no anuncia (recarga, alcance, duración) y todos quedan en un lugar.
  const icons = new Map(Object.entries(catalog.icons));
  const detail: Record<string, { en: ItemDetail; es: ItemDetail }> = {};
  for (const i of itemsEn.filter(isShopItem)) {
    detail[String(i.id)] = {
      en: buildDetail(i, icons),
      es: buildDetail(esItems.get(i.id) ?? i, icons),
    };
  }
  catalog.icons = Object.fromEntries(icons);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify(catalog));
  writeFileSync(OUT_DETAIL, JSON.stringify(detail));
  console.log(
    `  ${Object.keys(catalog.heroes).length} héroes jugables de ${heroesEn.length} listados ` +
      `(${traducidos} con nombre propio en español), ${catalog.ranks.length} rangos → ${OUT}`
  );
  console.log(
    `  ${Object.keys(catalog.icons).length} íconos del juego, y ` +
      `${Object.values(catalog.items).filter((i) => i.types?.length).length} ítems anuncian su tipo`
  );
  console.log(
    `  ${Object.keys(catalog.items).length} ítems de tienda de ${itemsEn.length} listados ` +
      `(${itemsTraducidos} con nombre propio en español) — ` +
      Object.entries(porPrecio).map(([c, n]) => `${c}: ${n}`).join(", ")
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
