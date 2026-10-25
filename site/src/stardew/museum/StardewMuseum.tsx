/**
 * La pestaña Museo de Stardew Valley (etapa 4, tarea 7): una pantalla con tres vistas elegidas por botones.
 *
 * - **Colección** (se abre en esta): los 95 casilleros de lo que recibe Gunther, tildables como el Centro Comunitario,
 *   con un filtro (artefactos, minerales, lo que falta). Cada uno dice en una línea de dónde sale y, al tocarla, el
 *   detalle: dónde se excava, qué geodas, qué monstruos (enlazados a su ficha de Minas) y lo demás.
 * - **Premios**: cada premio con lo que pide, lo que falta según lo tildado y el premio en su casillero (los muebles y
 *   la Llave oxidada, sin ficha, con su dibujo y su nombre).
 * - **Libros**: los de poder y los de habilidad con su efecto, el precio del Librero y dónde se consiguen; aparte, los
 *   libros perdidos de la biblioteca.
 *
 * Lo tildado se guarda en el navegador (`checklist.ts`, clave `sdv-museum-v1`) y se lee después del primer dibujo: el
 * HTML prerenderizado sale destildado y con la Colección. Si el Lector de partida tiene una partida guardada, un botón
 * pasa lo donado en ella. Cada fila lleva un `id` (el slug) para enlazarla con `#`. La Colección son 95 casilleros con
 * un sprite cada uno: no hace falta `LazyRows`; el detalle de dónde sale se dibuja recién al abrirlo.
 */
import { useEffect, useMemo, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useStardewCopy, type MuseumCopy } from "../../stardewCopy";
import { useLoad } from "../../useLoad";
import { readDone, toggle, writeDone, type Done } from "../checklist";
import { loadMuseum, peekMuseum, say } from "../data";
import { Pix } from "../mines/pix";
import { pixelScale } from "../mines/state";
import { readStoredSaveInfo } from "../save/store";
import { Box, Gold, Group, Pill, prizeSrc, SdLoading, Slot, Sprite, type Nav } from "../ui";
import {
  bookAnchor,
  DEFAULT_MUSEUM_VIEW,
  doneFromSave,
  museumSync,
  MUSEUM_FILTERS,
  MUSEUM_KEY,
  MUSEUM_VIEWS,
  pieceKinds,
  progress,
  readMuseumView,
  rewardAnchor,
  shownPieces,
  viewOfAnchor,
  writeMuseumView,
  type Book,
  type MuseumData,
  type MuseumFilter,
  type MuseumView,
  type Piece,
  type Reward,
  type RewardState,
  type SavedMuseum,
} from "./state";
import "../../styles/stardew-items.css";
import "../../styles/stardew-museum.css";

export default function StardewMuseum({ route, navigate }: { route: Route; navigate: Nav }) {
  const data = useLoad("museum", () => peekMuseum() ?? undefined, loadMuseum);
  if (data.failed) return <SdLoading onRetry={data.retry} />;
  if (!data.value) return <SdLoading />;
  return <MuseumBook data={data.value} route={route} navigate={navigate} />;
}

const scrollTo = (id: string) => window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 80);

