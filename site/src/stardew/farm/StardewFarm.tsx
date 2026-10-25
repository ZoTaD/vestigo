/**
 * La pestaña Granja de Stardew Valley (etapa 4, tarea 6): una pantalla con tres vistas elegidas por botones.
 *
 * - **Animales** (se abre en esta): una caja por edificio (el corral, el establo) con cada animal: adulto y cría,
 *   precio de Marnie o de dónde sale, días para crecer, cada cuántos días produce, con qué se cosecha, lo que da (lo
 *   de lujo aparte) en casilleros enlazados a Objetos y en qué máquina se procesa cada producto. Abajo, los cuidados.
 * - **Edificios**: los de Robin y los del mago por separado, con su dibujo, costo, materiales, días de obra, de cuál
 *   son mejora (y lo que cuesta la cadena desde cero) y qué animales entran. La cabaña del multijugador va aparte.
 * - **Casa**: las tres mejoras de la casa y las reformas con su precio.
 *
 * La vista viaja en la dirección (`?v=buildings`) y se lee después del primer dibujo: el HTML prerenderizado sale con
 * Animales. Cada fila tiene un `id` con el slug de su clave del juego, y un enlace con ancla (`#coop`) abre la vista
 * donde está. Ninguna lista pasa de ~25 filas: no hace falta `LazyRows`; las imágenes van `lazy`, con tamaño fijo y a
 * un múltiplo entero de su tamaño.
 */
import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import { routePath, type Route } from "../../route";
import { useStardewCopy, type FarmCopy } from "../../stardewCopy";
import { useLoad } from "../../useLoad";
import { loadFarm, peekFarm, say } from "../data";
import { Pix } from "../mines/pix";
import { pixelScale } from "../mines/state";
import { Box, Gold, Group, Pill, SdLoading, Slot, Sprite, type Nav } from "../ui";
import {
  animalsByHouse,
  buildingChain,
  buildingsOf,
  DEFAULT_FARM_VIEW,
  FARM_VIEWS,
  maxSellPrice,
  MULTIPLAYER,
  residents,
  readFarmView,
  viewOfAnchor,
  writeFarmView,
  type Animal,
  type Building,
  type FarmData,
  type FarmView,
} from "./state";
import "../../styles/stardew-items.css";
import "../../styles/stardew-farm.css";

export default function StardewFarm({ route, navigate }: { route: Route; navigate: Nav }) {
  const data = useLoad("farm", () => peekFarm() ?? undefined, loadFarm);
  if (data.failed) return <SdLoading onRetry={data.retry} />;
  if (!data.value) return <SdLoading />;
  return <FarmBook data={data.value} route={route} navigate={navigate} />;
}

/** Abre la vista y lleva a una fila: la dirección queda con la vista y el ancla, y el scroll espera el dibujo nuevo. */
type Go = (view: FarmView, anchor?: string) => void;

const scrollTo = (id: string) => window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 80);

