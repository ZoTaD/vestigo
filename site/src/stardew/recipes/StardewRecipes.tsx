/**
 * La pestaña Recetas y máquinas de Stardew Valley (etapa 2, tarea 6). Tres vistas en la misma página, elegidas con
 * botones: Cocina (se abre en esta), Fabricación y Máquinas. Las recetas van en una grilla de tarjetas con el plato o el
 * objeto, cómo se aprende (pastilla de texto con tinte) y sus ingredientes en casilleros chicos con la cantidad; el
 * buscador encuentra por el nombre de la receta o de cualquier ingrediente. Las máquinas van en una caja cada una, con
 * cómo se fabrica y la tabla de lo que entra y sale, el tiempo y el precio (las primeras 8 filas y "ver todas").
 *
 * La vista y la búsqueda viajan en la dirección (`?view=craft&q=melon`) y se leen después del primer dibujo: el HTML
 * prerenderizado sale con Cocina y sin búsqueda. Son ~230 recetas: la grilla va con `LazyRows` y, en el prerender,
 * sólo la primera tanda lleva sprites (`skipSprite`). Cada plato, ingrediente, producto y máquina enlaza a su ficha.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLang, useLocale } from "../../i18n";
import { LazyRows, skipSprite } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { QUALITIES, useStardewCopy, type RecipesCopy } from "../../stardewCopy";
import { useLoad } from "../../useLoad";
import { qualityIndex } from "../bundles/progress";
import { loadRecipes, machineTime, peekRecipes, say } from "../data";
import { Box, Gold, Group, Pill, SdLoading, Slot, Sprite, type Nav } from "../ui";
import {
  DEFAULT_RECIPE_STATE,
  ingName,
  ingSprite,
  machineList,
  readRecipeState,
  recipeList,
  VIEWS,
  writeRecipeState,
  type Machine,
  type Recipe,
  type RecipeState,
  type RecipesData,
  type RuleRow,
  type Unlock,
} from "./state";
import "../../styles/stardew-items.css";
import "../../styles/stardew-recipes.css";

/** Las tarjetas que se dibujan por tanda (y las que llevan sprite en el prerender). */
const SD_RCHUNK = 24;
/** El alto de una tarjeta de receta, medido en el navegador: 205 px en escritorio (la grilla iguala cada fila), de 157 a 253 a 375 px. */
const SD_RCARD = 205;
/** Lo que multiplica el precio cada calidad: normal, plata, oro e iridio (`Object.sellToStorePrice`). */
const QUALITY_PRICE = [1, 1.25, 1.5, 2];
/** Las filas de una máquina que se ven antes de "ver todas". */
const SD_MROWS = 8;

const isBig = (id: string) => id.startsWith("(BC)");

export default function StardewRecipes({ route, navigate }: { route: Route; navigate: Nav }) {
  const data = useLoad("recipes", () => peekRecipes() ?? undefined, loadRecipes);
  if (data.failed) return <SdLoading onRetry={data.retry} />;
  if (!data.value) return <SdLoading />;
  return <RecipeBook data={data.value} route={route} navigate={navigate} />;
}

/** Cómo se aprende una receta: una pastilla con tinte y el texto de la interfaz con los nombres del juego. */
function UnlockTag({ u, data, r }: { u: Unlock; data: RecipesData; r: RecipesCopy }) {
  const { lang } = useLang();
  const locale = useLocale();
  const show = say(data.refs.tv, lang);
  const way =
    u.type === "skill"
      ? r.unlock.skill(data.refs.skills[u.skill] ? say(data.refs.skills[u.skill], lang) : u.skill, u.level)
      : u.type === "friend"
        ? r.unlock.friend(data.refs.npcs[u.npc] ? say(data.refs.npcs[u.npc], lang) : u.npc, u.hearts)
        : u.type === "tv"
          ? r.unlock.tv(show)
          : u.type === "shop"
            ? r.unlock.shop(data.refs.shops[u.shop] ? say(data.refs.shops[u.shop], lang) : u.shop, u.price ? u.price.toLocaleString(locale) : null)
            : u.type === "default"
              ? r.unlock.default
              : r.unlock.other;
  const text = (u.type === "skill" || u.type === "friend") && u.tv ? r.unlock.orTv(way, show) : way;
  return (
    <span className={`sd-unlock is-${u.type}`} title={r.unlock.label}>
      {text}
    </span>
  );
}

