/**
 * "Qué hacer" con cada moodle de Project Zomboid (2026-09-30). **TEXTO NUESTRO**, no del juego ni copiado de ningún
 * lado (PZwiki es CC BY-NC-SA y no se usa): consejos cortos y prácticos, de una a tres frases, en inglés y en español
 * con voseo.
 *
 * Se escribieron mirando la Build 42.21: qué sube y qué baja cada moodle se leyó en el código del juego (por ejemplo,
 * que un pañuelo o papel higiénico en cualquiera de las dos manos ahoga los estornudos (TriggerSneezeCough mira la
 * principal y, si ahí no hay pañuelo ni papel, la secundaria), que "Gases mortales" es un generador prendido
 * dentro de un edificio, que borracho los analgésicos, los tranquilizantes y los antidepresivos rinden la mitad o menos,
 * que Insensible no entra nunca en pánico pero sólo se salva de la incomodidad de la ropa (dormir en el piso, mojarse
 * o arrastrar un cadáver le molestan igual), que el vidrio sale también a mano pero la bala sólo con pinzas, o que el
 * alcohol no baja el estrés). Donde no hay certeza, el consejo queda general y sin números. En español, el texto de
 * cada enlace a un objeto es el nombre que le da el juego (ES_MX), así se reconoce en el inventario.
 *
 * Los enlaces van como `[texto](destino)`: `destino` es el id de la ficha de un objeto (`bandage`), o `traits:<id>` y
 * `moodles:<id>` para un rasgo u otro moodle. El test comprueba que cada destino exista y que los dos idiomas enlacen lo
 * mismo.
 */
import type { PzTab } from "../../route";

