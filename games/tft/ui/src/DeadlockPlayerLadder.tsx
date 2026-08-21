import { useEffect, useMemo, useState } from "react";
import { useCopy, useLang, useLocale, type Lang } from "./i18n";
import { text } from "./catalog";
import RouteLink from "./RouteLink";
import type { Route } from "./route";
import {
  fetchLadder,
  fetchPodium,
  PODIUM_SIZE,
  type Ladder,
  type LadderRow,
} from "./deadlockLadder";
import { catalog } from "./deadlockData";
import { heroImg, rankLabel, rankOf } from "./deadlockReportData";
import RankBadge from "./DeadlockRankBadge";

/**
 * La ladder de jugadores de Deadlock: los mejores del mundo en clasificatorias.
 *
 * **No tiene filtro de rango, y eso es una decisión.** Lo tuvo hasta el
 * 2026-08-13, y filtraba con `min_average_badge`, que es el promedio del LOBBY
 * y no el rango del jugador: la pestaña decía "Emissary / Oracle" mientras
 * mostraba "partidas jugadas en salas de ese promedio". Un ranking de los
 * mejores del mundo no necesita esa perilla — necesita que las partidas cuenten,
 * y por eso mide sólo clasificatorias desde el reset.
 *
 * **Dos columnas**: a la izquierda la tabla global, a la derecha los héroes con
 * el podio del que se elija. El podio se pide al elegir y no de entrada, porque
 * 38 héroes serían 38 pedidos por visita.
 *
 * **`DeadlockPlayerLadder` y no `DeadlockLadder`**: el módulo de datos ya se
 * llama `deadlockLadder.ts`, y en Windows dos archivos que sólo difieren en
 * mayúsculas son el mismo archivo para el compilador.
 */

/**
 * La bandera del país como IMAGEN, no como emoji.
 *
 * **El emoji se probó el 2026-08-12 y se sacó**: se arma con indicadores
 * regionales y Windows no trae fuente para eso, así que en pantalla salían "US"
 * y "GB" sueltos, sin caja y sin alineación — se leía como un error de
 * codificación. Una imagen se ve igual en todos lados.
 *
 * Si la imagen no llega, queda el código de dos letras, que es exactamente lo
 * que la página mostraba antes: se degrada a lo anterior, no a un hueco.
 */
function Flag({ code }: { code?: string }) {
  const [falló, setFalló] = useState(false);
  if (!code || code.length !== 2) return null;
  const cc = code.toLowerCase();
  if (falló) return <span className="dl-flag-code">{code.toUpperCase()}</span>;
  return (
    <img
      className="dl-flag"
      src={`https://flagcdn.com/32x24/${cc}.png`}
      srcSet={`https://flagcdn.com/64x48/${cc}.png 2x`}
      alt={code.toUpperCase()}
      title={code.toUpperCase()}
      width={20}
      height={15}
      loading="lazy"
      onError={() => setFalló(true)}
    />
  );
}

