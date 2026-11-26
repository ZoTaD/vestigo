/**
 * Cara a cara en el perfil de AoE2 (2026-11-20): se busca otro jugador (nombre exacto o SteamID64) y se listan las
 * partidas entre los dos que están en el historial reciente del dueño del perfil.
 */
import { useLang } from "../../i18n";
import { useState, type FormEvent } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useAoe2Copy } from "../../aoe2Copy";
import { Panel, type Nav } from "../ui";
import type { Aoe2Match, SearchResult } from "../api/wel";
import { buscarPerfiles } from "./search";
import { consulta } from "./names";
import { headToHead } from "./profileStats";
import { mapName } from "./mapName";
import { useModeName } from "./MatchHistory";

export default function HeadToHead({ matches, id, route, navigate }: { matches: Aoe2Match[]; id: number; route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  const { lang } = useLang();
  const modo = useModeName();
  const [q, setQ] = useState("");
  const [otro, setOtro] = useState<SearchResult | null | "none" | "down">(null);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    // Primero entre los que aparecen en el historial (parte del nombre, sin mayúsculas: 2026-11-26); si no, la API por
    // nombre exacto o SteamID64.
    const c = consulta(v);
    const veces = new Map<number, { alias: string; country: string | null; n: number }>();
    if (c.length >= 2)
      for (const m of matches)
        for (const j of m.players)
          if (j.profileId !== id && consulta(j.alias).includes(c)) {
            const x = veces.get(j.profileId) ?? { alias: j.alias, country: j.country, n: 0 };
            x.n++;
            veces.set(j.profileId, x);
          }
    const exacto = [...veces].find(([, x]) => consulta(x.alias) === c);
    const mejor = exacto ?? [...veces].sort((a, b) => b[1].n - a[1].n)[0];
    if (mejor) {
      const [pid, x] = mejor;
      setOtro({ id: pid, alias: x.alias, country: x.country, steamId: null, clan: null, level: 0, ratings: [], last: null });
      return;
    }
    void buscarPerfiles(v).then((r) => setOtro(r ? (r[0] ?? "none") : "down"));
  };
  const hay = otro && otro !== "none" && otro !== "down" ? otro : null;
  const juntas = hay ? headToHead(matches, id, hay.id) : [];
  const res = (m: Aoe2Match) => m.players.find((p) => p.profileId === id)?.result;
  const g = juntas.filter((m) => res(m) === "win").length;
  const p = juntas.filter((m) => res(m) === "loss").length;
  return (
    <Panel h={t.hist.h2h}>
      <form onSubmit={enviar} className="a2-search-row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.hist.h2hHint} aria-label={t.hist.h2hHint} autoComplete="off" spellCheck={false} />
        <button type="submit" className="a2-btn">
          {t.lb.searchGo}
        </button>
      </form>
      {otro === "none" && <p className="a2-note">{t.lb.noResults}</p>}
      {otro === "down" && (
        <p className="a2-note" role="alert">
          {t.t.apiDown}
        </p>
      )}
      {hay && (
        <>
          <p>
            <b>{juntas.length ? t.hist.h2hScore(g, p, hay.alias) : t.hist.h2hNone(hay.alias)}</b>
          </p>
          <ul className="a2-vs">
            {juntas.map((m) => (
              <li key={m.id}>
                <RouteLink to={{ ...route, view: "aoe2", a2Section: "matches", detail: `${m.id}?p=${id}` }} onNavigate={navigate}>
                  {mapName(m.map, lang)} · {modo(m.mode)}
                </RouteLink>
                <span className={res(m) === "win" ? "a2-up" : "a2-down"}>{res(m) === "win" ? t.hist.win : res(m) === "loss" ? t.hist.loss : t.hist.other}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
