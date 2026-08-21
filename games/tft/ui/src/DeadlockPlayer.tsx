import { useEffect, useState } from "react";
import { useCopy, useLang, useLocale, type Lang } from "./i18n";
import { text } from "./catalog";
import {
  searchAccounts,
  fetchHistory,
  fetchAccount,
  fetchRank,
  fetchRankSteps,
  summarize,
  rankedCorpus,
  scopeCounts,
  scopeRows,
  streakOf,
  formOf,
  CALIBRATION_MATCHES,
  MatchError,
  type MatchScope,
  type SteamAccount,
  type HistoryRow,
  type PlayerSummary,
  type PlayerRank,
  type RankStep,
} from "./deadlockMatch";
import { useGrades } from "./deadlockGrades";
import { heroImg, heroName, rankLabel, rankOf } from "./deadlockReportData";
import RankBadge from "./DeadlockRankBadge";
import DeadlockStreakForm from "./DeadlockStreakForm";
import DeadlockActivity from "./DeadlockActivity";
import DeadlockScopePicker from "./DeadlockScopePicker";
import {
  metalOf,
  useHeroPlacings,
  type HeroPlacing,
  type WorldStanding,
} from "./deadlockHeroLadder";

/**
 * El buscador, el perfil y el historial de Deadlock.
 *
 * **Sin login, y eso no es una etapa: es el diseño.** `steam-search` resuelve un
 * nombre y `match-history` contesta con el `account_id` pelado, así que "buscá tu
 * perfil" no necesita tocar Steam OpenID. Entrar con la cuenta serviría para
 * recordarla, que no es el camino crítico.
 *
 * El resumen de arriba **no pide un endpoint más**: sale del mismo historial que
 * dibuja la lista (ver `summarize`). Lo único que se pide aparte es la ficha de
 * Steam, y sólo cuando se llega por link directo sin haber buscado.
 */

/**
 * La última cuenta que se miró.
 *
 * La usa el informe para saber **de quién** hablar cuando alguien llega desde el
 * historial. En un link compartido no hay cuenta previa y la página pide que se
 * elija un jugador, que es lo correcto: la partida es de doce personas.
 */
let ultimaCuenta: number | null = null;
export const lastAccount = (): number | null => ultimaCuenta;
export const rememberAccount = (id: number): void => {
  ultimaCuenta = id;
};

const mmss = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/**
 * Cuándo se jugó, en corto.
 *
 * `start_time` viene en segundos, no en milisegundos: multiplicarlo mal manda la
 * partida a 1970 y la fecha se ve rara sin que nada falle.
 */
const fecha = (s: number, lang: Lang): string =>
  new Date(s * 1000).toLocaleDateString(lang, { day: "numeric", month: "short" });

/**
 * Cuántas filas del historial se dibujan de entrada, y de a cuántas crece.
 *
 * **Bajó de 40 a 15 el 2026-08-12**, con el botón de "mostrar más" al pie. El
 * informe competitivo midió que ninguno de los cuatro sitios del género deja la
 * lista abierta: op.gg corta en 20 con "Show more", OpenDota topea en 20 y
 * enlaza a la pestaña completa, Dotabuff hace top-N por módulo. Cuarenta filas
 * eran 2.746px de página nuestra contra 1.569px de página entera de Statlocker.
 *
 * Sigue siendo un tope de PRESENTACIÓN: el filtro por héroe elige sobre el
 * historial entero y el resumen describe lo visible, nunca las 475.
 */
const HISTORY_PAGE = 15;

/**
 * El alto de la insignia en la fila del historial, y el de cada una de las dos
 * de un ascenso.
 *
 * **Eran 18 px, y a ese tamaño la insignia no dice nada**: el numeral del
 * subnivel vive en un rombo que ocupa un séptimo de la imagen, así que "Eternus
 * 3 → Eternus 4" se veía como dos manchas iguales. El ancho sale de la
 * proporción real (ver `rankArtW`). **No estiran la fila**: el retrato del héroe
 * son 40 px y sigue mandando el alto.
 *
 * El ascenso va un escalón más chico porque son dos insignias y una flecha en la
 * misma celda — el par entero mide 83,2 px de los 91,2 que da la columna a 19px
 * de raíz. Si alguna de las dos medidas sube, sube también `4.8rem` en
 * `codex.css`.
 */
