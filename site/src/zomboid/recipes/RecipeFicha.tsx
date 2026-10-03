/**
 * La ficha de una receta de Project Zomboid (2026-09-30), como una página de la libreta: la cabecera con el ícono de lo
 * que da, el nombre y la nota del juego; a la izquierda lo que hace falta (ingredientes y herramientas) y a la derecha lo
 * que sale, lo que pide y cómo se aprende. Se lee en ese orden: qué junto, qué obtengo, qué necesito saber.
 *
 * Cada objeto es un enlace a su ficha, con su ícono: una etiqueta del juego (`base:saw`) va abierta en todos los objetos
 * que sirven. Los rasgos y las profesiones que la enseñan, también (desde que se publicó Rasgos, el 2026-09-30).
 *
 * El tiempo va tal cual lo declara el juego, con esa aclaración: no está verificado a cuántos segundos equivale.
 */
import type { ReactNode } from "react";
import meta from "@zomboid/meta.json";
import RouteLink from "../../RouteLink";
import { useLang, useLocale } from "../../i18n";
import type { Route } from "../../route";
import { tidyTitleName, useZomboidCopy, type PzRecipesCopy } from "../../zomboidCopy";
import { Collapse, gameLines, ItemIcon, Stamp, wordFit } from "../ui";
import type { RecipeFicha as Ficha, RecipeInput, RecipeLearn, RecipeOutput, Ref } from "./data";
import { changesItem, inputLines, optionLabels, type InputLine } from "./lines";
import CraftLink from "../crafting/link";
import type { CraftState } from "../crafting/query";
import { ChangesSlot } from "../patches/changes";

type Nav = (r: Route) => void;
type Lang = "en" | "es";

/** Cuántas opciones se ven de entrada en una línea ("cualquiera de:" puede traer 190); el resto, en un desplegable. */
const OPTS_SHOWN = 12;

/** Lo que cada pieza de la ficha necesita saber para escribir y enlazar. */
interface Ctx {
  t: PzRecipesCopy;
  lang: Lang;
  num: (n: number) => string;
  toItem: (id: string) => Route;
  /** La ficha de un rasgo o de una profesión que enseña la receta. */
  toTrait: (sec: "traits" | "professions", id: string) => Route;
  navigate: Nav;
}

