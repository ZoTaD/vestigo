/**
 * La pestaña Minas y combate de Stardew Valley (etapa 3, tarea 6): la ficha de un monstruo si la dirección trae un
 * slug, y si no (o si no existe), una pantalla con cinco vistas elegidas por botones:
 *
 * - **Pisos** (se abre en esta): una caja por zona con sus pisos, sus monstruos (sprite y nombre, enlazados a su
 *   ficha), sus minerales (a Objetos) y los cofres con su premio.
 * - **Monstruos**: la grilla de los 43 con salud, daño y experiencia y su botín en casilleros.
 * - **Armas**: la tabla de las 67, ordenable por daño, velocidad o crítico y filtrable por tipo, con dónde se consigue.
 * - **Anillos y baratijas**: casilleros con su efecto; los anillos enlazan a su ficha de Objetos.
 * - **Botas**: defensa, inmunidad y dónde se consiguen.
 *
 * La vista, el orden y el tipo viajan en la dirección (`?v=weapons&sort=crit&type=dagger`) y se leen después del primer
 * dibujo: el HTML prerenderizado sale con Pisos. Ninguna lista pasa de ~70 filas: no hace falta `LazyRows`; las
 * imágenes van `lazy` y con tamaño fijo (y los sprites pixel a múltiplos enteros de su tamaño).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useStardewCopy, type MinesCopy } from "../../stardewCopy";
import { useLoad } from "../../useLoad";
import { findMonster, loadMines, peekMines, say } from "../data";
import { Box, Gold, Group, Pill, SdLoading, Slot, type Nav } from "../ui";
import MonsterPage from "./MonsterPage";
import { GearPix, MonsterPix, pct, signed } from "./pix";
import {
  chestFloorOf,
  DEFAULT_MINES_STATE,
  gearName,
  isSlingshot,
  itemSlug,
  lootRows,
  monsterOrder,
  readMinesState,
  SORTS,
  VIEWS,
  WEAPON_TYPES,
  weaponList,
  writeMinesState,
  zoneChests,
  type GearShop,
  type MinesData,
  type MinesState,
  type Monster,
  type WeaponType,
} from "./state";
import "../../styles/stardew-items.css";
import "../../styles/stardew-mines.css";

export default function StardewMines({ route, navigate }: { route: Route; navigate: Nav }) {
  const data = useLoad("mines", () => peekMines() ?? undefined, loadMines);
  if (data.failed) return <SdLoading onRetry={data.retry} />;
  if (!data.value) return <SdLoading />;
  const monster = route.detail ? findMonster(data.value, route.detail) : undefined;
  if (monster) return <MonsterPage data={data.value} monster={monster} route={route} navigate={navigate} key={monster.key} />;
  // Un monstruo que no existe: la grilla de Monstruos, con el aviso ("estos son todos").
  if (route.detail) return <MinesBook data={data.value} route={route} navigate={navigate} missing initial={{ ...DEFAULT_MINES_STATE, view: "monsters" }} />;
  return <MinesBook data={data.value} route={route} navigate={navigate} />;
}

/** Dónde se consigue un arma o unas botas: la tienda (precio y desde cuándo), el cofre del piso y los pisos donde sale. */
function WhereList({ data, id, shop, floors, m }: { data: MinesData; id: string; shop: GearShop | null; floors?: [number, number] | null; m: MinesCopy }) {
  const { lang } = useLang();
  const chest = chestFloorOf(data, id);
  const parts: ReactNode[] = [];
  if (shop)
    parts.push(
      <li key="shop">
        <b>{say(shop.shop, lang)}</b> <Gold n={shop.price} /> <small>{shop.needs === "galaxySword" ? m.weapons.galaxy : m.weapons.shop(shop.floor)}</small>
      </li>,
    );
  if (chest != null) parts.push(<li key="chest">{m.weapons.chest(chest)}</li>);
  if (floors) parts.push(<li key="floors">{m.weapons.nearFloor(floors[0], floors[1] > 0 ? floors[1] : null)}</li>);
  if (!parts.length) parts.push(<li key="other" className="is-other">{m.weapons.other}</li>);
  return <ul className="sd-mn-where">{parts}</ul>;
}

