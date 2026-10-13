/**
 * La ficha de un objeto de Terraria (2026-10-12): nombre en su color de rareza, las estadísticas como las escribe el
 * tooltip del juego, sus recetas, en qué se usa, quién lo suelta y de qué otra forma se consigue (tiendas, cofres,
 * bolsas, cajas, pesca). Recibe la ficha ya cargada; todo lo que nombra
 * viene en sus `refs`, así no pide nada más.
 */
import type { CSSProperties, ReactNode } from "react";
import { useLang, useLocale } from "../../i18n";
import { LazyRows, skipSprite } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import { routePath, type Route } from "../../route";
import { useTerrariaCopy, type TerrariaCopy } from "../../terrariaCopy";
import { refName, say, type Ficha, type Recipe, type Ref, type Source } from "../data";
import { itemRoute, rare, Slot, Sprite, type Nav } from "../ui";
import { buyCoins, knockbackTier, percent, sellCoins, speedTier } from "./stats";

/** El alto de una fila de "se usa en" y de botín, en px, medido en el navegador (2026-10-12). */
const TR_ROW = 44;
/** Las fuentes cuya probabilidad está medida (miles de intentos) y no leída de una tabla: llevan la aclaración al pie. */
const MEASURED = new Set<Source["k"]>(["chest", "pot", "tree", "bag", "crate", "open", "extract", "angler"]);
/** El alto de una fila de "dónde se consigue" sin condición, en px (2026-10-12). */
const TR_SOURCE_ROW = 44;

/** Las letras de la palabra más larga del nombre: el título se achica para que entre entera, sin cortarla. */
const longestWord = (name: string): number => Math.max(...name.split(/\s+/).map((w) => w.length), 1);

