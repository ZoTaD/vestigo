/**
 * La pestaña Misiones de Stardew Valley (etapa 4, tarea 9): una pantalla con dos vistas elegidas por botones y un
 * filtro por aldeano.
 *
 * - **Pedidos especiales** (se abre en esta): una caja por tablero (el del pueblo y el del Festival del Desierto) con
 *   cada pedido: el retrato de quien lo pide, lo que dice el cartel, los objetivos, los días, si se repite, lo que pide
 *   (en casilleros enlazados a su ficha) y los premios. Los que eligen al azar entre muchas opciones (Lewis, Demetrius)
 *   no repiten la lista en cada frase: los objetivos la nombran como "una de las opciones de abajo" y el cartel entero
 *   va plegado.
 * - **Misiones de la historia**: en cadenas (una abre la siguiente), con quién la da, el objetivo, lo que hace falta y lo
 *   que paga. Arriba las de la historia; abajo los pedidos que llegan por carta de un aldeano.
 *
 * Cada fila lleva un `id` (su slug) para enlazarla con `#`: la ficha de un objeto enlaza al pedido o la misión que lo
 * pide o lo paga. Son 21 pedidos y 66 misiones, con un retrato y unos pocos sprites cada uno: no hace falta `LazyRows`.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useStardewCopy, type QuestsCopy } from "../../stardewCopy";
import { useLoad } from "../../useLoad";
import { loadQuests, peekQuests, refName, say, type Lang } from "../data";
import { Pix } from "../mines/pix";
import { pixelScale } from "../mines/state";
import { Box, Group, Pill, prizeSrc, SdLoading, type Nav } from "../ui";
import {
  DEFAULT_QUEST_VIEW,
  initialQuestView,
  isLongPick,
  nextElsewhere,
  orderPick,
  portraitSrc,
  QUEST_VIEWS,
  questChains,
  questParents,
  requesters,
  shortGoal,
  writeQuestView,
  type Order,
  type OrderReward,
  type Quest,
  type QuestsData,
  type QuestView,
} from "./state";
import "../../styles/stardew-items.css";
import "../../styles/stardew-crops.css";
import "../../styles/stardew-quests.css";

export default function StardewQuests({ route, navigate }: { route: Route; navigate: Nav }) {
  const data = useLoad("quests", () => peekQuests() ?? undefined, loadQuests);
  if (data.failed) return <SdLoading onRetry={data.retry} />;
  if (!data.value) return <SdLoading />;
  return <QuestBook data={data.value} route={route} navigate={navigate} />;
}

const scrollTo = (id: string) => window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 80);

type Ctx = { data: QuestsData; m: QuestsCopy; route: Route; navigate: Nav; lang: Lang; locale: string };

export function QuestBook({
  data,
  route,
  navigate,
  initial = DEFAULT_QUEST_VIEW,
  initialWho = "",
}: {
  data: QuestsData;
  route: Route;
  navigate: Nav;
  initial?: QuestView;
  /** El aldeano del filtro en el primer dibujo (los tests); "" son todos. */
  initialWho?: string;
}) {
  const t = useStardewCopy();
  const m = t.quests;
  const { lang } = useLang();
  const locale = useLocale();
  const [view, setView] = useState<QuestView>(initial);
  const [who, setWho] = useState(initialWho);

  // La vista de la dirección; sin `?v=` (aunque traiga otros parámetros), la del ancla (`#101` es una misión). Después, la fila del ancla.
  useEffect(() => {
    const anchor = window.location.hash.slice(1);
    setView(initialQuestView(data, window.location.search, anchor));
    const timer = anchor ? scrollTo(anchor) : undefined;
    return () => window.clearTimeout(timer);
  }, [data]);

  const go = (v: QuestView) => {
    setView(v);
    // Un aldeano que no está en la otra vista no deja la pantalla vacía: vuelve a todos.
    if (who && !requesters(data, v).includes(who)) setWho("");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${writeQuestView(v)}`);
  };
  const people = requesters(data, view);
  const ctx: Ctx = { data, m, route, navigate, lang, locale };

  return (
    <main className="sd-main sd-quests">
      <Box className="sd-intro">
        <h1 className="sd-h1">{m.h1}</h1>
        <p className="sd-lede">{m.lede}</p>
        <div className="sd-filters sd-qs-filters">
          <Group label={m.view}>
            {QUEST_VIEWS.map((v) => (
              <Pill on={view === v} onClick={() => go(v)} key={v}>
                {m.views[v]}
              </Pill>
            ))}
          </Group>
          <label className="sd-field">
            <span className="sd-label">{m.who}</span>
            <select className="sd-select" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">{m.everyone}</option>
              {[...people]
                .sort((a, b) => personName(data, a, lang).localeCompare(personName(data, b, lang), locale))
                .map((k) => (
                  <option value={k} key={k}>
                    {personName(data, k, lang)}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </Box>
      {view === "orders" ? <Orders {...ctx} who={who} /> : <Story {...ctx} who={who} />}
    </main>
  );
}

/** El nombre de quien pide o da, en el idioma pedido (la clave del juego si no estuviera). */
const personName = (data: QuestsData, who: string, lang: Lang): string => {
  const p = data.people[who];
  return p ? say(p.name, lang) : who;
};

/** El nombre de quien pide o da, enlazado a su ficha de Aldeanos si la tiene (Gunther y Marlon no). */
function PersonLink({ who, ctx }: { who: string; ctx: Ctx }) {
  const { data, route, navigate, lang } = ctx;
  const p = data.people[who];
  const name = personName(data, who, lang);
  if (!p?.slug) return <>{name}</>;
  return (
    <RouteLink className="sd-qs-plink" to={{ ...route, view: "stardew", sdSection: "villagers", detail: p.slug }} onNavigate={navigate} prefetch="press">
      {name}
    </RouteLink>
  );
}

/** El retrato de quien pide o da, a su tamaño (64×64, un múltiplo entero). */
function Face({ who }: { who: string }) {
  return <img className="sd-qs-face" src={portraitSrc(who)} alt="" width={64} height={64} loading="lazy" decoding="async" />;
}

/** "1,250–16,000" con la "g" del juego pegada: el oro que paga, o de cuánto a cuánto si depende de la opción. */
function Money({ n, max, locale, g }: { n: number; max?: number; locale: string; g: string }) {
  return (
    <span className="sd-gold sd-qs-gold">
      {n.toLocaleString(locale)}
      {max != null && `–${max.toLocaleString(locale)}`}
      <small>{g}</small>
    </span>
  );
}

/** Un objeto en su casillero chico con el nombre (enlazado a su ficha, si la tiene) y la cantidad si es más de uno. */
function Thing({ id, n, ctx, className, sprite, label }: { id?: string; n?: number; ctx: Ctx; className: string; sprite?: [number, number]; label?: string }) {
  const { data, route, navigate, lang, locale } = ctx;
  const r = id ? data.refs[id] : undefined;
  const [sw, sh] = r ? [r[4], r[5]] : (sprite ?? [16, 16]);
  const name = label ?? (r ? refName(r, lang) : "");
  const body = (
    <>
      {id && (r || sprite) && (
        <span className="sd-qs-pic">
          <Pix src={prizeSrc(id)} w={sw} h={sh} k={pixelScale(sw, sh, 32, 32)} />
        </span>
      )}
      <span className="sd-qs-tname">{name}</span>
      {n != null && n > 1 && <span className="sd-qs-n">×{n.toLocaleString(locale)}</span>}
    </>
  );
  return (
    <li className={className}>
      {r ? (
        <RouteLink className="sd-qs-thing" to={{ ...route, view: "stardew", sdSection: "items", detail: r[0] }} onNavigate={navigate} prefetch="press">
          {body}
        </RouteLink>
      ) : (
        <span className="sd-qs-thing">{body}</span>
      )}
    </li>
  );
}

// --- Pedidos especiales -----------------------------------------------------------------------------------------

function Orders({ who, ...ctx }: Ctx & { who: string }) {
  const { data, m } = ctx;
  const shown = data.orders.filter((o) => !who || o.who === who);
  const boards = (["town", "desert"] as const).map((b) => [b, shown.filter((o) => o.board === b)] as const).filter(([, l]) => l.length > 0);
  return (
    <>
      {boards.map(([b, list]) => (
        <Box className="sd-qo-board" key={b}>
          <h2 className="sd-h2">{b === "town" ? m.orders.town : m.orders.desert}</h2>
          <p className="sd-muted">{b === "town" ? m.orders.townHint : m.orders.desertHint}</p>
          <ul className="sd-qo-list">
            {list.map((o) => (
              <OrderCard {...ctx} o={o} key={o.key} />
            ))}
          </ul>
        </Box>
      ))}
    </>
  );
}

function OrderCard({ o, ...ctx }: Ctx & { o: Order }) {
  const { data, m, lang, locale } = ctx;
  const t = useStardewCopy();
  const long = isLongPick(o);
  // Entre muchas opciones de la misma cantidad (100 de un cultivo), la cantidad va una vez en el rótulo.
  const same = long && o.items.every((it) => it.n === o.items[0].n) ? o.items[0].n : null;
  const person = personName(data, o.who, lang);
  // Los objetivos de los que eligen entre muchas opciones nombran "una de las opciones de abajo" en vez de la lista.
  const goals = o.goals.map((g) => {
    const text = say(g, lang);
    if (!long) return text;
    const first = data.refs[o.items[0].id];
    const last = data.refs[o.items[o.items.length - 1].id];
    return first && last ? shortGoal(text, refName(first, lang), refName(last, lang), m.orders.instead) : text;
  });
  return (
    <li className="sd-qo" id={o.slug}>
      <header className="sd-qo-head">
        <Face who={o.who} />
        <div className="sd-qo-title">
          <h3 className="sd-qo-name">{say(o.name, lang)}</h3>
          <p className="sd-qo-who">
            <PersonLink who={o.who} ctx={ctx} />
          </p>
        </div>
        <p className="sd-qo-tags">
          <span className="sd-qs-tag">{m.orders.days(o.days)}</span>
          <span className={`sd-qs-tag${o.repeat ? " is-repeat" : ""}`}>{o.repeat ? m.orders.repeat : m.orders.once}</span>
        </p>
      </header>
      {!long && <p className="sd-qs-quote">{say(o.text, lang)}</p>}
      <ul className="sd-qs-goals">
        {goals.map((g, i) => (
          <li key={i}>{g}</li>
        ))}
      </ul>
      {o.items.length > 0 && (
        <div className="sd-qo-sec">
          <p className="sd-label">{orderPick(o) === "one" ? (same ? m.orders.needsOneOf(same.toLocaleString(locale)) : m.orders.needsOne) : m.orders.needsAll}</p>
          <ul className={`sd-qo-opts${long ? " is-many" : ""}`}>
            {o.items.map((it) => (
              <Thing ctx={ctx} id={it.id} n={same ? undefined : it.n} className="sd-qo-opt" key={it.id} />
            ))}
          </ul>
        </div>
      )}
      {long && (
        <details className="sd-qo-more">
          <summary>{m.orders.boardText}</summary>
          <p className="sd-qs-quote">{say(o.text, lang)}</p>
        </details>
      )}
      <div className="sd-qo-sec">
        <p className="sd-label">{m.orders.rewards}</p>
        <ul className="sd-qo-prizes">
          {o.rewards.map((r, i) => (
            <Prize ctx={ctx} r={r} person={person} g={t.gold} key={i} />
          ))}
        </ul>
      </div>
    </li>
  );
}

function Prize({ r, ctx, person, g }: { r: OrderReward; ctx: Ctx; person: string; g: string }) {
  const { m, lang, locale } = ctx;
  switch (r.k) {
    case "money":
      return (
        <li className="sd-qo-prize is-money">
          <Money n={r.n} max={r.max} locale={locale} g={g} />
        </li>
      );
    case "item":
      return <Thing ctx={ctx} id={r.id} n={r.n} className="sd-qo-prize" />;
    case "mail":
      return <Thing ctx={ctx} id={r.id} sprite={r.sprite} label={say(r.text, lang)} className="sd-qo-prize" />;
    case "friendship":
      return <li className="sd-qo-prize is-heart">{m.orders.friendship(r.n.toLocaleString(locale), person)}</li>;
  }
}

// --- Misiones de la historia ------------------------------------------------------------------------------------

function Story({ who, ...ctx }: Ctx & { who: string }) {
  const { data, m } = ctx;
  const chains = useMemo(() => questChains(data), [data]);
  // Los padres de cada misión, una vez: cada paso los usa para nombrar las que siguen en otra cadena.
  const parents = useMemo(() => questParents(data), [data]);
  // Con el filtro, sólo las misiones de ese aldeano (las cadenas que quedan vacías no salen).
  const shown = chains.map((c) => c.filter((q) => !who || q.from === who)).filter((c) => c.length > 0);
  // En la historia, primero las cadenas (a lo ancho) y después las sueltas; los pedidos por carta son todos sueltos.
  const story = shown.filter((c) => !c[0].from);
  const chained = story.filter((c) => c.length > 1);
  const loose = story.filter((c) => c.length === 1);
  const letters = shown.filter((c) => !!c[0].from);
  return (
    <>
      {story.length > 0 && (
        <Box className="sd-qm-box">
          <h2 className="sd-h2">{m.story.chains}</h2>
          <p className="sd-muted">{m.story.chainsHint}</p>
          {chained.length > 0 && (
            <ul className="sd-qm-chains">
              {chained.map((c) => (
                <Chain {...ctx} chain={c} parents={parents} key={c[0].key} />
              ))}
            </ul>
          )}
          {loose.length > 0 && (
            <ul className="sd-qm-loose">
              {loose.map((c) => (
                <Chain {...ctx} chain={c} parents={parents} key={c[0].key} />
              ))}
            </ul>
          )}
        </Box>
      )}
      {letters.length > 0 && (
        <Box className="sd-qm-box">
          <h2 className="sd-h2">{m.story.letters}</h2>
          <p className="sd-muted">{m.story.lettersHint}</p>
          <ul className="sd-qm-loose">
            {letters.map((c) => (
              <Chain {...ctx} chain={c} parents={parents} key={c[0].key} />
            ))}
          </ul>
        </Box>
      )}
    </>
  );
}

/** Una cadena: sus misiones en orden, numeradas si son más de una. Una suelta es una tarjeta sola. */
function Chain({ chain, parents, ...ctx }: Ctx & { chain: Quest[]; parents: Map<string, string> }) {
  const { m } = ctx;
  if (chain.length === 1)
    return (
      <li className="sd-qm-chain">
        <QuestStep {...ctx} q={chain[0]} parents={parents} />
      </li>
    );
  return (
    <li className="sd-qm-chain is-chain">
      <ol className="sd-qm-steps">
        {chain.map((q, i) => (
          <li className="sd-qm-stepli" key={q.key}>
            <span className="sd-qm-num" aria-hidden="true">
              {i + 1}
            </span>
            <span className="visually-hidden">{m.story.step(i + 1, chain.length)}</span>
            <QuestStep {...ctx} q={q} parents={parents} />
          </li>
        ))}
      </ol>
    </li>
  );
}

function QuestStep({ q, parents, ...ctx }: Ctx & { q: Quest; parents: Map<string, string> }) {
  const { data, m, lang, locale } = ctx;
  const t = useStardewCopy();
  const person = q.from ? personName(data, q.from, lang) : null;
  const elsewhere = nextElsewhere(data, q, parents);
  const pays: ReactNode[] = [];
  if (q.money > 0) pays.push(<Money n={q.money} locale={locale} g={t.gold} key="g" />);
  if (q.friendship && person) pays.push(<span key="f">{m.story.friendship(q.friendship.toLocaleString(locale), person)}</span>);
  return (
    <article className="sd-qm" id={q.slug}>
      <header className="sd-qm-head">
        {q.from && <Face who={q.from} />}
        <div className="sd-qm-title">
          <h3 className="sd-qm-name">{say(q.title, lang)}</h3>
          {person && (
            <p className="sd-qm-from">
              <span className="sd-label">{m.story.from}</span> <PersonLink who={q.from!} ctx={ctx} />
            </p>
          )}
        </div>
        {pays.length > 0 && (
          <p className="sd-qm-pays">
            <span className="visually-hidden">{m.story.pays} </span>
            {pays}
          </p>
        )}
      </header>
      <p className="sd-qs-quote">{say(q.desc, lang)}</p>
      <p className="sd-qm-goal">{say(q.goal, lang)}</p>
      {q.item && data.refs[q.item] && (
        <div className="sd-qm-item">
          <span className="sd-label">{m.story.item}</span>
          <ul>
            <Thing ctx={ctx} id={q.item} n={q.n} className="sd-qm-thing" />
          </ul>
        </div>
      )}
      {elsewhere.length > 0 && (
        <p className="sd-qm-next">
          <span className="sd-label">{m.story.continues}</span>{" "}
          {elsewhere.map((n, i) => (
            <span key={n.key}>
              {i > 0 && ", "}
              <a href={`#${n.slug}`}>{say(n.title, lang)}</a>
            </span>
          ))}
        </p>
      )}
    </article>
  );
}
