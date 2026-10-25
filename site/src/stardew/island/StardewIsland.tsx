/**
 * La pestaña Isla Jengibre de Stardew Valley (etapa 4, tarea 8): una pantalla con cuatro vistas elegidas por botones.
 *
 * - **Nueces doradas** (se abre en esta): arriba la cifra "N de 130" y la cuenta de cada zona; abajo una caja por zona
 *   con sus nueces para tildar. Cada fila dice cómo se consigue y cuántas da; las de caída limitada traídas de una
 *   partida pueden quedar a medias ("2 / 5"). Las de frase genérica (un arbusto o una nuez enterrada en una casilla) van
 *   juntas al pie de su zona como casilleros chicos con la casilla, así la lista no se hace kilométrica en el teléfono.
 * - **Mejoras del loro**: cada una con su precio en nueces, en el orden de las zonas, y lo que pide antes; con una
 *   partida guardada, las hechas se marcan.
 * - **Habitación de las Nueces de Qi**: lo que vende con su precio en gemas (los muebles, el sombrero y la Llave de la
 *   ciudad, sin ficha, con su dibujo y su nombre).
 * - **Pedidos de Qi**: objetivo, días y gemas; los que el juego no ofrece no salen.
 *
 * Lo tildado se guarda en el navegador (`checklist.ts`, clave `sdv-nuts-v1`) y se lee después del primer dibujo: el
 * HTML prerenderizado sale destildado y con las Nueces. Son 69 filas sin dibujo propio (la nuez de cada fila es un
 * fondo de CSS: un solo pedido): no hace falta `LazyRows`.
 */
import { useEffect, useMemo, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useStardewCopy, type IslandCopy } from "../../stardewCopy";
import { useLoad } from "../../useLoad";
import { readMarks, writeDone, type Marks } from "../checklist";
import { loadIsland, peekIsland, say } from "../data";
import { Pix } from "../mines/pix";
import { pixelScale } from "../mines/state";
import { readStoredSave } from "../save/store";
import { Box, Group, Pill, prizeSrc, SdLoading, type Nav } from "../ui";
import {
  areaAnchor,
  DEFAULT_ISLAND_VIEW,
  isGenericNut,
  ISLAND_KEY,
  ISLAND_VIEWS,
  mergeMarks,
  nutCount,
  nutGot,
  nutsFromSave,
  readIslandView,
  shownOrders,
  toggleNut,
  upgradesDone,
  upgradesInOrder,
  viewOfAnchor,
  WALNUT_ID,
  writeIslandView,
  type Area,
  type IslandData,
  type IslandView,
  type Nut,
  type ShopItem,
} from "./state";
import "../../styles/stardew-items.css";
import "../../styles/stardew-island.css";

export default function StardewIsland({ route, navigate }: { route: Route; navigate: Nav }) {
  const data = useLoad("island", () => peekIsland() ?? undefined, loadIsland);
  if (data.failed) return <SdLoading onRetry={data.retry} />;
  if (!data.value) return <SdLoading />;
  return <IslandBook data={data.value} route={route} navigate={navigate} />;
}

const scrollTo = (id: string) => window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 80);

/** Lo que se usa de la partida guardada del Lector: las nueces, lo que dice haber encontrado y el correo de todos. */
type SavedIsland = { nuts: Record<string, number>; walnuts: number; mail: string[] };

