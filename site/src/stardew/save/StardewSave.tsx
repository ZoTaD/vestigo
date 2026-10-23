/**
 * La pestaña Lector de partida de Stardew Valley (etapa 3, tarea 5).
 *
 * Sin partida (y en el prerender) es una caja del menú para soltar o elegir el archivo, con dónde está en cada sistema
 * y la línea que dice que el archivo se lee en el navegador: es lo que indexa Google. El archivo nunca sale de acá: se
 * lee con `File.text()`, se pasa por `parseSave` y se guarda sólo la partida ya leída (`store.ts`), con un botón para
 * olvidarla. Al volver se muestra la guardada sin pedir el archivo de nuevo (se lee después del primer dibujo, así el
 * HTML prerenderizado es siempre la caja vacía).
 *
 * Con partida: arriba la granja, el día y el granjero (botones si hay invitados); después, en cajas, Hoy (los consejos
 * de `today`), Perfección (la cifra y una fila por parte; al abrirla, lo que falta), Regalos de la semana, Centro
 * Comunitario (con el botón que pasa lo hecho al checklist de esa pestaña) y los Peces y Recetas que faltan. La
 * perfección es de la granja; los regalos, las recetas, los peces y los consejos, del granjero elegido.
 *
 * Los datos (los mismos archivos de las otras pestañas, más `save.json`) se piden recién con una partida. Las listas
 * que pueden pasar de ~150 casilleros van con `LazyRows`, y lo que falta de cada parte de la perfección se dibuja
 * recién al abrirla: así una partida recién empezada (donde falta todo) no llena la página de nodos.
 */
import { Component, useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { useLang, useLocale } from "../../i18n";
import { LazyRows } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { QUALITIES, useStardewCopy, type SaveCopy } from "../../stardewCopy";
import { useLoad } from "../../useLoad";
import { qualityIndex, roomAnchor } from "../bundles/progress";
import { loadSaveBundle, peekSaveBundle, say, type Lang, type Row, type SaveBundle, type Villager } from "../data";
import { Box, Gold, Group, Pill, Slot, Sprite, type Nav } from "../ui";
import { normId, type Player, type Save } from "./parse";
import { bundleStatus, missingFish, missingRecipes, perfection, today, weekGifts, type BundleItem, type Part, type Tip } from "./progress";
import { forgetSave, isOldVersion, readSaveFile, readStoredSave, storeSave, syncChecklist, type ReadError } from "./store";
import "../../styles/stardew-items.css";
import "../../styles/stardew-bundles.css";
import "../../styles/stardew-save.css";

type Screen = { kind: "empty" } | { kind: "reading" } | { kind: "error"; error: ReadError } | { kind: "save"; save: Save };

export default function StardewSave({ route, navigate }: { route: Route; navigate: Nav }) {
  const [screen, setScreen] = useState<Screen>({ kind: "empty" });
  // La partida guardada se lee después del primer dibujo: el HTML prerenderizado es la caja vacía.
  useEffect(() => {
    const stored = readStoredSave();
    if (stored) setScreen({ kind: "save", save: stored });
  }, []);

  const onFile = async (file: File) => {
    setScreen({ kind: "reading" });
    const r = await readSaveFile(file);
    if ("error" in r) {
      setScreen({ kind: "error", error: r.error });
      return;
    }
    storeSave(r);
    setScreen({ kind: "save", save: r });
    window.scrollTo({ top: 0 });
  };
  const onForget = () => {
    forgetSave();
    setScreen({ kind: "empty" });
  };

  if (screen.kind === "save")
    return (
      <SaveBoundary onError={() => setScreen({ kind: "error", error: "broken" })}>
        <SaveLoader save={screen.save} route={route} navigate={navigate} onFile={onFile} onForget={onForget} />
      </SaveBoundary>
    );
  return (
    <main className="sd-main sd-save">
      <SavePicker reading={screen.kind === "reading"} error={screen.kind === "error" ? screen.error : null} onFile={onFile} />
    </main>
  );
}

/**
 * El sitio no tiene un límite de errores general: si una partida (guardada con otra forma, o un caso que el lector no
 * previó) rompe al dibujarse, la pestaña quedaría en blanco en cada visita y sin el botón de olvidarla. Este la olvida y
 * vuelve a la caja vacía con el aviso.
 */
export class SaveBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    forgetSave();
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** La partida ya leída, mientras bajan los datos con los que se cruza. */
function SaveLoader({ save, route, navigate, onFile, onForget }: { save: Save; route: Route; navigate: Nav; onFile: (f: File) => void; onForget: () => void }) {
  const { lang } = useLang();
  const data = useLoad(`save-${lang}`, () => peekSaveBundle(lang) ?? undefined, () => loadSaveBundle(lang));
  const t = useStardewCopy();
  if (!data.value)
    return (
      <main className="sd-main sd-save">
        <Box className="sd-intro">
          {data.failed ? (
            <p role="alert">
              {t.loadError}{" "}
              <button type="button" className="sd-btn" onClick={data.retry}>
                {t.retry}
              </button>
            </p>
          ) : (
            <p aria-busy="true">{t.save.reading}</p>
          )}
        </Box>
      </main>
    );
  return <SaveView save={save} data={data.value} route={route} navigate={navigate} onFile={onFile} onForget={onForget} />;
}

// --- La caja para elegir el archivo ---------------------------------------------------------------------------------

/** El botón de "elegir archivo": un `<label>` con la apariencia de los botones, y el `<input type="file">` adentro. */
function FileButton({ label, onFile, className = "sd-btn" }: { label: string; onFile: (f: File) => void; className?: string }) {
  return (
    <label className={`${className} sd-sv-file`}>
      {label}
      <input
        type="file"
        className="visually-hidden"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (f) onFile(f);
        }}
      />
    </label>
  );
}

