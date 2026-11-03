/**
 * Piezas de la pestaña Torneos (2026-11-03, etapa 6a): el logo de un equipo (con sus iniciales si no hay), el
 * reproductor de Twitch que se carga al tocarlo y el agrupado de partidos por día en la hora de quien mira.
 */
import { useState } from "react";
import type { Lang } from "../../i18n";
import { useCs2Copy } from "../../cs2Copy";
import type { Teams } from "./data";
import type { Match } from "./matches";

/** Las iniciales de un equipo: una palabra, sus dos primeras letras ("MO"); varias, la de las dos primeras ("NV"). */
export function initials(name: string): string {
  const w = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  if (!w.length) return "?";
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[1][0]).toUpperCase();
}

/** El logo de un equipo por su página de Liquipedia, en una caja cuadrada de `size`; sin logo, sus iniciales. */
export function TeamLogo({ lp, name, teams, size = 28 }: { lp: string | null; name: string; teams: Teams; size?: number }) {
  const logo = lp ? teams[lp]?.logo : null;
  if (!logo)
    return (
      <span className="c2-logo is-text" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }} aria-hidden="true">
        {initials(name)}
      </span>
    );
  return <img className="c2-logo" src={`/cs2/t/${logo}.webp`} alt="" width={size} height={size} loading="lazy" decoding="async" />;
}

/**
 * La transmisión: una portada con el canal y un botón; al tocarlo se pone el reproductor de Twitch (pesa decenas de
 * pedidos, por eso no carga al abrir la página). `parent` es el dominio donde se ve, como pide Twitch.
 */
export function Twitch({ channel, title }: { channel: string; title: string }) {
  const t = useCs2Copy();
  const [on, setOn] = useState(false);
  if (on)
    return (
      <iframe
        className="c2-tw"
        src={`https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${window.location.hostname}&muted=false`}
        title={title}
        allowFullScreen
      />
    );
  return (
    <button type="button" className="c2-tw is-off" onClick={() => setOn(true)}>
      <span className="c2-tw-play" aria-hidden="true">
        ▶
      </span>
      <b>{t.es.watch}</b>
      <span>twitch.tv/{channel}</span>
      <small>{t.es.watchHint}</small>
    </button>
  );
}

/** El día local de un instante, como clave ("2026-11-04"). */
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Los partidos por día, en la zona horaria del navegador: "Hoy", "Mañana", "Ayer" o "Miércoles 5 de noviembre". `now` es el
 * instante de referencia (para las pruebas).
 */
export function byLocalDay(ms: Match[], lang: Lang, now: Date, words: { today: string; tomorrow: string; yesterday: string }): { key: string; label: string; items: Match[] }[] {
  const today = dayKey(now);
  const tomorrow = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const fmt = new Intl.DateTimeFormat(lang === "es" ? "es-AR" : "en-US", { weekday: "long", day: "numeric", month: "long" });
  const out: { key: string; label: string; items: Match[] }[] = [];
  for (const m of ms) {
    const d = new Date(m.t * 1000);
    const key = dayKey(d);
    let g = out[out.length - 1];
    if (!g || g.key !== key) {
      const label = key === today ? words.today : key === tomorrow ? words.tomorrow : key === yesterday ? words.yesterday : fmt.format(d);
      g = { key, label: label.charAt(0).toUpperCase() + label.slice(1), items: [] };
      out.push(g);
    }
    g.items.push(m);
  }
  return out;
}

/** La hora local de un partido, de 24 h ("21:30"). */
export const localTime = (t: number, lang: Lang) =>
  new Intl.DateTimeFormat(lang === "es" ? "es-AR" : "en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t * 1000));