export default function ItemPage({ ficha, route, navigate }: { ficha: Ficha; route: Route; navigate: Nav }) {
  const t = useTerrariaCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const name = say(ficha.name, lang);
  const tip = say(ficha.tip, lang);
  const s = ficha.stats;

  /** Otro objeto, con su casillero y su nombre, enlazado a su ficha. */
  const link = (id: number, extra?: ReactNode, bare = false) => {
    const r: Ref | undefined = id === ficha.id ? [ficha.slug, ficha.slugEs, ficha.name[0], ficha.name[1], ficha.rare, ...ficha.size] : ficha.refs[String(id)];
    if (!r) return null;
    return (
      <RouteLink className="tr-ref" to={itemRoute(route, r[0])} onNavigate={navigate} prefetch="press">
        <Slot size={36}>{!bare && <Sprite id={id} w={r[5]} h={r[6]} max={28} />}</Slot>
        <span style={rare(r[4])}>{refName(r, lang)}</span>
        {extra}
      </RouteLink>
    );
  };

  const station = (tile: number): ReactNode => {
    if (tile < 0) return t.items.byHand;
    const st = ficha.stations[String(tile)];
    if (!st) return null;
    // Una estación que no coloca ningún objeto (un altar) no tiene ficha que enlazar: va su nombre.
    return (st[0] && link(st[0])) || <b>{say([st[1], st[2]], lang)}</b>;
  };

  /** Quién o qué da el objeto en una fuente: el NPC, el cofre, o el objeto del que sale (enlazado a su ficha). */
  const origin = (s: Source, i: number): ReactNode => {
    if (s.k === "pylon") return <b>{t.items.sources.anyNpc}</b>;
    if (s.k === "pot" || s.k === "tree") return <b>{s.k === "pot" ? t.items.sources.pots : t.items.sources.trees}</b>;
    if (s.k === "fish") return <b>{s.tier ? t.items.sources.tiers[s.tier] : t.items.sources.anyCatch}</b>;
    if (s.n != null) return <b>{say(ficha.npcs[String(s.n)] ?? ["?", ""], lang)}</b>;
    if (s.l) return <b>{say(s.l, lang)}</b>;
    if (s.i == null) return null;
    const station = s.t != null ? ficha.refs[String(s.t)] : undefined;
    return link(s.i, station && <small>{t.items.sources.inStation(refName(station, lang))}</small>, skipSprite(i, 12));
  };
  const price = (s: Source): string | null => {
    if (s.p == null) return null;
    const coin = s.c != null ? ficha.refs[String(s.c)] : undefined;
    if (coin) return `${s.p} × ${refName(coin, lang)}`;
    const coins = buyCoins(s.p);
    return coins.flatMap((n, j) => (n ? [`${n} ${t.items.coins[j]}`] : [])).join(", ") || null;
  };

  const tree = `${routePath({ ...route, view: "terraria", trSection: "crafting", detail: undefined })}#${ficha.slug}`;

  return (
    <main className="tr-main tr-ficha">
      <div className="tr-wrap">
        <RouteLink className="tr-back" to={{ ...route, view: "terraria", trSection: "items", detail: undefined }} onNavigate={navigate}>
          ← {t.items.back}
        </RouteLink>
        <section className="tr-dug tr-top">
          <Slot size={96}>
            <Sprite id={ficha.id} w={ficha.size[0]} h={ficha.size[1]} max={80} eager />
          </Slot>
          <div className="tr-title">
            <p className="tr-label">
              {t.kinds[ficha.kind]} · {t.rarity(ficha.rare)}
            </p>
            <h1 className="tr-h1 tr-andy" style={{ ...rare(ficha.rare), "--tr-word": longestWord(name) } as CSSProperties}>
              {name}
            </h1>
            {tip && (
              <p className="tr-tip">
                {tip.split("\n").map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </p>
            )}
            <Tags stats={s} t={t} />
          </div>
        </section>

        <section className="tr-dug">
          <h2 className="tr-h2 tr-andy">{t.items.stats}</h2>
          <dl className="tr-stats">
            {statRows(ficha, t, locale).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {ficha.recipes.length > 0 && (
          <section className="tr-dug">
            <h2 className="tr-h2 tr-andy">{ficha.recipes.length > 1 ? t.items.recipesTitle(ficha.recipes.length) : t.items.recipeTitle}</h2>
            <ul className="tr-recipes">
              {ficha.recipes.map((r, i) => (
                <li key={i}>
                  <RecipeLine recipe={r} ficha={ficha} link={link} station={station} t={t} lang={lang} />
                </li>
              ))}
            </ul>
            <a className="tr-btn" href={tree}>
              {t.items.openTree} →
            </a>
          </section>
        )}

        {ficha.drops.length > 0 && (
          <section className="tr-dug">
            <h2 className="tr-h2 tr-andy">{t.items.dropsTitle}</h2>
            <ul className="tr-rows">
              <LazyRows
                items={ficha.drops}
                rowHeight={TR_ROW}
                tag="li"
                chunk={40}
                render={([npc, min, max, rate, mode], i) => (
                  <li className="tr-drop" key={`${npc}-${mode}-${i}`}>
                    <b>{say(ficha.npcs[String(npc)] ?? ["?", ""], lang)}</b>
                    {mode && <small>{t.items.dropModes[mode]}</small>}
                    <span>{min === max ? `×${min}` : `×${min}–${max}`}</span>
                    <strong>{percent(rate, locale)}</strong>
                  </li>
                )}
              />
            </ul>
          </section>
        )}

        {ficha.sources.length > 0 && (
          <section className="tr-dug">
            <h2 className="tr-h2 tr-andy">{t.items.sources.title}</h2>
            <ul className="tr-sources">
              <LazyRows
                items={ficha.sources}
                rowHeight={TR_SOURCE_ROW}
                tag="li"
                chunk={30}
                render={(s, i) => (
                  <li className="tr-source" key={i}>
                    <small className="tr-label">{t.items.sources.kinds[s.k]}</small>
                    <div className="tr-source-who">
                      {origin(s, i)}
                      {(s.if || s.k === "pylon") && <em>{s.if ? say(s.if, lang) : t.items.sources.pylon}</em>}
                    </div>
                    {s.q && (s.q[1] > 1 || s.q[0] !== s.q[1]) && <span>{s.q[0] === s.q[1] ? `×${s.q[0]}` : `×${s.q[0]}–${s.q[1]}`}</span>}
                    {s.r != null && s.r < 1 && <strong>{percent(s.r, locale)}</strong>}
                    {s.p != null && <strong>{price(s)}</strong>}
                  </li>
                )}
              />
            </ul>
            {ficha.sources.some((s) => MEASURED.has(s.k)) && <p className="tr-source-note">{t.items.sources.note}</p>}
          </section>
        )}

        {ficha.uses.length > 0 && (
          <section className="tr-dug">
            <h2 className="tr-h2 tr-andy">{t.items.usesTitle(ficha.uses.length)}</h2>
            <ul className="tr-rows tr-uses">
              <LazyRows
                items={ficha.uses}
                rowHeight={TR_ROW}
                tag="li"
                chunk={40}
                render={([out, need], i) => <li key={`${out}-${i}`}>{link(out, <small>{t.items.needs(need)}</small>, skipSprite(i, 0))}</li>}
              />
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

function RecipeLine({ recipe, ficha, link, station, t, lang }: { recipe: Recipe; ficha: Ficha; link: (id: number, extra?: ReactNode) => ReactNode; station: (tile: number) => ReactNode; t: TerrariaCopy; lang: "en" | "es" }) {
  const [, qty, tile, flags, ings] = recipe;
  return (
    <div className="tr-recipe">
      <ul className="tr-ings">
        {ings.map(([key, n]) => (
          <li key={key}>
            {key < 0 ? (
              <Group group={ficha.groups[String(-key - 1)]} refs={ficha.refs} n={n} lang={lang} />
            ) : (
              link(key, <small>×{n}</small>)
            )}
          </li>
        ))}
      </ul>
      <p className="tr-recipe-how">
        <span className="tr-label">{t.items.at}</span> {station(tile)}
        {t.items.flags.map((f, i) => (flags & (1 << i) ? <em key={f}>{f}</em> : null))}
        {qty > 1 && <em>{t.items.makes(qty)}</em>}
      </p>
    </div>
  );
}

/** Un grupo como ingrediente: su nombre y el sprite de su primer objeto. No enlaza: no es un objeto. */
function Group({ group, refs, n, lang }: { group: Ficha["groups"][string] | undefined; refs: Ficha["refs"]; n: number; lang: "en" | "es" }) {
  if (!group) return null;
  const r = refs[String(group[2])];
  return (
    <span className="tr-ref is-group">
      <Slot size={36}>{r && <Sprite id={group[2]} w={r[5]} h={r[6]} max={28} />}</Slot>
      <span>{say([group[0], group[1]], lang)}</span>
      <small>×{n}</small>
    </span>
  );
}

function Tags({ stats: s, t }: { stats: Ficha["stats"]; t: TerrariaCopy }) {
  const tags = [s.material && t.items.tags.material, s.consumable && t.items.tags.consumable, s.autoReuse && s.damage ? t.items.tags.autoReuse : null, s.expert && t.items.tags.expert, s.master && t.items.tags.master].filter(Boolean);
  if (!tags.length) return null;
  return (
    <p className="tr-tags">
      {tags.map((x) => (
        <span key={x as string}>{x}</span>
      ))}
    </p>
  );
}

/** Las filas de estadísticas que tiene sentido mostrar para este objeto, en el orden del tooltip del juego. */
function statRows(f: Ficha, t: TerrariaCopy, locale: string): [string, string][] {
  const s = f.stats;
  const c = t.items.stat;
  const out: [string, string][] = [];
  const num = (n: number) => n.toLocaleString(locale);
  if (s.damage && s.damage > 0) {
    const cls = s.melee ? c.classes.melee : s.ranged ? c.classes.ranged : s.magic ? c.classes.magic : s.summon || s.sentry ? c.classes.summon : c.classes.none;
    out.push([c.damage(cls).trim(), num(s.damage)]);
    if (!s.summon && !s.sentry) out.push([c.crit, `${4 + (s.crit ?? 0)}%`]);
    if (s.useAnimation) out.push([c.speed, `${t.items.speeds[speedTier(s.useAnimation)]} (${s.useAnimation})`]);
    out.push([c.knockback, `${t.items.knockbacks[knockbackTier(s.knockBack ?? 0)]}${s.knockBack ? ` (${s.knockBack.toLocaleString(locale)})` : ""}`]);
  }
  if (s.defense) out.push([c.defense, num(s.defense)]);
  if (s.pick) out.push([c.pick, `${s.pick}%`]);
  if (s.axe) out.push([c.axe, `${s.axe * 5}%`]);
  if (s.hammer) out.push([c.hammer, `${s.hammer}%`]);
  if (s.tileBoost) out.push([c.range, `${s.tileBoost > 0 ? "+" : ""}${s.tileBoost}`]);
  if (s.fishingPole) out.push([c.fishing, `${s.fishingPole}%`]);
  if (s.bait) out.push([c.bait, `${s.bait}%`]);
  if (s.mana) out.push([c.mana, num(s.mana)]);
  if (s.healLife) out.push([c.healLife, num(s.healLife)]);
  if (s.healMana) out.push([c.healMana, num(s.healMana)]);
  if (s.maxStack && s.maxStack > 1) out.push([c.stack, num(s.maxStack)]);
  const coins = sellCoins(s.value ?? 0);
  out.push([c.sell, coins.some(Boolean) ? coins.flatMap((n, i) => (n ? [`${n} ${t.items.coins[i]}`] : [])).join(", ") : c.noValue]);
  out.push([c.rarity, t.rarity(f.rare)]);
  return out;
}