export function MuseumBook({
  data,
  route,
  navigate,
  initial = DEFAULT_MUSEUM_VIEW,
  initialDone = {},
  initialSaved = null,
}: {
  data: MuseumData;
  route: Route;
  navigate: Nav;
  initial?: MuseumView;
  /** Lo tildado del primer dibujo (los tests); en el navegador se lee lo guardado después. */
  initialDone?: Done;
  /** La partida guardada del primer dibujo (los tests); en el navegador se lee después. */
  initialSaved?: SavedMuseum | null;
}) {
  const t = useStardewCopy();
  const m = t.museum;
  const locale = useLocale();
  const [view, setView] = useState<MuseumView>(initial);
  const [done, setDone] = useState<Done>(initialDone);
  // Los ids donados en la partida guardada del Lector, si hay una; se lee después del primer dibujo.
  const [saved, setSaved] = useState<SavedMuseum | null>(initialSaved);
  const [synced, setSynced] = useState<number | null>(null);

  // La vista de la dirección; sin `?v=`, la del ancla (`#dwarf` es un premio). Después, la fila del ancla. Lo guardado
  // se lee acá (el HTML prerenderizado va destildado), y se sigue si otra pestaña lo cambia.
  useEffect(() => {
    const anchor = window.location.hash.slice(1);
    // Sólo `?v=` elige la vista: otra cosa en la dirección (`?utm_…`) no le gana al ancla.
    const search = window.location.search;
    const v = new URLSearchParams(search).has("v") ? readMuseumView(search) : (viewOfAnchor(data, anchor) ?? DEFAULT_MUSEUM_VIEW);
    setView(v);
    setDone(readDone(MUSEUM_KEY));
    const info = readStoredSaveInfo();
    setSaved(info ? { ids: info.save.museum, stale: info.filled.includes("museum") } : null);
    const onStorage = () => setDone(readDone(MUSEUM_KEY));
    window.addEventListener("storage", onStorage);
    const timer = anchor ? scrollTo(anchor) : undefined;
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearTimeout(timer);
    };
  }, [data]);

  const go = (v: MuseumView) => {
    setView(v);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${writeMuseumView(v)}`);
  };
  // Se parte del estado que se muestra (sin almacenamiento, lo guardado sería siempre `{}`) y después se guarda.
  const onTick = (id: string) =>
    setDone((prev) => {
      const next = toggle(prev, id);
      writeDone(MUSEUM_KEY, next);
      return next;
    });
  const onSync = () => {
    if (museumSync(saved) !== "ok" || !saved) return;
    const add = doneFromSave(saved.ids, data);
    const fresh = Object.keys(add).filter((k) => !done[k]).length;
    const next = { ...done, ...add };
    writeDone(MUSEUM_KEY, next);
    setDone(next);
    setSynced(fresh);
  };

  const state = useMemo(() => progress(data, done), [data, done]);

  return (
    <main className="sd-main sd-museum">
      <Box className="sd-intro">
        <h1 className="sd-h1">{m.h1}</h1>
        <p className="sd-lede">{m.lede(data.pieces.length.toLocaleString(locale))}</p>
        <div className="sd-filters">
          <Group label={m.view}>
            {MUSEUM_VIEWS.map((v) => (
              <Pill on={view === v} onClick={() => go(v)} key={v}>
                {m.views[v]}
              </Pill>
            ))}
          </Group>
        </div>
      </Box>
      {view === "collection" && (
        <Collection data={data} route={route} navigate={navigate} m={m} done={done} state={state} onTick={onTick} saved={saved} synced={synced} onSync={onSync} />
      )}
      {view === "rewards" && <Rewards data={data} route={route} navigate={navigate} m={m} state={state.rewards} />}
      {view === "books" && <Books data={data} route={route} navigate={navigate} m={m} />}
    </main>
  );
}

type Props = { data: MuseumData; route: Route; navigate: Nav; m: MuseumCopy };

/** Un objeto con ficha (geoda, premio, libro): su nombre enlazado a Objetos; sin ficha, el nombre solo. */
function ItemName({ data, route, navigate, id, fallback }: Omit<Props, "m"> & { id: string; fallback?: [string, string] }) {
  const { lang } = useLang();
  const r = data.refs[id];
  const name = fallback ? say(fallback, lang) : r ? (lang === "es" && r[3]) || r[2] : id;
  return r ? (
    <RouteLink className="sd-mu-link" to={{ ...route, view: "stardew", sdSection: "items", detail: r[0] }} onNavigate={navigate} prefetch="press">
      {name}
    </RouteLink>
  ) : (
    <b>{name}</b>
  );
}

// --- Colección --------------------------------------------------------------------------------------------------

function Collection({
  m,
  done,
  state,
  onTick,
  saved,
  synced,
  onSync,
  ...props
}: Props & {
  done: Done;
  state: { pieces: number; total: number };
  onTick: (id: string) => void;
  saved: SavedMuseum | null;
  synced: number | null;
  onSync: () => void;
}) {
  const { data } = props;
  const locale = useLocale();
  const [filter, setFilter] = useState<MuseumFilter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const shown = shownPieces(data, filter, done);
  return (
    <Box className="sd-mu-coll">
      <div className="sd-mu-head">
        <p className="sd-mu-count">
          <span className="sd-label">{m.donated}</span>
          <b aria-live="polite">{m.progress(state.pieces.toLocaleString(locale), state.total.toLocaleString(locale))}</b>
        </p>
        <p className="sd-muted">{m.saved}</p>
      </div>
      <div className="sd-filters">
        <Group label={m.filter}>
          {MUSEUM_FILTERS.map((f) => (
            <Pill on={filter === f} onClick={() => setFilter(f)} key={f}>
              {m.filters[f]}
            </Pill>
          ))}
        </Group>
        {/* Guardada antes de que el Lector leyera el museo: no se trae nada (diría "nada nuevo", y no se sabe). */}
        {museumSync(saved) === "stale" && <p className="sd-muted sd-mu-stale">{m.reopen}</p>}
        {museumSync(saved) === "ok" && (
          <div className="sd-mu-sync">
            <button type="button" className="sd-btn" onClick={onSync}>
              {m.fromSave}
            </button>
            <span className="sd-muted" aria-live="polite">
              {synced != null ? m.synced(synced) : ""}
            </span>
          </div>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="sd-muted">{m.empty}</p>
      ) : (
        <ul className="sd-mu-grid">
          {shown.map((p) => (
            <PieceCard {...props} m={m} p={p} on={!!done[p.id]} onTick={onTick} open={open === p.id} onOpen={() => setOpen(open === p.id ? null : p.id)} key={p.id} />
          ))}
        </ul>
      )}
    </Box>
  );
}

function PieceCard({ p, on, onTick, open, onOpen, m, ...props }: Props & { p: Piece; on: boolean; onTick: (id: string) => void; open: boolean; onOpen: () => void }) {
  const { data } = props;
  const { lang } = useLang();
  const r = data.refs[p.id];
  const name = r ? (lang === "es" && r[3]) || r[2] : p.id;
  const kinds = pieceKinds(p);
  const whereId = `${p.slug}-where`;
  return (
    <li className={`sd-mu-piece${on ? " is-on" : ""}${open ? " is-open" : ""}`} id={p.slug}>
      {/* El dibujo y el nombre son un solo botón que tilda, como en el Centro Comunitario; la casilla de la esquina
          dice si está donada (tinte y palomita, sin filo). El enlace a la ficha va en el detalle. */}
      <button type="button" className="sd-mu-tick" aria-pressed={on} aria-label={name} onClick={() => onTick(p.id)}>
        <Slot>
          <Sprite id={p.id} size={48} />
          {on && (
            <span className="sd-check" aria-hidden="true">
              ✓
            </span>
          )}
        </Slot>
        <span className="sd-mu-pname">{name}</span>
        <span className="sd-mu-box" aria-hidden="true">
          {on ? "✓" : ""}
        </span>
      </button>
      <button type="button" className="sd-mu-kinds" aria-expanded={open} aria-controls={open ? whereId : undefined} onClick={onOpen}>
        {/* El punto va pegado a la palabra de antes: un renglón nunca empieza con "·". En el teléfono, sólo "Dónde sale". */}
        <span className="sd-mu-kfull">{kinds.map((k) => m.kinds[k]).join(NBSP_DOT)}</span>
        <span className="sd-mu-kshort">{m.where}</span>
        <span className="sd-mu-caret" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && <WhereList {...props} m={m} p={p} id={whereId} />}
    </li>
  );
}

/** Separador de la línea de fuentes: espacio duro antes del punto, para que el punto no empiece un renglón. */
const NBSP_DOT = "\u00a0· ";

/** El detalle de dónde sale una pieza: una línea por fuente. */
function WhereList({ p, id, m, ...props }: Props & { p: Piece; id: string }) {
  const { data, route, navigate } = props;
  const { lang } = useLang();
  const monsters = p.where.filter((w): w is Extract<typeof w, { k: "monster" }> => w.k === "monster");
  const r = data.refs[p.id];
  return (
    <ul className="sd-mu-where" id={id} aria-label={m.where}>
      {r && (
        <li>
          <RouteLink className="sd-mu-link" to={{ ...route, view: "stardew", sdSection: "items", detail: r[0] }} onNavigate={navigate} prefetch="press">
            {m.itemPage(say([r[2], r[3]], lang))}
          </RouteLink>
        </li>
      )}
      {p.where.map((w, i) => {
        if (w.k === "dig")
          return (
            <li key={i}>
              <small>{m.whereText.dig}</small> {w.places.map((pl) => say(pl, lang)).join(", ")}
            </li>
          );
        if (w.k === "geode")
          return (
            <li key={i}>
              <small>{m.whereText.geode}</small>{" "}
              {w.geodes.map((g, j) => (
                <span key={g}>
                  {j > 0 && ", "}
                  <ItemName data={data} route={route} navigate={navigate} id={g} />
                </span>
              ))}
            </li>
          );
        if (w.k === "fish") return <li key={i}>{m.whereText.fish}</li>;
        if (w.k === "other") return <li key={i}>{say(w.text, lang)}</li>;
        // Los monstruos van juntos, en la línea del primero.
        if (w !== monsters[0]) return null;
        return (
          <li key={i}>
            <small>{m.whereText.monster}</small>{" "}
            {monsters.map((x, j) => (
              <span key={x.slug}>
                {j > 0 && ", "}
                <RouteLink className="sd-mu-link" to={{ ...route, view: "stardew", sdSection: "mines", detail: x.slug }} onNavigate={navigate} prefetch="press">
                  {say(x.who, lang)}
                </RouteLink>
              </span>
            ))}
          </li>
        );
      })}
    </ul>
  );
}

// --- Premios ----------------------------------------------------------------------------------------------------

function Rewards({ m, state, ...props }: Props & { state: RewardState[] }) {
  const { data } = props;
  const locale = useLocale();
  const won = state.filter((s) => s.ok).length;
  const byKey = new Map(state.map((s) => [s.key, s]));
  return (
    <Box className="sd-mu-rewardsbox">
      <h2 className="sd-h2">{m.views.rewards}</h2>
      <p className="sd-mu-count">
        <b>{m.rewards.count(won.toLocaleString(locale), state.length.toLocaleString(locale))}</b>
      </p>
      <p className="sd-muted">{m.rewards.hint}</p>
      <ul className="sd-mu-rewards">
        {data.rewards.map((r) => (
          <RewardRow {...props} m={m} r={r} s={byKey.get(r.key)!} key={r.key} />
        ))}
      </ul>
    </Box>
  );
}

/** El dibujo de un premio a un múltiplo entero, lo más grande que entre en 64 px (16×16 a 4×, 16×32 a 2×, 32×64 a 1×). */
function PrizePix({ data, id }: { data: MuseumData; id: string }) {
  const r = data.refs[id];
  const [w, h] = r ? [r[4], r[5]] : (data.rewards.find((x) => x.reward.id === id)?.reward.sprite ?? [16, 16]);
  return <Pix src={prizeSrc(id)} w={w} h={h} k={pixelScale(w, h, 64, 64)} />;
}

function RewardRow({ r, s, m, ...props }: Props & { r: Reward; s: RewardState }) {
  const { data } = props;
  const { lang } = useLang();
  const locale = useLocale();
  const prize = r.reward;
  return (
    <li className={`sd-mu-reward${s.ok ? " is-won" : ""}`} id={rewardAnchor(r)}>
      <span className="sd-mu-prize">
        <PrizePix data={data} id={prize.id} />
        {s.ok && (
          <span className="sd-check" aria-hidden="true">
            ✓
          </span>
        )}
      </span>
      <div className="sd-mu-rinfo">
        <p className="sd-mu-rname">
          <span>
            {/* La receta lleva su nombre con "(Receta)": va sin enlace a la ficha del objeto, que es otra cosa. */}
            {prize.recipe ? <b>{say(prize.name, lang)}</b> : <ItemName {...props} id={prize.id} fallback={data.refs[prize.id] ? undefined : prize.name} />}
            {prize.n > 1 && <small> × {prize.n.toLocaleString(locale)}</small>}
          </span>
        </p>
        <p className="sd-mu-need">
          <span className="sd-label">{m.rewards.needs}</span>
          <span>{say(r.text, lang)}</span>
        </p>
      </div>
      <span className={`sd-mu-state${s.ok ? " is-won" : ""}`}>{s.ok ? m.rewards.won : m.rewards.left(s.missing)}</span>
    </li>
  );
}

// --- Libros -----------------------------------------------------------------------------------------------------

/** Los libros de habilidad dan experiencia cada vez (`SkillBook_*`, y el Libro de estrellas, que da de todas). */
const isSkillBook = (b: Book): boolean => b.id.startsWith("SkillBook_") || b.id === "PurpleBook";

/** La condición del Librero que comparten más libros de una lista: se dice una vez arriba y no en cada uno. */
function commonNote(books: Book[]): Book["priceNote"] {
  const count = new Map<string, { note: NonNullable<Book["priceNote"]>; n: number }>();
  for (const b of books) {
    if (!b.priceNote) continue;
    const k = b.priceNote[0];
    count.set(k, { note: b.priceNote, n: (count.get(k)?.n ?? 0) + 1 });
  }
  const best = [...count.values()].sort((a, b) => b.n - a.n)[0];
  return best && best.n > 1 ? best.note : null;
}

function Books(props: Props) {
  const { data, m } = props;
  const { lang } = useLang();
  const locale = useLocale();
  const power = data.books.filter((b) => !isSkillBook(b));
  const skill = data.books.filter(isSkillBook);
  const powerNote = commonNote(power);
  const skillNote = commonNote(skill);
  const lost = data.refs[data.lostBook];
  return (
    <>
      <Box className="sd-mu-books">
        <h2 className="sd-h2">{m.books.power}</h2>
        <BookIntro {...props} hint={m.books.powerHint} note={powerNote} />
        <ul className="sd-mu-blist">
          {power.map((b) => (
            <BookRow {...props} b={b} common={powerNote} key={b.id} />
          ))}
        </ul>
      </Box>
      <Box className="sd-mu-books">
        <h2 className="sd-h2">{m.books.skill}</h2>
        <BookIntro {...props} hint={m.books.skillHint} note={skillNote} />
        <ul className="sd-mu-blist">
          {skill.map((b) => (
            <BookRow {...props} b={b} common={skillNote} key={b.id} />
          ))}
        </ul>
      </Box>
      <Box className="sd-mu-books" id="lost-books">
        <h2 className="sd-h2">{m.books.lostTitle}</h2>
        <div className="sd-mu-lost">
          {lost ? (
            <RouteLink className="sd-mu-lostref" to={{ ...props.route, view: "stardew", sdSection: "items", detail: lost[0] }} onNavigate={props.navigate} prefetch="press">
              <Slot>
                <Sprite id={data.lostBook} size={48} />
              </Slot>
              <b>{say([lost[2], lost[3]], lang)}</b>
            </RouteLink>
          ) : null}
          <p>{m.books.lost(data.lostBooks.toLocaleString(locale))}</p>
        </div>
      </Box>
    </>
  );
}

/** Lo que dice la caja arriba: para qué sirven y, una sola vez, la condición del Librero que comparten. */
function BookIntro({ m, hint, note }: Props & { hint: string; note: Book["priceNote"] }) {
  const { lang } = useLang();
  return (
    <p className="sd-muted">
      {hint}
      {note && ` ${m.books.sold(say(note, lang))}`}
    </p>
  );
}

function BookRow({ b, common, ...props }: Props & { b: Book; common: Book["priceNote"] }) {
  const { data, m } = props;
  const { lang } = useLang();
  return (
    <li className="sd-mu-book" id={bookAnchor(b)}>
      <Slot>{data.refs[b.id] && <Sprite id={b.id} size={48} />}</Slot>
      <div className="sd-mu-binfo">
        <h3 className="sd-mu-bname">
          <ItemName {...props} id={b.id} fallback={data.refs[b.id] ? undefined : b.name} />
        </h3>
        <p className="sd-mu-effect">{say(b.effect, lang)}</p>
        <ul className="sd-mu-bwhere">
          {b.where.map((w, i) => (
            <li key={i}>{say(w, lang)}</li>
          ))}
        </ul>
      </div>
      {b.price != null && (
        <span className="sd-mu-price">
          <small>{m.books.from}</small>
          <Gold n={b.price} />
          {/* La condición propia de este libro; la que comparten todos ya está arriba. */}
          {b.priceNote ? (
            b.priceNote[0] !== common?.[0] && <small className="sd-mu-pnote">{say(b.priceNote, lang)}</small>
          ) : (
            // Sin condición lo tiene siempre: se dice, porque arriba se avisa la condición de los demás.
            common && <small className="sd-mu-pnote">{m.books.always}</small>
          )}
        </span>
      )}
    </li>
  );
}