export function IslandBook({
  data,
  route,
  navigate,
  initial = DEFAULT_ISLAND_VIEW,
  initialDone = {},
}: {
  data: IslandData;
  route: Route;
  navigate: Nav;
  initial?: IslandView;
  /** Lo tildado del primer dibujo (los tests); en el navegador se lee lo guardado después. */
  initialDone?: Marks;
}) {
  const t = useStardewCopy();
  const m = t.island;
  const [view, setView] = useState<IslandView>(initial);
  const [marks, setMarks] = useState<Marks>(initialDone);
  const [saved, setSaved] = useState<SavedIsland | null>(null);
  const [synced, setSynced] = useState<number | null>(null);

  // La vista de la dirección; sin `?v=`, la del ancla (`#turtle` es una mejora). Después, la fila del ancla. Lo guardado
  // se lee acá (el HTML prerenderizado va destildado), y se sigue si otra pestaña lo cambia.
  useEffect(() => {
    const anchor = window.location.hash.slice(1);
    setView(window.location.search ? readIslandView(window.location.search) : (viewOfAnchor(data, anchor) ?? DEFAULT_ISLAND_VIEW));
    setMarks(readMarks(ISLAND_KEY));
    const s = readStoredSave();
    setSaved(s ? { nuts: s.nuts, walnuts: s.walnuts, mail: s.players.flatMap((p) => p.mail) } : null);
    const onStorage = () => setMarks(readMarks(ISLAND_KEY));
    window.addEventListener("storage", onStorage);
    const timer = anchor ? scrollTo(anchor) : undefined;
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearTimeout(timer);
    };
  }, [data]);

  const go = (v: IslandView) => {
    setView(v);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${writeIslandView(v)}`);
  };
  // Se parte del estado que se muestra (sin almacenamiento, lo guardado sería siempre `{}`) y después se guarda.
  const onTick = (nut: Nut) =>
    setMarks((prev) => {
      const next = toggleNut(prev, nut);
      writeDone(ISLAND_KEY, next);
      return next;
    });
  const onSync = () => {
    if (!saved) return;
    const next = mergeMarks(marks, nutsFromSave(saved.nuts, data));
    writeDone(ISLAND_KEY, next);
    setSynced(nutCount(data, next).found - nutCount(data, marks).found);
    setMarks(next);
  };

  return (
    <main className="sd-main sd-island">
      <Box className="sd-intro">
        <h1 className="sd-h1">{m.h1}</h1>
        <p className="sd-lede">{m.lede}</p>
        <div className="sd-filters">
          <Group label={m.view}>
            {ISLAND_VIEWS.map((v) => (
              <Pill on={view === v} onClick={() => go(v)} key={v}>
                {m.views[v]}
              </Pill>
            ))}
          </Group>
        </div>
      </Box>
      {view === "nuts" && <Nuts data={data} m={m} marks={marks} onTick={onTick} saved={saved} synced={synced} onSync={onSync} />}
      {view === "upgrades" && <Upgrades data={data} m={m} done={saved ? upgradesDone(saved.mail, data) : null} />}
      {view === "walnut-room" && <WalnutRoom data={data} m={m} route={route} navigate={navigate} />}
      {view === "qi" && <QiOrders data={data} m={m} />}
    </main>
  );
}

// --- Nueces -----------------------------------------------------------------------------------------------------

type NutsProps = { data: IslandData; m: IslandCopy; marks: Marks; onTick: (nut: Nut) => void };

function Nuts({ saved, synced, onSync, ...props }: NutsProps & { saved: SavedIsland | null; synced: number | null; onSync: () => void }) {
  const { data, m, marks } = props;
  const { lang } = useLang();
  const locale = useLocale();
  const [missing, setMissing] = useState(false);
  const count = useMemo(() => nutCount(data, marks), [data, marks]);
  const fmt = (n: number) => n.toLocaleString(locale);
  return (
    <>
      <Box className="sd-is-head">
        <div className="sd-is-top">
          <p className="sd-is-count">
            <span className="sd-is-walnut" aria-hidden="true">
              <Pix src={prizeSrc(WALNUT_ID)} w={16} h={16} k={3} lazy={false} />
            </span>
            <span className="sd-is-cwrap">
              <span className="sd-label">{m.nuts.found}</span>
              <b aria-live="polite">{m.nuts.progress(fmt(count.found), fmt(count.total))}</b>
            </span>
          </p>
          <p className="sd-muted">{m.nuts.saved}</p>
        </div>
        <div className="sd-filters">
          <Group label={m.nuts.filter}>
            <Pill on={!missing} onClick={() => setMissing(false)}>
              {m.nuts.filters.all}
            </Pill>
            <Pill on={missing} onClick={() => setMissing(true)}>
              {m.nuts.filters.missing}
            </Pill>
          </Group>
          {saved && (
            <div className="sd-is-sync">
              <button type="button" className="sd-btn" onClick={onSync}>
                {m.nuts.fromSave}
              </button>
              <span className="sd-muted" aria-live="polite">
                {synced != null ? m.nuts.synced(synced) : m.nuts.saveSays(fmt(saved.walnuts))}
              </span>
            </div>
          )}
        </div>
        <nav className="sd-is-areas" aria-label={m.nuts.areas}>
          <ul>
            {data.areas.map((a) => {
              const [f, tot] = count.byArea[a.key];
              return (
                <li key={a.key}>
                  <a href={`#${areaAnchor(a)}`} className={f >= tot ? "is-done" : undefined}>
                    <span>{say(a.name, lang)}</span>
                    <b>
                      {fmt(f)} / {fmt(tot)}
                    </b>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </Box>
      {data.areas.map((a) => (
        <AreaBox {...props} a={a} got={count.byArea[a.key]} missing={missing} key={a.key} />
      ))}
    </>
  );
}

