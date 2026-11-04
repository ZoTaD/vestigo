/**
 * Lo que comparten Ranking, Jugador y Partida de CoH3 (2026-11-04): el pedido a `/api/coh3/*` con una memoria corta,
 * la bandera y el país, el tiempo relativo, los nombres de los mapas, el `noindex` y el título con el alias.
 *
 * Los datos son en vivo: se piden en el navegador, nunca en el prerender (Jugador y Partida no se prerenderizan; el
 * Ranking sale con su armazón y la tabla vacía).
 */
import { useCallback, useEffect, useState } from "react";
import { useLang, type Lang } from "../../i18n";
import { flagUrl } from "../../flags";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { agoParts, prettyMap, stripPlayers } from "./logic";
import "./live.css";

// ——— Pedidos ———

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`coh3 api ${status}`);
  }
}

/** Lo ya pedido, un minuto (ir del ranking al jugador y volver no repite el pedido). */
const memo = new Map<string, { at: number; p: Promise<unknown> }>();
const TTL = 60_000;

export function getJson<T>(path: string): Promise<T> {
  const hit = memo.get(path);
  if (hit && Date.now() - hit.at < TTL) return hit.p as Promise<T>;
  const p = fetch(path, { headers: { Accept: "application/json" } }).then(async (r) => {
    if (!r.ok) throw new ApiError(r.status);
    return (await r.json()) as T;
  });
  memo.set(path, { at: Date.now(), p });
  p.catch(() => memo.delete(path));
  return p;
}

export type Remote<T> = { data: T | null; error: number | null; loading: boolean; retry: () => void };

/** Pide `path` (o nada, con null) y devuelve lo que llegó, la falla (estado HTTP; 0 sin red) y si está esperando. */
export function useApi<T>(path: string | null): Remote<T> {
  const [st, setSt] = useState<{ path: string | null; data: T | null; error: number | null }>({ path: null, data: null, error: null });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return;
    let vivo = true;
    getJson<T>(path).then(
      (data) => vivo && setSt({ path, data, error: null }),
      (e) => vivo && setSt({ path, data: null, error: e instanceof ApiError ? e.status : 0 }),
    );
    return () => {
      vivo = false;
    };
  }, [path, n]);
  const retry = useCallback(() => {
    if (path) memo.delete(path);
    setSt({ path: null, data: null, error: null });
    setN((x) => x + 1);
  }, [path]);
  const fresh = st.path === path;
  return { data: fresh ? st.data : null, error: fresh ? st.error : null, loading: !!path && !fresh, retry };
}

// ——— Página sin indexar y título ———

/** Jugador y Partida son infinitas y cambian a cada rato: `noindex` (además de estar fuera del sitemap). */
export function useNoindex() {
  useEffect(() => {
    const m = document.createElement("meta");
    m.name = "robots";
    m.content = "noindex";
    document.head.appendChild(m);
    // Como en `useDocTitle`: si `Suspense` esconde la página sin limpiar, la etiqueta se va igual al cambiar la dirección
    // (`PageMeta` reescribe el <head> en cada cambio de ruta, que es lo que despierta al vigía).
    const path = window.location.pathname;
    const mo = new MutationObserver(() => {
      if (window.location.pathname !== path) {
        mo.disconnect();
        m.remove();
      }
    });
    mo.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => {
      mo.disconnect();
      m.remove();
    };
  }, []);
}

/**
 * El título del documento con el alias. `PageMeta` escribe el genérico de la pestaña cuando cambia la ruta (y, en la
 * primera carga, más de una vez): mientras la página esté abierta, se vuelve a poner el nuestro si alguien lo pisa.
 */
export function useDocTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;
    // Al irse a una pestaña cuyo chunk todavía no bajó, `Suspense` esconde esta sin limpiar sus efectos: el vigía se
    // apaga solo en cuanto la dirección ya no es la de esta página.
    const path = window.location.pathname;
    const mo = new MutationObserver(() => put());
    const put = () => {
      if (window.location.pathname !== path) return mo.disconnect();
      if (document.title !== title) document.title = title;
    };
    put();
    mo.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => mo.disconnect();
  }, [title]);
}

// ——— Bandera, país y tiempo ———

