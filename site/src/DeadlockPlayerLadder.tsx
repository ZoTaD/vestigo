import { useEffect, useMemo, useState } from "react";
import "./styles/deadlock-ladder.css";
import SectionHead from "./SectionHead";
import { useLang, useLocale, type Lang } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { text } from "./localized";
import RouteLink from "./RouteLink";
import type { Route } from "./route";
import { fetchLadder, type Ladder, type LadderRow } from "./deadlockLadder";
import { catalog } from "./deadlockData";
import { heroImg, rankLabel, rankOf } from "./deadlockReportData";
import RankBadge from "./DeadlockRankBadge";
import GameImg from "./GameImg";
import DeadlockOneTricks from "./DeadlockOneTricks";
import Flag from "./DeadlockFlag";
import DeadlockHeroBoard from "./DeadlockHeroBoard";
import DeadlockStatBoard from "./DeadlockStatBoard";
import DeadlockLadderCheck from "./DeadlockLadderCheck";
import { LADDER_COPY, type LadderTab } from "./deadlockLadderCopy";
import { heroes as heroSlugs } from "./deadlockSlugs";
import { ladderSeason } from "./deadlockSeasons";

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
    <li className="dl-lb-row">
      <span className="dl-lb-pos">{row.rank}</span>
      {/* La celda del país se dibuja SIEMPRE, aunque esté vacía: la fila es una
          grilla de columnas fijas, y si esta desaparece cuando no hay país —y no
          lo hay en la mitad de los jugadores— la fila queda con un hijo menos y
          todo se corre una columna. */}
      <span className="dl-lb-flag">
        <Flag code={row.country} />
      </span>
      {/* Nombre de Steam: texto de terceros, se pinta como texto y nunca con
          `dangerouslySetInnerHTML`. Sin nombre se dibuja el id. */}
      <RouteLink
        className="dl-lb-name"
        to={{ ...route, view: "deadlock", dlSection: "player", detail: String(row.accountId) }}
        onNavigate={navigate}
      >
        {row.name ?? row.accountId}
      </RouteLink>
      {/**
       * **El rango del juego va acá porque es lo que ORDENA la tabla.**
       *
       * Sale del scoreboard con `sort_by=rank`, el rango real del jugador al
       * cerrar su última clasificatoria, no el promedio de su equipo que se usaba antes.
       */}
      <span className="dl-lb-rank">
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
            <span className="dl-lb-rank-name">{rankLabel(rango, lang)}</span>
          </>
        ) : (
          <span className="dl-lb-none">—</span>
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
      <span className="dl-lb-rating" title={c.ratingTitle((row.winRate * 100).toFixed(1))}>
        {(row.score * 100).toFixed(1)}
      </span>
      <span className="dl-lb-wins">
        {row.wins.toLocaleString(locale)}
        <em>/{row.matches.toLocaleString(locale)}</em>
      </span>
    </li>
  );
}

/**
 * La sub-pestaña sale de `route.detail` (2026-11-17): nada es el mundo,
 * `stats`, `one-tricks` y `check` son las suyas, y un slug de héroe es el
 * ranking de ese héroe (`/deadlock/ladder/abrams`), que tiene URL propia
 * porque es lo que se busca ("abrams leaderboard").
 */
export function ladderTabOf(detail: string | undefined): { tab: LadderTab; heroId: number | null } {
  if (!detail) return { tab: "world", heroId: null };
  if (detail === "stats" || detail === "one-tricks" || detail === "check") return { tab: detail, heroId: null };
  const id = heroSlugs.toId.get(detail);
  return id ? { tab: "hero", heroId: Number(id) } : { tab: "world", heroId: null };
}

const TABS: LadderTab[] = ["world", "hero", "stats", "one-tricks", "check"];

