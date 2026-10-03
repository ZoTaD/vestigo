/**
 * El árbol completo del Planificador de fabricación (2026-10-02): una lista anidada por objetivo, con lo que pide cada
 * paso. Es donde se cambia todo: la receta de un objeto ("Cambiar receta"), el material de una línea ("una de"), si algo
 * lo conseguís o lo fabricás, si una herramienta la hacés vos ("La fabrico" / "La consigo") y cuánto ya tenés de lo que
 * se fabrica ("tengo"). El árbol y la hoja de ruta salen de las mismas decisiones del motor (`tree` y `totals` en
 * `engine.ts`), así que cualquier cambio se ve igual en los dos.
 *
 * Sangría: 12 px por nivel hasta el 6; más abajo deja de sangrar y lo dice ("↳ nivel 7"), así en el celular una rama
 * honda (la bragueta de metal) no empuja la hoja fuera de la pantalla. Una lista larga de opciones va en un `<select>`.
 */
import type { ReactNode } from "react";
import RouteLink from "../../RouteLink";
import { useLang, useLocale, type Lang } from "../../i18n";
import type { Route } from "../../route";
import { ItemIcon, Stamp } from "../ui";
import { useCraftCopy, type CraftCopy } from "./copy";
import { own, type CraftData } from "./data";
import { asItems, context, knows, type NodeLine, type TreeNode } from "./engine";
import { targetRoute, entryOf } from "./Picker";
import { HaveInput, linksOf } from "./RouteSheet";
import { isBuild, setLeaf, setMake, setOpt, setRecipe, type CraftState } from "./state";

type Nav = (r: Route) => void;
/** Hasta qué nivel sangra el árbol; después, "↳ nivel N". */
const MAX_INDENT = 6;

interface Ctx {
  data: CraftData;
  st: CraftState;
  set: (s: CraftState) => void;
  route: Route;
  navigate: Nav;
  t: CraftCopy;
  lang: Lang;
  num: (n: number) => string;
  known: Set<string>;
}

export default function TreeSheet({
  data,
  st,
  set,
  trees,
  route,
  navigate,
}: {
  data: CraftData;
  st: CraftState;
  set: (s: CraftState) => void;
  trees: TreeNode[];
  route: Route;
  navigate: Nav;
}) {
  const t = useCraftCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const ctx: Ctx = {
    data,
    st,
    set,
    route,
    navigate,
    t,
    lang,
    num: (n) => n.toLocaleString(locale),
    known: context(data, st).known,
  };
  return (
    <section className="pz-page pzc-sheet pzc-treesheet" aria-labelledby="pzc-tree-title">
      <h2 className="pzi-h2" id="pzc-tree-title">
        <Stamp name="gears" />
        {t.treeTitle}
        <span className="pzi-hand">{t.treeNote}</span>
      </h2>
      {trees.map((node) => (
        <ul className="pzc-tree" key={node.id}>
          <Node node={node} depth={0} ctx={ctx} />
        </ul>
      ))}
    </section>
  );
}

/** El nombre de una opción del `<select>` de recetas: con "(hay que aprenderla)" o qué hace si sale de otra cosa. */
function recipeLabel(ctx: Ctx, rid: string): string {
  const r = ctx.data.recipes[rid];
  const notes = [r.x ? ctx.t.undoes[r.x] : null, knows(ctx.data, ctx.known, rid) ? null : ctx.t.mustLearn].filter(Boolean);
  return [r[ctx.lang], ...notes].join(" ");
}

/** Lo que elige una línea entre varias opciones (el material o la herramienta). */
interface Choice {
  rid: string;
  li: number;
  opts: string[];
  pick: string;
}

