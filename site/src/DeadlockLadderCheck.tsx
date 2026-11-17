import { useEffect, useState } from "react";
import { useLang, useLocale } from "./i18n";
import { text } from "./localized";
import RouteLink from "./RouteLink";
import type { Route } from "./route";
import { catalog } from "./deadlockData";
import { heroImg } from "./deadlockReportData";
import GameImg from "./GameImg";
import { LADDER_COPY } from "./deadlockLadderCopy";
import { searchAccounts, type SteamAccount } from "./deadlockMatch";
import { useHeroPlacings } from "./deadlockHeroLadder";
import { ladderSeason, seasonParams } from "./deadlockSeasons";
import { heroes as heroSlugs } from "./deadlockSlugs";

/**
 * "¿Entro?" (2026-11-17): busca una cuenta y dice en qué rankings está y
 * cuántas clasificatorias le faltan para entrar a cada uno.
 *
 * Los puestos salen de `heroLadder.json` (los mismos del perfil); las partidas,
 * de un pedido a `/v1/players/hero-stats` con todos los héroes de la temporada.
 */

const API = "https://api.deadlock-api.com/v1";
/** SteamID64 → account_id (los 32 bits de abajo). */
const STEAM64_BASE = 76561197960265728n;

/** Un número de cuenta, un SteamID64 o un enlace `/profiles/<id64>`. Si no, es un nombre. */
export function parseAccount(input: string): number | null {
  const s = input.trim();
  const perfil = /steamcommunity\.com\/profiles\/(\d{17})/i.exec(s);
  const id64 = perfil?.[1] ?? (/^\d{17}$/.test(s) ? s : null);
  if (id64 && id64.startsWith("7656")) return Number(BigInt(id64) - STEAM64_BASE);
  if (/^\d{1,10}$/.test(s)) return Number(s);
  return null;
}

interface HeroMatches {
  heroId: number;
  matches: number;
}

async function fetchSeasonMatches(accountId: number): Promise<HeroMatches[]> {
  const q = new URLSearchParams({ account_ids: String(accountId), match_mode: "Ranked", ...seasonParams(ladderSeason().season) });
  const res = await fetch(`${API}/players/hero-stats?${q}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = (await res.json()) as { hero_id: number; matches_played: number }[];
  return rows.map((r) => ({ heroId: r.hero_id, matches: r.matches_played })).sort((a, b) => b.matches - a.matches);
}

/** Los pisos: 50 en el mundo y 20 con un héroe (ver `ladder.ts`). */
const WORLD_FLOOR = 50;
const HERO_FLOOR = 20;

function Result({ accountId, route, navigate }: { accountId: number; route: Route; navigate: (r: Route) => void }) {
  const { lang } = useLang();
  const locale = useLocale();
  const c = LADDER_COPY[lang].check;
  const { placings, world } = useHeroPlacings(accountId);
  const [matches, setMatches] = useState<HeroMatches[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let vivo = true;
    setMatches(null);
    setFailed(false);
    fetchSeasonMatches(accountId).then(
      (m) => vivo && setMatches(m),
      () => vivo && setFailed(true)
    );
    return () => {
      vivo = false;
    };
  }, [accountId]);

  if (failed) return <p className="dl-notice">{c.failed}</p>;
  if (!matches) return <p className="box-empty">{c.searching}</p>;
  if (matches.length === 0) return <p className="box-empty">{c.noRanked}</p>;

  const total = matches.reduce((a, m) => a + m.matches, 0);
  const n = (x: number) => x.toLocaleString(locale);
  const lugar = new Map(placings.map((p) => [p.heroId, p.place]));

  return (
    <div className="dl-chk-result">
      <div className="dl-chk-world">
        <h3 className="dl-chk-h">{c.world}</h3>
        <p className="dl-chk-count">{c.worldCount(n(total), n(WORLD_FLOOR))}</p>
        <p className="dl-chk-verdict" data-in={!!world}>
          {world ? c.worldIn(n(world.place)) : total >= WORLD_FLOOR ? c.worldYes : c.worldNo(n(WORLD_FLOOR - total))}
        </p>
      </div>

      <h3 className="dl-chk-h">{c.heroesTitle}</h3>
      <ul className="dl-chk-heroes">
        {matches.map((m) => {
          const slug = heroSlugs.toSlug.get(String(m.heroId));
          const p = lugar.get(m.heroId);
          const nombre = text(catalog.heroes[String(m.heroId)]?.name, lang, `#${m.heroId}`);
          return (
            <li key={m.heroId} className="dl-chk-hero" data-in={!!p}>
              <GameImg src={heroImg(m.heroId) ?? ""} alt="" width={32} height={32} loading="lazy" decoding="async" />
              <span className="dl-chk-hero-name">
                {slug ? (
                  <RouteLink to={{ ...route, view: "deadlock", dlSection: "ladder", detail: slug }} onNavigate={navigate}>
                    {nombre}
                  </RouteLink>
                ) : (
                  nombre
                )}
              </span>
              <span className="dl-chk-hero-m">{c.matchesN(n(m.matches))}</span>
              <span className="dl-chk-hero-v">
                {p ? c.heroIn(n(p)) : m.matches >= HERO_FLOOR ? c.heroYes : c.heroNo(n(HERO_FLOOR - m.matches))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function DeadlockLadderCheck({ route, navigate }: { route: Route; navigate: (r: Route) => void }) {
  const { lang } = useLang();
  const c = LADDER_COPY[lang].check;
  const [q, setQ] = useState("");
  const [cuenta, setCuenta] = useState<number | null>(null);
  const [opciones, setOpciones] = useState<SteamAccount[] | null>(null);
  const [estado, setEstado] = useState<"idle" | "searching" | "notFound" | "failed">("idle");

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    const id = parseAccount(q);
    setOpciones(null);
    if (id !== null) {
      setCuenta(id);
      setEstado("idle");
      return;
    }
    if (q.trim().length < 2) return;
    setCuenta(null);
    setEstado("searching");
    try {
      const r = await searchAccounts(q.trim());
      if (r.length === 0) setEstado("notFound");
      else if (r.length === 1) {
        setCuenta(r[0].accountId);
        setEstado("idle");
      } else {
        setOpciones(r.slice(0, 8));
        setEstado("idle");
      }
    } catch {
      setEstado("failed");
    }
  }

  return (
    <section className="box dl-chk">
      <div className="box-head">
        <h2 className="box-title">{c.title}</h2>
      </div>
      <p className="dl-hb-lead">{c.lead}</p>
      <form className="dl-chk-form" onSubmit={buscar}>
        <label className="field">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={c.placeholder} aria-label={c.placeholder} autoComplete="off" />
        </label>
        <button type="submit" className="btn">
          {c.go}
        </button>
      </form>

      {estado === "searching" && <p className="box-empty">{c.searching}</p>}
      {estado === "notFound" && <p className="box-empty">{c.notFound}</p>}
      {estado === "failed" && <p className="dl-notice">{c.failed}</p>}

      {opciones && (
        <div className="dl-chk-pick">
          <p className="dl-chk-h">{c.pickOne}</p>
          <ul>
            {opciones.map((o) => (
              <li key={o.accountId}>
                <button
                  type="button"
                  onClick={() => {
                    setCuenta(o.accountId);
                    setOpciones(null);
                  }}
                >
                  {o.avatar && <img src={o.avatar} alt="" width={24} height={24} loading="lazy" decoding="async" />}
                  {o.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cuenta !== null && <Result accountId={cuenta} route={route} navigate={navigate} />}
    </section>
  );
}
