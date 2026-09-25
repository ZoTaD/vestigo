/**
 * Deadlock entero: la barra de pestañas y la pestaña abierta (2026-09-25).
 *
 * Vivía adentro de `App.tsx`, que importaba cada pantalla de cada juego: quien
 * entraba a Valheim bajaba también el armador de Deadlock. Ahora `areas.ts`
 * carga este módulo aparte, con su CSS, y sólo cuando la ruta es de Deadlock.
 */
import { useCopy } from "./i18n";
import RouteLink from "./RouteLink";
import Deadlock, { PatchHistory } from "./Deadlock";
import DeadlockItems from "./DeadlockItems";
import DeadlockHeroes from "./DeadlockHeroes";
import DeadlockBuilder from "./DeadlockBuilderPage";
import DeadlockNews from "./DeadlockNews";
import DeadlockRanks from "./DeadlockRanks";
import DeadlockPlayerLadder from "./DeadlockPlayerLadder";
import DeadlockPlayer from "./DeadlockPlayer";
// `DeadlockReport` y no `DeadlockMatch`: el módulo de datos ya se llama
// `deadlockMatch.ts`, y en Windows dos archivos que sólo difieren en mayúsculas
// son el mismo archivo para el compilador.
import DeadlockReport from "./DeadlockReport";
import DeadlockBandPicker from "./DeadlockBandPicker";
import { PUBLISHED_BAND, type BandId } from "./deadlockData";
import { DEADLOCK_SECTIONS, type DeadlockSection, type Route } from "./route";
// Las hojas de Deadlock y de Vestigo News, en el mismo orden que tenían en
// `main.tsx`: viajan en el CSS de este chunk y no en el de todo el sitio.
import "./styles/deadlock.css";
import "./styles/deadlock-heroes.css";
import "./styles/deadlock-builder.css";
// El material del juego (papel, tiza, arte de héroes) sobre las hojas de Deadlock, 2026-09-23.
import "./styles/deadlock-game.css";
// Vestigo News (2026-09-17): la única página con paleta y fuentes propias, todo bajo `.vn`.
import "./styles/news.css";

export default function DeadlockArea({
  route,
  navigate,
  band: chosen,
  onBand,
}: {
  route: Route;
  navigate: (next: Route) => void;
  /**
   * La banda elegida, o `undefined` si todavía no se eligió ninguna.
   *
   * El estado vive en `App` y no acá: con un `useState` por página, elegir
   * Arconte en la tier list de héroes y pasar a objetos volvía sola a
   * Fantasma+. `App` no puede importar `PUBLISHED_BAND` sin arrastrar los datos
   * de Deadlock al JS de entrada, así que la banda por defecto se resuelve acá.
   */
  band: BandId | undefined;
  onBand: (band: BandId) => void;
}) {
  const copy = useCopy();
  const band = chosen ?? PUBLISHED_BAND;
  const picker = <DeadlockBandPicker band={band} onChange={onBand} />;

  /** Opening or closing a detail is a navigation, so it gets its own URL. */
  const goDetail = (next: DeadlockSection, slug?: string) =>
    navigate({ ...route, view: "deadlock", dlSection: next, detail: slug });

  return (
    <>
      {/* La misma barra que TFT, con las pestañas de este juego. Que sea el
          mismo control y no uno propio es deliberado: quien viene de la otra
          pestaña no tiene que aprender nada nuevo. */}
      <div className="subnav-wrap">
        <nav className="subnav" aria-label={copy.games.deadlock}>
          {DEADLOCK_SECTIONS.map((id) => (
            <RouteLink
              className="subnav-item"
              key={id}
              to={{ ...route, view: "deadlock", dlSection: id, detail: undefined }}
              // Street Brawl es la Tier list en otro modo: la pestaña sigue encendida.
              active={route.dlSection === id || (id === "meta" && route.dlSection === "street-brawl")}
              onNavigate={navigate}
            >
              {copy.deadlock.tabs[id]}
              {/* El perfil se publicó el 2026-08-11 y sigue creciendo. La
                  insignia dice que se puede usar y que se va a mover, que es
                  distinto del "Pronto" de Dota 2: eso anuncia lo que no
                  existe, esto califica lo que sí. Se saca cuando la pestaña
                  deje de cambiar. */}
              {id === "player" && <em className="subnav-beta">{copy.games.beta}</em>}
            </RouteLink>
          ))}
        </nav>
      </div>
      {route.dlSection === "player" ? (
        <DeadlockPlayer
          accountId={route.detail}
          onOpenAccount={(id) => goDetail("player", String(id))}
          onOpenMatch={(id) => goDetail("match", String(id))}
        />
      ) : route.dlSection === "match" ? (
        <DeadlockReport
          matchId={route.detail}
          onBack={(accountId) => goDetail("player", accountId === null ? undefined : String(accountId))}
        />
      ) : route.dlSection === "items" ? (
        <DeadlockItems band={band} picker={picker} open={route.detail} onOpen={(slug) => goDetail("items", slug)} />
      ) : route.dlSection === "heroes" ? (
        <DeadlockHeroes route={route} navigate={navigate} band={band} picker={picker} open={route.detail} />
      ) : route.dlSection === "builder" ? (
        <DeadlockBuilder />
      ) : route.dlSection === "ranks" ? (
        /* Sin `picker`: la escalera es el eje sobre el que se definen las
           bandas, así que filtrarla por una no significaría nada. */
        <DeadlockRanks />
      ) : route.dlSection === "ladder" ? (
        /* Sin `band` ni `picker`: la escalera dejó de filtrar por banda el
           2026-08-13. Mide a los mejores del mundo en clasificatorias, y el
           filtro que tenía era por promedio del lobby, no por rango del
           jugador — ver el comentario de `DeadlockPlayerLadder`. */
        <DeadlockPlayerLadder route={route} navigate={navigate} />
      ) : route.dlSection === "patches" ? (
        /* Vestigo News: una edición por parche, y debajo el historial del
           foro para los parches que no tienen edición. */
        <DeadlockNews route={route} navigate={navigate} archive={<PatchHistory boxed />} />
      ) : (
        <Deadlock
          route={route}
          navigate={navigate}
          band={band}
          picker={picker}
          open={route.detail}
          onOpen={(slug) => goDetail("meta", slug)}
          brawl={route.dlSection === "street-brawl"}
        />
      )}
    </>
  );
}