export function FarmBook({ data, route, navigate, initial = DEFAULT_FARM_VIEW }: { data: FarmData; route: Route; navigate: Nav; initial?: FarmView }) {
  const t = useStardewCopy();
  const f = t.farm;
  const [view, setView] = useState<FarmView>(initial);
  // La vista de la dirección; sin `?v=`, la del ancla (`#coop` es un edificio). Después, la fila del ancla.
  useEffect(() => {
    const anchor = window.location.hash.slice(1);
    // Sólo `?v=` elige la vista: otra cosa en la dirección (`?utm_…`) no le gana al ancla.
    const search = window.location.search;
    const v = new URLSearchParams(search).has("v") ? readFarmView(search) : (viewOfAnchor(data, anchor) ?? DEFAULT_FARM_VIEW);
    setView(v);
    if (!anchor) return;
    const timer = scrollTo(anchor);
    return () => window.clearTimeout(timer);
  }, [data]);
  const go: Go = (v, anchor) => {
    setView(v);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${writeFarmView(v)}${anchor ? `#${anchor}` : ""}`);
    if (anchor) scrollTo(anchor);
  };

  return (
    <main className="sd-main sd-farm">
      <Box className="sd-intro">
        <h1 className="sd-h1">{f.h1}</h1>
        <p className="sd-lede">{f.lede}</p>
        <div className="sd-filters">
          <Group label={f.view}>
            {FARM_VIEWS.map((v) => (
              <Pill on={view === v} onClick={() => go(v)} key={v}>
                {f.views[v]}
              </Pill>
            ))}
          </Group>
        </div>
      </Box>
      {view === "animals" && <Animals data={data} route={route} navigate={navigate} f={f} />}
      {view === "buildings" && <Buildings data={data} route={route} navigate={navigate} f={f} go={go} />}
      {view === "house" && <House data={data} route={route} navigate={navigate} f={f} />}
    </main>
  );
}

type Props = { data: FarmData; route: Route; navigate: Nav; f: FarmCopy };

/** Un objeto (producto, material, máquina): casillero con su sprite y el nombre, enlazado a su ficha de Objetos. */
function ItemCell({ data, id, route, navigate, n, small }: Omit<Props, "f"> & { id: string; n?: number; small?: boolean }) {
  const { lang } = useLang();
  const locale = useLocale();
  const r = data.refs[id];
  const name = r ? (lang === "es" && r[3]) || r[2] : id;
  const body = (
    <>
      <Slot>{r && <Sprite id={id} w={r[4]} h={r[5]} size={small ? 32 : 40} />}</Slot>
      <span>
        <b>{name}</b>
        {n != null && <small>× {n.toLocaleString(locale)}</small>}
      </span>
    </>
  );
  const cls = `sd-fm-item${small ? " is-small" : ""}`;
  return r ? (
    <RouteLink className={cls} to={{ ...route, view: "stardew", sdSection: "items", detail: r[0] }} onNavigate={navigate} prefetch="press">
      {body}
    </RouteLink>
  ) : (
    <span className={cls}>{body}</span>
  );
}

/** El sprite de un animal (adulto o cría) lo más grande que entre en una caja de `box` px. */
function AnimalPix({ a, baby, box }: { a: Animal; baby?: boolean; box: number }) {
  const [w, h] = a.sprite;
  return <Pix src={`/stardew/animals/${a.slug}${baby ? "-baby" : ""}.png`} w={w} h={h} k={pixelScale(w, h, box, box)} />;
}

/**
 * El dibujo de un edificio. Los atributos van a 1× (el tamaño del archivo) y el CSS lo agranda al doble con `--w`/`--h`
 * (los más grandes miden 112×128: 224×256 en pantalla); en el teléfono queda a 1×. Siempre un múltiplo entero.
 */
function BuildingPix({ b }: { b: Building }) {
  const [w, h] = b.sprite;
  return (
    <span className="sd-fm-bimg" style={{ "--w": `${w}px`, "--h": `${h}px` } as CSSProperties}>
      <Pix src={`/stardew/buildings/${b.slug}.png`} w={w} h={h} k={1} />
    </span>
  );
}

// --- Animales ---------------------------------------------------------------------------------------------------

function Animals(props: Props) {
  const { data } = props;
  const { lang } = useLang();
  const groups = useMemo(() => animalsByHouse(data), [data]);
  const houseName = (key: string) => {
    const b = data.buildings.find((x) => x.key === key);
    return b ? say(b.name, lang) : key;
  };
  return (
    <>
      {groups.map(([house, list]) => (
        <Box className="sd-fm-group" data-house={house} key={house}>
          <h2 className="sd-h2">{houseName(house)}</h2>
          <ul className="sd-fm-animals">
            {list.map((a) => (
              <AnimalCard {...props} a={a} key={a.key} />
            ))}
          </ul>
        </Box>
      ))}
      <CareBox {...props} />
    </>
  );
}

function AnimalCard({ a, ...props }: Props & { a: Animal }) {
  const { data, f } = props;
  const c = f.animals;
  const { lang } = useLang();
  const locale = useLocale();
  const needs = a.needs ? data.buildings.find((b) => b.key === a.needs) : undefined;
  const harvest = a.tool === "pail" || a.tool === "shears" ? say(data.tools[a.tool], lang) : a.tool === "dig" ? c.dig : c.floor;
  return (
    <li className="sd-fm-animal" id={a.slug}>
      <div className="sd-fm-ahead">
        <figure className="sd-fm-apix is-adult">
          <AnimalPix a={a} box={96} />
          {a.baby && <figcaption>{c.adult}</figcaption>}
        </figure>
        {a.baby && (
          <figure className="sd-fm-apix is-baby">
            <AnimalPix a={a} baby box={64} />
            <figcaption>{c.baby}</figcaption>
          </figure>
        )}
        <div className="sd-fm-aname">
          <h3>{say(a.name, lang)}</h3>
          {a.price != null ? (
            <span className="sd-fm-price">
              <Gold n={a.price} />
              {needs && <small>{c.needs(say(needs.name, lang))}</small>}
            </span>
          ) : (
            <span className="sd-fm-price is-none">
              {c.notSold}
              {needs && <small>{c.needs(say(needs.name, lang))}</small>}
            </span>
          )}
        </div>
      </div>
      {a.from && <p className="sd-fm-from">{say(a.from, lang)}</p>}
      <dl className="sd-fm-stats">
        <div>
          <dt>{c.stats.grows}</dt>
          <dd>{c.grows(a.mature)}</dd>
        </div>
        <div>
          <dt>{c.stats.every}</dt>
          <dd>{c.every(a.every)}</dd>
        </div>
        <div>
          <dt>{c.stats.harvest}</dt>
          <dd>{harvest}</dd>
        </div>
        <div>
          <dt>{c.stats.sell}</dt>
          <dd>
            {c.upTo} <Gold n={maxSellPrice(a)} />
          </dd>
        </div>
      </dl>
      <span className="sd-label">{c.produce}</span>
      <ul className="sd-fm-produce">
        {a.produce.map((p) => (
          <li key={`${p.id}-${p.deluxe}`}>
            <div className="sd-fm-prow">
              <ItemCell {...props} id={p.id} />
              {p.deluxe && (
                <span className="sd-fm-deluxe">
                  {c.deluxe}
                  {p.minFriendship > 0 && <small>{c.friendship(p.minFriendship.toLocaleString(locale))}</small>}
                </span>
              )}
            </div>
            {(data.process[p.id] ?? []).map(([machine, out, , , n]) => (
              <div className="sd-fm-flow" key={machine}>
                <span className="sd-fm-in">{c.machine}</span>
                <ItemCell {...props} id={machine} small />
                {/* La flecha baja junto con lo que sale, nunca sola al final del renglón. */}
                <span className="sd-fm-out">
                  <span className="sd-fm-arrow" aria-hidden="true">
                    →
                  </span>
                  <ItemCell {...props} id={out} n={n > 1 ? n : undefined} small />
                </span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </li>
  );
}

function CareBox({ data, f }: Props) {
  const { lang } = useLang();
  return (
    <Box className="sd-fm-care">
      <h2 className="sd-h2">{f.care.title}</h2>
      <p className="sd-muted">{f.care.hint}</p>
      <ul className="sd-fm-crows">
        {data.care.map((c) => (
          <li key={c.key} data-care={c.key}>
            <span className={`sd-fm-cval${c.value.startsWith("+") ? " is-up" : c.value.startsWith("±") ? "" : " is-down"}`}>{c.value}</span>
            <span>
              <small>{f.care.stats[c.stat]}</small>
              {say(c.text, lang)}
            </span>
          </li>
        ))}
      </ul>
    </Box>
  );
}

// --- Edificios --------------------------------------------------------------------------------------------------

function Buildings(props: Props & { go: Go }) {
  const { data, f } = props;
  const b = f.buildings;
  const robin = useMemo(() => buildingsOf(data, "Robin"), [data]);
  const wizard = useMemo(() => buildingsOf(data, "Wizard"), [data]);
  const cabin = data.buildings.find((x) => x.key === MULTIPLAYER);
  return (
    <>
      <Box className="sd-fm-builder" data-builder="Robin">
        <h2 className="sd-h2">{b.robin}</h2>
        <p className="sd-muted">{b.robinHint}</p>
        <ul className="sd-fm-buildings">
          {robin.map((x) => (
            <BuildingCard {...props} b={x} key={x.key} />
          ))}
        </ul>
        {cabin && (
          <section className="sd-fm-multi">
            <h3 className="sd-h3">{b.multiplayer}</h3>
            <ul className="sd-fm-buildings">
              <BuildingCard {...props} b={cabin} note={b.multiplayerNote} />
            </ul>
          </section>
        )}
      </Box>
      <Box className="sd-fm-builder" data-builder="Wizard">
        <h2 className="sd-h2">{b.wizard}</h2>
        <p className="sd-muted">{b.wizardHint}</p>
        <ul className="sd-fm-buildings">
          {wizard.map((x) => (
            <BuildingCard {...props} b={x} key={x.key} />
          ))}
        </ul>
      </Box>
    </>
  );
}

function BuildingCard({ b, note, go, ...props }: Props & { b: Building; note?: string; go: Go }) {
  const { data, f } = props;
  const c = f.buildings;
  const { lang } = useLang();
  const chain = useMemo(() => buildingChain(data, b.key), [data, b.key]);
  const base = b.upgradeOf ? data.buildings.find((x) => x.key === b.upgradeOf) : undefined;
  const animals = useMemo(() => residents(data, b.key), [data, b.key]);
  const toAnimal = (a: Animal) => (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go("animals", a.slug);
  };
  return (
    <li className="sd-fm-building" id={b.slug} data-building={b.key}>
      <div className="sd-fm-bwrap">
        <div className="sd-fm-bpix">
          <BuildingPix b={b} />
        </div>
        <div className="sd-fm-binfo">
          <h3>{say(b.name, lang)}</h3>
          {note && <p className="sd-fm-bnote">{note}</p>}
          <p className="sd-fm-desc">{say(b.desc, lang)}</p>
          <p className="sd-fm-bstats">
            <span className="sd-fm-cost">
              <small>{c.cost}</small> <Gold n={b.cost} />
            </span>
            <span>{c.days(b.days)}</span>
            <span>{c.size(b.size[0], b.size[1])}</span>
          </p>
          {base && (
            <p className="sd-fm-chain">
              <span>{c.upgradeOf(say(base.name, lang))}</span>
              <span>
                {c.total}: <Gold n={chain[chain.length - 1].total} />
              </span>
            </p>
          )}
          <span className="sd-label">{c.materials}</span>
          {b.materials.length ? (
            <ul className="sd-fm-mats">
              {b.materials.map(([id, n]) => (
                <li key={id}>
                  <ItemCell {...props} id={id} n={n} small />
                </li>
              ))}
            </ul>
          ) : (
            <p className="sd-muted">{c.onlyGold}</p>
          )}
          {animals.length > 0 && (
            <>
              <span className="sd-label">{c.houses}</span>
              <ul className="sd-fm-who">
                {animals.map((a) => (
                  <li key={a.key}>
                    <a href={`${routePath(props.route)}#${a.slug}`} onClick={toAnimal(a)} title={say(a.name, lang)} aria-label={say(a.name, lang)}>
                      <AnimalPix a={a} box={32} />
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

// --- La casa ----------------------------------------------------------------------------------------------------

function House(props: Props) {
  const { data, f } = props;
  const h = f.house;
  const { lang } = useLang();
  const { upgrades, renovations } = data.house;
  const total = upgrades.reduce((n, u) => n + u.cost, 0);
  return (
    <>
      <Box className="sd-fm-house">
        <h2 className="sd-h2">{h.upgrades}</h2>
        <p className="sd-muted">{h.upgradesHint}</p>
        <ol className="sd-fm-ups">
          {upgrades.map((u) => (
            <li className="sd-fm-up" id={`upgrade-${u.level}`} key={u.level}>
              <span className="sd-fm-level">{h.level(u.level)}</span>
              <span className="sd-fm-adds">{say(u.adds, lang)}</span>
              <span className="sd-fm-ucost">
                <Gold n={u.cost} />
                {/* Los materiales en su columna, aunque falten (la tercera es sólo oro): así las cifras quedan alineadas. */}
                <span className="sd-fm-umats">
                  {u.materials.map(([id, n]) => (
                    <ItemCell {...props} id={id} n={n} small key={id} />
                  ))}
                </span>
              </span>
              <small className="sd-fm-udays">{f.buildings.days(u.days)}</small>
            </li>
          ))}
        </ol>
        <p className="sd-fm-total">
          {h.total}: <Gold n={total} />
        </p>
      </Box>
      <Box className="sd-fm-house">
        <h2 className="sd-h2">{h.renovations}</h2>
        <p className="sd-muted">{h.renovationsHint}</p>
        <ul className="sd-fm-renos">
          {renovations.map((r) => (
            <li className="sd-fm-reno" id={r.slug} key={r.key}>
              <span>
                <b>{say(r.name, lang)}</b>
                <small>{say(r.desc, lang)}</small>
              </span>
              <span className="sd-fm-rprice">{r.price > 0 ? <Gold n={r.price} /> : h.free}</span>
            </li>
          ))}
        </ul>
      </Box>
    </>
  );
}
