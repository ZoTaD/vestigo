import { useMemo } from "react";
import recordsJson from "@deadlock/records.json";
import DeadlockHeroesTabs from "./DeadlockHeroesTabs";
import GameImg from "./GameImg";
import SectionHead from "./SectionHead";
import RouteLink from "./RouteLink";
import { useLang, useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { heroImg, heroName } from "./deadlockReportData";
import { heroes as heroSlugs } from "./deadlockSlugs";
import type { Route } from "./route";
import "./styles/deadlock-records.css";

/**
 * Récords (2026-11-18): la mejor partida de la temporada en cada estadística,
 * del mundo (`/deadlock/heroes/records`) y de cada héroe (`/deadlock/heroes/records/<héroe>`).
 * Es una sub-pestaña de Héroes, al lado de la tabla de estadísticas.
 *
 * Los datos los arma `build:records` en el pipeline (`records.ts`), una vez por
 * día y sumando de a poco: un récord sólo puede mejorar. Cada fila enlaza a la
 * partida y al perfil del jugador, que es lo que se comparte.
 */

interface Rec {
  m: number;
  a: number;
  h: number;
  v: number;
  t: number;
  d: number;
  w: boolean;
}
interface RecordsFile {
  generatedAt: string;
  season: number;
  metrics: string[];
  world: Record<string, Rec[]>;
  heroes: Record<string, Record<string, Rec[]>>;
  names: Record<string, string>;
}

const data = recordsJson as unknown as RecordsFile;

/** El héroe de la dirección (`records/<héroe>`), o null para el mundo (`records`). */
export function recordsHeroOf(detail: string | undefined): number | null {
  const slug = detail?.startsWith("records/")
    ? detail.slice("records/".length)
    : null;
  if (!slug) return null;
  const id = heroSlugs.toId.get(slug);
  return id && data.heroes[id] ? Number(id) : null;
}

export default function DeadlockRecords({
  route,
  navigate,
}: {
  route: Route;
  navigate: (r: Route) => void;
}) {
  const copy = useCopy();
  const t = copy.deadlock.records;
  const { lang } = useLang();
  const locale = useLocale();
  const heroId = recordsHeroOf(route.detail);
  const nombreDe = (id: number) =>
    heroName(id)?.[lang] ?? heroName(id)?.en ?? `#${id}`;

  const opciones = useMemo(
    () =>
      Object.keys(data.heroes)
        .map(Number)
        .filter((id) => heroSlugs.toSlug.has(String(id)))
        .map((id) => ({ id, name: nombreDe(id) }))
        .sort((a, b) => a.name.localeCompare(b.name, lang)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang],
  );

  const listas = heroId == null ? data.world : data.heroes[String(heroId)];
  const fecha = (s: number) =>
    new Date(s * 1000).toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
    });
  const num = (v: number) => v.toLocaleString(locale);
  const aJugador = (a: number): Route => ({
    ...route,
    view: "deadlock",
    dlSection: "player",
    detail: String(a),
  });
  const aPartida = (m: number): Route => ({
    ...route,
    view: "deadlock",
    dlSection: "match",
    detail: String(m),
  });

  return (
    <main className="deadlock deadlock-heroes">
      <SectionHead
        eyebrow={copy.deadlock.eyebrow}
        title={heroId == null ? t.title : t.heroTitle(nombreDe(heroId))}
        accent={t.accent}
        lead={[t.lead, t.note]}
        meta={
          <span className="dl-meta-line">
            {t.season(data.season)} ·{" "}
            {t.updated(
              new Date(data.generatedAt).toLocaleDateString(locale, {
                day: "numeric",
                month: "long",
              }),
            )}
          </span>
        }
      />
      <DeadlockHeroesTabs route={route} navigate={navigate} active="records" />
      <div className="page dl-rec">
        <nav className="dl-rec-pick" aria-label={t.pickHero}>
          <RouteLink
            className="dl-rec-all"
            to={{
              ...route,
              view: "deadlock",
              dlSection: "heroes",
              detail: "records",
            }}
            onNavigate={navigate}
            active={heroId == null}
          >
            {t.world}
          </RouteLink>
          <div className="dl-rec-heroes dl-lb-heroes">
            {opciones.map((h) => (
              <RouteLink
                key={h.id}
                className="dl-rec-hero dl-lb-hero"
                to={{
                  ...route,
                  view: "deadlock",
                  dlSection: "heroes",
                  detail: `records/${heroSlugs.toSlug.get(String(h.id))}`,
                }}
                onNavigate={navigate}
                active={heroId === h.id}
                title={h.name}
                aria-label={h.name}
              >
                <GameImg
                  src={heroImg(h.id) ?? ""}
                  alt=""
                  width={34}
                  height={34}
                  loading="lazy"
                  decoding="async"
                />
              </RouteLink>
            ))}
          </div>
        </nav>

        {!listas ? (
          <p className="detail-note">{t.none}</p>
        ) : (
          <div className="dl-rec-grid">
            {data.metrics.map((metric) => {
              const filas = listas[metric] ?? [];
              const [top, ...resto] = filas;
              if (!top) return null;
              return (
                <section key={metric} className="box dl-rec-card">
                  <h2 className="dl-rec-metric">
                    {t.metrics[metric] ?? metric}
                  </h2>
                  <div className="dl-rec-top">
                    <GameImg
                      className="dl-rec-top-img"
                      src={heroImg(top.h) ?? ""}
                      alt={nombreDe(top.h)}
                      title={nombreDe(top.h)}
                      width={56}
                      height={56}
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="dl-rec-top-body">
                      <p className="dl-rec-value">
                        {num(top.v)}{" "}
                        <span className="dl-rec-unit">{t.units[metric]}</span>
                      </p>
                      <RouteLink
                        className="dl-rec-player"
                        to={aJugador(top.a)}
                        onNavigate={navigate}
                      >
                        {data.names[top.a] ?? `#${top.a}`}
                      </RouteLink>
                      <p className="dl-rec-sub">
                        <span className={top.w ? "dl-rec-won" : "dl-rec-lost"}>
                          {top.w ? t.won : t.lost}
                        </span>{" "}
                        · {t.minutes(Math.round(top.d / 60))} · {fecha(top.t)} ·{" "}
                        <RouteLink to={aPartida(top.m)} onNavigate={navigate}>
                          {t.match(top.m)}
                        </RouteLink>
                      </p>
                    </div>
                  </div>
                  {resto.length > 0 && (
                    <ol className="dl-rec-list" start={2}>
                      {resto.map((r) => (
                        <li key={`${r.m}:${r.a}`}>
                          <GameImg
                            src={heroImg(r.h) ?? ""}
                            alt={nombreDe(r.h)}
                            title={nombreDe(r.h)}
                            width={22}
                            height={22}
                            loading="lazy"
                            decoding="async"
                          />
                          <RouteLink
                            className="dl-rec-name"
                            to={aJugador(r.a)}
                            onNavigate={navigate}
                          >
                            {data.names[r.a] ?? `#${r.a}`}
                          </RouteLink>
                          <RouteLink
                            className="dl-rec-n"
                            to={aPartida(r.m)}
                            onNavigate={navigate}
                            title={t.match(r.m)}
                          >
                            {num(r.v)}
                          </RouteLink>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