export const ADVICE: Record<string, { en: string; es: string }> = {
  angry: {
    en: "It wears off on its own as time goes by; you don't need to take anything for it.",
    es: "Se te pasa solo con el tiempo; no hace falta tomar nada.",
  },
  bleeding: {
    en: "Open the Health panel and bandage every bleeding part right away: a [bandage](bandage), or a [rag](rag) if that's all you have. A deep wound also needs stitches, with a [suture needle](suture-needle) or a [needle](needle) and [thread](thread), but glass or a bullet has to come out first: a bullet with [tweezers](tweezers), glass with them or by hand. Clean it with [disinfectant](bottle-of-disinfectant) or use a [sterilized bandage](bandage-sterilized) so it doesn't get infected.",
    es: "Abrí el panel de salud y vendá ya cada parte que sangra: con una [venda](bandage), o con un [trapo](rag) si no tenés otra cosa. Una herida profunda además hay que coserla, con una [aguja de sutura](suture-needle) o con [aguja](needle) e [hilo](thread), pero si tiene vidrio o una bala, primero hay que sacarlos: la bala con [pincitas](tweezers), el vidrio con ellas o a mano. Limpiala con [desinfectante](bottle-of-disinfectant) o usá un [vendaje esterilizado](bandage-sterilized) para que no se infecte.",
  },
  bored: {
    en: "Read something: a [book](book) does the most, and a [comic book](comic-book) or a [magazine](magazine) help too. TV, the radio and music CDs also take the edge off.",
    es: "Leé algo: un [libro](book) es lo que más ayuda, y un [cómic](comic-book) o una [revista](magazine) también. La tele, la radio y los CD de música también te lo bajan.",
  },
  "restricted-movement": {
    en: "Something you're wearing or carrying is too bulky to sprint with. Take off the heaviest clothes, swap a big bag for a smaller one or put down what's in your hands.",
    es: "Algo que tenés puesto o que llevás es demasiado voluminoso para correr. Sacate la ropa más pesada, cambiá la mochila grande por una más chica o soltá lo que tenés en las manos.",
  },
  dead: {
    en: "There's nothing more to do for this character. If you keep playing in the same world, what they carried is still on the body, so your next survivor can go back for it.",
    es: "Con este personaje ya no hay nada que hacer. Si seguís en la misma partida, lo que llevaba sigue en el cuerpo, y tu próximo sobreviviente puede ir a buscarlo.",
  },
  drunk: {
    en: "It wears off with time: wait it out somewhere safe and don't go looking for a fight meanwhile. While you're drunk, [painkillers](painkillers), [beta blockers](beta-blockers) and [antidepressants](antidepressants) work much worse.",
    es: "Se pasa con el tiempo: esperá en un lugar seguro y no salgas a buscar pelea mientras tanto. Mientras estés borracho, los [analgésicos](painkillers), los [tranquilizantes](beta-blockers) y los [antidepresivos](antidepressants) hacen mucho menos efecto.",
  },
  endurance: {
    en: "Stop running and swinging and catch your breath; sitting down, on a chair or a sofa if there's one, gets it back faster. Training Fitness makes it last longer.",
    es: "Dejá de correr y de pegar y recuperá el aliento; sentado, mejor en una silla o un sillón, se recupera más rápido. Entrenar Estado físico hace que te dure más.",
  },
  "food-eaten": {
    en: 'This one\'s good: you ate well and your body is making the most of it. Stop at "Full to Bursting": overeating day after day makes you put on weight.',
    es: "Es de los buenos: comiste bien y el cuerpo lo aprovecha. Cuando llegás a «A reventar», pará: comer de más todos los días te hace subir de peso.",
  },
  "has-a-cold": {
    en: "Rest, stay warm and dry, and it goes away on its own. Hold a [tissue](tissue) or [toilet paper](toilet-paper) in either hand: it muffles the sneezes and coughs that would otherwise draw zombies.",
    es: "Descansá, abrigate, no te mojes y se te pasa solo. Llevá un [pañuelo](tissue) o [papel higiénico](toilet-paper) en cualquiera de las dos manos: ahoga los estornudos y la tos, que si no atraen zombis.",
  },
  "heavy-load": {
    en: "Drop what you don't need, or carry it in a bag you're wearing instead of loose: worn bags make what's inside weigh less. Strength raises how much you can carry.",
    es: "Soltá lo que no te hace falta, o llevalo en una mochila puesta en vez de suelto: las mochilas puestas hacen que lo de adentro pese menos. La Fuerza sube cuánto podés cargar.",
  },
  hungry: {
    en: "Eat something, starting with whatever spoils first and leaving the canned food for later. Once you're starving, it slowly eats away at your health.",
    es: "Comé algo, primero lo que se echa a perder y después las latas. Si llegás a morirte de hambre, empieza a comerte la salud de a poco.",
  },
  hyperthermia: {
    en: "Take off layers, stop running and get into the shade or indoors. You sweat and get thirsty faster, so keep a [water bottle](water-bottle) handy.",
    es: "Sacate ropa, dejá de correr y metete a la sombra o bajo techo. Transpirás y te da sed más rápido: tené a mano una [botella de agua](water-bottle).",
  },
  hypothermia: {
    en: "Put on warm layers (a [sweater](sweater), a jacket, a hat), then get indoors or next to a fire. [Wet](moodles:wet) clothes steal your heat, so dry off or change first.",
    es: "Ponete ropa de abrigo (un [suéter](sweater), una campera, un gorro) y metete bajo techo o al lado del fuego. La ropa [mojada](moodles:wet) te roba el calor: secate o cambiate primero.",
  },
  injured: {
    en: "It shows how hurt you are overall, from wounds or from illness. Treat every wound in the Health panel (bandage, disinfect, a [splint](splint) on a broken bone), then eat, sleep and rest: health comes back little by little.",
    es: "Muestra cuánto daño tenés en total, por heridas o por enfermedad. Tratá cada herida en el panel de salud (vendar, desinfectar, una [férula](splint) si hay un hueso roto) y después comé, dormí y descansá: la salud vuelve de a poco.",
  },
  "noxious-smell": {
    en: 'Levels 1 to 3 mean rotting corpses nearby: move away, and burn or bury bodies far from where you live. A [bandana](bandana), a [surgical mask](surgical-mask) or a [gas mask](gas-mask) over your face cuts how sick they make you. "Deadly Fumes" is a generator running inside the building: get out, and run generators outdoors.',
    es: "Los niveles 1 a 3 son cadáveres pudriéndose cerca: alejate, y quemá o enterrá los cuerpos lejos de donde vivís. Una [bandana](bandana), una [mascarilla quirúrgica](surgical-mask) o una [máscara antigás](gas-mask) en la cara hacen que te enfermen menos. «Gases mortales» es un generador prendido dentro del edificio: salí, y prendé los generadores afuera.",
  },
  pain: {
    en: "Take [painkillers](painkillers) and treat whatever hurts: the pain eases as the wound heals. Pain makes it hard to sleep, and [sleeping pills](sleeping-pills) help with that.",
    es: "Tomá [analgésicos](painkillers) y tratá lo que te duele: el dolor baja a medida que se cura la herida. Con dolor cuesta dormir, y para eso ayudan las [pastillas para dormir](sleeping-pills).",
  },
  panic: {
    en: "Get away from the zombies and out of their sight: panic drops once you're safe. [Beta blockers](beta-blockers) calm it down, [Brave](traits:brave) characters panic less, and [Desensitized](traits:desensitized) ones never do.",
    es: "Alejate de los zombis y salí de su vista: el pánico baja cuando estás a salvo. Los [tranquilizantes](beta-blockers) lo calman, los personajes [Valientes](traits:brave) entran menos en pánico, y los [Insensibles](traits:desensitized), nunca.",
  },
  sick: {
    en: "It's usually food poisoning (rotten or raw food, tainted water) or [rotting corpses](moodles:noxious-smell) nearby: get away from the cause, rest, eat and drink clean, and it passes. If it started after a zombie bite, scratch or laceration, it may be the infection, and that has no cure in vanilla.",
    es: "Casi siempre es una intoxicación (comida podrida o cruda, agua contaminada) o [cadáveres pudriéndose](moodles:noxious-smell) cerca: alejate de la causa, descansá, comé y tomá cosas limpias, y se pasa. Si empezó después de una mordida, un rasguño o una laceración de un zombi, puede ser la infección, y esa no tiene cura en el juego sin mods.",
  },
  stress: {
    en: "It comes down with time once you're out of danger. Reading lowers it (a [book](book) the most); if you're a [Smoker](traits:smoker), a [cigarette](cigarette) calms it and going without one pushes it up.",
    es: "Baja con el tiempo cuando ya no estás en peligro. Leer lo baja (un [libro](book) más que nada); si sos [Fumador](traits:smoker), un [cigarrillo](cigarette) te calma y pasar sin fumar te lo sube.",
  },
  thirst: {
    en: "Drink. Tap water is safe while it still runs; water from rivers, lakes and ponds is tainted, so boil it or use [water purification tablets](water-purification-tablets) first or it'll make you sick.",
    es: "Tomá agua. La de la canilla es segura mientras siga saliendo; la de ríos, lagos y lagunas está contaminada: hervila o echale [pastillas para purificar el agua](water-purification-tablets) antes, o te va a enfermar.",
  },
  tired: {
    en: "Sleep, in a bed if you can: it's the only real fix. [Coffee](coffee) or [caffeine pills](caffeine-pills) buy you a little time, and [sleeping pills](sleeping-pills) help when you can't fall asleep.",
    es: "Dormí, en una cama si podés: es lo único que lo arregla de verdad. El [café](coffee) o las [pastillas de cafeína](caffeine-pills) te estiran un rato, y las [pastillas para dormir](sleeping-pills) ayudan cuando no te podés dormir.",
  },
  uncomfortable: {
    en: "Take off gear that's uncomfortable to wear (a lot of armor and protective clothing is) when you don't need it, get dry, and warm up or cool down. Sleeping on the floor or dragging a corpse also adds to it, and if it lasts it stresses you out. [Desensitized](traits:desensitized) characters don't mind uncomfortable clothing, but everything else still gets to them.",
    es: "Sacate lo que es incómodo de llevar (mucha armadura y ropa de protección lo es) cuando no lo necesitás, secate y abrigate o refrescate. Dormir en el piso o arrastrar un cadáver también suma, y si dura te estresa. A los personajes [Insensibles](traits:desensitized) no les molesta la ropa incómoda, pero lo demás sí.",
  },
  unhappy: {
    en: "Read something: a [book](book) or a [comic book](comic-book) cheers you up, and so do TV and the radio. [Antidepressants](antidepressants) work slowly, over several days, and stale food makes it worse.",
    es: "Leé algo: un [libro](book) o un [cómic](comic-book) te levantan el ánimo, y la tele y la radio también. Los [antidepresivos](antidepressants) hacen efecto de a poco, a lo largo de varios días, y la comida pasada lo empeora.",
  },
  wet: {
    en: "Get out of the rain and dry off with a [bath towel](bath-towel) or a [dish towel](dish-towel). An [umbrella](umbrella) or a [poncho](poncho) keeps you dry next time, and staying soaked can give you a [cold](moodles:has-a-cold).",
    es: "Salí de la lluvia y secate con una [toalla](bath-towel) o una [micro fibra de cocina](dish-towel). Un [paraguas](umbrella) o un [poncho](poncho) te mantienen seco la próxima vez, y seguir empapado te puede [resfriar](moodles:has-a-cold).",
  },
  windchill: {
    en: "Get out of the wind: indoors or into a car. If you have to stay outside, wear clothes that block the wind, like jackets and coats, so the cold doesn't get to you.",
    es: "Salí del viento: metete bajo techo o en un auto. Si tenés que quedarte afuera, ponete ropa que corte el viento, como camperas y abrigos, para que el frío no te llegue.",
  },
  zombie: {
    en: "It only shows when your character dies infected: the body will get back up as a zombie. There's no cure in vanilla ([antibiotics](antibiotics) don't stop it either), so your next character will have to take the gear off that zombie.",
    es: "Sólo aparece cuando tu personaje muere infectado: el cuerpo se va a levantar como zombi. La infección no tiene cura en el juego sin mods (los [antibióticos](antibiotics) tampoco la frenan), así que tu próximo personaje va a tener que sacarle las cosas a ese zombi.",
  },
};