export function RecipeBook({ data, route, navigate, initial = DEFAULT_RECIPE_STATE }: { data: RecipesData; route: Route; navigate: Nav; initial?: RecipeState }) {
  const t = useStardewCopy();
  const r = t.recipes;
  const { lang } = useLang();
  const locale = useLocale();
  const [state, setState] = useState<RecipeState>(initial);
  useEffect(() => {
    if (window.location.search) setState(readRecipeState(window.location.search));
  }, []);
  // Sobre el estado de ese momento, y la dirección al día con lo elegido.
  const pick = (patch: Partial<RecipeState>) =>
    setState((prev) => {
      const next = { ...prev, ...patch };
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${writeRecipeState(next)}`);
      return next;
    });

  const recipes = useMemo(() => (state.view === "machines" ? [] : recipeList(data, state.view, state.q, lang)), [data, state.view, state.q, lang]);
  const machines = useMemo(() => (state.view === "machines" ? machineList(data, state.q, lang) : []), [data, state.view, state.q, lang]);
  const shown = state.view === "machines" ? machines.length : recipes.length;

  const itemRoute = (slug: string): Route => ({ ...route, view: "stardew", sdSection: "items", detail: slug });

  /** Un ingrediente: casillero chico con el sprite y la cantidad, y el nombre; una categoría ("Huevo (cualquiera)") sin enlace. */
  const ingredient = ([id, n]: [string, number], sprite: boolean) => {
    const ref = data.refs.items[id];
    const icon = ingSprite(data, id);
    const body = (
      <>
        <span className="sd-islot">
          {sprite && icon && <Sprite id={icon} h={isBig(icon) ? 32 : 16} size={32} />}
          <i className="sd-qty">{n.toLocaleString(locale)}</i>
        </span>
        <span className="sd-ing-name">{ingName(data, id, lang)}</span>
      </>
    );
    return (
      <li key={id}>
        {ref ? (
          <RouteLink className="sd-ing" to={itemRoute(ref[0])} onNavigate={navigate} prefetch="press">
            {body}
          </RouteLink>
        ) : (
          <span className="sd-ing is-cat">{body}</span>
        )}
      </li>
    );
  };

  const recipeCard = (rec: Recipe, i: number) => {
    const ref = data.refs.items[rec.out];
    const sprite = !skipSprite(i, SD_RCHUNK);
    const name = say(rec.name, lang);
    const head = (
      <>
        <Slot>
          {sprite && <Sprite id={rec.out} h={isBig(rec.out) ? 32 : 16} size={48} />}
          {rec.qty > 1 && <i className="sd-qty">{r.makes(rec.qty)}</i>}
        </Slot>
        <b>{name}</b>
      </>
    );
    return (
      <li className="sd-rcard" data-recipe={ref?.[0] ?? rec.out} key={`${rec.kind}:${rec.out}:${rec.name[0]}`}>
        {ref ? (
          <RouteLink className="sd-rhead" to={itemRoute(ref[0])} onNavigate={navigate} prefetch="press">
            {head}
          </RouteLink>
        ) : (
          <span className="sd-rhead">{head}</span>
        )}
        <UnlockTag u={rec.unlock} data={data} r={r} />
        <ul className="sd-ingl">{rec.ings.map((ing) => ingredient(ing, sprite))}</ul>
      </li>
    );
  };

  return (
    <main className="sd-main sd-recipes">
      <Box className="sd-intro">
        <h1 className="sd-h1">{r.h1}</h1>
        <p className="sd-lede">{r.lede}</p>
        <div className="sd-filters">
          <Group label={r.view}>
            {VIEWS.map((v) => (
              <Pill on={state.view === v} onClick={() => pick({ view: v })} key={v}>
                {r.views[v]}
              </Pill>
            ))}
          </Group>
          <label className="sd-find">
            <span className="sd-label">{r.search}</span>
            <input type="search" value={state.q} placeholder={r.searchPlaceholder} autoComplete="off" onChange={(e) => pick({ q: e.target.value })} />
          </label>
          <p className="sd-count" aria-live="polite">
            {shown === 0 ? r.none : state.view === "machines" ? r.machinesCount(shown.toLocaleString(locale)) : r.count(shown.toLocaleString(locale))}
          </p>
        </div>
      </Box>

      {state.view !== "machines" ? (
        recipes.length > 0 && (
          <Box className="sd-rbox">
            <h2 className="visually-hidden">{r.views[state.view]}</h2>
            <ul className="sd-rgrid">
              <LazyRows items={recipes} rowHeight={SD_RCARD} chunk={SD_RCHUNK} tag="li" eager margin={600} render={recipeCard} />
            </ul>
          </Box>
        )
      ) : (
        machines.map(({ machine, rows }) => (
          <MachineBox
            key={machine.id}
            machine={machine}
            rows={rows}
            data={data}
            route={route}
            navigate={navigate}
            ingredient={(ing) => ingredient(ing, true)}
          />
        ))
      )}
    </main>
  );
}

/** Una máquina: su sprite y nombre (enlazados a su ficha), cómo se fabrica y la tabla de lo que entra y sale. */
function MachineBox({
  machine,
  rows,
  data,
  route,
  navigate,
  ingredient,
}: {
  machine: Machine;
  rows: RuleRow[];
  data: RecipesData;
  route: Route;
  navigate: Nav;
  ingredient: (ing: [string, number]) => ReactNode;
}) {
  const t = useStardewCopy();
  const r = t.recipes;
  const m = r.machine;
  const { lang } = useLang();
  const locale = useLocale();
  const [all, setAll] = useState(false);
  const recipe = machine.recipe != null ? data.recipes[machine.recipe] : null;
  const shown = all ? rows : rows.slice(0, SD_MROWS);
  const itemRoute = (slug: string): Route => ({ ...route, view: "stardew", sdSection: "items", detail: slug });
  const time = (minutes: number) => {
    const tm = machineTime(minutes, 0);
    return tm ? t.items.time(tm) : m.instant;
  };
  /** Un objeto de la tabla: sprite chico y nombre, enlazado si tiene ficha. Los productos de sabor sin sprite propio usan el de su sabor. */
  const thing = (id: string, name: string, spriteId: string) => {
    const ref = data.refs.items[id];
    const body = (
      <>
        <Sprite id={spriteId} h={isBig(spriteId) ? 32 : 16} size={32} />
        <span>{name}</span>
      </>
    );
    return ref ? (
      <RouteLink className="sd-mthing" to={itemRoute(ref[0])} onNavigate={navigate} prefetch="press">
        {body}
      </RouteLink>
    ) : (
      <span className="sd-mthing">{body}</span>
    );
  };

  return (
    <Box as="article" className="sd-mbox" data-machine={machine.slug}>
      <header className="sd-mhead">
        <RouteLink className="sd-mname" to={itemRoute(machine.slug)} onNavigate={navigate} prefetch="press">
          <Slot>
            <Sprite id={machine.id} h={32} size={48} />
          </Slot>
          <h2 className="sd-h2">{say(machine.name, lang)}</h2>
        </RouteLink>
        {recipe ? (
          <div className="sd-mmade">
            <span className="sd-label">{m.made}</span>
            <ul className="sd-ingl">{recipe.ings.map((ing) => ingredient(ing))}</ul>
            <UnlockTag u={recipe.unlock} data={data} r={r} />
          </div>
        ) : (
          <p className="sd-muted sd-mmade">{m.notMade}</p>
        )}
      </header>
      <table className="sd-mtable">
        <thead>
          <tr>
            <th scope="col">{m.cols.input}</th>
            <th scope="col">
              <span className="sd-mouthead">
                <span>{m.cols.output}</span>
                <span>{m.cols.price}</span>
              </span>
            </th>
            <th scope="col" className="c-time">
              {m.cols.time}
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr data-rule={row.in} key={row.in}>
              <th scope="row" className="c-in">
                {thing(row.in, say(row.inName, lang), row.in)}
                {row.count > 1 && <small className="sd-mcount">× {row.count.toLocaleString(locale)}</small>}
                {row.count === 0 && <small className="sd-mcount">{m.nearby}</small>}
              </th>
              <td className="c-out" data-label={m.cols.output}>
                {row.outs.map((o) => (
                  <span className="sd-mout" key={o.out}>
                    <span className="sd-mwhat">
                      {thing(o.out, say(o.outName, lang), data.refs.items[o.out] ? o.out : (o.flavor ?? row.in))}
                      {o.stack && <small className="sd-mcount">× {o.stack.toLocaleString(locale)}</small>}
                      {o.quality && <small className="sd-mcount">{t.qualities[QUALITIES[qualityIndex(o.quality)]]}</small>}
                    </span>
                    <Gold n={Math.floor(o.price * QUALITY_PRICE[qualityIndex(o.quality ?? 0)])} />
                  </span>
                ))}
              </td>
              <td className="c-time" data-label={m.cols.time}>
                {time(row.minutes)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > SD_MROWS && (
        <button type="button" className="sd-pill sd-mmore" aria-expanded={all} onClick={() => setAll((x) => !x)}>
          {all ? m.less : m.more(rows.length.toLocaleString(locale))}
        </button>
      )}
    </Box>
  );
}
