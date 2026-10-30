import { useMemo } from "react";
import GameImg from "./GameImg";
import RouteLink from "./RouteLink";
import { useLang, useLocale } from "./i18n";
import { text } from "./localized";
import { useCopy } from "./deadlockCopy";
import { catalog } from "./deadlockData";
import type { Route } from "./route";
import { useSteamNames, useTopPlayers } from "./deadlockTopPlayers";
import "./styles/deadlock-draft.css";

/**
 * Los one-tricks (2026-10-30): el mejor de **cada** héroe a la vez, no sólo el
 * podio del héroe elegido. Es el mejor puesto del top 10 de la escalera por
 * héroe (`heroLadder.json`) con `ACTIVE`+ partidas de ese héroe en los últimos
 * 30 días; los nombres llegan en vivo en un solo pedido.
 */
/** Partidas con el héroe en los 30 días para contar como su jugador. */
const ACTIVE = 20;

export default function DeadlockOneTricks({ route, navigate }: { route: Route; navigate: (r: Route) => void }) {
  const copy = useCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const c = copy.deadlock.playerLadder.oneTricks;
  const top = useTopPlayers();

  const filas = useMemo(() => {
    if (!top) return [];
    return Object.entries(top.heroes)
      .map(([id, h]) => {
        const hero = catalog.heroes[id];
        // El mejor puesto de la escalera que de verdad juega el héroe: el #1
        // histórico puede tener dos partidas en el mes y eso no es un one-trick.
        const activo = h.players.find((x) => x[1] >= ACTIVE);
        const p = activo ?? [...h.players].sort((a, b) => b[1] - a[1])[0];
        return hero && p && p[1] > 0 ? { heroId: Number(id), name: text(hero.name, lang, `#${id}`), img: hero.img, player: p } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [top, lang, locale]);
  const nombres = useSteamNames(filas.map((f) => f.player[0]));

  if (!filas.length) return null;
  return (
    <section className="box dl-ot">
      <div className="box-head">
        <h2 className="box-title">{c.title}</h2>
        <p className="box-lead">{c.lead}</p>
      </div>
      <ul className="dl-ot-grid">
        {filas.map((f) => {
          const [id, n, w] = f.player;
          return (
            <li key={f.heroId}>
              <RouteLink
                className="dl-ot-card"
                to={{ ...route, view: "deadlock", dlSection: "player", detail: String(id) }}
                onNavigate={navigate}
              >
                <GameImg src={f.img} alt="" width={44} height={44} loading="lazy" decoding="async" />
                <span className="dl-ot-hero">{f.name}</span>
                <span className="dl-ot-player">{nombres.get(id) ?? `#${id}`}</span>
                <span className="dl-ot-stats">{c.stats(n.toLocaleString(locale), `${Math.round((w / n) * 100)} %`)}</span>
              </RouteLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