export function MinesBook({ data, route, navigate, missing = false, initial = DEFAULT_MINES_STATE }: { data: MinesData; route: Route; navigate: Nav; missing?: boolean; initial?: MinesState }) {
  const t = useStardewCopy();
  const m = t.mines;
  const [state, setState] = useState<MinesState>(initial);
  useEffect(() => {
    if (window.location.search) setState(readMinesState(window.location.search));
  }, []);
  // Sobre el estado de ese momento, y la dirección al día con lo elegido.
  const pick = (patch: Partial<MinesState>) =>
    setState((prev) => {
      const next = { ...prev, ...patch };
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${writeMinesState(next)}`);
      return next;
    });

  return (
    <main className="sd-main sd-mines">
      <Box className="sd-intro">
        <h1 className="sd-h1">{m.h1}</h1>
        <p className="sd-lede">{m.lede}</p>
        {missing && (
          <p className="sd-note" role="status">
            {m.monster.missing}
          </p>
        )}
        <div className="sd-filters">
          <Group label={m.view}>
            {VIEWS.map((v) => (
              <Pill on={state.view === v} onClick={() => pick({ view: v })} key={v}>
                {m.views[v]}
              </Pill>
            ))}
          </Group>
        </div>
      </Box>
      {state.view === "floors" && <Floors data={data} route={route} navigate={navigate} />}
      {state.view === "monsters" && <Monsters data={data} route={route} navigate={navigate} />}
      {state.view === "weapons" && <Weapons data={data} state={state} pick={pick} />}
      {state.view === "gear" && <Gear data={data} route={route} navigate={navigate} />}
      {state.view === "boots" && <BootsTable data={data} />}
    </main>
  );
}

/** Un monstruo como ficha chica: su sprite en una caja fija y el nombre, enlazado a su ficha. */
function MonsterChip({ m, route, navigate }: { m: Monster; route: Route; navigate: Nav }) {
  const { lang } = useLang();
  return (
    <RouteLink className="sd-mn-chip" to={{ ...route, view: "stardew", sdSection: "mines", detail: m.slug }} onNavigate={navigate} prefetch="press">
      <span className="sd-mn-pix">
        <MonsterPix m={m} box={64} boxH={72} />
      </span>
      <span>{say(m.name, lang)}</span>
    </RouteLink>
  );
}

/** Un objeto de las listas (mineral, premio): casillero con su sprite y el nombre, enlazado a Objetos si tiene ficha. */
function ItemCell({ data, id, route, navigate, small }: { data: MinesData; id: string; route: Route; navigate: Nav; small?: boolean }) {
  const { lang } = useLang();
  const slug = itemSlug(data, id);
  const body = (
    <>
      <Slot>
        <GearPix id={id} box={small ? 32 : 40} />
      </Slot>
      <span>{gearName(data, id, lang)}</span>
    </>
  );
  return slug ? (
    <RouteLink className="sd-mn-item" to={{ ...route, view: "stardew", sdSection: "items", detail: slug }} onNavigate={navigate} prefetch="press">
      {body}
    </RouteLink>
  ) : (
    <span className="sd-mn-item">{body}</span>
  );
}

function Floors({ data, route, navigate }: { data: MinesData; route: Route; navigate: Nav }) {
  const t = useStardewCopy();
  const m = t.mines;
  const { lang } = useLang();
  const byKey = useMemo(() => new Map(data.monsters.map((x) => [x.key, x])), [data]);
  return (
    <>
      <p className="sd-mn-elevator">{m.elevator(data.elevator.every, data.elevator.last)}</p>
      {data.zones.map((z) => {
        const mons = z.monsters.map((k) => byKey.get(k)).filter((x): x is Monster => !!x);
        const chests = zoneChests(data, z);
        return (
          <Box className="sd-mn-zone" data-zone={z.key} key={z.key}>
            <header className="sd-mn-zhead">
              <h2 className="sd-h2">{say(z.name, lang)}</h2>
              <span className="sd-mn-floors">{z.floors ? m.floors(z.floors[0], z.floors[1]) : m.noFloors}</span>
            </header>
            {z.note && <p className="sd-mn-note">{say(z.note, lang)}</p>}
            <h3 className="sd-h3">{m.monsters}</h3>
            {mons.length > 0 ? (
              <ul className="sd-mn-chips">
                {mons.map((x) => (
                  <li key={x.key}>
                    <MonsterChip m={x} route={route} navigate={navigate} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sd-muted">{m.usualMonsters}</p>
            )}
            {z.ores.length > 0 && (
              <>
                <h3 className="sd-h3">{m.ores}</h3>
                <ul className="sd-mn-items">
                  {z.ores.map((id) => (
                    <li key={id}>
                      <ItemCell data={data} id={id} route={route} navigate={navigate} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            {chests.length > 0 && (
              <>
                <h3 className="sd-h3">{m.chests}</h3>
                <ul className="sd-mn-chests">
                  {chests.map((c) => (
                    <li className="sd-mn-chest" data-floor={c.floor} key={c.floor}>
                      <span className="sd-mn-cfloor">{m.chestFloor(c.floor)}</span>
                      <ItemCell data={data} id={c.item} route={route} navigate={navigate} />
                      {c.remixed && (
                        <span className="sd-mn-remix">
                          <small>{m.remixed}</small>
                          <span className="sd-mn-rlist">
                            {c.remixed.map((id) => (
                              <span className="sd-mn-rslot" title={gearName(data, id, lang)} key={id}>
                                <GearPix id={id} box={32} />
                                <span className="visually-hidden">{gearName(data, id, lang)}</span>
                              </span>
                            ))}
                          </span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Box>
        );
      })}
    </>
  );
}

/** Las tres cifras de un monstruo: salud, daño y experiencia. */
function MonsterStats({ x, m }: { x: Monster; m: MinesCopy }) {
  const locale = useLocale();
  return (
    <dl className="sd-mn-stats">
      <div>
        <dt>{m.stats.hp}</dt>
        <dd>{x.hp.toLocaleString(locale)}</dd>
      </div>
      <div>
        <dt>{m.stats.dmg}</dt>
        <dd>{x.dmg.toLocaleString(locale)}</dd>
      </div>
      <div>
        <dt>{m.stats.xp}</dt>
        <dd>{x.xp.toLocaleString(locale)}</dd>
      </div>
    </dl>
  );
}

function Monsters({ data, route, navigate }: { data: MinesData; route: Route; navigate: Nav }) {
  const t = useStardewCopy();
  const m = t.mines;
  const { lang } = useLang();
  const locale = useLocale();
  const list = useMemo(() => monsterOrder(data), [data]);
  return (
    <Box className="sd-mn-roster">
      <h2 className="visually-hidden">{m.views.monsters}</h2>
      <p className="sd-count">{m.monstersCount(list.length.toLocaleString(locale))}</p>
      <ul className="sd-mn-grid">
        {list.map((x) => (
          <li className="sd-mn-card" data-monster={x.slug} key={x.key}>
            <RouteLink className="sd-mn-chead" to={{ ...route, view: "stardew", sdSection: "mines", detail: x.slug }} onNavigate={navigate} prefetch="press">
              <span className="sd-mn-pix">
                <MonsterPix m={x} box={64} boxH={72} />
              </span>
              <span className="sd-mn-cname">
                <b>{say(x.name, lang)}</b>
              </span>
            </RouteLink>
            <MonsterStats x={x} m={m} />
            <span className="sd-label">{m.loot}</span>
            {x.loot.length ? (
              <ul className="sd-mn-loot">
                {lootRows(x).map(([id, p, n]) => {
                  const slug = itemSlug(data, id);
                  // El nombre, la probabilidad de al menos uno y, si sale en varias tiradas, hasta cuántos.
                  const name = `${gearName(data, id, lang)} · ${pct(p, locale)}${n > 1 ? ` · ${m.upTo(n)}` : ""}`;
                  const body = (
                    <>
                      <span className="sd-mn-dslot">
                        <GearPix id={id} box={32} />
                        {n > 1 && <i className="sd-mn-upto">≤{n}</i>}
                      </span>
                      <small>{pct(p, locale)}</small>
                    </>
                  );
                  return (
                    <li key={id}>
                      {slug ? (
                        <RouteLink className="sd-mn-drop" to={{ ...route, view: "stardew", sdSection: "items", detail: slug }} onNavigate={navigate} prefetch="press" title={name} aria-label={name}>
                          {body}
                        </RouteLink>
                      ) : (
                        <span className="sd-mn-drop" title={name}>
                          {body}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="sd-muted">{m.noLoot}</p>
            )}
          </li>
        ))}
      </ul>
    </Box>
  );
}

function Weapons({ data, state, pick }: { data: MinesData; state: MinesState; pick: (p: Partial<MinesState>) => void }) {
  const t = useStardewCopy();
  const m = t.mines;
  const w = m.weapons;
  const { lang } = useLang();
  const locale = useLocale();
  const rows = useMemo(() => weaponList(data, state.sort, state.type, lang), [data, state.sort, state.type, lang]);
  return (
    <Box className="sd-mn-weapons">
      <h2 className="sd-h2">{m.views.weapons}</h2>
      <div className="sd-filters">
        <Group label={w.sortBy}>
          {SORTS.map((s) => (
            <Pill on={state.sort === s} onClick={() => pick({ sort: s })} key={s}>
              {w.sorts[s]}
            </Pill>
          ))}
        </Group>
        <Group label={w.type}>
          {(Object.keys(WEAPON_TYPES) as WeaponType[]).map((k) => (
            <Pill on={state.type === k} onClick={() => pick({ type: k })} key={k}>
              {w.types[k]}
            </Pill>
          ))}
        </Group>
        <p className="sd-count" aria-live="polite">
          {w.count(rows.length.toLocaleString(locale))}
        </p>
      </div>
      <table className="sd-mn-table">
        <thead>
          <tr>
            <th scope="col">{w.cols.weapon}</th>
            <th scope="col" className="c-num" aria-sort={state.sort === "dmg" ? "descending" : undefined}>
              {w.cols.damage}
            </th>
            <th scope="col" className="c-num" aria-sort={state.sort === "speed" ? "descending" : undefined}>
              {w.cols.speed}
            </th>
            <th scope="col" className="c-num" aria-sort={state.sort === "crit" ? "descending" : undefined}>
              {w.cols.crit}
            </th>
            <th scope="col">{w.cols.where}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr data-weapon={x.slug} key={x.id}>
              <th scope="row" className="c-name">
                <span className="sd-mn-wname">
                  <span className="sd-mn-wpix">
                    <GearPix id={x.id} box={32} />
                  </span>
                  <span>
                    <b>{say(x.name, lang)}</b>
                    <small>{say(x.typeName, lang)}</small>
                  </span>
                </span>
              </th>
              <td className="c-num c-dmg" data-label={w.cols.damage}>
                {isSlingshot(x) ? (
                  <span className="sd-muted">{w.ammo}</span>
                ) : (
                  <>
                    {x.dmg[0].toLocaleString(locale)}–{x.dmg[1].toLocaleString(locale)}
                  </>
                )}
              </td>
              <td className="c-num" data-label={w.cols.speed}>
                {isSlingshot(x) ? "—" : signed(x.speed, locale)}
              </td>
              <td className="c-num" data-label={w.cols.crit}>
                {pct(x.crit[0], locale)} <small>{w.critMult(x.crit[1].toLocaleString(locale))}</small>
              </td>
              <td className="c-where" data-label={w.cols.where}>
                <WhereList data={data} id={x.id} shop={x.shop} floors={x.floors} m={m} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}

/**
 * La descripción de una baratija con sus números: cada una sale con los suyos (el nivel de la rana, cada cuántos
 * segundos dispara), así que el texto del juego trae `{0}`; acá van como "X" (y "X–Y" un rango), y el rótulo lo explica.
 */
export const trinketText = (s: string): string => s.replace(/\{\d+\}\s*-\s*\{\d+\}/g, "X–Y").replace(/\{\d+\}/g, "X");

function Gear({ data, route, navigate }: { data: MinesData; route: Route; navigate: Nav }) {
  const t = useStardewCopy();
  const g = t.mines.gear;
  const { lang } = useLang();
  const rings = useMemo(() => [...data.rings].sort((a, b) => say(a.name, lang).localeCompare(say(b.name, lang), lang)), [data, lang]);
  return (
    <>
      <Box className="sd-mn-gear">
        <h2 className="sd-h2">{g.rings}</h2>
        <p className="sd-muted">{g.ringsHint}</p>
        <ul className="sd-mn-ggrid">
          {rings.map((r) => (
            <li key={r.id}>
              <RouteLink className="sd-mn-gcard" to={{ ...route, view: "stardew", sdSection: "items", detail: r.slug }} onNavigate={navigate} prefetch="press">
                <Slot>
                  <GearPix id={r.id} box={48} />
                </Slot>
                <span>
                  <b>{say(r.name, lang)}</b>
                  {/* El Anillo combinado trae "..." de descripción: sin texto, mejor nada. */}
                  {/\w/.test(say(r.desc, lang)) && <small>{say(r.desc, lang)}</small>}
                </span>
              </RouteLink>
            </li>
          ))}
        </ul>
      </Box>
      <Box className="sd-mn-gear">
        <h2 className="sd-h2">{g.trinkets}</h2>
        <p className="sd-muted">{g.trinketsHint}</p>
        <ul className="sd-mn-ggrid">
          {data.trinkets.map((x) => (
            <li key={x.id}>
              <span className="sd-mn-gcard">
                <Slot>
                  <GearPix id={x.id} box={48} />
                </Slot>
                <span>
                  <b>{say(x.name, lang)}</b>
                  <small>{trinketText(say(x.desc, lang))}</small>
                  <span className={`sd-mn-tag${x.drops ? " is-drop" : ""}`}>{x.drops ? g.drops : g.noDrops}</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Box>
    </>
  );
}

function BootsTable({ data }: { data: MinesData }) {
  const t = useStardewCopy();
  const m = t.mines;
  const c = m.boots.cols;
  const { lang } = useLang();
  const locale = useLocale();
  // De la que más protege a la que menos: defensa más inmunidad, y por nombre.
  const rows = useMemo(
    () => [...data.boots].sort((a, b) => b.defense + b.immunity - (a.defense + a.immunity) || say(a.name, lang).localeCompare(say(b.name, lang), lang)),
    [data, lang],
  );
  return (
    <Box className="sd-mn-boots">
      <h2 className="sd-h2">{m.views.boots}</h2>
      <table className="sd-mn-table">
        <thead>
          <tr>
            <th scope="col">{c.boots}</th>
            <th scope="col" className="c-num">
              {c.defense}
            </th>
            <th scope="col" className="c-num">
              {c.immunity}
            </th>
            <th scope="col">{c.where}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr data-boots={b.id} key={b.id}>
              <th scope="row" className="c-name">
                <span className="sd-mn-wname">
                  <span className="sd-mn-wpix">
                    <GearPix id={b.id} box={32} />
                  </span>
                  <span>
                    <b>{say(b.name, lang)}</b>
                    <small>{say(b.desc, lang)}</small>
                  </span>
                </span>
              </th>
              <td className="c-num" data-label={c.defense}>
                {b.defense.toLocaleString(locale)}
              </td>
              <td className="c-num" data-label={c.immunity}>
                {b.immunity.toLocaleString(locale)}
              </td>
              <td className="c-where" data-label={c.where}>
                <WhereList data={data} id={b.id} shop={b.shop} m={m} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}