/**
 * Los slugs en español de los objetos que enlazan los consejos (id → slug), los mismos que arma el build
 * (`buildEsSlugs`; el test lo comprueba). Van escritos acá y no con `virtual:pz-slugs-es/items` porque ese módulo trae
 * los de las 3.826 fichas de objetos (47 KB con gzip) para 30 enlaces. Se anotan al cargar la pestaña con
 * `registerPzSlugs`, que suma y no pisa: si la pestaña Objetos ya anotó los suyos, siguen todos.
 */
export const ADVICE_ITEM_SLUGS_ES: Record<string, string> = {
  antibiotics: "antibioticos",
  antidepressants: "anti-depresivos",
  bandage: "venda",
  "bandage-sterilized": "vendaje-esterilizado",
  "bath-towel": "toalla-de-bano",
  "beta-blockers": "tranquilizantes",
  book: "libro",
  "bottle-of-disinfectant": "botella-de-desinfectante",
  "caffeine-pills": "pastillas-de-cafeina",
  cigarette: "cigarrillo-cigarette",
  coffee: "cafe",
  "comic-book": "comic",
  "dish-towel": "micro-fibra-de-cocina",
  "gas-mask": "mascara-antigas",
  magazine: "revista",
  needle: "aguja",
  painkillers: "analgesicos",
  rag: "trapo",
  "sleeping-pills": "pastillas-para-dormir",
  splint: "ferula",
  "surgical-mask": "mascarilla-quirurgica",
  "suture-needle": "aguja-de-sutura",
  sweater: "sueter",
  thread: "hilo-thread",
  tissue: "panuelo",
  "toilet-paper": "papel-higienico",
  tweezers: "pincitas",
  umbrella: "paraguas",
  "water-bottle": "botella-de-agua",
  "water-purification-tablets": "pastillas-para-purificar-el-agua",
};

/** Un pedazo del consejo: texto suelto, o un enlace a una ficha. */
export type AdvicePart = string | { text: string; sec: PzTab; id: string };

const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

/** `traits:brave` → rasgo; `moodles:wet` → moodle; sin prefijo, un objeto. */
function target(dest: string): { sec: PzTab; id: string } {
  const [sec, id] = dest.includes(":") ? (dest.split(":", 2) as [PzTab, string]) : (["items", dest] as [PzTab, string]);
  return { sec, id };
}

/** El consejo partido en texto y enlaces, para dibujarlo. */
export function adviceParts(text: string): AdvicePart[] {
  const parts: AdvicePart[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    parts.push({ text: m[1], ...target(m[2]) });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Los enlaces de un consejo, en orden. */
export const adviceLinks = (text: string): { sec: PzTab; id: string }[] =>
  adviceParts(text).flatMap((p) => (typeof p === "string" ? [] : [{ sec: p.sec, id: p.id }]));
