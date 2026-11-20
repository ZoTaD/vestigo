/**
 * Las piezas que comparten las pestañas de Age of Empires II (2026-11-20): encabezado con la tira de capturas, barra de
 * pestañas con los botones del juego, selector de modo, escudo de civ, panel y avisos. Estética C "Campo de batalla".
 */
import type { ReactNode } from "react";
import RouteLink from "../RouteLink";
import type { Aoe2Section, Route } from "../route";
import { AOE2_TABS, useAoe2Copy } from "../aoe2Copy";
import civs from "@aoe2/civs.json";

export type Nav = (r: Route) => void;
export type Aoe2Mode = "rm1v1" | "rmteam" | "ew1v1" | "ewteam" | "dm1v1" | "dmteam";
export type Civ = { id: number; slug: string; name: { en: string; es: string }; era: string };

const POR_ID = new Map((civs as Civ[]).map((c) => [c.id, c]));
const POR_SLUG = new Map((civs as Civ[]).map((c) => [c.slug, c]));
/** La civ de un `civilization_id` de la API, o null si es una que todavía no conocemos (DLC nuevo). */
export const civById = (id: number): Civ | null => POR_ID.get(id) ?? null;
export const civBySlug = (slug: string): Civ | null => POR_SLUG.get(slug) ?? null;

/** Los 8 colores de jugador del juego (1 = azul … 8 = naranja). */
export const PLAYER_COLORS = ["#2d6cf0", "#e23b30", "#2fb04f", "#f2cf2d", "#2bc4c4", "#9a49d6", "#a0a0a0", "#f08a24"];

const STRIP = [1, 2, 3, 4, 5];

/** La cabecera: tira de capturas del juego, escudo, título y la franja con los colores de jugador. */
export function Aoe2Header({ home, route, navigate }: { home: boolean; route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  return (
    <header className={`a2-head${home ? " is-home" : ""}`}>
      <div className="a2-strip" aria-hidden="true">
        {STRIP.map((n) => (
          <img key={n} src={`/aoe2/ui/strip-${n}.webp`} alt="" width={800} height={373} decoding="async" loading={n === 1 ? undefined : "lazy"} />
        ))}
      </div>
      <div className="a2-title">
        <img src="/aoe2/ui/shield-sp.webp" alt="" width={90} height={121} decoding="async" />
        <div>
          {home ? (
            <h1>{t.name}</h1>
          ) : (
            <RouteLink className="a2-name" to={{ ...route, view: "aoe2", a2Section: "home", detail: undefined }} onNavigate={navigate}>
              {t.name}
            </RouteLink>
          )}
          <p>{t.tagline}</p>
        </div>
      </div>
      <div className="a2-players" aria-hidden="true">
        {PLAYER_COLORS.map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
      </div>
    </header>
  );
}

/** La barra de pestañas, con los botones rojos del juego. `live` dice cuáles ya tienen página. */
export function Aoe2Tabs({ route, navigate, section, live }: { route: Route; navigate: Nav; section: Aoe2Section; live: (s: Aoe2Section) => boolean }) {
  const t = useAoe2Copy();
  return (
    <nav className="a2-tabs" aria-label={t.name}>
      {AOE2_TABS.map((tab) =>
        live(tab) ? (
          <RouteLink key={tab} className={`a2-tab${tab === section ? " is-on" : ""}`} to={{ ...route, view: "aoe2", a2Section: tab, detail: undefined }} onNavigate={navigate} active={tab === section}>
            {t.tabs[tab]}
          </RouteLink>
        ) : (
          <span key={tab} className="a2-tab is-soon" aria-disabled="true" title={t.t.soon}>
            {t.tabs[tab]}
          </span>
        ),
      )}
    </nav>
  );
}

const MODE_ART: Record<Aoe2Mode, string> = { rm1v1: "mode-rm", rmteam: "mode-team", ew1v1: "mode-ew", ewteam: "mode-ew", dm1v1: "mode-dm", dmteam: "mode-dm" };

/** El selector de modo con la captura de cada uno. `modes` limita los que se ofrecen. */
export function ModePicker({ value, onChange, modes = ["rm1v1", "rmteam", "ew1v1", "dm1v1"] }: { value: Aoe2Mode; onChange: (m: Aoe2Mode) => void; modes?: Aoe2Mode[] }) {
  const t = useAoe2Copy();
  return (
    <div className="a2-mode" role="radiogroup">
      {modes.map((m) => (
        <button key={m} type="button" role="radio" aria-checked={m === value} className={m === value ? "is-on" : undefined} onClick={() => onChange(m)}>
          <img src={`/aoe2/ui/${MODE_ART[m]}.webp`} alt="" width={712} height={332} loading="lazy" decoding="async" />
          <span>{t.modes[m]}</span>
        </button>
      ))}
    </div>
  );
}

/** El escudo de una civ (o el genérico si no la conocemos). */
export function CivShield({ civ, size = 40 }: { civ: Civ | null; size?: number }) {
  return (
    <img
      className="a2-shield"
      src={civ ? `/aoe2/civ/${civ.slug}.webp` : "/aoe2/ui/civ-unknown.webp"}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
    />
  );
}

export function Panel({ h, sub, children, className }: { h?: ReactNode; sub?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={`a2-panel${className ? ` ${className}` : ""}`}>
      {h && <h2>{h}</h2>}
      {sub && <p className="a2-sub">{sub}</p>}
      {children}
    </section>
  );
}

/** El aviso de muestra chica: va al lado de toda cifra con menos de 200 partidas. */
export function MuestraChica({ games }: { games: number }) {
  const t = useAoe2Copy();
  return (
    <span className="a2-small" title={t.t.smallNote(games)}>
      {t.t.small}
    </span>
  );
}

/** Cargando, o la API caída con un botón para reintentar. */
export function Aoe2Loading({ onRetry }: { onRetry?: () => void }) {
  const t = useAoe2Copy();
  return (
    <Panel className="a2-loading">
      {onRetry ? (
        <p role="alert">
          {t.t.apiDown}{" "}
          <button type="button" className="a2-btn" onClick={onRetry}>
            {t.t.retry}
          </button>
        </p>
      ) : (
        <p aria-busy="true">{t.t.loading}</p>
      )}
    </Panel>
  );
}
