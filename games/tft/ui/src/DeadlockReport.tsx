import { useEffect, useMemo, useState } from "react";
import { useCopy, useLang, type Lang } from "./i18n";
import { text } from "./catalog";
import {
  fetchMatch,
  fetchNames,
  MatchError,
  type MatchPlayer,
  type ParsedMatch,
  type SteamAccount,
} from "./deadlockMatch";
import {
  adviceFor,
  buyOrder,
  gradeOf,
  keptItems,
  type Finding,
  type Grade,
  type Items,
} from "./deadlockAdvice";
import { heroImg, heroName, itemOf, items, rankOf, report, useReport } from "./deadlockReportData";
import RankBadge from "./DeadlockRankBadge";
import { lastAccount } from "./DeadlockPlayer";

/**
 * El informe de una partida.
 *
 * Cuatro cosas, en este orden: una nota para los doce, **de qué está hecha esa
 * nota**, qué compró y cuándo, y hasta tres consejos de compra.
 *
 * **El desglose de la nota no es decoración.** Medido sobre doce partidas
 * reales, la mitad devuelve uno o cero consejos de compras — y ahí una letra
 * sola no contesta "¿por qué C+?". El desglose sí: dice en cuál de las tres
 * señales quedaste por debajo de un jugador típico de ese héroe. Una nota sin
 * eso es el *grade* de Statlocker, que es justo lo que este producto no quiere
 * ser.
 *
 * La partida viene de deadlock-api en el momento; la referencia contra la que se
 * compara la publica nuestro pipeline (`report.json`). Si falta cualquiera de las
 * dos no se dibuja un informe a medias.
 */

const pct = (x: number, lang: Lang, d = 0): string =>
  `${(x * 100).toLocaleString(lang, { maximumFractionDigits: d })}%`;

/**
 * Un momento de la partida, en minutos enteros.
 *
 * **Sin decimales a propósito**: "31,3'" promete una precisión que la mediana de
 * una tabla no tiene, y nadie compra un objeto en el segundo 18 del minuto 31.
 */
const min = (x: number, lang: Lang): string => Math.round(x).toLocaleString(lang);

const mmss = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/**
 * Un número grande, corto, para el marcador.
 *
 * Ocho columnas de cinco dígitos son ilegibles de una pasada, y en una fila de
 * marcador lo que se compara es el orden de magnitud. **El número exacto no se
 * pierde**: viaja en el `title` de la celda, y las secciones de abajo —donde el
 * número ES la afirmación— lo imprimen entero.
 */
const corto = (x: number, lang: Lang): string => {
  // La "k" a mano y no `notation: "compact"`: en español eso imprime "44,1 mil",
  // que son ocho caracteres para una columna de tres y se sale de la celda. La
  // k es lo que usa cualquier marcador del género y se lee igual en los dos
  // idiomas.
  if (x < 1000) return x.toLocaleString(lang);
  return `${(x / 1000).toLocaleString(lang, { maximumFractionDigits: 1 })}k`;
};

/** El color de la letra: oro arriba, bronce abajo. */
const gradeTone = (index: number): string =>
  index >= 6 ? "is-gold" : index >= 3 ? "is-silver" : "is-bronze";

/* ── De qué está hecha la nota ────────────────────────────────────────────── */

