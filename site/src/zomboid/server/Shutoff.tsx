/**
 * La calculadora de cortes de agua y luz (2026-10-02), `/servidor/cortes-de-agua-y-luz`: el día y la hora del juego en
 * que se cortan, con la cuenta del juego (`shutoffCalc.ts`).
 *
 * - Dos solapas: "Servidor" (el día exacto, con `WaterShutModifier` / `ElecShutModifier`) y "Partida de un jugador" (el
 *   rango que sortea el juego al crear la partida, con `WaterShut` / `ElecShut` y sus etiquetas).
 * - Las entradas son las opciones del juego, con su nombre y sus etiquetas: la fecha y la hora de inicio, los meses
 *   desde el apocalipsis, la duración del día y los dos cortes. "Empezá de un preset" las llena.
 * - **La dirección es la del generador** (`?p=&s=`, `link.ts`): el link de la línea de los cortes del generador abre esta
 *   página con tus valores, y "Llevar estos valores al generador" vuelve con ellos. Como en el generador, el prerender
 *   escribe Apocalipsis, la dirección se lee al montarse (antes de pintar) y cada cambio la reescribe con
 *   `history.replaceState`. El modo no va en la dirección: es cómo se mira, no la configuración.
 *
 * Los datos viajan en el chunk de la pestaña (`data.ts`): el prerender escribe la página entera, sin "cargando…".
 */
import { useEffect, useRef, useState } from "react";
import meta from "@zomboid/meta.json";
import RouteLink from "../../RouteLink";
import { useLang, useLocale } from "../../i18n";
import { parseRoute, routePath, type Route } from "../../route";
import { Stamp, wordFit, useIsoLayoutEffect } from "../ui";
import { coerce, daysInMonth, fromPreset, sandboxChanges, setOption, type Config } from "./config";
import { usePzServerCopy, type CutSay, type PzServerCopy } from "./copy";
import { fullPreset, optionByKey, presetById, SERVER, type PresetId, type SandboxOption } from "./data";
import { CONFIG_KEYS, decodeConfig, encodeConfig, isDefaultConfig } from "./link";
import { withForeign } from "../foreignQuery";
import QueryLink from "../QueryLink";
import { cutAt, cutRange, dayMinutes, realTime, SHUTOFF_KEYS, startDate, worldOf, type Cut, type World } from "./shutoffCalc";
import "../../styles/zomboid-items.css";
import "../../styles/zomboid-server.css";

type Nav = (r: Route) => void;
type Mode = "server" | "solo";

export const SHUTOFF_ID = "water-and-power-shutoff";
/** Esta página, en el idioma de `route`. */
export const shutoffRoute = (route: Route): Route => ({ ...route, view: "zomboid", pzSection: "server", detail: SHUTOFF_ID });
const serverRoute = (route: Route): Route => ({ ...route, view: "zomboid", pzSection: "server", detail: undefined });

