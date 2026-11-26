/**
 * El buscador de jugadores de AoE2 (2026-11-26). Mientras se escribe busca por parte del nombre en el índice del
 * colector (`names.ts`: sin mayúsculas ni acentos, cualquier palabra del nombre); al apretar Buscar suma lo que da la
 * API por nombre exacto o SteamID64 (quien nunca jugó ranked no está en el índice). De cada resultado se piden en vivo
 * los ratings y la última partida (`/api/aoe2/players`), para distinguir a los que se llaman igual.
 *
 * El texto que se escribe en la barra de arriba dentro de AoE2 llega por `pendingSearch`.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang } from "../../i18n";
import { flagUrl } from "../../flags";
import { useAoe2Copy } from "../../aoe2Copy";
import { countryName } from "../../coh3/live/ui";
import { PENDING_SEARCH_EVENT, takePendingSearch } from "../../pendingSearch";
import { Panel, type Nav } from "../ui";
import type { SearchResult } from "../api/wel";
import { buscarNombres, consulta } from "./names";
import { buscarPerfiles, pedirFichas } from "./search";
import { fechaConAnio } from "./fecha";

/** Lo que se muestra de un resultado: lo del índice al toque y la ficha en vivo cuando llega. */
type Fila = { id: number; alias: string; country: string | null; ficha?: SearchResult };
const STEAM = /^7656\d{13}$/;
const MAX = 20;

export function Buscador({ route, navigate, autoFocus = false }: { route: Route; navigate: Nav; autoFocus?: boolean }) {
  const t = useAoe2Copy();
  const { lang } = useLang();
  const [q, setQ] = useState("");
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [estado, setEstado] = useState<"" | "busy" | "down" | "exacto">("");
  const turno = useRef(0);

  /** Pide las fichas en vivo de lo que se ve y las pega a cada fila. */
  const completar = (lista: Fila[], n: number) => {
    const faltan = lista.filter((f) => !f.ficha).map((f) => f.id);
    if (!faltan.length) return;
    void pedirFichas(faltan.join(",")).then((fs) => {
      if (n !== turno.current || !fs) return;
      const por = new Map(fs.map((f) => [f.id, f]));
      setFilas((act) => act?.map((f) => (por.has(f.id) ? { ...f, ficha: por.get(f.id), alias: por.get(f.id)!.alias, country: por.get(f.id)!.country } : f)) ?? null);
    });
  };

  /** Mientras se escribe: el índice, con una pausa corta para no buscar por cada letra. */
  useEffect(() => {
    const v = q.trim();
    const n = ++turno.current;
    if (consulta(v).length < 2 || STEAM.test(v)) {
      setFilas(null);
      setEstado("");
      return;
    }
    const id = setTimeout(() => {
      void buscarNombres(v, MAX).then((hs) => {
        if (n !== turno.current) return;
        const lista = hs.map((h) => ({ id: h.id, alias: h.alias, country: h.country }));
        setFilas(lista);
        setEstado("");
        completar(lista, n);
      });
    }, 200);
    return () => clearTimeout(id);
  }, [q]);

  /** Buscar: además del índice, el nombre exacto o el SteamID64 en la API. */
  const exacto = (v: string) => {
    const n = ++turno.current;
    setEstado("busy");
    void Promise.all([buscarPerfiles(v), STEAM.test(v) ? Promise.resolve([]) : buscarNombres(v, MAX)]).then(([api, hs]) => {
      if (n !== turno.current) return;
      if (api == null && !hs.length) {
        setFilas(null);
        setEstado("down");
        return;
      }
      const vistos = new Set<number>();
      const lista: Fila[] = [];
      for (const p of api ?? []) if (!vistos.has(p.id) && vistos.add(p.id)) lista.push({ id: p.id, alias: p.alias, country: p.country, ficha: p });
      for (const h of hs) if (!vistos.has(h.id) && vistos.add(h.id)) lista.push({ id: h.id, alias: h.alias, country: h.country });
      setFilas(lista.slice(0, MAX));
      setEstado("exacto");
      completar(lista.slice(0, MAX), n);
    });
  };
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (v) exacto(v);
  };

  // Lo escrito en la barra de arriba.
  useEffect(() => {
    const tomar = () => {
      const p = takePendingSearch();
      if (!p) return;
      setQ(p);
      exacto(p.trim());
    };
    tomar();
    window.addEventListener(PENDING_SEARCH_EVENT, tomar);
    return () => window.removeEventListener(PENDING_SEARCH_EVENT, tomar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const corto = consulta(q.trim()).length < 2 && !STEAM.test(q.trim());
  return (
    <Panel className="a2-search">
      <form onSubmit={enviar} role="search">
        <label htmlFor="a2-q">{t.lb.search}</label>
        <div className="a2-search-row">
          <input
            id="a2-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.lb.searchHint}
            autoComplete="off"
            spellCheck={false}
            autoFocus={autoFocus}
          />
          <button type="submit" className="a2-btn" disabled={estado === "busy" || !q.trim()}>
            {t.lb.searchGo}
          </button>
        </div>
      </form>
      {estado === "down" && (
        <p className="a2-note" role="alert">
          {t.t.apiDown}
        </p>
      )}
      {filas && !corto && (
        <ul className="a2-results" aria-live="polite">
          {filas.length ? (
            filas.map((f) => (
              <li key={f.id}>
                <RouteLink className="a2-res" to={{ ...route, view: "aoe2", a2Section: "players", detail: String(f.id) }} onNavigate={navigate}>
                  <span className="a2-res-name">
                    {f.country ? (
                      <img src={flagUrl(f.country)} alt={countryName(f.country, lang) ?? f.country} title={countryName(f.country, lang) ?? f.country} width={20} height={15} loading="lazy" decoding="async" />
                    ) : (
                      <span className="a2-res-noflag" aria-hidden="true" />
                    )}
                    <b>{f.alias}</b>
                  </span>
                  <span className="a2-res-data">
                    {!f.ficha ? (
                      <span className="a2-note">…</span>
                    ) : f.ficha.ratings.length ? (
                      f.ficha.ratings.slice(0, 3).map((r) => (
                        <span key={r.leaderboard} className="a2-res-elo">
                          <small>{t.lb.short[r.leaderboard] ?? r.leaderboard}</small> {r.elo}
                          {r.rank > 0 && <small className="a2-res-rank"> #{r.rank.toLocaleString(lang)}</small>}
                        </span>
                      ))
                    ) : (
                      <span className="a2-note">{t.lb.noRanked}</span>
                    )}
                    {f.ficha?.last ? <span className="a2-note">{t.lb.lastGame(fechaConAnio(f.ficha.last, lang))}</span> : null}
                  </span>
                </RouteLink>
              </li>
            ))
          ) : (
            <li className="a2-note">{estado === "exacto" ? t.lb.noResults : t.lb.noMatchesYet}</li>
          )}
        </ul>
      )}
    </Panel>
  );
}