const RANK_H = 34;
const RANKUP_H = 26;

/**
 * La ficha del jugador: quién es y en qué rango está.
 *
 * **La insignia de rango es lo primero que se ve**, no un ícono de 30px al lado
 * del texto (pedido de ZoTaD el 2026-08-12). En un juego con clasificatorias
 * el rango es la identidad del jugador, y así lo tratan los cuatro sitios
 * medidos. Vive en la columna lateral: dejó de ser una fila de 1163px.
 */
function Profile({
  account,
  resumen,
  rank,
  rankReady,
  world,
}: {
  account: SteamAccount | null;
  resumen: PlayerSummary;
  rank: PlayerRank | null;
  /** Si el pedido del rango ya volvió. Sin esto, una falla se dibuja como un hecho. */
  rankReady: boolean;
  /** El puesto mundial, si llegó al piso de clasificatorias. */
  world: WorldStanding | null;
}) {
  const copy = useCopy();
  const { lang } = useLang();
  const c = copy.deadlock.report;
  /**
   * El rango sale SÓLO del endpoint que lo sabe.
   *
   * El respaldo `|| resumen.badge` —el badge de alguna partida del historial— se
   * borró el 2026-08-13. Medido sobre las 475 partidas de una cuenta real:
   * **ninguna trae badge**, así que el respaldo nunca ayudaba. Y si algún día
   * trajera uno viejo, taparía al endpoint autoritativo con un rango vencido:
   * un respaldo que sólo puede mentir no es un respaldo.
   */
  const rango = rankOf(rank?.badge ?? 0);
  const num = (x: number, d = 0) => x.toLocaleString(lang, { maximumFractionDigits: d });
  const calibrando = !rango && rank !== null && rank.calibrating;

  return (
    <div className="dl-rep-profile">
      <div className="dl-profile-id-row">
        {account?.avatar && (
          <img className="dl-rep-avatar" src={account.avatar} alt="" width={56} height={56} />
        )}
        <div className="dl-rep-profile-id">
          <h2 className="dl-rep-profile-name">
            {/* La bandera del país que la persona puso en Steam, como imagen:
                el emoji no tiene fuente en Windows. Ver `Flag` en la escalera. */}
            {account?.country && account.country.length === 2 && (
              <img
                className="dl-flag"
                src={`https://flagcdn.com/32x24/${account.country.toLowerCase()}.png`}
                srcSet={`https://flagcdn.com/64x48/${account.country.toLowerCase()}.png 2x`}
                alt={account.country.toUpperCase()}
                title={account.country.toUpperCase()}
                width={22}
                height={17}
              />
            )}
            {account?.name ?? ""}
          </h2>
          {/* El enlace al perfil de Steam. `rel="noopener"` porque abre en otra
              pestaña, y `nofollow` porque es un perfil de un tercero: no le
              pasamos autoridad ni le pedimos a Google que lo rastree. */}
          {account?.steamUrl && (
            <a
              className="dl-steam-link"
              href={account.steamUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              {c.steamProfile}
            </a>
          )}
        </div>
      </div>

      {/* Tres estados y no dos, porque en los datos dos de ellos son el mismo
          cero: con rango, calibrando (y cuántas faltan), y nunca jugó
          clasificatorias. Statlocker rellena la calibración con un rango propio
          inventado; nosotros decimos la verdad y decimos cuánto falta. */}
      {rango ? (
        <div className="dl-rank-badge">
          {/* La insignia con el numeral encima, que es la identidad del jugador:
              va grande y es lo primero que se ve de la tarjeta. */}
          <RankBadge badge={rank!.badge} height={54} eager />
          <span>
            {/* El nombre en texto y el numeral EN LA INSIGNIA, no repetido acá:
                antes iba una segunda imagen al lado que era la misma insignia
                apretada en 22px, y se leía como un borrón. */}
            <strong className="dl-rank-name" title={rankLabel(rango, lang)}>
              {text(rango.name, lang, "")}
            </strong>
            {rank && rank.lastChange !== 0 && (
              <span className="dl-rank-note">
                <span className="dl-rep-progress">
                  {rank.lastChange > 0 ? "+" : ""}
                  {rank.lastChange}
                </span>
              </span>
            )}
          </span>
          <WorldTag world={world} />
        </div>
      ) : (
        <div className="dl-rank-badge is-calibrating">
          <span className="dl-rank-slot" aria-hidden="true" />
          <span>
            <strong className="dl-rank-name">
              {/* Tres estados y no dos: mientras el pedido no volvió no se
                  afirma nada. Decir "sin rango" porque la API no contestó es
                  poner una falla de red en boca del dato. */}
              {!rankReady
                ? c.rankUnknown
                : calibrando
                  ? c.calibrating(rank!.calibrationPlayed, CALIBRATION_MATCHES)
                  : c.noRank}
            </strong>
            {/* "Faltan 0" no es una frase: cuando terminó las ocho y el juego
                todavía no destapó la insignia, alcanza con "8 de 8". */}
            {rankReady && calibrando && rank!.calibrationLeft > 0 && (
              <span className="dl-rank-note">{c.calibratingLeft(rank!.calibrationLeft)}</span>
            )}
          </span>
        </div>
      )}

      <dl className="dl-rep-stats">
        <div>
          <dt>{c.stats.matches}</dt>
          <dd>{resumen.matches}</dd>
        </div>
        <div>
          <dt>{c.stats.winRate}</dt>
          <dd>{num(resumen.winRate * 100, 0)}%</dd>
        </div>
        <div>
          <dt>{c.stats.kda}</dt>
          <dd>
            {num(resumen.kills, 1)}/{num(resumen.deaths, 1)}/{num(resumen.assists, 1)}
          </dd>
        </div>
        <div>
          <dt>{c.stats.souls}</dt>
          <dd>{num(resumen.soulsPerMin, 0)}</dd>
        </div>
        <div>
          <dt>{c.stats.lastHitsDenies}</dt>
          <dd>
            {num(resumen.lastHits, 0)} / {num(resumen.denies, 0)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * El puesto mundial, al lado del rango.
 *
 * **Es un número absoluto, no un top.** El ranking por héroe premia estar entre
 * los cien; esto contesta la otra pregunta —"¿dónde estoy yo?"— y la contesta
 * para cualquiera que llegue al piso de partidas, sea el #7 o el #7.412.
 *
 * Se dibuja sólo cuando hay número. Un cartel de "no calificás" al lado del rango
 * sería lo primero que ve todo el que abre su perfil, y no es información: es un
 * recordatorio de que no jugaste lo suficiente.
 */
function WorldTag({ world }: { world: WorldStanding | null }) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.deadlock.report;
  if (!world) return null;
  return (
    <span
      className="dl-world-tag"
      title={c.worldTagTitle(world.of.toLocaleString(locale), world.minMatches)}
    >
      <em>{c.worldTagLabel}</em>#{world.place.toLocaleString(locale)}
    </span>
  );
}

/**
 * En qué héroes el jugador entra al top 100 del mundo.
 *
 * **Es la tarjeta que contesta "¿soy bueno con alguien?" de una mirada**, y es
 * lo único del perfil que compara al jugador contra el mundo entero en vez de
 * contra sí mismo. Del primero al tercero llevan metal —oro, plata y bronce, con
 * un brillo apenas— y del cuarto al centésimo el número va en blanco: si todo
 * brillara, nada brillaría.
 *
 * No cuesta ningún pedido: sale del archivo que publica el pipeline. Ver
 * `deadlockHeroLadder.ts`.
 */
function HeroPlacings({ placings }: { placings: HeroPlacing[] }) {
  const copy = useCopy();
  const { lang } = useLang();
  const c = copy.deadlock.report;

  if (placings.length === 0) return null;

  return (
    <div className="dl-card">
      <h2 className="dl-card-title">{c.cards.placings}</h2>
      <p className="detail-note dl-placings-note">{c.placingsLead(placings.length)}</p>
      <ul className="dl-placings">
        {placings.map((p) => {
          const n = heroName(p.heroId);
          const nombre = n ? text(n, lang, "") : String(p.heroId);
          return (
            <li className="dl-placing" key={p.heroId} data-metal={metalOf(p.place) ?? undefined}>
              <img src={heroImg(p.heroId) ?? ""} alt="" width={40} height={40} loading="lazy" />
              <span className="dl-placing-num" title={c.placingTitle(nombre, p.place)}>
                #{p.place}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Los héroes más jugados, que son además los botones del filtro del historial. */
function TopHeroes({
  heroes,
  activeHero,
  onToggleHero,
}: {
  /** Sale del historial ENTERO, no del filtrado: si siguiera al filtro, elegir
   *  un héroe borraría los botones de los demás y no se podría cambiar. */
  heroes: { heroId: number; matches: number; wins: number }[];
  activeHero: number | null;
  onToggleHero: (heroId: number) => void;
}) {
  const copy = useCopy();
  const { lang } = useLang();
  const c = copy.deadlock.report;

  return (
    <div className="dl-rep-top" role="group" aria-label={c.stats.top}>
      {heroes.slice(0, 5).map((h) => {
        const n = heroName(h.heroId);
        const nombre = n ? text(n, lang, "") : String(h.heroId);
        const activo = activeHero === h.heroId;
        return (
          <button
            type="button"
            className="dl-rep-top-hero"
            key={h.heroId}
            data-active={activo}
            aria-pressed={activo}
            aria-label={c.filterByHero(nombre)}
            title={`${nombre} · ${h.matches}`}
            onClick={() => onToggleHero(h.heroId)}
          >
            <img src={heroImg(h.heroId) ?? ""} alt="" width={34} height={34} loading="lazy" />
            <span>{h.matches}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function DeadlockPlayer({
  accountId,
  onOpenAccount,
  onOpenMatch,
}: {
  accountId?: string;
  onOpenAccount: (id: number) => void;
  onOpenMatch: (id: number) => void;
}) {
  const copy = useCopy();
  const { lang } = useLang();
  const c = copy.deadlock.report;

  const [query, setQuery] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [cuentas, setCuentas] = useState<SteamAccount[] | null>(null);
  const [historial, setHistorial] = useState<HistoryRow[] | null>(null);
  const [cuenta, setCuenta] = useState<SteamAccount | null>(null);
  const [rango, setRango] = useState<PlayerRank | null>(null);
  /**
   * Si el pedido del rango llegó, aunque haya llegado vacío.
   *
   * **Sin esto, un pedido que falla se dibuja como un hecho.** `fetchRank`
   * fallaba en silencio y dejaba `rango` en `null`, y la ficha renderiza con
   * `null` exactamente lo mismo que cuando la API contesta "no tiene rango": el
   * cartel de "Todavía sin partidas rankeadas". Un 429 pasajero se veía, así,
   * como una afirmación sobre el jugador — y al recargar volvía a aparecer el
   * rango. Es el "a veces lo veo y a veces no" que reportó ZoTaD.
   */
  const [rangoListo, setRangoListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** El héroe elegido en "Most played". `null` = sin filtro, historial entero. */
  const [heroFiltro, setHeroFiltro] = useState<number | null>(null);
  /** En qué modo se está mirando el perfil entero. */
  const [modo, setModo] = useState<MatchScope>("all");
  /** Cuántas filas del historial se están dibujando. Crece con el botón del pie. */
  const [verFilas, setVerFilas] = useState(HISTORY_PAGE);
  const id = accountId ? Number(accountId) : null;

  /** En qué héroes entra al top 100 del mundo. No cuesta ningún pedido. */
  const { placings, world } = useHeroPlacings(id);
  /** El rango partida por partida, para marcar en cuál ascendió. */
  const [pasos, setPasos] = useState<Map<number, RankStep>>(new Map());

  useEffect(() => {
    if (!id || !Number.isFinite(id)) {
      setHistorial(null);
      setCuenta(null);
      setRango(null);
      setHeroFiltro(null);
      // Volver al buscador deja el filtro como lo encuentra el próximo perfil
      // antes de que llegue su historial: sin esto, la lista aparecería un
      // instante filtrada al modo del jugador anterior.
      setModo("all");
      return;
    }
    let vivo = true;
    rememberAccount(id);
    setHistorial(null);
    setError(null);
    // Cambiar de cuenta con un héroe filtrado dejaría el filtro puesto sobre
    // un historial que todavía no llegó — y encima de otro jugador.
    setHeroFiltro(null);
    // Y dejaría abiertas las 60 filas que se pidieron del jugador anterior.
    setVerFilas(HISTORY_PAGE);
    fetchHistory(id).then(
      (h) => {
        if (!vivo) return;
        setHistorial(h);
        /**
         * **Un perfil abre en clasificatorias, si la cuenta tiene.**
         *
         * Es la pregunta con la que alguien entra a un perfil —el suyo o el de
         * otro—: cómo le va en lo que cuenta. Mezclar ahí las normales y la
         * pelea callejera contesta otra cosa, y hasta hoy había que apretar el
         * filtro todas las veces.
         *
         * **El respaldo no es cosmético**: hay cuentas con cero clasificatorias
         * —ranked abrió hace dos semanas— y abrirlas en un modo vacío mostraría
         * un perfil sin una sola cifra, con la pastilla elegida deshabilitada.
         * Con historial en cero también cae acá, y `all` es lo único honesto.
         *
         * Se decide por cuenta y no una sola vez: entrar a otro perfil vuelve a
         * elegir, en vez de arrastrar el modo del jugador anterior.
         */
        setModo(scopeCounts(h).ranked > 0 ? "ranked" : "all");
      },
      (e) =>
        vivo && setError(e instanceof MatchError && e.code === "NOT_FOUND" ? c.noAccounts : c.apiDown)
    );
    // La ficha de Steam va aparte y **puede fallar sin llevarse la página**: si
    // no llega, se pierden el avatar y el nombre, no el historial.
    fetchAccount(id).then(
      (a) => vivo && setCuenta(a),
      () => undefined
    );
    setRango(null);
    setRangoListo(false);
    fetchRank(id).then(
      (r) => {
        if (!vivo) return;
        setRango(r);
        setRangoListo(true);
      },
      // Falla: `rangoListo` queda en false y la ficha NO afirma nada sobre el
      // rango. Callar es correcto; inventar "no tiene rango" no lo es.
      () => undefined
    );
    // El rango partida por partida. Falla en silencio: sin esto el historial se
    // dibuja igual, sólo sin las marcas de ascenso.
    setPasos(new Map());
    fetchRankSteps(id).then(
      (p) => vivo && setPasos(p),
      () => undefined
    );
    return () => {
      vivo = false;
    };
  }, [id, c.apiDown, c.noAccounts]);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setBuscando(true);
    setError(null);
    try {
      setCuentas(await searchAccounts(query.trim()));
    } catch {
      setError(c.apiDown);
    } finally {
      setBuscando(false);
    }
  }

  // El filtro elige sobre el historial entero (hasta 475 filas medidas); el
  // tope de dibujado se aplica después, sobre lo ya elegido.
  const historialCompleto: HistoryRow[] = historial ?? [];
  /**
   * **El modo se aplica ANTES que el héroe, y de ahí sale todo lo demás.**
   *
   * `enModo` es el historial del jugador tal como lo pidió: si eligió
   * clasificatorias, el perfil entero habla de clasificatorias. El filtro de
   * héroe se apila encima y sólo afecta a la lista y a su resumen, porque es una
   * lupa sobre lo mismo; el modo es otra pregunta.
   */
  const conteos = scopeCounts(historialCompleto);
  const enModo = scopeRows(historialCompleto, modo);
  const filtrado = heroFiltro != null ? enModo.filter((r) => r.heroId === heroFiltro) : enModo;
  const visibles = filtrado.slice(0, verFilas);
  /**
   * **El resumen describe el historial ENTERO, no una ventana.**
   *
   * Describió `visibles` primero y una ventana fija de 15 después, y las dos
   * estaban mal por el mismo motivo: la ficha decía "PARTIDAS 15" —el tamaño de
   * la ventana, no un dato del jugador— justo al lado de "Calibrando · 2 de 8".
   * ZoTaD lo leyó como "tengo 15 clasificatorias y me sigue diciendo que
   * calibro", que es exactamente lo que ese par de números aparenta.
   *
   * Un número que en realidad es una constante de presentación no es una
   * estadística. Ahora las cinco cifras hablan de todo lo que la API devolvió, y
   * la forma reciente vive en su propia tarjeta, que dice sobre cuántas mide.
   */
  const resumen = filtrado.length > 0 ? summarize(filtrado) : null;
  // "Most played" NO sigue al filtro de héroe —si lo hiciera, elegir un héroe
  // borraría los botones de los demás y nadie podría cambiar sin soltarlo
  // primero— pero SÍ sigue al modo: los héroes que más jugás en pelea callejera
  // no tienen por qué ser los de tus clasificatorias.
  const heroesTop = summarize(enModo)?.heroes ?? [];
  // La racha y la forma nunca miran el filtro de héroe (ver el comentario de
  // `DeadlockStreakForm`), pero sí el modo: con "todas" siguen eligiendo solas
  // entre ranked y el historial completo, y con un modo elegido miran ese.
  const corpus = historial ? rankedCorpus(historialCompleto, modo) : null;
  const streak = corpus ? streakOf(corpus.rows) : null;
  const forma = corpus ? formOf(corpus.rows) : null;

  /**
   * Las notas de las partidas que se están viendo.
   *
   * Se piden sobre las visibles y no sobre las 475: un pedido de 204 KB por
   * quince partidas, contra 3 MB si se pidieran todas las que el filtro deja.
   */
  const grades = useGrades(
    id,
    visibles.map((m) => m.matchId)
  );

  function alternarHeroe(heroId: number) {
    setHeroFiltro((actual) => (actual === heroId ? null : heroId));
  }

  /**
   * Cambiar de modo **suelta el héroe y vuelve a la primera página**.
   *
   * Un héroe elegido sobre "todas" puede no tener ni una partida en pelea
   * callejera: quedaría una lista vacía con un filtro puesto que el visitante no
   * ve como la causa. Y las filas abiertas del modo anterior no significan nada
   * en el nuevo. Es el mismo criterio que ya se aplica al cambiar de cuenta.
   */
  function cambiarModo(s: MatchScope) {
    setModo(s);
    setHeroFiltro(null);
    setVerFilas(HISTORY_PAGE);
  }

  return (
    <section className="tool">
      <div className="tool-head">
        <div>
          <p className="eyebrow">{copy.deadlock.eyebrow}</p>
          <h1 className="tool-title">{c.searchTitle}</h1>
        </div>
      </div>
      <p className="detail-note">{c.searchLead}</p>

      <form className="dl-rep-search" onSubmit={buscar}>
        <input
          className="dl-rep-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={c.placeholder}
          aria-label={c.placeholder}
        />
        <button className="dl-rep-go" type="submit" disabled={buscando}>
          {buscando ? c.searching : c.search}
        </button>
      </form>

      {error && <p className="dl-fallback">{error}</p>}

      {cuentas && cuentas.length === 0 && <p className="dl-fallback">{c.noAccounts}</p>}

      {cuentas && cuentas.length > 0 && !historial && (
        <ul className="dl-rep-accounts">
          {cuentas.slice(0, 10).map((a) => (
            <li key={a.accountId}>
              <button className="dl-rep-account" onClick={() => onOpenAccount(a.accountId)}>
                {a.avatar && <img src={a.avatar} alt="" width={40} height={40} loading="lazy" />}
                <span className="dl-rep-account-name">{a.name}</span>
                <span className="dl-rep-account-note">{c.recent(a.recent)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
        Dos columnas: las partidas a la izquierda, quién es el jugador a la
        derecha. Es el reparto que usan los cuatro sitios del género (Statlocker
        752+420, Dotabuff 760+428, op.gg 332+740, OpenDota 65/35) y el que
        convierte una página de 3.995px en una de ~1.500.

        **El orden del DOM pone las partidas primero a propósito**: son el
        contenido principal, y es lo que tiene que encontrar un buscador o un
        lector de pantalla. En el teléfono el CSS sube la ficha con `order`,
        porque ahí lo primero que se quiere ver es el rango.
      */}
      {historial && (
        <div className="dl-profile-grid">
          <div className="dl-profile-main">
            <h2 className="dl-section-title">{c.history}</h2>
            {/* El filtro va ARRIBA de la lista y no en la ficha lateral: manda
                sobre las dos columnas, y el lugar donde se ve el efecto más
                grande es acá. */}
            <DeadlockScopePicker scope={modo} counts={conteos} onChange={cambiarModo} />
            <p className="detail-note">{c.shown(visibles.length, filtrado.length)}</p>

            {/**
             * **Encabezado de columnas, que la lista no tenía.**
             *
             * ZoTaD miró su propio historial y no supo qué era el número al
             * lado del KDA (eran golpes/denies). Una columna sin rótulo no es un
             * dato: es una cifra que el lector tiene que adivinar, y la que no se
             * adivina se ignora. Comparte la misma grilla que la fila, así que
             * cada rótulo cae sobre lo que rotula.
             */}
            <div className="dl-rep-match-head" aria-hidden="true">
              <span className="dl-rep-face" />
              <span className="dl-rep-match-hero">{c.histCols.hero}</span>
              {/* El rango va pegado al héroe en el encabezado Y en la fila: si
                  el orden del DOM difiere entre los dos, cada rótulo cae sobre
                  otra columna — que es exactamente lo que pasó al agregarla. */}
              <span className="dl-rep-match-rank">{c.histCols.rank}</span>
              <span className="dl-rep-match-result">{c.histCols.result}</span>
              <span className="dl-rep-match-grade">{c.histCols.grade}</span>
              <span className="dl-rep-match-kda">{c.histCols.kda}</span>
              <span className="dl-rep-match-farm">{c.histCols.farm}</span>
              <span className="dl-rep-match-num">{c.histCols.souls}</span>
              <span className="dl-rep-match-num">{c.histCols.length}</span>
              <span className="dl-rep-match-date">{c.histCols.when}</span>
            </div>

            <ul className="dl-rep-matches">
            {visibles.map((m) => {
              const nombre = heroName(m.heroId);
              const paso = pasos.get(m.matchId);
              /**
               * El rango que tenía en esa partida, y de dónde venía.
               *
               * Sólo el ASCENSO se marca con la flecha. Bajar de rango también
               * está en los datos, pero un cartel de "descendiste" en tu propio
               * perfil no es algo que nadie viniera a buscar; en ese caso queda
               * la insignia sola, que es el dato sin el juicio.
               */
              const enEsa = paso ? rankOf(paso.badge) : null;
              const nuevo = paso && paso.delta > 0 ? rankOf(paso.badge) : null;
              const previo = paso && paso.delta > 0 && paso.previo > 0 ? rankOf(paso.previo) : null;
              /**
               * **La flecha sólo si las dos insignias se ven distintas.**
               *
               * Arriba del último rango publicado el badge sigue subiendo pero se
               * dibuja siempre igual —Eternus sin numeral, ver `rankOf`—, así que
               * 122 → 123 pintaba dos insignias idénticas separadas por una flecha:
               * la forma visual de "cambiaste de rango" puesta sobre un rango que
               * no cambió. Ahí la insignia sola dice lo mismo sin prometer nada.
               */
              const cambioVisible =
                nuevo && previo && (nuevo.img !== previo.img || nuevo.sub !== previo.sub);
              const subio = cambioVisible ? nuevo : null;
              const desde = cambioVisible ? previo : null;
              return (
                <li key={m.matchId}>
                  <button
                    className={`dl-rep-match ${m.won ? "is-win" : "is-loss"}`}
                    onClick={() => onOpenMatch(m.matchId)}
                  >
                    <img
                      className="dl-rep-face"
                      src={heroImg(m.heroId) ?? ""}
                      alt={nombre ? text(nombre, lang, "") : ""}
                      width={44}
                      height={44}
                      loading="lazy"
                    />
                    <span className="dl-rep-match-hero">
                      {/* El nombre en su propio `<span>`: la elipsis necesita un
                          elemento al que agarrarse, y con el nombre como nodo de
                          texto suelto la regla terminaba recortando la insignia
                          de ascenso que va al lado. */}
                      <span className="dl-rep-hero-name">
                        {nombre ? text(nombre, lang, "") : m.heroId}
                      </span>
                    </span>

                    {/**
                     * El rango que el jugador tenía en esa partida, siempre que
                     * exista — y **el ascenso mostrado como el cambio que fue**:
                     * la insignia vieja, una flecha y la nueva. "Eternus 3 →
                     * Eternus 4" cuenta algo; una insignia sola sólo dice dónde
                     * quedó, que es justo lo que la fila de al lado ya dice.
                     */}
                    <span className="dl-rep-match-rank">
                      {subio && desde && paso ? (
                        <span
                          className="dl-rankup"
                          title={c.rankUpTitle(rankLabel(desde, lang), rankLabel(subio, lang))}
                        >
                          <RankBadge badge={paso.previo} height={RANKUP_H} title="" />
                          <em aria-hidden="true">→</em>
                          <RankBadge
                            className="dl-rankup-new"
                            badge={paso.badge}
                            height={RANKUP_H}
                            title=""
                          />
                        </span>
                      ) : (
                        paso &&
                        enEsa && (
                          <RankBadge className="dl-rep-rank" badge={paso.badge} height={RANK_H} />
                        )
                      )}
                    </span>
                    <span className="dl-rep-match-result">{m.won ? c.win : c.loss}</span>
                    <span className="dl-rep-match-grade">
                      {grades.get(m.matchId) && (
                        <em data-grade={grades.get(m.matchId)}>{grades.get(m.matchId)}</em>
                      )}
                    </span>
                    <span className="dl-rep-match-kda">
                      {m.kills}/{m.deaths}/{m.assists}
                    </span>
                    {/* Golpes y denies, en ese orden: es el par que el jugador de
                        este género ya lee junto. */}
                    <span className="dl-rep-match-farm" title={c.farmTitle(m.lastHits, m.denies)}>
                      {m.lastHits}/{m.denies}
                    </span>
                    <span className="dl-rep-match-num">{m.netWorth.toLocaleString(lang)}</span>
                    <span className="dl-rep-match-num">{mmss(m.durationS)}</span>
                    <span className="dl-rep-match-date">{fecha(m.startTime, lang)}</span>
                    {/* La insignia por fila se fue: `ranked_display_badge` da 0
                        en las 475 partidas medidas, así que no dibujaba nunca.
                        El rango de cada partida ahora sale de `mmr-history` y se
                        muestra donde importa: en la que ascendió. */}
                  </button>
                </li>
              );
            })}
            </ul>

            {/* Sólo cuando hay algo más que mostrar. Un botón que no hace nada
                es peor que ningún botón. */}
            {visibles.length < filtrado.length && (
              <button
                type="button"
                className="dl-more"
                onClick={() => setVerFilas((n) => n + HISTORY_PAGE)}
              >
                {c.showMore}
              </button>
            )}
          </div>

          <aside className="dl-profile-aside">
            {resumen && (
              <div className="dl-card">
                <h2 className="dl-card-title">{c.cards.profile}</h2>
                <Profile account={cuenta} resumen={resumen} rank={rango} rankReady={rangoListo} world={world} />
              </div>
            )}

            {/* Va arriba de la forma reciente a propósito: "sos el #56 del
                mundo con Abrams" es más fuerte que "ganaste 2 seguidas", y en el
                teléfono esta columna es lo primero que se ve. */}
            <HeroPlacings placings={placings} />

            {corpus && (
              <div className="dl-card">
                <DeadlockStreakForm corpus={corpus} streak={streak} forma={forma} />
              </div>
            )}

            {heroesTop.length > 0 && (
              <div className="dl-card">
                <h2 className="dl-card-title">{c.cards.heroes}</h2>
                <TopHeroes
                  heroes={heroesTop}
                  activeHero={heroFiltro}
                  onToggleHero={alternarHeroe}
                />
              </div>
            )}

            {/* Cuesta CERO pedidos: agrupa por día el historial que ya está en
                memoria. Ver `DeadlockActivity`. Sigue al modo como el resto de
                la ficha: si el perfil habla de clasificatorias, el calendario
                que dice "jugaste" tiene que hablar de las mismas. */}
            <div className="dl-card">
              <h2 className="dl-card-title">{c.cards.activity}</h2>
              <DeadlockActivity rows={enModo} />
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