/** Una carpeta que puede cortarse en dos líneas sólo después de cada separador (en el celular no entra entera). */
const breakable = (path: string): ReactNode[] => path.split(/(?<=[\\/])/).flatMap((part, i) => [part, <wbr key={i} />]);

export function SavePicker({ reading = false, error = null, onFile }: { reading?: boolean; error?: ReadError | null; onFile: (f: File) => void }) {
  const t = useStardewCopy();
  const c = t.save;
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };
  return (
    <Box className="sd-intro">
      <h1 className="sd-h1">{c.h1}</h1>
      <p className="sd-lede">{c.lede}</p>
      <div
        className={`sd-sv-drop${over ? " is-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        aria-busy={reading}
      >
        {/* El cofre del juego, solo (sin casillero: sobre el papel el casillero se veía cortado), al doble. */}
        <Sprite id="(BC)130" w={16} h={32} size={64} lazy={false} />
        {reading ? (
          <p className="sd-sv-dropmsg" role="status">
            {c.reading}
          </p>
        ) : (
          <>
            <p className="sd-sv-dropmsg">{c.drop}</p>
            <FileButton label={c.pick} onFile={onFile} />
          </>
        )}
      </div>
      {error && (
        <p className="sd-note sd-sv-error" role="alert">
          {c.errors[error]}
        </p>
      )}
      <p className="sd-sv-private">{c.private}</p>
      <h2 className="sd-h3">{c.whereTitle}</h2>
      <dl className="sd-sv-where">
        {c.where.map((w) => (
          <div key={w.os}>
            <dt>{w.os}</dt>
            <dd>
              <code>{breakable(w.path)}</code>
            </dd>
          </div>
        ))}
      </dl>
      <p className="sd-muted">{c.fileHint}</p>
    </Box>
  );
}

// --- La partida -----------------------------------------------------------------------------------------------------

/** Lo que comparten todas las cajas: los datos, los objetos por id, la dirección y el idioma. */
interface Ctx {
  data: SaveBundle;
  byId: Map<string, Row>;
  people: Map<string, Villager>;
  route: Route;
  navigate: Nav;
  lang: Lang;
  locale: string;
}

const portrait = (key: string) => `/stardew/portraits/${key.toLowerCase()}.png`;
const num = (n: number, locale: string, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits });

export function SaveView({
  save,
  data,
  route,
  navigate,
  onFile = () => undefined,
  onForget = () => undefined,
}: {
  save: Save;
  data: SaveBundle;
  route: Route;
  navigate: Nav;
  onFile?: (f: File) => void;
  onForget?: () => void;
}) {
  const t = useStardewCopy();
  const c = t.save;
  const { lang } = useLang();
  const locale = useLocale();
  const [who, setWho] = useState(0);
  const player = save.players[who] ?? save.players[0];
  const x: Ctx = useMemo(
    () => ({
      data,
      byId: new Map(data.rows.map((r) => [r.id, r])),
      people: new Map(data.villagers.map((v) => [v.key, v])),
      route,
      navigate,
      lang,
      locale,
    }),
    [data, route, navigate, lang, locale],
  );

  return (
    <main className="sd-main sd-save">
      <Box className="sd-intro sd-sv-head">
        <p className="sd-kicker">{c.h1}</p>
        <h1 className="sd-h1">{c.farm(save.farm)}</h1>
        <p className="sd-sv-date">{c.date(save.day, t.seasons[save.season], save.year)}</p>
        {save.players.length > 1 && (
          <div className="sd-filters">
            <Group label={c.farmer}>
              {save.players.map((p, i) => (
                <Pill on={i === who} onClick={() => setWho(i)} key={i}>
                  {p.host ? `${p.name} (${c.host})` : p.name}
                </Pill>
              ))}
            </Group>
          </div>
        )}
        {isOldVersion(save.version) && (
          <p className="sd-note" role="status">
            {c.old(save.version)}
          </p>
        )}
        <div className="sd-sv-actions">
          <FileButton label={c.other} onFile={onFile} />
          <button type="button" className="sd-btn" onClick={onForget}>
            {c.forget}
          </button>
        </div>
        <p className="sd-muted">{c.private}</p>
      </Box>
      <TodayBox save={save} player={player} x={x} />
      <PerfectionBox save={save} player={player} x={x} />
      <GiftsBox save={save} player={player} x={x} />
      <BundlesBox save={save} x={x} />
      <MissingBox save={save} player={player} x={x} />
    </main>
  );
}

/** Un objeto como casillero con su nombre abajo, enlazado a su ficha; `note` va debajo del nombre. */
function ItemCell({ id, x, note, have, name }: { id: string; x: Ctx; note?: ReactNode; have?: boolean; name?: string }) {
  const r = x.byId.get(normId(id));
  const label = name ?? r?.name ?? id;
  const body = (
    <>
      {/* A un múltiplo entero: 16×16 por 3, los objetos grandes (16×32) por 2. */}
      <Slot>{r ? <Sprite id={r.id} w={r.w} h={r.h} size={r.h > r.w ? 64 : 48} /> : null}</Slot>
      <span>{label}</span>
      {note != null && <small>{note}</small>}
    </>
  );
  const cls = `sd-cell sd-sv-cell${have ? " is-have" : ""}`;
  return r ? (
    <RouteLink className={cls} to={{ ...x.route, view: "stardew", sdSection: "items", detail: r.slug }} onNavigate={x.navigate} prefetch="press" title={label}>
      {body}
    </RouteLink>
  ) : (
    <span className={cls}>{body}</span>
  );
}

/**
 * El alto de una fila de casilleros (casillero, nombre en hasta dos líneas y la nota), para `LazyRows`: medido en el
 * navegador con la partida mínima, de 92 a 144 px según la fila (108 de promedio a 375 px).
 */
const CELL_H = 108;

/**
 * Una grilla de casilleros; pasados los 60, de a tandas de 30. Más estricto que las ~150 de CLAUDE.md: en una partida
 * recién empezada falta casi todo, y abrir varias partes de la perfección a la vez sumaba miles de nodos.
 */
function CellGrid<T>({ items, render, keyOf }: { items: readonly T[]; render: (it: T) => ReactNode; keyOf: (it: T) => string }) {
  if (items.length > 60)
    return (
      <ul className="sd-grid sd-sv-grid">
        <LazyRows items={items} rowHeight={CELL_H} chunk={30} tag="li" render={(it) => <li key={keyOf(it)}>{render(it)}</li>} />
      </ul>
    );
  return (
    <ul className="sd-grid sd-sv-grid">
      {items.map((it) => (
        <li key={keyOf(it)}>{render(it)}</li>
      ))}
    </ul>
  );
}

// --- Hoy ------------------------------------------------------------------------------------------------------------

function TodayBox({ save, player, x }: { save: Save; player: Player; x: Ctx }) {
  const t = useStardewCopy();
  const c = t.save.today;
  const tips = useMemo(
    () =>
      today(save, player, {
        save: x.data.save,
        villagers: x.data.villagers,
        calendar: x.data.calendar,
        crops: x.data.crops,
        fish: x.data.fish.fish,
        bundles: x.data.rooms,
      }),
    [save, player, x.data],
  );
  return (
    <Box className="sd-sv-today" aria-labelledby="sd-sv-today-h">
      <h2 className="sd-h2" id="sd-sv-today-h">
        {c.title}
      </h2>
      {tips.length === 0 ? (
        <p className="sd-muted">{c.empty}</p>
      ) : (
        <ul className="sd-sv-tips">
          {tips.map((tip, i) => (
            <li className="sd-sv-tip" data-kind={tip.kind} key={`${tip.kind}-${i}`}>
              <TipBody tip={tip} x={x} c={c} />
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}

function TipBody({ tip, x, c }: { tip: Tip; x: Ctx; c: SaveCopy["today"] }) {
  const grid = (ids: string[]) => <CellGrid items={ids} keyOf={(id) => id} render={(id) => <ItemCell id={id} x={x} />} />;
  switch (tip.kind) {
    case "birthday": {
      const [key, ...loved] = tip.ids;
      const v = x.people.get(key);
      const name = v ? say(v.name, x.lang) : key;
      return (
        <>
          <p className="sd-sv-tiphead">
            <img className="sd-portrait" src={portrait(key)} alt="" width={48} height={48} loading="lazy" decoding="async" />
            {v ? (
              <RouteLink to={{ ...x.route, view: "stardew", sdSection: "villagers", detail: v.slug }} onNavigate={x.navigate} prefetch="press">
                <b>{c.birthday(name)}</b>
              </RouteLink>
            ) : (
              <b>{c.birthday(name)}</b>
            )}
          </p>
          {loved.length > 0 && (
            <>
              <p className="sd-sv-tiptext">{c.lovedHave}</p>
              {grid(loved)}
            </>
          )}
        </>
      );
    }
    case "festival":
      return (
        <p className="sd-sv-tiphead">
          <b>{c.festival(tip.name ? say(tip.name, x.lang) : tip.ids[0], tip.when ?? 0)}</b>
        </p>
      );
    case "plant":
    case "fish":
    case "bundle":
      return (
        <>
          <p className="sd-sv-tiphead">
            <b>{c[tip.kind]}</b>
          </p>
          {grid(tip.ids)}
        </>
      );
    case "tv": {
      const out = x.data.save.cooking.find((r) => r.key === tip.ids[0])?.out;
      const recipe = out ? x.data.recipes.recipes.find((r) => r.kind === "cook" && r.out === out) : undefined;
      const name = recipe ? say(recipe.name, x.lang) : tip.ids[0];
      return (
        <>
          <p className="sd-sv-tiphead">
            <b>{c.tv(say(x.data.recipes.refs.tv, x.lang), name)}</b>
          </p>
          {out && grid([out])}
        </>
      );
    }
    case "cart":
      return (
        <p className="sd-sv-tiphead">
          <b>{c.cart}</b>
        </p>
      );
  }
}

// --- Perfección -----------------------------------------------------------------------------------------------------

function PerfectionBox({ save, player, x }: { save: Save; player: Player; x: Ctx }) {
  const t = useStardewCopy();
  const c = t.save.perfection;
  const p = useMemo(() => perfection(save, x.data.save), [save, x.data.save]);
  const names = useMemo(() => new Map(x.data.save.perfection.map((q) => [q.key, q.name])), [x.data.save]);
  return (
    <Box className="sd-sv-perf" aria-labelledby="sd-sv-perf-h">
      <header className="sd-sv-perfhead">
        <h2 className="sd-h2" id="sd-sv-perf-h">
          {c.title}
        </h2>
        <p className="sd-sv-total" data-total={p.total.toFixed(2)}>
          {num(p.total, x.locale, 1)}
          <small>%</small>
        </p>
      </header>
      <p className="sd-muted">{c.hint}</p>
      <ul className="sd-sv-parts">
        {p.parts.map((part) => (
          <li key={part.key}>
            <PartRow part={part} name={say(names.get(part.key) ?? [part.key, part.key], x.lang)} player={player} x={x} />
          </li>
        ))}
      </ul>
    </Box>
  );
}

function PartRow({ part, name, player, x }: { part: Part; name: string; player: Player; x: Ctx }) {
  const c = useStardewCopy().save.perfection;
  const [open, setOpen] = useState(false);
  const got = (part.weight * part.pct) / 100;
  const done = part.done >= part.total;
  return (
    <details className={`sd-sv-part${done ? " is-done" : ""}`} onToggle={(e) => setOpen(e.currentTarget.open)} data-part={part.key}>
      <summary>
        <span className="sd-sv-pname">{name}</span>
        <span className="sd-sv-pcount">
          {num(part.done, x.locale)} / {num(part.total, x.locale)}
        </span>
        <span className="sd-sv-ppoints">{c.points(num(got, x.locale, 1), num(part.weight, x.locale))}</span>
      </summary>
      {open && <PartMissing part={part} player={player} x={x} />}
    </details>
  );
}

/** Lo que falta de una parte de la perfección, con lo que haga falta para nombrarlo. */
function PartMissing({ part, player, x }: { part: Part; player: Player; x: Ctx }) {
  const c = useStardewCopy().save.perfection;
  const s = x.data.save;
  if (part.key === "level") return <p className="sd-sv-pmore">{c.level(part.done)}</p>;
  if (part.key === "walnuts") return <p className="sd-sv-pmore">{c.walnuts}</p>;
  if (part.missing.length === 0) return <p className="sd-sv-pmore">{c.allDone}</p>;
  switch (part.key) {
    case "shipped":
    case "fish":
      return <CellGrid items={part.missing} keyOf={(id) => id} render={(id) => <ItemCell id={id} x={x} />} />;
    case "cooking":
    case "crafting": {
      const outOf = new Map((part.key === "cooking" ? s.cooking : s.crafting).map((r) => [r.key, r.out]));
      return <CellGrid items={part.missing} keyOf={(k) => k} render={(k) => <ItemCell id={outOf.get(k) ?? k} x={x} />} />;
    }
    case "friends": {
      const need = new Map(s.friends.map((f) => [f.key, f.max]));
      return (
        <ul className="sd-sv-people">
          {part.missing.map((key) => {
            const v = x.people.get(key);
            const hearts = Math.floor((player.friends[key]?.points ?? 0) / 250);
            return (
              <li key={key}>
                <img className="sd-portrait" src={portrait(key)} alt="" width={48} height={48} loading="lazy" decoding="async" />
                <span>
                  <b>{v ? say(v.name, x.lang) : key}</b>
                  <small>{c.hearts(hearts, need.get(key) ?? 10)}</small>
                </span>
              </li>
            );
          })}
        </ul>
      );
    }
    case "slayer":
      return (
        <ul className="sd-sv-list">
          {s.slayer
            .filter((q) => part.missing.includes(q.key))
            .map((q) => {
              const kills = q.targets.reduce((a, k) => a + (player.kills[k] ?? 0), 0);
              return (
                <li key={q.key}>
                  <b>{say(q.name, x.lang)}</b>
                  <span className="sd-sv-num">
                    {num(Math.min(kills, q.count), x.locale)} / {num(q.count, x.locale)}
                  </span>
                </li>
              );
            })}
        </ul>
      );
    case "stardrops":
      return (
        <ul className="sd-sv-list">
          {s.stardrops
            .filter((d) => part.missing.includes(d.flag))
            .map((d) => (
              <li key={d.flag}>
                <b>{say(d.name, x.lang)}</b>
              </li>
            ))}
        </ul>
      );
    default:
      // Los obeliscos y el reloj de oro: edificios, por su nombre.
      return (
        <ul className="sd-sv-list">
          {part.missing.map((b) => (
            <li key={b}>
              <b>{s.buildingNames[b] ? say(s.buildingNames[b], x.lang) : b}</b>
            </li>
          ))}
        </ul>
      );
  }
}

// --- Regalos de la semana -------------------------------------------------------------------------------------------

function GiftsBox({ save, player, x }: { save: Save; player: Player; x: Ctx }) {
  const t = useStardewCopy();
  const c = t.save.gifts;
  const gifts = useMemo(() => weekGifts(save, player, x.data.villagers), [save, player, x.data.villagers]);
  return (
    <Box className="sd-sv-gifts" aria-labelledby="sd-sv-gifts-h">
      <h2 className="sd-h2" id="sd-sv-gifts-h">
        {c.title}
      </h2>
      {gifts.length === 0 ? (
        <p className="sd-muted">{c.empty}</p>
      ) : (
        <ul className="sd-sv-bdays">
          {gifts.map((g) => {
            const v = x.people.get(g.key);
            const name = v ? say(v.name, x.lang) : g.key;
            const loved = g.loved.filter((l) => x.byId.has(normId(l.id)));
            return (
              <li className="sd-sv-bday" key={g.key}>
                <header className="sd-sv-who">
                  <img className="sd-portrait" src={portrait(g.key)} alt="" width={48} height={48} loading="lazy" decoding="async" />
                  <span>
                    {v ? (
                      <RouteLink to={{ ...x.route, view: "stardew", sdSection: "villagers", detail: v.slug }} onNavigate={x.navigate} prefetch="press">
                        <b>{name}</b>
                      </RouteLink>
                    ) : (
                      <b>{name}</b>
                    )}
                    <small>
                      {c.on(g.birthday[1], t.seasons[g.birthday[0]])} · {g.inDays === 0 ? c.today : c.inDays(g.inDays)}
                    </small>
                    <small>
                      <span className="sd-sv-heart">{c.hearts(g.hearts)}</span> · {c.giftsWeek(g.giftsWeek)}
                    </small>
                  </span>
                </header>
                <CellGrid
                  items={loved}
                  keyOf={(l) => l.id}
                  render={(l) => <ItemCell id={l.id} x={x} have={l.have > 0} note={l.have > 0 ? c.have(num(l.have, x.locale)) : undefined} />}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Box>
  );
}

// --- Centro Comunitario ---------------------------------------------------------------------------------------------

/** El id del oro en los paquetes de la Bóveda. */
const GOLD = "-1";

function BundlesBox({ save, x }: { save: Save; x: Ctx }) {
  const t = useStardewCopy();
  const c = t.save.cc;
  const status = useMemo(() => bundleStatus(save, x.data.rooms), [save, x.data.rooms]);
  const [synced, setSynced] = useState<number | null>(null);
  const roomOf = (key: string) => x.data.rooms.find((r) => r.room === key);
  /** El nombre del paquete: el de `bundles.json` si es el mismo (por sala e índice, o por nombre si está remezclado). */
  const bundleName = (room: string, index: number, name: string): string => {
    const r = roomOf(room);
    const same = r?.bundles.find((b) => b.index === index && b.name[0] === name) ?? x.data.rooms.flatMap((q) => q.bundles).find((b) => b.name[0] === name);
    return same ? say(same.name, x.lang) : name;
  };
  return (
    <Box className="sd-sv-cc" aria-labelledby="sd-sv-cc-h">
      <h2 className="sd-h2" id="sd-sv-cc-h">
        {c.title}
      </h2>
      {status === "joja" ? (
        <p className="sd-note">{c.joja}</p>
      ) : status === "complete" ? (
        <p className="sd-note">{c.complete}</p>
      ) : (
        <>
          <div className="sd-sv-actions">
            <button type="button" className="sd-btn" onClick={() => setSynced(syncChecklist(save, x.data.rooms))}>
              {c.sync}
            </button>
            <RouteLink className="sd-sv-link" to={{ ...x.route, view: "stardew", sdSection: "bundles", detail: undefined }} onNavigate={x.navigate}>
              {t.tabs.bundles} →
            </RouteLink>
          </div>
          <p className="sd-muted" aria-live="polite">
            {synced != null ? c.synced(synced) : ""}
          </p>
          {status.map((room) => {
            const r = roomOf(room.room);
            const left = room.bundles.filter((b) => !b.done);
            return (
              <section className="sd-sv-room" key={room.room}>
                <header className="sd-sv-roomhead">
                  <h3 className="sd-h3">
                    <RouteLink to={{ ...x.route, view: "stardew", sdSection: "bundles", detail: undefined }} hash={roomAnchor(room.room)} onNavigate={x.navigate}>
                      {r ? say(r.name, x.lang) : room.room}
                    </RouteLink>
                  </h3>
                  <span className="sd-count">
                    {num(room.bundles.length - left.length, x.locale)} / {num(room.bundles.length, x.locale)}
                  </span>
                </header>
                {left.length === 0 ? (
                  <p className="sd-muted">{c.roomDone}</p>
                ) : (
                  <ul className="sd-sv-bundles">
                    {left.map((b) => (
                      <li className="sd-sv-bundle" key={b.index}>
                        <p className="sd-sv-bhead">
                          <b>{bundleName(room.room, b.index, b.name)}</b>
                          <span>{c.left(b.left)}</span>
                        </p>
                        <ul className="sd-grid sd-sv-grid">
                          {b.missing.map((it, i) => (
                            <li key={`${it[0]}-${i}`}>
                              <BundleCell it={it} have={b.have[it[0]] ?? 0} x={x} />
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </>
      )}
    </Box>
  );
}

/** Un objeto que falta en un paquete: cantidad y calidad, y cuántos hay en los cofres. */
function BundleCell({ it, have, x }: { it: BundleItem; have: number; x: Ctx }) {
  const t = useStardewCopy();
  const c = t.save.cc;
  const [id, qty, quality] = it;
  if (id === GOLD)
    return (
      <span className="sd-cell sd-sv-cell">
        <Slot>
          <span className="sd-coin">g</span>
        </Slot>
        <span>{c.gold}</span>
        <small>
          <Gold n={qty} />
        </small>
      </span>
    );
  // La calidad del juego (0, 1, 2 y 4 el iridio) como índice de QUALITIES: la misma cuenta que el checklist.
  const q = qualityIndex(quality);
  const note = (
    <>
      × {num(qty, x.locale)}
      {q > 0 ? ` · ${t.qualities[QUALITIES[q]]}` : ""}
      {have > 0 && (
        <>
          <br />
          {c.inFarm(num(have, x.locale))}
        </>
      )}
    </>
  );
  // El tinte de "ya lo tenés" sólo si alcanza: 13 maderas de 99 se anotan, pero no se pintan.
  return <ItemCell id={id} x={x} note={note} have={have >= qty} />;
}

// --- Peces y recetas que faltan -------------------------------------------------------------------------------------

function MissingBox({ save, player, x }: { save: Save; player: Player; x: Ctx }) {
  const t = useStardewCopy();
  const c = t.save.missing;
  const fish = useMemo(() => missingFish(player, x.data.fish.fish, save.season, x.data.save.fish), [player, x.data, save.season]);
  const recipes = useMemo(() => missingRecipes(player, x.data.recipes.recipes, x.data.save, save), [player, x.data, save]);
  const recipeName = useMemo(() => new Map(x.data.recipes.recipes.map((r) => [`${r.kind}:${r.out}`, r.name])), [x.data.recipes]);
  const recipeCell = (r: (typeof recipes)[number]) => {
    const n = recipeName.get(`${r.kind}:${r.out}`);
    // Lo que se consigue ya y no se conoce sólo puede ser la receta de la tele de esta estación.
    return <ItemCell id={r.out} x={x} name={n ? say(n, x.lang) : undefined} note={r.now && !r.known ? c.tv : undefined} />;
  };
  return (
    <Box className="sd-sv-missing" aria-labelledby="sd-sv-missing-h">
      <h2 className="sd-h2" id="sd-sv-missing-h">
        {c.title}
      </h2>
      <section className="sd-sv-half">
        <header className="sd-sv-roomhead">
          <h3 className="sd-h3">{c.fish}</h3>
          <span className="sd-count">{c.count(num(fish.length, x.locale))}</span>
        </header>
        {fish.length === 0 && <p className="sd-muted">{c.none}</p>}
        <Split items={fish} now={(f) => f.now} keyOf={(f) => f.id} render={(f) => <ItemCell id={f.id} x={x} note={f.leaving ? c.leaving : undefined} />} c={c} />
      </section>
      {(["cook", "craft"] as const).map((kind) => {
        const list = recipes.filter((r) => r.kind === kind);
        return (
          <section className="sd-sv-half" key={kind}>
            <header className="sd-sv-roomhead">
              <h3 className="sd-h3">{kind === "cook" ? c.cook : c.craft}</h3>
              <span className="sd-count">{c.count(num(list.length, x.locale))}</span>
            </header>
            {list.length === 0 && <p className="sd-muted">{c.none}</p>}
            <Split items={list} now={(r) => r.now} keyOf={(r) => r.key} render={recipeCell} c={c} />
          </section>
        );
      })}
    </Box>
  );
}

/** Una lista de lo que falta partida en dos: lo que se consigue ya y lo de más adelante, cada una con su rótulo. */
function Split<T>({ items, now, keyOf, render, c }: { items: readonly T[]; now: (it: T) => boolean; keyOf: (it: T) => string; render: (it: T) => ReactNode; c: SaveCopy["missing"] }) {
  const yes = items.filter(now);
  const no = items.filter((it) => !now(it));
  return (
    <>
      {yes.length > 0 && (
        <>
          <p className="sd-label">{c.now}</p>
          <CellGrid items={yes} keyOf={keyOf} render={render} />
        </>
      )}
      {no.length > 0 && (
        <>
          <p className="sd-label">{c.later}</p>
          <CellGrid items={no} keyOf={keyOf} render={render} />
        </>
      )}
    </>
  );
}
