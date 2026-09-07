import SectionHead from "./SectionHead";
import RouteLink from "./RouteLink";
import MetaView from "./MetaView";
import UnitsView from "./UnitsView";
import ItemsView from "./ItemsView";
import LadderView from "./LadderView";
import PlayerView from "./PlayerView";
import { useCopy } from "./i18n";
import { SECTIONS, type Route, type Section } from "./route";
import { DEFAULT_BAND, rememberBand } from "./bands";

/**
 * Todo TFT, en un solo módulo que se carga bajo demanda.
 *
 * Vivía adentro de `App.tsx`, y con eso las cinco vistas y sus datos —el
 * catálogo del set, las 50 comps de la banda por defecto, unidades e ítems:
 * casi un megabyte— viajaban en el bundle principal a la portada y a
 * Deadlock. Desde el 2026-09-07 `App` lo importa con `lazyWithPreload`: el
 * navegador lo baja al entrar a TFT, y el prerender lo precarga antes de
 * renderizar para que el HTML de las páginas de TFT salga entero.
 */
export default function TftArea({
  route,
  navigate,
}: {
  route: Route;
  navigate: (next: Route) => void;
}) {
  const copy = useCopy();
  const { section, detail } = route;

  const goDetail = (next: Section, slug?: string) =>
    navigate({ ...route, view: "tft", section: next, detail: slug });

  return (
    <>
      <div className="subnav-wrap">
        <nav className="subnav" aria-label={copy.games.tft}>
          {SECTIONS.map((id) => (
            <RouteLink
              className="subnav-item"
              key={id}
              to={{ ...route, view: "tft", section: id, detail: undefined }}
              active={section === id}
              onNavigate={navigate}
            >
              {copy.sections[id]}
            </RouteLink>
          ))}
        </nav>
      </div>

      {section === "meta" && (
        <MetaView
          band={route.band ?? DEFAULT_BAND}
          // Changing rank drops the open comp: the comp you had expanded
          // may not exist in the band you just switched to.
          onBand={(next) => {
            rememberBand(next);
            navigate({ ...route, view: "tft", section: "meta", band: next, detail: undefined });
          }}
          open={detail}
          onOpen={(slug) => goDetail("meta", slug)}
        />
      )}
      {section === "units" && (
        <UnitsView open={detail} onOpen={(slug) => goDetail("units", slug)} />
      )}
      {section === "items" && (
        <ItemsView open={detail} onOpen={(slug) => goDetail("items", slug)} />
      )}
      {section === "ladder" && <LadderView />}
      {section === "player" && (
        <>
          <SectionHead
            eyebrow={copy.games.tft}
            title={copy.player.title}
            accent={copy.player.titleBreak}
            lead={copy.player.standfirst}
          />
          <main className="page">
            <PlayerView />
          </main>
        </>
      )}
    </>
  );
}
