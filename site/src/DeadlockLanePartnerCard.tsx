import { useEffect, useState } from "react";
import { useLang, type Lang } from "./i18n";
import { text } from "./localized";
import RouteLink from "./RouteLink";
import GameImg from "./GameImg";
import { PUBLISHED_BAND, type BandId } from "./deadlockData";
import { loadInsights, type HeroInsightsFile, type PairPoint } from "./deadlockHeroKitData";
import { bandRangeOf } from "./deadlockVsBand";
import { heroImg, heroName } from "./deadlockReportData";
import { heroes as heroSlugs } from "./deadlockSlugs";
import { useCopy } from "./deadlockCopy";
import type { Route } from "./route";
import "./styles/deadlock-lanepartner.css";

/**
 * "Tu compañero de línea ideal" (2026-11-25), en el Resumen del perfil: con
 * los héroes que más jugás, a quién llevar a la línea y a quién evitar, según
 * cuánto ganan los dos juntos en la misma línea en salas de tu banda. Sale de
 * los dúos de línea (`hero-insights.<banda>.json`, campo `mates`): no pide nada
 * a la API.
 */

/** Cuántos héroes tuyos y cuántos compañeros por héroe. */
const MY_HEROES = 3;
const BEST = 3;

const COPY = {
  en: {
    title: "Your ideal lane partner",
    lead: (band: string) => `With the heroes you play most: who wins most with them in the same lane, in ${band} lobbies.`,
    take: "Take",
    avoid: "Avoid",
    games: (n: string) => `${n} games together`,
    all: (hero: string) => `All ${hero} lane partners`,
    none: "Not enough lane games yet for your heroes in your rank.",
  },
  es: {
    title: "Tu compañero de línea ideal",
    lead: (band: string) => `Con los héroes que más jugás: quién gana más con ellos en la misma línea, en salas ${band}.`,
    take: "Llevá a",
    avoid: "Evitá",
    games: (n: string) => `${n} partidas juntos`,
    all: (hero: string) => `Todos los compañeros de ${hero}`,
    none: "Todavía no hay partidas de línea suficientes para tus héroes en tu rango.",
  },
} as const;

const nombre = (id: number, lang: Lang) => text(heroName(id) ?? undefined, lang, `#${id}`);
const pct = (p: number, lang: Lang) => `${(p * 100).toLocaleString(lang === "es" ? "es-AR" : "en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export default function DeadlockLanePartnerCard({ heroIds, badge, route, navigate }: { heroIds: number[]; badge: number; route: Route; navigate: (r: Route) => void }) {
  const { lang } = useLang();
  const c = COPY[lang];
  const bands = useCopy().deadlock.bands;
  const band: BandId = bandRangeOf(badge)?.band ?? PUBLISHED_BAND;
  const [file, setFile] = useState<HeroInsightsFile | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    setFile(undefined);
    loadInsights(band).then((f) => vivo && setFile(f));
    return () => {
      vivo = false;
    };
  }, [band]);
  if (file === undefined || heroIds.length === 0) return null;

  const filas = heroIds
    .slice(0, MY_HEROES)
    .map((id) => ({ id, mates: (file?.heroes[String(id)]?.mates ?? []) as PairPoint[] }))
    .filter((f) => f.mates.length > 0);
  const toDuos = (id: number): Route => ({ ...route, view: "deadlock", dlSection: "heroes", detail: `duos/${heroSlugs.toSlug.get(String(id)) ?? id}` });
  const Cara = ({ m }: { m: PairPoint }) => {
    const [id, n, w] = m;
    return (
      <span className="dl-lp-mate" title={c.games(n.toLocaleString(lang === "es" ? "es-AR" : "en-US"))}>
        {heroImg(id) && <GameImg src={heroImg(id)!} alt="" width={28} height={28} loading="lazy" decoding="async" />}
        <span>{nombre(id, lang)}</span>
        <b>{pct(w / n, lang)}</b>
      </span>
    );
  };

  return (
    <div className="box dl-pcard dl-lp">
      <h2 className="box-title dl-pcard-title">{c.title}</h2>
      <p className="detail-note">{c.lead(bands[band])}</p>
      {filas.length === 0 ? (
        <p className="box-empty">{c.none}</p>
      ) : (
        <ul className="dl-lp-rows">
          {filas.map(({ id, mates }) => {
            const mejores = mates.slice(0, BEST);
            const peor = mates.length > BEST ? mates[mates.length - 1] : null;
            return (
              <li key={id} className="dl-lp-row">
                <RouteLink className="dl-lp-hero" to={toDuos(id)} onNavigate={navigate} title={c.all(nombre(id, lang))}>
                  {heroImg(id) && <GameImg src={heroImg(id)!} alt="" width={40} height={40} loading="lazy" decoding="async" />}
                  <span>{nombre(id, lang)}</span>
                </RouteLink>
                <div className="dl-lp-take">
                  <span className="dl-lp-k">{c.take}</span>
                  <span className="dl-lp-list">
                    {mejores.map((m) => (
                      <Cara key={m[0]} m={m} />
                    ))}
                  </span>
                </div>
                {peor && (
                  <div className="dl-lp-avoid">
                    <span className="dl-lp-k">{c.avoid}</span>
                    <span className="dl-lp-list">
                      <Cara m={peor} />
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