function AreaBox({ a, got, missing, ...props }: NutsProps & { a: Area; got: [number, number]; missing: boolean }) {
  const { data, m, marks } = props;
  const { lang } = useLang();
  const locale = useLocale();
  const nuts = data.nuts.filter((n) => n.area === a.key && !(missing && nutGot(n, marks) >= n.n));
  const own = nuts.filter((n) => !isGenericNut(n));
  const generic = (["bush", "buried"] as const).map((k) => [k, nuts.filter((n) => isGenericNut(n) && n.kind === k)] as const).filter(([, l]) => l.length > 0);
  return (
    <Box className="sd-is-area" id={areaAnchor(a)}>
      <header className="sd-is-ahead">
        <h2 className="sd-h2">{say(a.name, lang)}</h2>
        <span className={`sd-is-acount${got[0] >= got[1] ? " is-done" : ""}`}>
          {got[0].toLocaleString(locale)} / {got[1].toLocaleString(locale)}
        </span>
      </header>
      {nuts.length === 0 && <p className="sd-muted">{m.nuts.areaDone}</p>}
      {own.length > 0 && (
        <ul className="sd-is-nuts">
          {own.map((n) => (
            <NutRow {...props} n={n} key={n.key} />
          ))}
        </ul>
      )}
      {generic.map(([k, list]) => (
        <div className="sd-is-gen" key={k}>
          <h3 className="sd-is-gtitle">{k === "bush" ? m.nuts.generic.bush : m.nuts.generic.buried}</h3>
          <p className="sd-muted">{k === "bush" ? m.nuts.generic.bushHint : m.nuts.generic.buriedHint}</p>
          <ul className="sd-is-tiles">
            {list.map((n) => (
              <TileChip {...props} n={n} key={n.key} />
            ))}
          </ul>
        </div>
      ))}
    </Box>
  );
}

/**
 * Las coordenadas no se cortan al final de un renglón: "(casilla 58, 11)" con espacios duros, así nunca queda "58," en
 * uno y "11)" en el otro.
 */
const keepTogether = (s: string): string => s.replace(/(\d+), (\d+)/g, "$1,\u00a0$2").replace(/\b(casilla|tile) (\d)/g, "$1\u00a0$2");

/**
 * Una nuez con frase propia: la casilla, cómo se consigue y cuántas da (o cuántas lleva, si quedó a medias). Como en el
 * inventario del juego, la que da una sola no lleva número: "×3" sólo en las que dan más.
 */
function NutRow({ n, m, marks, onTick }: NutsProps & { n: Nut }) {
  const { lang } = useLang();
  const locale = useLocale();
  const got = nutGot(n, marks);
  const on = got >= n.n;
  const part = got > 0 && !on;
  return (
    <li className={`sd-is-nut${on ? " is-on" : ""}${part ? " is-part" : ""}`} id={n.slug}>
      <button type="button" className="sd-is-tick" aria-pressed={on} onClick={() => onTick(n)}>
        <span className="sd-is-box" aria-hidden="true">
          {on ? "✓" : ""}
        </span>
        <span className="sd-is-text">{keepTogether(say(n.text, lang))}</span>
        {n.n > 1 ? (
          <span className="sd-is-n" title={m.nuts.gives(n.n)}>
            {part ? `${got.toLocaleString(locale)} / ${n.n.toLocaleString(locale)}` : `×${n.n.toLocaleString(locale)}`}
            <span className="visually-hidden"> {m.nuts.gives(n.n)}</span>
          </span>
        ) : (
          <span className="visually-hidden">{m.nuts.gives(1)}</span>
        )}
      </button>
    </li>
  );
}

/** Una nuez de frase genérica: la casilla y las coordenadas; la frase entera va de nombre del botón. */
function TileChip({ n, m, marks, onTick }: NutsProps & { n: Nut }) {
  const { lang } = useLang();
  const on = nutGot(n, marks) >= n.n;
  const [x, y] = n.tile!;
  return (
    <li className={`sd-is-tile${on ? " is-on" : ""}`} id={n.slug}>
      <button type="button" className="sd-is-tick" aria-pressed={on} aria-label={say(n.text, lang)} onClick={() => onTick(n)}>
        <span className="sd-is-box" aria-hidden="true">
          {on ? "✓" : ""}
        </span>
        <span className="sd-is-xy">{m.nuts.generic.tile(x, y)}</span>
      </button>
    </li>
  );
}

// --- Mejoras del loro -------------------------------------------------------------------------------------------

