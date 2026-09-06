import { useCopy, useLocale } from "./i18n";
import { peersInScope, useSteamNames, type PeerRaw } from "./deadlockPeers";
import type { HistoryRow } from "./deadlockMatch";

/**
 * Con quién jugás y contra quién te cruzás.
 *
 * **Una sola tarjeta para las dos preguntas**, porque los dos endpoints tienen
 * la misma forma y la lectura es la misma: una persona, cuántas veces, y cómo
 * salió. Duplicar el componente sería duplicar la grilla y el manejo de nombres
 * para cambiar un título.
 *
 * **Sigue al filtro de modo como el resto de la ficha** y no cuesta un pedido
 * por click: el crudo trae los `match_id` compartidos y el cruce contra las
 * filas del modo se hace en memoria (ver `peersInScope`).
 */

/** Cuántas filas se dibujan. */
const TOP = 5;

export default function DeadlockPeers({
  kind,
  peers,
  rows,
  onOpenAccount,
}: {
  kind: "mates" | "enemies";
  /** El crudo del endpoint, sin filtrar por modo. */
  peers: PeerRaw[];
  /** Las filas del historial **ya filtradas al modo elegido**. */
  rows: HistoryRow[];
  onOpenAccount: (id: number) => void;
}) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.deadlock.report.peers;

  const lista = peersInScope(peers, rows).slice(0, TOP);
  // Los nombres se piden sólo de los que se dibujan, y quedan cacheados: cambiar
  // de modo no vuelve a pedirlos.
  const nombres = useSteamNames(lista.map((p) => p.accountId));

  /**
   * **Sin filas no hay tarjeta.** Un cartel de "todavía no jugaste con nadie
   * dos veces" sería ocupar la columna para decir que no hay nada — y en el
   * modo clasificatorias, donde la cola abrió hace semanas, sería lo normal.
   */
  if (lista.length === 0) return null;

  return (
    <div className="dl-card">
      <h2 className="dl-card-title">{kind === "mates" ? c.matesTitle : c.enemiesTitle}</h2>
      <p className="detail-note dl-peers-note">
        {kind === "mates" ? c.matesLead : c.enemiesLead}
      </p>
      <ul className="dl-peers">
        {lista.map((p) => {
          const cuenta = nombres.get(p.accountId);
          const nombre = cuenta?.name ?? String(p.accountId);
          return (
            <li key={p.accountId}>
              <button
                type="button"
                className="dl-peer"
                onClick={() => onOpenAccount(p.accountId)}
                title={c.rowTitle(nombre, p.matches, p.wins, p.losses)}
              >
                {cuenta?.avatar ? (
                  <img src={cuenta.avatar} alt="" width={28} height={28} loading="lazy" />
                ) : (
                  <span className="dl-peer-face" aria-hidden="true" />
                )}
                <span className="dl-peer-name">{nombre}</span>
                {/* **Cuántas antes de cómo salió**: primero la muestra y después
                    el resultado, que es el orden en que hay que leerlos para no
                    tomarse en serio un 2-0. Y deja el récord contra el borde
                    derecho, alineado entre filas, que es donde se lo busca. */}
                <span className="dl-peer-matches">
                  {c.matches(p.matches.toLocaleString(locale))}
                </span>
                {/* El récord y no el porcentaje: "1-1" dice a la vez cómo salió y
                    sobre cuántas partidas, y a estas muestras el porcentaje solo
                    convertiría dos partidas en un "50%" que suena medido. */}
                <span className="dl-peer-record">
                  <em className="is-win">{p.wins}</em>
                  <span aria-hidden="true">–</span>
                  <em className="is-loss">{p.losses}</em>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