const regionNames = new Map<Lang, Intl.DisplayNames | null>();
export function countryName(code: string | null | undefined, lang: Lang): string | null {
  if (!code) return null;
  if (!regionNames.has(lang)) {
    try {
      regionNames.set(lang, new Intl.DisplayNames([lang === "es" ? "es-AR" : "en"], { type: "region" }));
    } catch {
      regionNames.set(lang, null);
    }
  }
  try {
    return regionNames.get(lang)?.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** La bandera del país (de `public/flags/`), con el nombre en el `title`. Sin país, nada. */
export function Flag({ code }: { code: string | null | undefined }) {
  const { lang } = useLang();
  if (!code || !/^[a-z]{2}$/i.test(code)) return null;
  const name = countryName(code, lang) ?? code;
  return (
    <img
      className="c3-flag"
      src={flagUrl(code)}
      srcSet={`${flagUrl(code)} 1x, ${flagUrl(code, "64x48")} 2x`}
      alt={name}
      title={name}
      width={20}
      height={15}
      loading="lazy"
      decoding="async"
    />
  );
}

/** "hace 3 h" / "3 hr. ago", con el reloj que corre cada minuto. */
export function useAgo() {
  const { lang } = useLang();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const rtf = new Intl.RelativeTimeFormat(lang === "es" ? "es-AR" : "en", { numeric: "auto", style: "long" });
  return (sec: number) => {
    if (!sec) return "—";
    const [v, u] = agoParts(sec, now);
    return rtf.format(v, u);
  };
}

/** Fecha y hora completas, para el `title` y la ficha de la partida. */
export function useDate() {
  const { lang } = useLang();
  const f = new Intl.DateTimeFormat(lang === "es" ? "es-AR" : "en-US", { dateStyle: "medium", timeStyle: "short" });
  return (sec: number) => (sec ? f.format(new Date(sec * 1000)) : "—");
}

// ——— Mapas: el nombre del juego sale de `maps.json` (se pide recién cuando hace falta) ———

type MapRow = { slug: string; name: { en: string; es?: string | null } };
let mapNames: Map<string, MapRow["name"]> | null = null;
let mapPending: Promise<void> | null = null;

export function useMapName() {
  const { lang } = useLang();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (mapNames) return;
    mapPending ??= import("@coh3/maps.json")
      .then((m) => {
        mapNames = new Map((m.default as unknown as MapRow[]).map((r) => [r.slug, r.name]));
      })
      .catch(() => {
        mapNames = new Map();
      });
    let vivo = true;
    void mapPending.then(() => vivo && setTick((x) => x + 1));
    return () => {
      vivo = false;
    };
  }, []);
  return (raw: string) => {
    const n = mapNames?.get(raw);
    return n ? stripPlayers((lang === "es" && n.es) || n.en) : prettyMap(raw);
  };
}

// ——— Enlaces ———

/** El enlace a la ficha de un jugador. */
export function PlayerLink({ route, navigate, id, alias, country, className }: { route: Route; navigate: (r: Route) => void; id: number; alias: string; country?: string | null; className?: string }) {
  return (
    <RouteLink className={className ? `c3-pl ${className}` : "c3-pl"} to={{ ...route, view: "coh3", c3Section: "players", detail: String(id) }} onNavigate={navigate} prefetch="press">
      <Flag code={country} />
      <span>{alias || `#${id}`}</span>
    </RouteLink>
  );
}

/** El enlace a una partida: lleva el jugador desde cuyo historial se pide (`?p=`, ver `matches/Coh3Matches.tsx`). */
export function MatchLink({ route, navigate, id, player, className, children }: { route: Route; navigate: (r: Route) => void; id: number; player: number; className?: string; children: React.ReactNode }) {
  return (
    <RouteLink className={className} to={{ ...route, view: "coh3", c3Section: "matches", detail: String(id) }} search={`?p=${player}`} onNavigate={navigate} prefetch="press">
      {children}
    </RouteLink>
  );
}

/** El último jugador abierto, por si la partida llega sin `?p=` (un link copiado a mano). */
const LAST = "c3:lastPlayer";
export function rememberPlayer(id: number) {
  try {
    sessionStorage.setItem(LAST, String(id));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}
export function lastPlayer(): number | null {
  try {
    const v = sessionStorage.getItem(LAST);
    return v && /^\d{1,10}$/.test(v) ? Number(v) : null;
  } catch {
    return null;
  }
}

/** La query de la dirección, sólo en el navegador (el prerender no la tiene). */
export const currentSearch = () => (typeof window === "undefined" ? "" : window.location.search);
