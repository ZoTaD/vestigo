/**
 * La portada de Company of Heroes 3 (2026-11-04), estética B "Puesto de mando": la cabecera con el arte grande del
 * juego, el logo, el parche vigente y una tarjeta por facción; abajo, las herramientas agrupadas (En vivo,
 * Herramientas, Explorador), cada una con lo que resuelve.
 */
import { useEffect, useState } from "react";
import RouteLink from "../RouteLink";
import { routePath, type Coh3Section, type Route } from "../route";
import { COH_GAME_COPY, FACTIONS, FACTION_ICON, useCoh3Copy } from "../coh3Copy";
import { useLang } from "../i18n";
import { GAMES } from "./games";
import { loadMeta, peekMeta, type Meta } from "./data";
import type { Nav } from "./ui";

/** Las tarjetas de la portada, en tres grupos. */
const GROUPS: { k: "live" | "tools" | "explorer"; tabs: Coh3Section[] }[] = [
  { k: "live", tabs: ["leaderboards", "ranks", "stats", "tier-list"] },
  { k: "tools", tabs: ["penetration", "dps", "patches"] },
  { k: "explorer", tabs: ["units", "weapons", "battlegroups", "commanders", "bulletins", "maps", "challenges", "achievements", "final-stand"] },
];

function useMeta(): Meta | null {
  const [meta, setMeta] = useState<Meta | null>(() => peekMeta());
  useEffect(() => {
    if (meta) return;
    let vivo = true;
    loadMeta().then((m) => vivo && setMeta(m), () => undefined);
    return () => {
      vivo = false;
    };
  }, [meta]);
  return meta;
}

/** La cabecera de CoH2 y CoH1: su arte, su logo y una tarjeta por facción que abre su ranking. */
function GameHero({ route, game }: { route: Route; game: "coh2" | "coh1" }) {
  const { lang } = useLang();
  const g = COH_GAME_COPY[game][lang];
  const conf = GAMES[game];
  return (
    <header className="c3-hero">
      <picture>
        <source media="(max-width: 700px)" srcSet={`/${game}/bg/hero-800.webp`} />
        <img className="c3-hero-art" src={`/${game}/bg/hero-1600.webp`} alt="" width={1600} height={517} {...{ fetchpriority: "high" }} />
      </picture>
      <div className="c3-hero-in">
        <h1 className="c3-hero-h1">
          <img className="c3-logo" src={`/${game}/logo.webp`} alt={g.name} width={480} height={270} />
          <span className="c3-sr">{g.h1}</span>
        </h1>
        <p className="c3-hero-lede">{g.lede}</p>
        <nav className="c3-facs" aria-label={g.name}>
          {conf.factions.map((f) => (
            <a key={f} className="c3-fac-card" href={`${routePath({ ...route, view: "coh3", c3Section: "leaderboards", detail: undefined })}?f=${f}`}>
              <img src={conf.factionIcon[f]} alt="" width={44} height={44} />
              <b>{conf.factionShort[lang][f]}</b>
              <small>{conf.factionName[lang][f]}</small>
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

/** La cabecera de la portada: la dibuja `Coh3.tsx` arriba de la barra de pestañas. */
function Hero({ route, navigate }: { route: Route; navigate: Nav }) {
  if (route.cohGame && route.cohGame !== "coh3") return <GameHero route={route} game={route.cohGame} />;
  return <Coh3Hero route={route} navigate={navigate} />;
}

function Coh3Hero({ route }: { route: Route; navigate: Nav }) {
  const t = useCoh3Copy();
  const meta = useMeta();
  return (
    <header className="c3-hero">
      <picture>
        <source media="(max-width: 700px)" srcSet="/coh3/bg/hero-800.webp" />
        <img className="c3-hero-art" src="/coh3/bg/hero-1600.webp" alt="" width={1600} height={517} {...{ fetchpriority: "high" }} />
      </picture>
      <div className="c3-hero-in">
        <h1 className="c3-hero-h1">
          <img className="c3-logo" src="/coh3/logo.webp" alt="Company of Heroes 3" width={480} height={270} />
          <span className="c3-sr">{t.home.h1}</span>
        </h1>
        <div className="c3-kick">{t.home.kicker(meta?.patch ?? "…")}</div>
        <p className="c3-hero-lede">{t.home.lede}</p>
        <nav className="c3-facs" aria-label={t.tabs.units}>
          {FACTIONS.map((f) => (
            // Con `?f=` la pestaña Unidades abre filtrada (la ruta no lleva parámetros: va como enlace común).
            <a key={f} className="c3-fac-card" href={`${routePath({ ...route, view: "coh3", c3Section: "units", detail: undefined })}?f=${f}`}>
              <img src={FACTION_ICON[f]} alt="" width={44} height={44} />
              <b>{t.factionShort[f]}</b>
              <small>{t.faction[f]}</small>
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

function Coh3Home({ route, navigate, live }: { route: Route; navigate: Nav; live: (tab: Coh3Section) => boolean }) {
  const t = useCoh3Copy();
  const { lang } = useLang();
  const otro = route.cohGame && route.cohGame !== "coh3" ? COH_GAME_COPY[route.cohGame][lang] : null;
  const to = (tab: Coh3Section): Route => ({ ...route, view: "coh3", c3Section: tab, detail: undefined });
  return (
    <main className="c3-main c3-home">
      {GROUPS.map((g) => ({ ...g, tabs: g.tabs.filter((tab) => live(tab)) }))
        .filter((g) => g.tabs.length)
        .map((g) => (
        <section key={g.k} className="c3-group">
          <h2 className="c3-group-h">{t.home[g.k]}</h2>
          <ul className="c3-cards">
            {g.tabs.map((tab) => (
              <li key={tab}>
                {live(tab) ? (
                  <RouteLink className="c3-card" to={to(tab)} onNavigate={navigate}>
                    <b className="c3-card-h">{t.tabs[tab]}</b>
                    <span className="c3-dim">{tab === "ranks" && otro ? otro.ranksCard : t.home.cards[tab]}</span>
                  </RouteLink>
                ) : (
                  <span className="c3-card is-soon">
                    <b className="c3-card-h">{t.tabs[tab]}</b>
                    <span className="c3-dim">{tab === "ranks" && otro ? otro.ranksCard : t.home.cards[tab]}</span>
                    <span className="c3-soon">{t.t.soon}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

Coh3Home.Hero = Hero;
export default Coh3Home;