/** Las dos fechas del juego en el idioma de la página: "23 de julio de 1993, 7:00" / "July 23, 1993, 7:00 AM". */
export function gameDateFormat(locale: string): (d: Date) => string {
  const date = new Intl.DateTimeFormat(locale, { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
  // En español, el reloj de 24 horas como se escribe acá, "7:00": el de `Intl` da "7:00 a. m." o, con `h23`, "07:00".
  const clock = new Intl.DateTimeFormat(locale, { timeZone: "UTC", hour: "numeric", minute: "2-digit" });
  const time = locale.startsWith("es") ? (d: Date) => `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}` : (d: Date) => clock.format(d);
  return (d) => (Number.isFinite(d.getTime()) ? `${date.format(d)}, ${time(d)}` : "");
}

/** Un corte para la frase del generador: la fecha ya escrita. Una fecha fuera del calendario (millones de años) es nunca. */
export function cutSay(c: Cut, fmt: (d: Date) => string): CutSay {
  if (c.kind !== "at") return c;
  const when = fmt(c.date);
  return when ? { kind: "at", when } : { kind: "never" };
}

export default function Shutoff({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = usePzServerCopy();
  const c = t.shutoff;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const fmt = gameDateFormat(locale);

  const [config, setConfig] = useState<Config>(() => fromPreset(SERVER.baseline));
  const initial = useRef(config);
  const [mode, setMode] = useState<Mode>("server");
  // Lo que escribiste en un modificador y todavía no es un número válido: se muestra tal cual, con el aviso.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useIsoLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("p") && !params.has("s") && !params.has("i")) return;
    setConfig(decodeConfig(params));
  }, []);

  useEffect(() => {
    if (config === initial.current) return;
    const here = parseRoute(window.location.pathname);
    if (here.pzSection !== "server" || here.detail !== SHUTOFF_ID) return;
    const qs = withForeign(window.location.search, CONFIG_KEYS, isDefaultConfig(config) ? "" : encodeConfig(config));
    window.history.replaceState(window.history.state, "", window.location.pathname + qs + window.location.hash);
  }, [config]);

  const s = config.sandbox;
  const w = worldOf(s);
  const set = (key: string, value: number) => setConfig((cf) => setOption(cf, "sandbox", key, value));

  const pickPreset = (id: PresetId) => {
    // Lo demás que traías del generador (zombis, botín…) se pierde al cambiar de preset: se pregunta, como allá.
    const others = sandboxChanges(config).filter((k) => !(SHUTOFF_KEYS as readonly string[]).includes(k)).length;
    if (id !== config.preset && others && !window.confirm(t.confirmPreset(presetById(id)!.name[lang], others))) return;
    setConfig((cf) => ({ ...cf, preset: id, sandbox: { ...fullPreset(id) } }));
    setDrafts({});
  };

  const select = (key: string, count?: number) => {
    const opt = optionByKey(key)!;
    const values = (opt.values ?? []).slice(0, count);
    const id = `pzsc-${key}`;
    return (
      <label className="pzsc-field" htmlFor={id} key={key}>
        <span>{opt.name[lang]}</span>
        <select id={id} className="pzsv-select" value={Number(s[key])} onChange={(e) => set(key, Number(e.target.value))}>
          {values.map((v, i) => (
            <option value={i + 1} key={i}>
              {v[lang]}
            </option>
          ))}
        </select>
      </label>
    );
  };

  const modifier = (key: "WaterShutModifier" | "ElecShutModifier") => {
    const opt = optionByKey(key) as SandboxOption;
    const id = `pzsc-${key}`;
    const draft = drafts[key];
    const bad = draft !== undefined;
    return (
      <label className="pzsc-field" htmlFor={id} key={key}>
        <span>
          {opt.name[lang]} <code className="pzsc-key">{key}</code>
        </span>
        <input
          id={id}
          className="pzsv-input is-number"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          value={draft ?? String(s[key])}
          aria-invalid={bad || undefined}
          aria-describedby={`${id}-hint`}
          onChange={(e) => {
            const raw = e.target.value;
            const r = coerce(opt, raw.trim());
            if (r.ok && raw.trim() !== "") {
              set(key, Number(r.value));
              setDrafts(({ [key]: _, ...rest }) => rest);
            } else {
              setDrafts((d) => ({ ...d, [key]: raw }));
            }
          }}
        />
        <small id={`${id}-hint`}>{bad ? c.invalid(String(opt.min), String(opt.max)) : c.modifierHint}</small>
      </label>
    );
  };

  const server = serverRoute(route);
  const back = isDefaultConfig(config) ? routePath(server) : `${routePath(server)}?${encodeConfig(config)}`;
  const day = c.duration(Math.floor(dayMinutes(w) / 60), Math.round(dayMinutes(w) % 60), num);

  return (
    <main className="pz-main pzi pzsv pzsc">
      <nav className="pzi-crumb" aria-label={t.presets.crumbServer}>
        <RouteLink to={server} onNavigate={navigate}>
          {t.presets.crumbServer}
        </RouteLink>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">{c.crumbHere}</span>
      </nav>

      <section className="pz-page pzi-intro">
        <span className="pz-clip" />
        <h1 className="pzi-h1" style={wordFit(c.title)}>
          {c.title}
        </h1>
        {c.intro(meta.version).map((p) => (
          <p key={p}>{p}</p>
        ))}
        <p className="pzi-hand">{c.hand}</p>
      </section>

      <div className="pzsc-modes" role="group" aria-label={c.modeLabel}>
        {(["server", "solo"] as const).map((m) => (
          <button type="button" className={`pzsc-mode${mode === m ? " is-on" : ""}`} aria-pressed={mode === m} onClick={() => setMode(m)} key={m}>
            {m === "server" ? c.modeServer : c.modeSolo}
          </button>
        ))}
      </div>

      <section className="pz-page pzsc-in" aria-labelledby="pzsc-in-title">
        <h2 className="pzi-h2" id="pzsc-in-title">
          <Stamp name="sun" />
          {c.inputsTitle}
        </h2>
        <p className="pzsc-mode-note">{mode === "server" ? c.modeServerNote : c.modeSoloNote}</p>

        <div className="pzsc-presets">
          <span className="pzsc-presets-label">{c.presetsLabel}</span>
          {SERVER.presets.map((p) => (
            <button type="button" className="pzi-chip" aria-pressed={p.id === config.preset} onClick={() => pickPreset(p.id)} key={p.id}>
              {p.name[lang]}
            </button>
          ))}
        </div>

        <fieldset className="pzsc-group">
          <legend>{c.startDate}</legend>
          <div className="pzsc-fields">
            {select("StartMonth")}
            {/* Hasta el último día del mes, como el menú del juego, que arma la lista con el primer año (1993:
                `syncStartDay`), así que nunca ofrece el 29 de febrero. Un link o un archivo con un día de más (29 de
                febrero de 1996, 31 de febrero) lo sigue mostrando, y la cuenta lo toma como el juego. */}
            {select("StartDay", Math.max(daysInMonth(SERVER.rules.firstYear, w.month), w.day))}
            {select("StartYear")}
            {select("StartTime")}
          </div>
          <p className="pzsc-starts">{c.starts(fmt(startDate(w)))}</p>
        </fieldset>

        <div className="pzsc-fields">
          {select("TimeSinceApo")}
          {select("DayLength")}
        </div>

        <div className="pzsc-fields pzsc-cuts">
          {mode === "server" ? [modifier("WaterShutModifier"), modifier("ElecShutModifier")] : [select("WaterShut"), select("ElecShut")]}
        </div>

        <p className="pzsc-back">
          <QueryLink to={server} href={back} navigate={navigate}>
            {c.toGenerator} →
          </QueryLink>
        </p>
      </section>

      <div className="pzsc-results">
        {(["water", "power"] as const).map((what) => {
          const optKey = what === "water" ? "WaterShut" : "ElecShut";
          return (
            <section className="pz-page pzsc-sheet" aria-labelledby={`pzsc-${what}`} key={what}>
              <h2 className="pzi-h2" id={`pzsc-${what}`}>
                <Stamp name={what === "water" ? "waves" : "lightning"} />
                {what === "water" ? c.water : c.power}
              </h2>
              {mode === "server" ? (
                <CutView cut={cutAt(w, Number(s[what === "water" ? "WaterShutModifier" : "ElecShutModifier"]), what)} w={w} day={day} c={c} fmt={fmt} num={num} />
              ) : (
                <SoloView
                  range={cutRange(w, Number(s[optKey]), what)}
                  label={optionByKey(optKey)!.values?.[Number(s[optKey]) - 1]?.[lang] ?? ""}
                  w={w}
                  day={day}
                  c={c}
                  fmt={fmt}
                  num={num}
                />
              )}
            </section>
          );
        })}
      </div>

      <section className="pz-page pzsc-how" aria-labelledby="pzsc-how-title">
        <h2 className="pzi-h2" id="pzsc-how-title">
          <Stamp name="question" />
          {c.howTitle}
        </h2>
        <ul>
          {c.how.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

type ViewProps = { w: World; day: string; c: PzServerCopy["shutoff"]; fmt: (d: Date) => string; num: (n: number) => string };

/** Un corte: la fecha y la hora del juego, cuánto después de empezar y cuánto es en tiempo real. */
function CutView({ cut, w, day, c, fmt, num }: ViewProps & { cut: Cut }) {
  const say = cutSay(cut, fmt);
  if (say.kind !== "at" || cut.kind !== "at") {
    return <p className="pzsc-date is-flat">{say.kind === "start" ? c.startNow : c.never}</p>;
  }
  const h = cut.afterStartHours;
  const real = Math.round(realTime(w, h));
  return (
    <>
      <p className="pzsc-date">{say.when}</p>
      <p className="pzsc-after">{c.after(Math.floor(h / 24), h % 24, num)}</p>
      <p className="pzsc-real">{c.real(c.duration(Math.floor(real / 60), real % 60, num), day)}</p>
    </>
  );
}

/** El rango de una partida de un jugador: lo antes y lo más tarde que puede tocar. */
function SoloView({ range, label, ...rest }: ViewProps & { range: { from: Cut; to: Cut }; label: string }) {
  const { c } = rest;
  return (
    <>
      <div className="pzsc-bound">
        <h3>{c.earliest}</h3>
        <CutView cut={range.from} {...rest} />
      </div>
      <div className="pzsc-bound">
        <h3>{c.latest}</h3>
        <CutView cut={range.to} {...rest} />
      </div>
      <p className="pzsc-range">{c.rangeNote(label)}</p>
    </>
  );
}