export default function RecipeFicha({ ficha, route, navigate }: { ficha: Ficha; route: Route; navigate: Nav }) {
  const t = useZomboidCopy().recipes;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 });
  // Sin los espacios de más que traen algunos nombres del juego (Puntería IV: " Tácticas…"), como en el <head>.
  const name = tidyTitleName(ficha[lang]);
  const other = ficha[lang === "es" ? "en" : "es"];
  const toList: Route = { ...route, view: "zomboid", pzSection: "recipes", detail: undefined };
  const toItem = (id: string): Route => ({ ...route, view: "zomboid", pzSection: "items", detail: id });
  const toTrait = (sec: "traits" | "professions", id: string): Route => ({ ...route, view: "zomboid", pzSection: sec, detail: id });
  const ctx: Ctx = { t, lang, num, toItem, toTrait, navigate };
  const { ingredients, tools } = inputLines(ficha.inputs);
  const dir = ficha.kind === "build" ? "build" : "items";
  const none = <span className="pzr-none">{t.none}</span>;
  const skills = ficha.skills.filter((s) => s.lvl > 0);
  const plan = craftPlan(ficha);

  return (
    <main className="pz-main pzi pzi-ficha pzr">
      <nav className="pzi-crumb">
        <RouteLink to={toList} onNavigate={navigate}>
          ← {t.back}
        </RouteLink>
      </nav>

      <section className="pz-page pzi-head">
        <span className="pz-clip" />
        <div className="pzi-headmain">
          <ItemIcon icon={ficha.icon} dir={dir} size={64} lazy={false} />
          <div className="pzi-titles">
            <p className="pzi-kick">
              {ficha.catName[lang]} · {t.kinds[ficha.kind]} · Build {meta.version}
            </p>
            <h1 className="pzi-h1" style={wordFit(name)}>
              {name}
            </h1>
            {other !== name && <p className="pzi-hand">{t.otherName(other)}</p>}
          </div>
        </div>
        {/* Las notas del juego traen `<br>` literales (la del estante de secado, las de las barricadas). */}
        {ficha.tip && <p className="pzi-tip">{gameLines(ficha.tip[lang])}</p>}
      </section>

      <div className="pzi-sheets">
        <div className="pzi-relcol">
          {ingredients.length > 0 && (
            <Sheet cls="pzr-inputs" stamp="gears" title={t.inputsTitle}>
              <ul className="pzr-lines">
                {ingredients.map((l, i) => (
                  <InputRow line={l} ctx={ctx} key={i} />
                ))}
              </ul>
            </Sheet>
          )}
          {tools.length > 0 && (
            <Sheet cls="pzr-tools" stamp="wrench" title={t.toolsTitle} note={t.toolsNote}>
              <ul className="pzr-lines">
                {tools.map((l, i) => (
                  <InputRow line={l} ctx={ctx} tool key={i} />
                ))}
              </ul>
            </Sheet>
          )}
        </div>

        <div className="pzi-relcol">
          <Sheet cls="pzr-out" stamp="checkmark" title={t.outTitle}>
            {ficha.outputs.length ? (
              <ul className="pzr-lines">
                {ficha.outputs.map((o, i) => (
                  <OutputRow out={o} ficha={ficha} ctx={ctx} key={i} />
                ))}
              </ul>
            ) : (
              <p className="pzr-nothing">{changesItem(ficha) ? t.changesItem : t.noOutput}</p>
            )}
            {plan && (
              <CraftLink className="pzi-craftlink" route={route} navigate={navigate} st={plan}>
                {t.craftLink}
              </CraftLink>
            )}
          </Sheet>

          <Sheet cls="pzr-reqs" stamp="target" title={t.reqsTitle}>
            <dl className="pzi-lines">
              <div>
                <dt>{t.time}</dt>
                <dd>{num(ficha.time)}</dd>
              </div>
              <div>
                <dt>{t.skill}</dt>
                {/* Nivel 0 es "no pide nada" (forjar una barra con trozos): "Herrería 0" se leía como un requisito. */}
                <dd>{skills.length ? skills.map((s) => `${s.skill[lang]} ${s.lvl}`).join(" · ") : none}</dd>
              </div>
              <div>
                <dt>{t.xp}</dt>
                <dd>{ficha.xp.length ? ficha.xp.map((x) => `${x.skill[lang]} +${num(x.xp)}`).join(" · ") : none}</dd>
              </div>
              <div>
                <dt>{t.station}</dt>
                {/* Varias estaciones son alternativas (el horno primitivo o el avanzado): juntas con " / ", como los
                    líquidos, sin inventar un "o" por idioma entre nombres del juego. */}
                <dd>{ficha.stations.length ? ficha.stations.map((s) => s[lang]).join(" / ") : none}</dd>
              </div>
            </dl>
          </Sheet>

          <Sheet cls="pzr-learn" stamp="book" title={t.learnTitle}>
            {ficha.learn ? <Learn learn={ficha.learn} ctx={ctx} /> : <p className="pzr-known">{t.known}</p>}
          </Sheet>
        </div>
      </div>
      <ChangesSlot kind="recipes" changes={ficha.changes} route={route} navigate={navigate} />
    </main>
  );
}

/**
 * Lo que lleva "Planificá esta receta" al Planificador de fabricación: una construcción se pide por su receta (`c:`); una
 * receta que da un objeto pide el primero que da, con esta receta elegida para hacerlo (ese objeto puede tener otras).
 * Sin resultado (afilar una hoja, teñir ropa), no hay nada que planificar.
 */
export function craftPlan(f: Ficha): Partial<CraftState> | null {
  if (f.kind === "build") return { q: [{ id: `c:${f.id}`, qty: 1 }] };
  for (const o of f.outputs) {
    const id = "item" in o ? o.item.id : "choices" in o ? o.choices[0]?.item.id : undefined;
    if (id) return { q: [{ id, qty: 1 }], r: { [id]: f.id } };
  }
  return null;
}

/** Una hoja de la ficha con su sello y, si hace falta, una nota a lápiz junto al título. */
function Sheet({ cls, stamp, title, note, children }: { cls: string; stamp: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section className={`pz-page pzi-rel ${cls}`}>
      <h2 className="pzi-h2">
        <Stamp name={stamp} />
        {title}
        {note && <span className="pzi-hand">{note}</span>}
      </h2>
      {children}
    </section>
  );
}

/** "3 ×", o "1–20 ×" si la cantidad es variable. */
const amount = (n: number, max: number | undefined, num: (n: number) => string) =>
  max === undefined ? `${num(n)} ×` : `${num(n)}–${num(max)} ×`;