/** Los héroes del catálogo, con el nombre resuelto al idioma y ordenados por él. */
function heroOptions(lang: Lang): { heroId: number; name: string }[] {
  return Object.entries(catalog.heroes)
    .map(([id, h]) => ({ heroId: Number(id), name: text(h.name, lang, `#${id}`) }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}

function LadderRowView({
  row,
  route,
  navigate,
}: {
  row: LadderRow;
  route: Route;
  navigate: (route: Route) => void;
}) {
  const copy = useCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const c = copy.deadlock.playerLadder;
  // Ausente o 0 es "sin rango" y `rankOf` ya resuelve los dos casos a `null`.
  const rango = row.badge ? rankOf(row.badge) : null;

  return (
    <li className="dl-ladder-row">
      <span className="dl-ladder-pos">{row.rank}</span>
      {/* La celda del país se dibuja SIEMPRE, aunque esté vacía: la fila es una
          grilla de columnas fijas, y si esta desaparece cuando no hay país —y no
          lo hay en la mitad de los jugadores— la fila queda con un hijo menos y
          todo se corre una columna. */}
      <span className="dl-ladder-country">
        <Flag code={row.country} />
      </span>
      {/* Nombre de Steam: texto de terceros, se pinta como texto y nunca con
          `dangerouslySetInnerHTML`. Sin nombre se dibuja el id. */}
      <RouteLink
        className="dl-ladder-name"
        to={{ ...route, view: "deadlock", dlSection: "player", detail: String(row.accountId) }}
        onNavigate={navigate}
      >
        {row.name ?? row.accountId}
      </RouteLink>
      {/**
       * **El rango del juego va acá porque es lo que ORDENA la tabla.**
       *
       * Sale de `/v1/players/mmr`, que devuelve el rango real del jugador —se
       * cruzó contra `players/{id}/rank` y da idéntico—, no el promedio de su
       * equipo que se usaba antes.
       */}
      <span className="dl-ladder-rank">
        {rango ? (
          <>
            {/* **Acá el alto es 17 y no 22**: el ancho sale de la proporción del
                arte, y en el teléfono esta celda mide 1,3rem — crecer a lo ancho
                la desborda, que es la grilla que ya se amputó una vez.

                **Y es la única insignia del sitio sin el numeral encima**, que
                se apaga desde `codex.css`: a 17px el numeral son 6px de mancha,
                y acá el "Eternus 4" de al lado ya lo dice con todas las letras.
                Un numeral ilegible al lado del dato legible no agrega, ensucia. */}
            <RankBadge badge={row.badge!} height={17} />
            <span className="dl-ladder-rank-name">{rankLabel(rango, lang)}</span>
          </>
        ) : (
          <span className="dl-ladder-rank-none">—</span>
        )}
      </span>
      {/**
       * El desempate, a la vista.
       *
       * Con cincuenta y un jugadores compartiendo el rango más alto, la columna
       * del rango no explica por qué uno va antes que otro. Este número sí: es
       * el piso de Wilson sobre sus clasificatorias, y ordena dentro de cada
       * escalón. El winrate crudo viaja en el `title`.
       */}
      <span className="dl-ladder-value" title={c.ratingTitle((row.winRate * 100).toFixed(1))}>
        {(row.score * 100).toFixed(1)}
      </span>
      <span className="dl-ladder-matches">
        {row.wins.toLocaleString(locale)}
        <em>/{row.matches.toLocaleString(locale)}</em>
      </span>
    </li>
  );
}

/** Los tres puestos, con su metal. El orden es el del podio, no el del array. */
const METALS = ["gold", "silver", "bronze"] as const;

function Podium({
  hero,
  rows,
  cargando,
  route,
  navigate,
}: {
  hero: number;
  rows: LadderRow[];
  cargando: boolean;
  route: Route;
  navigate: (route: Route) => void;
}) {
  const copy = useCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const c = copy.deadlock.playerLadder;
  const nombre = catalog.heroes[String(hero)]?.name;

  return (
    <div className="dl-podium">
      <div className="dl-podium-head">
        <img className="dl-podium-face" src={heroImg(hero) ?? ""} alt="" width={44} height={44} />
        <h2 className="dl-podium-title">{nombre ? text(nombre, lang, "") : `#${hero}`}</h2>
      </div>

      {cargando && <p className="detail-note dl-loading">{c.loading}</p>}

      {/* Cero es una respuesta válida: con dos semanas de clasificatorias hay
          héroes que todavía no tienen tres jugadores con partidas suficientes,
          y decirlo es mejor que rellenar el podio con cualquiera. */}
      {!cargando && rows.length === 0 && <p className="detail-note">{c.noPodium}</p>}

      {!cargando && rows.length > 0 && (
        <ol className="dl-podium-list">
          {rows.slice(0, PODIUM_SIZE).map((r, i) => (
            <li className="dl-podium-step" key={r.accountId} data-metal={METALS[i]}>
              <span className="dl-podium-pos" aria-hidden="true">
                {i + 1}
              </span>
              <RouteLink
                className="dl-podium-name"
                to={{ ...route, view: "deadlock", dlSection: "player", detail: String(r.accountId) }}
                onNavigate={navigate}
              >
                {r.name ?? r.accountId}
              </RouteLink>
              <span className="dl-podium-flag">
                <Flag code={r.country} />
              </span>
              <span className="dl-podium-value">
                {c.wins(r.wins.toLocaleString(locale))}
                <em>{c.of(r.matches.toLocaleString(locale))}</em>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function DeadlockPlayerLadder({
  route,
  navigate,
}: {
  /** Para armar el link de cada fila y navegar sin perder idioma ni el resto de la ruta. */
  route: Route;
  navigate: (route: Route) => void;
}) {
  const copy = useCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const c = copy.deadlock.playerLadder;

  const [ladder, setLadder] = useState<Ladder | null>(null);
  const [failed, setFailed] = useState(false);

  const heroes = useMemo(() => heroOptions(lang), [lang]);
  /** El héroe del podio. Arranca en el primero del catálogo, no en ninguno. */
  const [hero, setHero] = useState<number | null>(null);
  const [podio, setPodio] = useState<LadderRow[]>([]);
  const [cargandoPodio, setCargandoPodio] = useState(false);

  /**
   * Se pide una sola vez: no depende de nada que el visitante pueda cambiar.
   *
   * Ni banda ni métrica — el orden lo decide `wilsonScore` y es el único. Un
   * selector de orden le pasaba al lector una pregunta que la página tiene que
   * contestar.
   */
  useEffect(() => {
    let vivo = true;
    setLadder(null);
    setFailed(false);
    fetchLadder({}).then(
      (l) => vivo && setLadder(l),
      () => vivo && setFailed(true)
    );
    return () => {
      vivo = false;
    };
  }, []);

  // El podio arranca con el primer héroe del catálogo en cuanto hay catálogo.
  useEffect(() => {
    if (hero === null && heroes.length > 0) setHero(heroes[0].heroId);
  }, [heroes, hero]);

  useEffect(() => {
    if (hero === null) return;
    let vivo = true;
    setCargandoPodio(true);
    setPodio([]);
    fetchPodium(hero).then(
      (l) => {
        if (!vivo) return;
        setPodio(l.rows);
        setCargandoPodio(false);
      },
      () => {
        if (!vivo) return;
        setPodio([]);
        setCargandoPodio(false);
      }
    );
    return () => {
      vivo = false;
    };
  }, [hero]);

  return (
    <main className="deadlock deadlock-ladder">
      <div className="tool-head">
        <header className="masthead">
          <p className="eyebrow">{copy.deadlock.eyebrow}</p>
          <h1 className="title">
            {c.title}
            <span className="title-break">{c.titleBreak}</span>
          </h1>
          <p className="standfirst">{c.lead}</p>
        </header>

        <div className="tool-controls">
          {/**
           * **Acá no hay ningún control, y esa es la idea.**
           *
           * La pestaña tenía un selector de orden con ganadas, winrate y almas
           * por partida. "Quién es el mejor" no puede depender de cuál elija el
           * lector — y dos de las tres contestan mal: por ganadas, el número uno
           * del mundo tenía 47,4% de victorias. Ahora hay un solo orden y lo que
           * ocupa este lugar es la explicación de cómo se calcula.
           */}
          <p className="detail-note">{c.rankedOnly}</p>
          <p className="detail-note">{c.howRanked}</p>
          {ladder && <p className="detail-note">{c.floor(ladder.floor.toLocaleString(locale))}</p>}
        </div>
      </div>

      <div className="dl-ladder-grid">
        <section className="dl-ladder-main">
          <h2 className="dl-card-title">{c.worldTitle}</h2>

          {!ladder && !failed && <p className="detail-note dl-loading">{c.loading}</p>}
          {failed && <p className="dl-fallback">{c.failed}</p>}
          {ladder && ladder.thin && <p className="dl-fallback">{c.thin}</p>}

          {ladder && !ladder.thin && (
            <>
              <div className="dl-ladder-head">
                <span className="dl-ladder-pos">{c.cols.rank}</span>
                <span className="dl-ladder-country" aria-hidden="true" />
                <span className="dl-ladder-name">{c.cols.player}</span>
                {/* Ahora SÍ lleva encabezado: dejó de ser un adorno que aparecía
                    cuando había dato y pasó a ser la columna que ordena. El
                    rango llega para todos, porque sale del MMR y no del promedio
                    del equipo. */}
                <span className="dl-ladder-rank">{c.cols.badge}</span>
                <span className="dl-ladder-value">{c.cols.winRate}</span>
                <span className="dl-ladder-matches">{c.cols.matches}</span>
              </div>
              <ol className="dl-ladder-list">
                {ladder.rows.map((row) => (
                  <LadderRowView
                    key={row.accountId}
                    row={row}
                    route={route}
                    navigate={navigate}
                  />
                ))}
              </ol>
            </>
          )}
        </section>

        <aside className="dl-ladder-aside">
          <h2 className="dl-card-title">{c.byHero}</h2>

          {/* La grilla de héroes ES el control: no hay un `select` además de
              esto, porque dos formas de elegir lo mismo obligan a mantener las
              dos sincronizadas y a que el visitante adivine cuál manda. */}
          <div className="dl-hero-grid" role="group" aria-label={c.byHero}>
            {heroes.map((h) => (
              <button
                type="button"
                key={h.heroId}
                className="dl-hero-pick"
                data-active={hero === h.heroId}
                aria-pressed={hero === h.heroId}
                title={h.name}
                aria-label={h.name}
                onClick={() => setHero(h.heroId)}
              >
                <img src={heroImg(h.heroId) ?? ""} alt="" width={34} height={34} loading="lazy" />
              </button>
            ))}
          </div>

          {hero !== null && (
            <Podium
              hero={hero}
              rows={podio}
              cargando={cargandoPodio}
              route={route}
              navigate={navigate}
            />
          )}
        </aside>
      </div>
    </main>
  );
}