function GradeBreakdown({ grade, hero, lang }: { grade: Grade; hero: string; lang: Lang }) {
  const copy = useCopy();
  const c = copy.deadlock.report;

  /**
   * El veredicto, en una oración.
   *
   * **Tres barras no contestan "¿por qué C+?"**: obligan a saber para qué lado
   * es bueno cada una y cuál pesa más. `impact` ya trae eso resuelto —el desvío
   * por su peso, negativo cuando restó— así que la señal que más restó es
   * simplemente la de menor impacto.
   */
  const ordenadas = [...grade.signals].sort((a, b) => a.impact - b.impact);
  const peor = ordenadas[0];
  const mejor = ordenadas[ordenadas.length - 1];
  const culpable = peor && peor.impact < 0 ? peor : null;
  const elegida = culpable ?? mejor;
  const veredicto = elegida
    ? (culpable ? c.costMost : c.helpedMost)({
        signal: c.signals[elegida.id as keyof typeof c.signals] ?? elegida.id,
        mine: pct(elegida.share, lang, 1),
        typical: pct(elegida.typical, lang, 1),
        hero,
      })
    : null;

  return (
    <>
      {veredicto && (
        <p className={`dl-rep-verdict ${culpable ? "is-bad" : "is-good"}`}>{veredicto}</p>
      )}
      <ul className="dl-rep-signals">
      {grade.signals.map((s) => {
        // La barra se dibuja contra el doble de lo típico, así que "lo normal"
        // cae siempre a la mitad y el ojo compara contra la misma marca en las
        // tres filas. Sin un tope fijo, cada señal tendría su propia escala y
        // dos barras iguales significarían cosas distintas.
        const tope = Math.max(s.typical * 2, s.share, 0.0001);
        const bueno = s.lowerIsBetter ? s.z < 0 : s.z > 0;
        return (
          <li className="dl-rep-signal" key={s.id}>
            <span className="dl-rep-signal-name">
              {c.signals[s.id as keyof typeof c.signals] ?? s.id}
            </span>
            <span className="dl-rep-signal-track">
              <span
                className={`dl-rep-signal-fill ${bueno ? "is-good" : "is-bad"}`}
                style={{ width: `${Math.min(100, (s.share / tope) * 100)}%` }}
              />
              <span className="dl-rep-signal-mark" style={{ left: `${(s.typical / tope) * 100}%` }} />
            </span>
            <span className="dl-rep-signal-num">{pct(s.share, lang, 1)}</span>
            <span className="dl-rep-signal-typ">{c.typical(pct(s.typical, lang, 1))}</span>
          </li>
        );
      })}
      </ul>
    </>
  );
}

/* ── Qué compró y cuándo ──────────────────────────────────────────────────── */