function Upgrades({ data, m, done }: { data: IslandData; m: IslandCopy; done: Set<string> | null }) {
  const { lang } = useLang();
  const locale = useLocale();
  const byKey = new Map(data.upgrades.map((u) => [u.key, u]));
  const areaName = new Map(data.areas.map((a) => [a.key, a.name]));
  const total = data.upgrades.reduce((n, u) => n + u.cost, 0);
  return (
    <Box className="sd-is-upbox">
      <h2 className="sd-h2">{m.views.upgrades}</h2>
      <p className="sd-is-sum">
        <span className="sd-is-cost is-nut">{m.upgrades.total(total.toLocaleString(locale))}</span>
      </p>
      <p className="sd-muted">
        {m.upgrades.hint}
        {done && done.size > 0 && ` ${m.upgrades.doneHint}`}
      </p>
      <ul className="sd-is-ups">
        {upgradesInOrder(data).map((u) => {
          const ok = !!done?.has(u.key);
          const needs = u.needs.map((k) => byKey.get(k)).filter((x) => !!x);
          return (
            <li className={`sd-is-up${ok ? " is-done" : ""}`} id={u.slug} key={u.key}>
              <div className="sd-is-uinfo">
                <h3 className="sd-is-uname">{say(u.name, lang)}</h3>
                <p className="sd-is-uarea">{say(areaName.get(u.area) ?? ["", ""], lang)}</p>
                {(needs.length > 0 || u.needsText) && (
                  <p className="sd-is-uneeds">
                    <span className="sd-label">{m.upgrades.first}</span>{" "}
                    {needs.map((x) => say(x.name, lang)).join(", ")}
                    {needs.length > 0 && u.needsText ? ". " : ""}
                    {u.needsText && say(u.needsText, lang)}
                  </p>
                )}
              </div>
              <div className="sd-is-uside">
                <span className="sd-is-cost is-nut">
                  {u.cost.toLocaleString(locale)}
                  <span className="visually-hidden"> {m.nuts.gives(u.cost)}</span>
                </span>
                {ok && <span className="sd-is-state">{m.upgrades.done}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </Box>
  );
}

// --- La Habitación de las Nueces de Qi --------------------------------------------------------------------------

function WalnutRoom({ data, m, route, navigate }: { data: IslandData; m: IslandCopy; route: Route; navigate: Nav }) {
  return (
    <Box className="sd-is-shopbox">
      <h2 className="sd-h2">{m.walnutRoom.title}</h2>
      <p className="sd-muted">{m.walnutRoom.hint}</p>
      <ul className="sd-is-shop">
        {data.walnutRoom.map((w) => (
          <ShopRow data={data} m={m} route={route} navigate={navigate} w={w} key={w.slug} />
        ))}
      </ul>
    </Box>
  );
}

function ShopRow({ data, m, route, navigate, w }: { data: IslandData; m: IslandCopy; route: Route; navigate: Nav; w: ShopItem }) {
  const { lang } = useLang();
  const locale = useLocale();
  const r = data.refs[w.id];
  // Con ficha, el tamaño de su dibujo sale de la referencia; sin ficha (mueble, sombrero, llave), del dato.
  const [sw, sh] = r ? [r[4], r[5]] : (w.sprite ?? [16, 16]);
  const name = say(w.name, lang);
  return (
    <li className="sd-is-item" id={w.slug}>
      <span className="sd-is-prize">
        <Pix src={prizeSrc(w.id)} w={sw} h={sh} k={pixelScale(sw, sh, 64, 64)} />
      </span>
      <div className="sd-is-iinfo">
        <p className="sd-is-iname">
          {r ? (
            <RouteLink className="sd-is-link" to={{ ...route, view: "stardew", sdSection: "items", detail: r[0] }} onNavigate={navigate} prefetch="press">
              {name}
            </RouteLink>
          ) : (
            <b>{name}</b>
          )}
          {w.recipe && <small className="sd-is-recipe">{m.walnutRoom.recipe}</small>}
        </p>
        {w.note && <p className="sd-is-note">{say(w.note, lang)}</p>}
      </div>
      {w.gems != null ? (
        <span className="sd-is-cost is-gem">
          {w.gems.toLocaleString(locale)}
          <span className="visually-hidden"> {m.walnutRoom.gems}</span>
        </span>
      ) : (
        <span className="sd-is-cost is-nut">{m.walnutRoom.walnuts(w.walnuts ?? 1)}</span>
      )}
    </li>
  );
}

// --- Pedidos de Qi ----------------------------------------------------------------------------------------------

function QiOrders({ data, m }: { data: IslandData; m: IslandCopy }) {
  const { lang } = useLang();
  const locale = useLocale();
  return (
    <Box className="sd-is-qibox">
      <h2 className="sd-h2">{m.views.qi}</h2>
      <p className="sd-muted">{m.qi.hint}</p>
      <ul className="sd-is-qi">
        {shownOrders(data).map((q) => (
          <li className="sd-is-order" id={q.slug} key={q.key}>
            <div className="sd-is-qinfo">
              <h3 className="sd-is-qname">{say(q.name, lang)}</h3>
              <p className="sd-is-goal">{say(q.goal, lang)}</p>
              <p className="sd-is-qtext">{say(q.text, lang)}</p>
            </div>
            <div className="sd-is-qside">
              <span className="sd-is-cost is-gem">
                {q.gems.toLocaleString(locale)}
                <span className="visually-hidden"> {m.walnutRoom.gems}</span>
              </span>
              <span className="sd-is-days">{m.qi.days(q.days)}</span>
            </div>
          </li>
        ))}
      </ul>
    </Box>
  );
}