/**
 * Un objeto enlazado a su ficha, con su ícono (y su cantidad, si la opción pide otra). `name` es cómo se escribe cuando
 * dos de la lista se llaman igual (ver `optionLabels`), y `title`, lo que sale al pasar el mouse. Precarga al apretar:
 * una receta con opciones lista decenas de objetos (ver `prefetch` en RouteLink).
 */
function ItemLink({ r, ctx, n, name }: { r: Ref; ctx: Ctx; n?: number; name?: { label: string; title?: string } }) {
  return (
    <>
      {n !== undefined && <b className="pzr-n">{amount(n, undefined, ctx.num)}</b>}
      <RouteLink className="pzr-item" to={ctx.toItem(r.id)} onNavigate={ctx.navigate} title={name?.title} prefetch="press">
        <ItemIcon icon={r.icon} />
        <span>{name?.label ?? r[ctx.lang]}</span>
      </RouteLink>
    </>
  );
}

/**
 * Una línea de ingredientes o de herramientas: la cantidad y qué sirve (un objeto, "cualquiera de:" con la lista, o
 * cualquier objeto), y abajo el líquido que lleva adentro. En una herramienta el "1 ×" sobra (la 42.21 no pide dos
 * herramientas iguales); sólo se escribe si pide otra cantidad.
 */
function InputRow({ line, ctx, tool = false }: { line: InputLine; ctx: Ctx; tool?: boolean }) {
  const { t, lang, num } = ctx;
  const { input: i, fluid } = line;
  const count = !tool || i.n !== 1 || i.max !== undefined ? <b className="pzr-n">{amount(i.n, i.max, num)}</b> : null;
  const liters = (x: RecipeInput) => t.liters(num(x.n));

  let what: ReactNode;
  let opts: ReactNode = null;
  if (i.fluid) {
    // Un líquido sin recipiente arriba (no pasa en la 42.21): va solo, con sus litros.
    what = (
      <>
        <b className="pzr-n">{liters(i)}</b>
        <span>{i.fluid[lang]}</span>
      </>
    );
  } else if (i.any || !i.opts.length) {
    what = (
      <>
        {count}
        <span className="pzr-any">{fluid ? t.anyContainer : t.anyItem}</span>
      </>
    );
  } else if (i.opts.length === 1) {
    const o = i.opts[0];
    what = (
      <>
        {count}
        <ItemLink r={o} ctx={ctx} />
      </>
    );
  } else {
    what = (
      <>
        {count}
        <span className="pzr-anyof">{t.anyOf}</span>
      </>
    );
    const names = optionLabels(i.opts, lang);
    opts = (
      <Collapse
        items={i.opts}
        shown={OPTS_SHOWN}
        more={t.more}
        className="pzi-links pzr-opts"
        render={(o, k) => (
          <li key={o.id}>
            <ItemLink r={o} ctx={ctx} n={o.n} name={names[k]} />
          </li>
        )}
      />
    );
  }

  return (
    <li className="pzr-line">
      <div className="pzr-what">{what}</div>
      {opts}
      {fluid?.fluid && (
        <p className="pzr-fluid">
          {t.holding(liters(fluid), fluid.fluid[lang])}
          {tool && <span className="pzr-used"> · {t.fluidUsed}</span>}
        </p>
      )}
    </li>
  );
}