function BuildOrder({ player, lang }: { player: MatchPlayer; lang: Lang }) {
  const copy = useCopy();
  const orden = buyOrder(player, items as Items);
  if (orden.length === 0) return null;
  return (
    <ol className="dl-rep-build">
      {orden.map((compra) => {
        const it = itemOf(compra.itemId);
        const vendido = compra.soldS !== 0;
        return (
          <li className={`dl-rep-buy ${vendido ? "is-sold" : ""}`} key={`${compra.itemId}-${compra.buyS}`}>
            <img
              src={it?.img ?? ""}
              alt={it ? text(it.name, lang, "") : ""}
              title={
                it
                  ? `${text(it.name, lang, "")} · ${copy.deadlock.report.boughtAt(min(compra.buyS / 60, lang))}`
                  : ""
              }
              width={40}
              height={40}
              loading="lazy"
            />
            <span className="dl-rep-buy-min">{min(compra.buyS / 60, lang)}′</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ── Las almas de los doce ────────────────────────────────────────────────── */

/**
 * La curva de patrimonio de cada jugador.
 *
 * **Adentro del SVG no va ni una palabra**, que es la regla que salió de la
 * dispersión de ítems: los rótulos se pisan entre sí y con las marcas. Los
 * números van debajo como texto real, que además se selecciona y lo agranda el
 * zoom del navegador.
 *
 * El color es el del equipo —ámbar para `Team0`, que es Hidden King, y zafiro
 * para `Team1`, que es Archmother— y no uno por jugador: doce colores no se
 * distinguen, y lo que la curva contesta es quién iba arriba y desde cuándo. El
 * jugador elegido se dibuja grueso encima de todos.
 */
/** Las almas de un jugador en el momento señalado, del punto más cercano. */
function soulsAt(p: MatchPlayer, t: number): number {
  if (p.souls.length === 0) return 0;
  let mejor = p.souls[0];
  for (const s of p.souls) {
    if (Math.abs(s.t - t) < Math.abs(mejor.t - t)) mejor = s;
  }
  return mejor.netWorth;
}

function SoulsChart({
  match,
  selected,
  names,
  lang,
  onPick,
}: {
  match: ParsedMatch;
  selected: number | null;
  names: Map<number, SteamAccount>;
  lang: Lang;
  onPick: (slot: number) => void;
}) {
  const copy = useCopy();
  const c = copy.deadlock.report;
  const [ocultos, setOcultos] = useState<Set<number>>(new Set());
  /** El segundo que está señalando el puntero. `null` = no está encima. */
  const [señalado, setSeñalado] = useState<number | null>(null);

  const W = 700;
  const H = 220;
  const visibles = match.players.filter((p) => !ocultos.has(p.slot));
  const maxT = Math.max(match.durationS, ...match.players.flatMap((p) => p.souls.map((s) => s.t)));
  // La escala se ajusta a lo visible: esconder al más rico es justamente lo que
  // se hace para poder comparar a los demás entre sí.
  const maxNW = Math.max(1, ...visibles.flatMap((p) => p.souls.map((s) => s.netWorth)));
  const x = (t: number) => (t / maxT) * W;
  const y = (nw: number) => H - (nw / maxNW) * H;

  const linea = (p: MatchPlayer) =>
    p.souls.map((s, i) => `${i === 0 ? "M" : "L"}${x(s.t).toFixed(1)},${y(s.netWorth).toFixed(1)}`).join(" ");

  // El elegido al final para que quede arriba de todos: en SVG pinta el orden
  // del documento, no un z-index.
  const orden = [...visibles].sort((a, b) => (a.slot === selected ? 1 : b.slot === selected ? -1 : 0));

  const nombre = (p: MatchPlayer) => {
    const n = heroName(p.heroId);
    return names.get(p.accountId)?.name ?? (n ? text(n, lang, "") : String(p.heroId));
  };

  /**
   * De dónde está el puntero al segundo de partida.
   *
   * `pointer` y no `mouse` para que el dedo también lo mueva: en el teléfono no
   * hay hover, y sin esto el gráfico sería un dibujo.
   */
  const señalar = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0) return;
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setSeñalado(frac * maxT);
  };

  const lectura =
    señalado === null
      ? []
      : visibles
          .map((p) => ({ p, nw: soulsAt(p, señalado) }))
          .sort((a, b) => b.nw - a.nw);

  return (
    <div className="dl-rep-chart">
      {/* La leyenda es el filtro: apretar un jugador lo saca del gráfico, y
          apretar su retrato en el marcador lo pone en primer plano. Dos gestos
          distintos porque son dos preguntas distintas. */}
      <ul className="dl-rep-legend">
        {match.players.map((p) => (
          <li key={p.slot}>
            <button
              className={`dl-rep-key ${p.team === 0 ? "is-amber" : "is-sapphire"} ${
                ocultos.has(p.slot) ? "is-off" : ""
              } ${p.slot === selected ? "is-open" : ""}`}
              aria-pressed={!ocultos.has(p.slot)}
              onClick={() =>
                setOcultos((antes) => {
                  const next = new Set(antes);
                  if (next.has(p.slot)) next.delete(p.slot);
                  else next.add(p.slot);
                  return next;
                })
              }
              title={c.toggleCurve}
            >
              <img src={heroImg(p.heroId) ?? ""} alt="" width={20} height={20} loading="lazy" />
              <span>{nombre(p)}</span>
            </button>
          </li>
        ))}
      </ul>

      <svg
        className="dl-rep-souls"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        onPointerMove={señalar}
        onPointerDown={señalar}
        onPointerLeave={() => setSeñalado(null)}
      >
        {orden.map((p) => (
          <path
            key={p.slot}
            d={linea(p)}
            className={`dl-rep-curve ${p.team === 0 ? "is-amber" : "is-sapphire"} ${
              p.slot === selected ? "is-open" : ""
            }`}
          />
        ))}
        {señalado !== null && (
          <>
            <line className="dl-rep-guide" x1={x(señalado)} x2={x(señalado)} y1={0} y2={H} />
            {visibles.map((p) => (
              <circle
                key={p.slot}
                className={`dl-rep-dot ${p.team === 0 ? "is-amber" : "is-sapphire"}`}
                cx={x(señalado)}
                cy={y(soulsAt(p, señalado))}
                r={3}
              />
            ))}
          </>
        )}
      </svg>

      {/* La lectura va DEBAJO y como texto real, no adentro del SVG: los rótulos
          se pisan entre sí y con las marcas, y así además se selecciona y la
          agranda el zoom del navegador. */}
      {señalado === null ? (
        <p className="dl-footnote">
          {c.soulsNote(mmss(match.durationS), Math.round(maxNW).toLocaleString(lang))}
        </p>
      ) : (
        <div className="dl-rep-readout">
          <span className="dl-rep-readout-t">{mmss(señalado)}</span>
          <ul>
            {lectura.map(({ p, nw }) => (
              <li key={p.slot}>
                <button
                  className={`dl-rep-read ${p.team === 0 ? "is-amber" : "is-sapphire"} ${
                    p.slot === selected ? "is-open" : ""
                  }`}
                  onClick={() => onPick(p.slot)}
                >
                  <img src={heroImg(p.heroId) ?? ""} alt="" width={18} height={18} loading="lazy" />
                  <span className="dl-rep-read-name">{nombre(p)}</span>
                  <span className="dl-rep-read-num">{corto(nw, lang)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Los consejos ─────────────────────────────────────────────────────────── */

function Findings({ list, lang }: { list: Finding[]; lang: Lang }) {
  const copy = useCopy();
  const c = copy.deadlock.report;
  const nombre = (id?: number) => {
    const it = id === undefined ? null : itemOf(id);
    return it ? text(it.name, lang, "") : "";
  };
  const img = (id?: number) => (id === undefined ? null : (itemOf(id)?.img ?? null));

  return (
    <ul className="dl-rep-findings">
      {list.map((f, i) => {
        let frase = "";
        if (f.id === "resist") {
          frase = c.families.resist({
            share: pct(f.n.share, lang),
            rate: pct(f.n.rate, lang),
            item: nombre(f.itemId),
            spirit: f.n.spirit === 1,
          });
        } else if (f.id === "skipped") {
          frase = c.families.skipped({ rate: pct(f.n.rate, lang), item: nombre(f.itemId) });
        } else if (f.id === "late") {
          frase = c.families.late({
            rate: pct(f.n.rate, lang),
            item: nombre(f.itemId),
            mine: min(f.n.mine, lang),
            theirs: min(f.n.theirs, lang),
          });
        } else if (f.id === "unupgraded") {
          frase = c.families.unupgraded({
            rate: pct(f.n.rate, lang),
            item: nombre(f.itemId),
            from: nombre(f.n.from),
          });
        } else if (f.id === "souls") {
          frase = c.families.souls({
            mine: Math.round(f.n.mine).toLocaleString(lang),
            theirs: Math.round(f.n.theirs).toLocaleString(lang),
          });
        } else if (f.id === "slots") {
          frase = c.families.slots({ mine: String(f.n.mine), theirs: String(f.n.theirs) });
        } else if (f.id === "split") {
          frase = c.families.split({
            weapon: pct(f.n.weapon, lang),
            vitality: pct(f.n.vitality, lang),
            spirit: pct(f.n.spirit, lang),
            theirs: `${pct(f.n.theirWeapon, lang)} / ${pct(f.n.theirVitality, lang)} / ${pct(
              f.n.theirSpirit,
              lang
            )}`,
          });
        } else if (f.id === "imbue") {
          frase = c.families.imbue({ rate: pct(f.n.rate, lang) });
        } else {
          frase = c.families.sold({
            item: nombre(f.itemId),
            rate: pct(f.n.rate, lang),
            at: min(f.n.soldAt, lang),
          });
        }
        const src = img(f.itemId);
        return (
          <li className="dl-rep-finding" key={`${f.id}-${f.itemId ?? i}`}>
            {src ? (
              <img className="dl-rep-finding-icon" src={src} alt="" width={44} height={44} loading="lazy" />
            ) : (
              <span className="dl-rep-finding-icon is-empty" aria-hidden="true" />
            )}
            <p>{frase}</p>
          </li>
        );
      })}
    </ul>
  );
}

export default function DeadlockReport({
  matchId,
  onBack,
}: {
  matchId?: string;
  /** Vuelve al historial de la cuenta que se estaba mirando, o al buscador. */
  onBack: (accountId: number | null) => void;
}) {
  const copy = useCopy();
  const { lang } = useLang();
  const c = copy.deadlock.report;
  const { ready, failed } = useReport();

  const [match, setMatch] = useState<ParsedMatch | null>(null);
  const [names, setNames] = useState<Map<number, SteamAccount>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [elegido, setElegido] = useState<number | null>(null);

  const id = matchId ? Number(matchId) : null;

  useEffect(() => {
    if (!id || !Number.isFinite(id)) return;
    let vivo = true;
    setMatch(null);
    setNames(new Map());
    setError(null);
    fetchMatch(id).then(
      (m) => {
        if (!vivo) return;
        setMatch(m);
        // Los nombres van después y en un solo pedido: la partida se dibuja sin
        // esperarlos, y si no llegan queda el héroe en su lugar.
        fetchNames(m.players.map((p) => p.accountId)).then((n) => vivo && setNames(n));
        // Si se llegó desde un historial, el informe se abre en esa persona. Un
        // link compartido no trae cuenta y ahí se pide elegir: la partida es de
        // doce, y adivinar de quién hablar sería inventar.
        const mio = m.players.find((p) => p.accountId === lastAccount());
        setElegido(mio ? mio.slot : null);
      },
      (e) => {
        if (!vivo) return;
        setError(e instanceof MatchError && e.code === "NOT_FOUND" ? c.notFound : c.apiDown);
      }
    );
    return () => {
      vivo = false;
    };
  }, [id, c.apiDown, c.notFound]);

  const file = ready ? report() : null;
  const jugador = useMemo(
    () => (match && elegido !== null ? (match.players.find((p) => p.slot === elegido) ?? null) : null),
    [match, elegido]
  );
  const consejos = useMemo(
    () => (match && jugador && file ? adviceFor(jugador, match, file, items) : []),
    [match, jugador, file]
  );
  const nota = match && jugador && file ? gradeOf(jugador, match, file) : null;

  if (error)
    return (
      <section className="tool">
        <p className="dl-fallback">{error}</p>
      </section>
    );
  if (failed)
    return (
      <section className="tool">
        <p className="dl-fallback">{c.noReference}</p>
      </section>
    );
  if (!match || !file)
    return (
      <section className="tool">
        <p className="dl-loading">{c.loadingMatch}</p>
      </section>
    );

  const rango = rankOf(match.badge);
  const equipos = [0, 1].map((t) => match.players.filter((p) => p.team === t));
  const nombreHeroe = (heroId: number) => {
    const n = heroName(heroId);
    return n ? text(n, lang, "") : String(heroId);
  };

  return (
    <section className="tool">
      {/* Volver, arriba de todo. La partida se abre desde el historial y hasta
          ahora la única salida era el botón del navegador — que en una SPA
          funciona, pero nadie lo busca cuando está adentro de una página que se
          siente propia. Si se llegó por un link compartido no hay historial al
          que volver y lleva al buscador, que es lo que corresponde. */}
      <button className="dl-rep-back" onClick={() => onBack(lastAccount())}>
        ← {lastAccount() === null ? c.backToSearch : c.backToMatches}
      </button>

      <div className="tool-head">
        <div>
          <p className="eyebrow">{copy.deadlock.eyebrow}</p>
          <h1 className="tool-title">{c.reportTitle}</h1>
        </div>
        <span className="dl-rep-badge">
          {rango && (
            <>
              {/* Una sola insignia con el numeral encima. La segunda imagen que
                  iba al lado del nombre era la insignia entera apretada en 18px
                  — ver `rankOf`. */}
              <RankBadge badge={match.badge} height={26} eager />
              {text(rango.name, lang, "")} ·{" "}
            </>
          )}
          {mmss(match.durationS)}
        </span>
      </div>

      <div className="dl-rep-board">
        {equipos.map((equipo, t) => (
          <div className="dl-rep-side" key={t}>
            {/* El resultado, escrito, y el nombre del bando. El borde de color ya
                dice quién ganó, pero un color solo no lo lee un lector de
                pantalla ni alguien que no distingue el verde del rojo.
                "Hidden King" y "Archmother" son del juego y no se traducen. */}
            <p className="dl-rep-team-head">
              <span className={t === match.winningTeam ? "is-win" : "is-loss"}>
                {t === match.winningTeam ? c.win : c.loss}
              </span>
              <span className="dl-rep-team-name">{t === 0 ? "Hidden King" : "Archmother"}</span>
            </p>
            <ul className="dl-rep-rows">
              <li className="dl-rep-row is-head">
                <span>{c.cols.player}</span>
                <span>{c.grade}</span>
                <span>{c.cols.souls}</span>
                <span>{c.cols.kda}</span>
                <span>{c.cols.damage}</span>
                <span>{c.cols.obj}</span>
                <span>{c.cols.heal}</span>
                <span>{c.cols.items}</span>
              </li>
              {equipo.map((p) => {
                const g = gradeOf(p, match, file);
                const quien = names.get(p.accountId)?.name;
                return (
                  <li key={p.slot}>
                    <button
                      className={`dl-rep-row ${elegido === p.slot ? "is-open" : ""} ${
                        p.team === match.winningTeam ? "is-win" : "is-loss"
                      }`}
                      onClick={() => setElegido(p.slot)}
                      title={g ? c.gradeHow(g.letter, nombreHeroe(p.heroId)) : c.noGrade}
                    >
                      <span className="dl-rep-who">
                        <img
                          className="dl-rep-face"
                          src={heroImg(p.heroId) ?? ""}
                          alt={nombreHeroe(p.heroId)}
                          width={40}
                          height={40}
                          loading="lazy"
                        />
                        <span className="dl-rep-who-txt">
                          <span className="dl-rep-who-name">{quien ?? nombreHeroe(p.heroId)}</span>
                          <span className="dl-rep-who-hero">{nombreHeroe(p.heroId)}</span>
                        </span>
                      </span>
                      <span className="dl-rep-cell">
                        {g ? (
                          <span className={`dl-rep-grade is-cell ${gradeTone(g.index)}`}>{g.letter}</span>
                        ) : (
                          <span className="dl-rep-dash">—</span>
                        )}
                      </span>
                      <span className="dl-rep-cell is-num" title={p.netWorth.toLocaleString(lang)}>
                        {corto(p.netWorth, lang)}
                      </span>
                      <span className="dl-rep-cell is-num">
                        {p.kills}/{p.deaths}/{p.assists}
                      </span>
                      <span className="dl-rep-cell is-num" title={p.damage.toLocaleString(lang)}>
                        {corto(p.damage, lang)}
                      </span>
                      <span className="dl-rep-cell is-num" title={p.boss.toLocaleString(lang)}>
                        {corto(p.boss, lang)}
                      </span>
                      <span className="dl-rep-cell is-num" title={p.healing.toLocaleString(lang)}>
                        {corto(p.healing, lang)}
                      </span>
                      <span className="dl-rep-cell dl-rep-mini">
                        {keptItems(p, items as Items).map((itemId) => {
                          const it = itemOf(itemId);
                          return (
                            <img
                              key={itemId}
                              src={it?.img ?? ""}
                              alt=""
                              title={it ? text(it.name, lang, "") : ""}
                              width={18}
                              height={18}
                              loading="lazy"
                            />
                          );
                        })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <h2 className="dl-section-title">{c.soulsTitle}</h2>
      <SoulsChart
        match={match}
        selected={elegido}
        names={names}
        lang={lang}
        onPick={setElegido}
      />

      {!jugador && <p className="detail-note">{c.pickPlayer}</p>}

      {jugador && (
        <>
          <h2 className="dl-section-title">
            {c.you} {nombreHeroe(jugador.heroId)}
          </h2>

          {nota ? (
            <>
              <p className="dl-rep-grade-line">
                <span className={`dl-rep-grade is-big ${gradeTone(nota.index)}`}>{nota.letter}</span>
                <span>{c.gradeHow(nota.letter, nombreHeroe(jugador.heroId))}</span>
              </p>
              <GradeBreakdown grade={nota} hero={nombreHeroe(jugador.heroId)} lang={lang} />
            </>
          ) : (
            <p className="detail-note">{c.noGrade}</p>
          )}

          <h3 className="dl-rep-sub">{c.buildTitle}</h3>
          <BuildOrder player={jugador} lang={lang} />

          <h3 className="dl-rep-sub">{c.adviceTitle}</h3>
          {consejos.length === 0 ? (
            <p className="dl-rep-clean">{c.clean}</p>
          ) : (
            <Findings list={consejos} lang={lang} />
          )}
          <p className="dl-footnote">
            {c.measured(
              copy.deadlock.bands[file.band as keyof typeof copy.deadlock.bands] ?? file.band,
              file.window.matches.toLocaleString(lang)
            )}
          </p>
        </>
      )}
    </section>
  );
}
