/**
 * Compartir pines (2026-10-30): arma un enlace con la semilla, la vista y los pines que se ven (los de la mesa de
 * cartografía y los de cada personaje mostrado, más los agregados a mano y los recibidos), y permite agregar pines
 * propios tocando el mapa. Los pines van en el `#` del enlace: no llegan a ningún servidor.
 */
import { useState } from "react";
import { useLang } from "../i18n";
import { encodePins, MAX_HASH, type SharedPin } from "./sharePins";

const COPY = {
  en: {
    title: "Share pins",
    help: "Makes a link with this seed and the pins you see. Whoever opens it sees them on the map, without uploading anything.",
    share: (n: number) => `Copy link with ${n} pin${n === 1 ? "" : "s"}`,
    none: "No pins to share yet: load your world or character, or add pins by hand.",
    copied: "Link copied.",
    tooBig: "Too many pins for one link. Hide some players or the cartography table and try again.",
    add: "Add a pin by tapping the map",
    adding: "Tap the map where the pin goes…",
    received: (n: number) => `${n} shared pin${n === 1 ? "" : "s"} on the map.`,
    clear: "Remove shared pins",
    ask: "Pin name",
  },
  es: {
    title: "Compartir pines",
    help: "Arma un enlace con esta semilla y los pines que ves. Quien lo abra los ve en el mapa, sin subir nada.",
    share: (n: number) => `Copiar enlace con ${n} pin${n === 1 ? "" : "es"}`,
    none: "Todavía no hay pines para compartir: carga tu mundo o tu personaje, o agrega pines a mano.",
    copied: "Enlace copiado.",
    tooBig: "Son demasiados pines para un enlace. Oculta algunos jugadores o la mesa de cartografía y prueba de nuevo.",
    add: "Agregar un pin tocando el mapa",
    adding: "Toca el mapa donde va el pin…",
    received: (n: number) => `${n} pin${n === 1 ? "" : "es"} compartido${n === 1 ? "" : "s"} en el mapa.`,
    clear: "Quitar los pines compartidos",
    ask: "Nombre del pin",
  },
};
export const useShareCopy = () => COPY[useLang().lang];

export default function SharePanel({ pins, shared, pinMode, setPinMode, clearShared }: {
  /** Todo lo que se compartiría ahora. */
  pins: () => SharedPin[];
  /** Cuántos pines llegaron por enlace o se agregaron a mano. */
  shared: number;
  pinMode: boolean;
  setPinMode: (on: boolean) => void;
  clearShared: () => void;
}) {
  const t = useShareCopy();
  const [msg, setMsg] = useState<string | null>(null);
  const n = pins().length;
  const share = async () => {
    const code = await encodePins(pins());
    if (code.length > MAX_HASH) { setMsg(t.tooBig); return; }
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#p=${code}`;
    window.history.replaceState(window.history.state, "", url);
    try { await navigator.clipboard.writeText(url); setMsg(t.copied); } catch { setMsg(url); }
  };
  return (
    <section className="vh-box vm-panel">
      <h3>{t.title}</h3>
      <p className="vm-note">{shared ? t.received(shared) : t.help}</p>
      <div className="vh-opts" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <button type="button" className="vm-btn is-main" disabled={!n} onClick={share}>{n ? t.share(n) : t.none}</button>
        <button type="button" className="vm-btn" aria-pressed={pinMode} onClick={() => setPinMode(!pinMode)}>{pinMode ? t.adding : t.add}</button>
        {shared > 0 && <button type="button" className="vm-btn" onClick={clearShared}>{t.clear}</button>}
      </div>
      {msg && (msg.startsWith("http")
        ? <input className="vh-input" readOnly value={msg} onFocus={(e) => e.currentTarget.select()} aria-label={t.title} />
        : <p className="vm-note">{msg}</p>)}
    </section>
  );
}