function OptSelect({ ctx, choice, label }: { ctx: Ctx; choice: Choice; label: string }) {
  const { data, st, set, lang } = ctx;
  return (
    <label className="pzc-select">
      <span className="pzc-why">{ctx.t.pickOne}</span>
      <select
        aria-label={label}
        value={choice.pick}
        onChange={(e) => set(setOpt(st, choice.rid, choice.li, e.target.value))}
      >
        {choice.opts.map((o) => (
          <option value={o} key={o}>
            {own(data.items, o)?.[lang] ?? o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Node({ node, depth, ctx, choice }: { node: TreeNode; depth: number; ctx: Ctx; choice?: Choice }) {
  const { data, st, set, t, lang, num, navigate, route } = ctx;
  const e = entryOf(data, node.id);
  const name = e?.[lang] ?? node.id;
  const build = isBuild(node.id);
  const root = depth === 0;
  const go = linksOf(route);
  const qty = build ? node.qty : asItems(data, node.id, node.qty);
  // Se fabrica o se puede fabricar: "Lo consigo" / "Lo fabrico" (nunca en la raíz, que es lo que pediste).
  const makeable = !build && (own(data.makes, node.id)?.length ?? 0) > 0;
  const why = node.why && node.why !== "raw" && node.why !== "undo" ? t.why[node.why] : null;
  const tools = node.lines.filter((l) => l.keep && !l.any);
  const rest = node.lines.filter((l) => !l.keep || l.any);
  const deep = depth > MAX_INDENT;
  // Los hijos de un nodo del nivel 6 ya no sangran: el 7 y los de abajo quedan a la misma altura, con su "↳ nivel N".
  const flat = depth + 1 > MAX_INDENT ? " is-flat" : "";

  return (
    <li className={`pzc-node${node.recipe ? " is-made" : " is-leaf"}`}>
      <div className="pzc-nrow">
        {deep && <span className="pzc-deep">{t.deep(depth)}</span>}
        <ItemIcon icon={e?.icon} dir={e?.dir ?? "items"} size={32} />
        <span className="pzc-nmain">
          <span className="pzc-nname">
            <b className="pzc-n">{num(qty)} ×</b>{" "}
            <RouteLink className="pzc-item" to={targetRoute(route, node.id)} onNavigate={navigate}>
              <span>{name}</span>
            </RouteLink>
          </span>
          {choice && choice.opts.length > 1 && <OptSelect ctx={ctx} choice={choice} label={`${t.pickOne}: ${name}`} />}
          {/* Una construcción es su receta: el nombre ya enlaza a ella, sin "con" repetido. */}
          {node.recipe && !build && (
            <span className="pzc-with">
              <em className="pzc-why">{t.with}</em>{" "}
              <RouteLink className="pzc-item" to={go.recipe(node.recipe)} onNavigate={navigate}>
                <span>{data.recipes[node.recipe][lang]}</span>
              </RouteLink>
              {node.alts.length > 1 && (
                <select
                  className="pzc-recipe"
                  aria-label={`${t.switchRecipe}: ${name}`}
                  value={node.recipe}
                  onChange={(ev) => set(setRecipe(st, node.id, ev.target.value))}
                >
                  {node.alts.map((rid) => (
                    <option value={rid} key={rid}>
                      {recipeLabel(ctx, rid)}
                    </option>
                  ))}
                </select>
              )}
            </span>
          )}
          {why && <em className={`pzc-why is-${node.why}`}>{why}</em>}
          {!root && makeable && node.why !== "cycle" && node.why !== "undo" && (
            <button
              type="button"
              className="pzc-act"
              aria-label={`${node.recipe ? t.getIt : t.makeIt}: ${name}`}
              onClick={() => set(node.recipe ? setLeaf(st, node.id, true) : setMake(st, node.id, true))}
            >
              {node.recipe ? t.getIt : t.makeIt}
            </button>
          )}
          {/* Lo que ya tenés de algo que se fabrica: se resta antes de contar las tandas (y lo que piden). */}
          {node.recipe && !build && <HaveInput id={node.id} name={name} st={st} set={set} />}
        </span>
      </div>

      {(tools.length > 0 || rest.length > 0) && (
        <ul className={`pzc-kids${flat}`}>
          {tools.length > 0 && (
            <li className="pzc-node is-tools">
              <div className="pzc-nrow">
                <span className="pzc-nmain">
                  <em className="pzc-why">{t.toolsLine}</em>
                  {tools.map((l) => (
                    <Tool line={l} node={node} ctx={ctx} key={l.li} />
                  ))}
                </span>
              </div>
            </li>
          )}
          {/* Una herramienta que vas a fabricar trae su rama, al mismo nivel que los materiales. */}
          {tools.map((l) => (l.child ? <Node node={l.child} depth={depth + 1} ctx={ctx} key={`t${l.li}`} /> : null))}
          {rest.map((l) => (
            <Line line={l} node={node} depth={depth + 1} ctx={ctx} key={l.li} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Una herramienta de la línea "Herramientas:": la elegida, "una de" si hay varias, y "La fabrico" si tiene receta. */
function Tool({ line, node, ctx }: { line: NodeLine; node: TreeNode; ctx: Ctx }) {
  const { data, st, set, t, lang, route, navigate } = ctx;
  if (!line.pick) return null;
  const pick = line.pick;
  const made = st.make.includes(pick);
  const canMake = (own(data.makes, pick)?.length ?? 0) > 0;
  const name = own(data.items, pick)?.[lang] ?? pick;
  return (
    <span className="pzc-tool">
      {line.opts.length > 1 && node.recipe ? (
        <OptSelect ctx={ctx} choice={{ rid: node.recipe, li: line.li, opts: line.opts, pick }} label={`${t.pickOne}: ${name}`} />
      ) : (
        <RouteLink className="pzc-item" to={targetRoute(route, pick)} onNavigate={navigate}>
          <ItemIcon icon={own(data.items, pick)?.icon} size={32} />
          <span>{name}</span>
        </RouteLink>
      )}
      {canMake && (
        <button
          type="button"
          className={`pzc-act${made ? " is-on" : ""}`}
          aria-label={`${made ? t.getTool : t.makeTool}: ${name}`}
          onClick={() => set(setMake(st, pick, !made))}
        >
          {made ? t.getTool : t.makeTool}
        </button>
      )}
    </span>
  );
}

/** Una línea que se gasta: su objeto (que puede tener su propio árbol), un líquido o cualquier recipiente. */
function Line({ line, node, depth, ctx }: { line: NodeLine; node: TreeNode; depth: number; ctx: Ctx }): ReactNode {
  const { t, lang, num } = ctx;
  if (line.fluid)
    return (
      <li className="pzc-node is-leaf">
        <div className="pzc-nrow">
          <span className="pzc-nmain">{t.liters(num(Math.round(line.fluid.liters * 100) / 100), line.fluid.name[lang])}</span>
        </div>
      </li>
    );
  if (line.any)
    return (
      <li className="pzc-node is-leaf">
        <div className="pzc-nrow">
          <span className="pzc-nmain">
            <b className="pzc-n">{num(line.qty)} ×</b> <em className="pzc-why">{t.anyContainer}</em>
          </span>
        </div>
      </li>
    );
  if (!line.child || !line.pick) return null;
  const choice = node.recipe && !isBuild(line.pick) ? { rid: node.recipe, li: line.li, opts: line.opts, pick: line.pick } : undefined;
  return <Node node={line.child} depth={depth} ctx={ctx} choice={choice} />;
}
