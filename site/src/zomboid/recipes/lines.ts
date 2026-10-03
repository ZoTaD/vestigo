/**
 * Las entradas de una receta como se leen en la ficha (2026-09-30): cada líquido pegado a su recipiente, y separadas en
 * ingredientes (se gastan) y herramientas (vuelven al inventario).
 *
 * En la receta del juego un líquido no es una entrada suelta: es una sublínea (`-fluid 0.3 [Water]`) de la línea de
 * arriba, el recipiente que lo tiene. site.py las deja como dos entradas seguidas; acá se vuelven a juntar, porque por
 * separado se leían mal: "1 × cualquier objeto" y "0,25 L de agua" como si fueran dos cosas, o el agua en Ingredientes
 * y el bol que la tiene en Herramientas. Va a la hoja de su recipiente: un bol que se queda con agua que se gasta es
 * una herramienta, con la nota de que el líquido se gasta.
 */
import { slugify } from "../../route";
import type { RecipeInput, Ref } from "./data";

export interface InputLine {
  input: RecipeInput;
  /** El líquido que va adentro de `input`, si lleva. */
  fluid?: RecipeInput;
}

export function inputLines(inputs: RecipeInput[]): { ingredients: InputLine[]; tools: InputLine[] } {
  const lines: InputLine[] = [];
  for (const input of inputs) {
    const prev = lines[lines.length - 1];
    // Un líquido sin línea arriba (o con otro líquido ya pegado) no pasa en la 42.21: si pasara, va solo.
    if (input.fluid && prev && !prev.input.fluid && !prev.fluid) prev.fluid = input;
    else lines.push({ input });
  }
  return { ingredients: lines.filter((l) => !l.input.keep), tools: lines.filter((l) => l.input.keep) };
}

/**
 * Las recetas que no dan nada y aun así no le cambian nada a un objeto que ponés: tirar un dado o robar una carta (sale
 * un número o una carta) y desguazar joyas (la joya se gasta y salen oro o gemas, por código del juego). Ahí el texto
 * genérico, "el resultado se decide al hacerla", es el que dice la verdad. Las otras 34 de la 42.21 sin resultado
 * (teñir una prenda, reparar con pegamento, afilar una hoja, abrir una lata, meter un filtro en la máscara) trabajan sobre
 * el objeto que usás y lo dejan cambiado: en los datos no se distinguen de éstas (una línea que se queda y otra que se
 * gasta, igual que un dado), por eso van por id.
 */
const NO_ITEM_CHANGE = new Set(["roll-one-dice", "draw-random-card", "scrap-jewellery"]);

/** Una receta sin resultado que modifica el objeto que usás ("Modifica el objeto que usás"). */
export function changesItem(f: { id: string; inputs: RecipeInput[]; outputs: unknown[] }): boolean {
  return f.outputs.length === 0 && !NO_ITEM_CHANGE.has(f.id) && f.inputs.some((i) => i.any || i.opts.length > 0);
}

/**
 * Cómo se muestra cada objeto de UNA lista de opciones: el mismo nombre en el idioma de la página para dos objetos
 * distintos ("Carbón vegetal" es `charcoal` y `wood-charcoal` en español; 220 listas de la 42.21 tienen un par así) no se
 * puede leer, así que a los que chocan se les suma el nombre en el otro idioma entre paréntesis (en inglés, en la página en
 * español), y el enlace lleva un `title` con el nombre en inglés y el id de su ficha para verlo al pasar el mouse. Los que no chocan quedan como están: ni un
 * paréntesis ni un `title` de más en el resto de las líneas (cada uno pesa en el HTML de las 2.340 páginas). El mismo
 * objeto dos veces no es un choque.
 */
export function optionLabels(list: Ref[], lang: "en" | "es"): { label: string; title?: string }[] {
  const other = lang === "es" ? "en" : "es";
  const ids = new Map<string, Set<string>>();
  for (const r of list) {
    const set = ids.get(r[lang]) ?? new Set<string>();
    set.add(r.id);
    ids.set(r[lang], set);
  }
  return list.map((r) => {
    if ((ids.get(r[lang])?.size ?? 0) < 2) return { label: r[lang] };
    const title = `${r.en} · ${r.id}`;
    // Si el otro idioma tampoco los distingue (no pasa en la 42.21), queda el `title` con el id.
    const twin = list.some((x) => x.id !== r.id && x[lang] === r[lang] && x[other] === r[other]);
    const label = r[other] && r[other] !== r[lang] && !twin ? `${r[lang]} (${r[other]})` : r[lang];
    // Si el paréntesis ya los distingue y el id es el nombre en inglés hecho slug, el `title` no suma nada ("Charcoal ·
    // charcoal" sobre "Carbón vegetal (Charcoal)").
    return label !== r[lang] && slugify(r.en) === r.id ? { label } : { label, title };
  });
}