/** La tabla del mundo, que se pide en vivo. Sólo existe en su pestaña. */
function WorldTable({ route, navigate }: { route: Route; navigate: (route: Route) => void }) {
  const copy = useCopy();
  const c = copy.deadlock.playerLadder;
  const [ladder, setLadder] = useState<Ladder | null>(null);
  const [failed, setFailed] = useState(false);
  /** Filtro por nombre sobre la tabla ya bajada: cero pedidos. */
  const [q, setQ] = useState("");

  /**
   * Se pide una sola vez: no depende de nada que el visitante pueda cambiar.
   * Ni banda ni métrica — el orden es el rango del juego, y Wilson desempata.
   */
  useEffect(() => {
    let vivo = true;
    fetchLadder({}).then(
      (l) => vivo && setLadder(l),
      () => vivo && setFailed(true)
    );
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <section className="box dl-lb">
      <div className="box-head dl-lb-top">
        <h2 className="box-title">{c.worldTitle}</h2>
        {ladder && !ladder.thin && (
          <label className="field dl-lb-search">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={copy.shell.search}
              aria-label={copy.shell.search}
              autoComplete="off"
            />
          </label>
        )}
      </div>

      {!ladder && !failed && <p className="box-empty">{c.loading}</p>}
      {failed && <p className="dl-notice">{c.failed}</p>}
      {ladder && ladder.thin && <p className="dl-notice">{c.thin}</p>}

      {ladder && !ladder.thin && (
        <>
          <div className="dl-lb-head">
            <span className="dl-lb-pos">{c.cols.rank}</span>
            <span className="dl-lb-flag" aria-hidden="true" />
            <span>{c.cols.player}</span>
            <span className="dl-lb-rank">{c.cols.badge}</span>
            <span className="dl-lb-rating">{c.cols.winRate}</span>
            <span className="dl-lb-wins">{c.cols.matches}</span>
          </div>
          <ol className="dl-lb-list">
            {ladder.rows
              .filter((row) => !q.trim() || (row.name ?? "").toLowerCase().includes(q.trim().toLowerCase()))
              .map((row) => (
                <LadderRowView key={row.accountId} row={row} route={route} navigate={navigate} />
              ))}
          </ol>
        </>
      )}
    </section>
  );
}

/**
 * La grilla de héroes como enlaces a su ranking. **Son enlaces y no botones**:
 * cada héroe tiene su página, y así el prerender deja 38 enlaces que siguen
 * los buscadores.
 */
function HeroGrid({ active, route, navigate }: { active: number | null; route: Route; navigate: (route: Route) => void }) {
  const { lang } = useLang();
  const heroes = useMemo(() => heroOptions(lang), [lang]);
  const c = LADDER_COPY[lang];
  return (
    <nav className="dl-lb-heroes" aria-label={c.tabs.hero}>
      {heroes.map((h) => {
        const slug = heroSlugs.toSlug.get(String(h.heroId));
        if (!slug) return null;
        return (
          <RouteLink
            key={h.heroId}
            className="dl-lb-hero"
            to={{ ...route, view: "deadlock", dlSection: "ladder", detail: slug }}
            onNavigate={navigate}
            active={active === h.heroId}
            title={h.name}
            aria-label={h.name}
          >
            <GameImg src={heroImg(h.heroId) ?? ""} alt="" width={34} height={34} loading="lazy" decoding="async" />
          </RouteLink>
        );
      })}
    </nav>
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
  const c = copy.deadlock.playerLadder;
  const lc = LADDER_COPY[lang];
  const { tab, heroId } = ladderTabOf(route.detail);

  /** "Por héroe" sin héroe abre el primero del catálogo por nombre. */
  const primerHeroe = useMemo(() => heroOptions(lang)[0]?.heroId ?? null, [lang]);
  const tabRoute = (t: LadderTab): Route => {
    const detail =
      t === "world" ? undefined : t === "hero" ? heroSlugs.toSlug.get(String(heroId ?? primerHeroe)) : t;
    return { ...route, view: "deadlock", dlSection: "ladder", detail };
  };

  return (
    <main className="deadlock deadlock-ladder">
      <SectionHead
        eyebrow={copy.deadlock.eyebrow}
        title={c.title}
        accent={c.titleBreak}
        lead={[c.lead, c.rankedOnly, c.howRanked]}
        meta={
          <span>
            {c.season(ladderSeason().season.id, ladderSeason().final)}
          </span>
        }
      />

      <div className="page">
        <nav className="dl-ltabs" aria-label={c.title}>
          {TABS.map((t) => (
            <RouteLink key={t} className="dl-ltab" to={tabRoute(t)} onNavigate={navigate} active={tab === t}>
              {lc.tabs[t]}
            </RouteLink>
          ))}
        </nav>
      </div>

      {tab === "world" && (
        <div className="page has-rail dl-lb-page">
          <WorldTable route={route} navigate={navigate} />
          <aside className="box dl-lb-aside">
            <div className="box-head">
              <h2 className="box-title">{lc.worldAside}</h2>
            </div>
            <p className="dl-hb-lead">{lc.worldAsideLead}</p>
            <HeroGrid active={null} route={route} navigate={navigate} />
          </aside>
        </div>
      )}

      {tab === "hero" && heroId !== null && (
        <div className="page dl-hb-page">
          <HeroGrid active={heroId} route={route} navigate={navigate} />
          <DeadlockHeroBoard key={heroId} heroId={heroId} route={route} navigate={navigate} />
        </div>
      )}

      {tab === "stats" && (
        <div className="page">
          <DeadlockStatBoard route={route} navigate={navigate} />
        </div>
      )}

      {tab === "one-tricks" && (
        <div className="page">
          <DeadlockOneTricks route={route} navigate={navigate} />
        </div>
      )}

      {tab === "check" && (
        <div className="page">
          <DeadlockLadderCheck route={route} navigate={navigate} />
        </div>
      )}
    </main>
  );
}