/** Lo que sale: un objeto, uno según el ingrediente, o el mueble que se construye. */
function OutputRow({ out, ficha, ctx }: { out: RecipeOutput; ficha: Ficha; ctx: Ctx }) {
  const { t, lang, num } = ctx;
  if ("entity" in out) {
    return (
      <li className="pzr-line">
        <div className="pzr-what">
          <ItemIcon icon={ficha.icon} dir="build" size={48} lazy={false} />
          <span className="pzr-entity">{out.entity[lang]}</span>
        </div>
        <p className="pzr-fluid">{t.built}</p>
      </li>
    );
  }
  const count = <b className="pzr-n">{amount(out.n, out.max, num)}</b>;
  if ("item" in out) {
    return (
      <li className="pzr-line">
        <div className="pzr-what">
          {count}
          <ItemLink r={out.item} ctx={ctx} />
        </div>
      </li>
    );
  }
  // Según el ingrediente: cada fila, lo que entra → lo que sale. Una sola opción es un resultado fijo con su origen. Los
  // que entran son alternativas (cada uno da el resultado por su cuenta, no hacen falta juntos): van con "o" entre ellos.
  // Dos resultados de filas distintas que se llaman igual se distinguen como las opciones de una línea.
  const toNames = optionLabels(
    out.choices.map((c) => c.item),
    lang,
  );
  return (
    <li className="pzr-line">
      <div className="pzr-what">
        {count}
        <span className="pzr-anyof">{t.choices}</span>
      </div>
      <Collapse
        items={out.choices}
        shown={OPTS_SHOWN}
        more={t.more}
        className="pzr-choices"
        render={(c, i) => {
          const fromNames = optionLabels(c.from, lang);
          const last = c.from.length - 1;
          return (
            <li key={`${c.item.id}-${i}`}>
              <span className="pzr-from">
                {c.from.length ? (
                  c.from.map((f, k) => (
                    // "A, B o C": la palabra es la de `join` (en español, "o" o "u") y va pegada al último, así si la fila
                    // baja de renglón el "o" baja con su objeto y no queda colgando al final del anterior.
                    <span className="pzr-fromitem" key={f.id}>
                      {k > 0 && k === last && <span className="pzr-or">{t.joinWord("or", fromNames[k].label)}</span>}
                      <ItemLink r={f} ctx={ctx} name={fromNames[k]} />
                      {k < last - 1 && <span className="pzr-comma">,</span>}
                    </span>
                  ))
                ) : (
                  <span className="pzr-any">{t.otherwise}</span>
                )}
              </span>
              {/* La flecha y su resultado van juntos: en el celular bajan de renglón como una sola pieza. Para el lector
                  de pantalla, la flecha dice "da". */}
              <span className="pzr-gives">
                <span className="visually-hidden">{t.gives}</span>
                <span className="pzr-arrow" aria-hidden="true">
                  →
                </span>
                <span className="pzr-to">
                  <ItemLink r={c.item} ctx={ctx} name={toNames[i]} />
                </span>
              </span>
            </li>
          );
        }}
      />
    </li>
  );
}

/**
 * Cómo se aprende: cada forma que la enseña (alcanza con una). Los libros y lo que se investiga son enlaces a sus
 * objetos; el nivel, una frase; los rasgos y las profesiones, enlaces a sus fichas con su ícono.
 */
function Learn({ learn, ctx }: { learn: RecipeLearn; ctx: Ctx }) {
  const { t, lang } = ctx;
  const refs = (list: Ref[]) => {
    const names = optionLabels(list, lang);
    return (
      <Collapse
        items={list}
        more={t.more}
        render={(r, k) => (
          <li key={r.id}>
            <ItemLink r={r} ctx={ctx} name={names[k]} />
          </li>
        )}
      />
    );
  };
  // Los rasgos a su tamaño del juego (18) y las profesiones achicadas a 32, como un objeto en una fila.
  const plain = (list: Ref[], dir: "traits" | "professions") => (
    <ul className="pzi-links">
      {list.map((r) => (
        <li key={r.id}>
          <RouteLink className="pzr-item" to={ctx.toTrait(dir, r.id)} onNavigate={ctx.navigate}>
            <ItemIcon icon={r.icon} dir={dir} size={dir === "traits" ? 18 : 32} />
            <span>{r[lang]}</span>
          </RouteLink>
        </li>
      ))}
    </ul>
  );
  const ways: { key: string; how: string; body?: ReactNode }[] = [];
  if (learn.books.length) ways.push({ key: "books", how: t.byReading, body: refs(learn.books) });
  if (learn.skills.length) {
    const skills = learn.skills.map((s) => `${s.skill[lang]} ${s.lvl}`);
    ways.push({ key: "skills", how: t.bySkill(t.join(skills, learn.anySkill ? "or" : "and")) });
  }
  if (learn.research.length) ways.push({ key: "research", how: t.byResearch, body: refs(learn.research) });
  if (learn.traits.length) ways.push({ key: "traits", how: t.byTrait(learn.traits.length), body: plain(learn.traits, "traits") });
  if (learn.professions.length)
    ways.push({ key: "professions", how: t.byProfession(learn.professions.length), body: plain(learn.professions, "professions") });

  return (
    <>
      {ways.length > 1 && <p className="pzi-hand pzr-learnany">{t.learnAny}</p>}
      <ul className="pzr-ways">
        {ways.map((w) => (
          <li key={w.key}>
            <p className="pzr-how">{w.how}</p>
            {w.body}
          </li>
        ))}
      </ul>
    </>
  );
}
