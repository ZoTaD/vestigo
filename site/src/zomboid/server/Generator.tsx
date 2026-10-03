/**
 * El generador de servidor de Project Zomboid (2026-10-01): las 269 opciones de sandbox y las 144 del `.ini` en hojas
 * de libreta, agrupadas como en la pantalla de configuración del juego, arrancando de un preset, con "sólo lo que
 * cambiaste", descarga y copia de `<nombre>_SandboxVars.lua` y `<nombre>.ini`, y el link para compartir.
 *
 * **Servidor y navegador.** El prerender escribe Apocalipsis sin cambios, con todas las filas (cada hoja es un
 * `<details>` abierto: Google lee las 413 con su ayuda). La dirección (`?p=&s=&i=`) no la conoce el servidor, y la
 * hidratación tiene que coincidir: se lee al montarse, antes de pintar, y cada cambio la reescribe con
 * `history.replaceState`, sin recargar ni sumar pasos al Atrás (como el Planificador de personaje).
 *
 * **Reglas de la casa:** una opción cambiada va con tinte y el texto "cambiada", nunca con un borde de color; las claves
 * largas bajan por sus puntos; en el celular cada fila es una columna y la barra pasa a dos renglones, sin scroll
 * horizontal de la página.
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import meta from "@zomboid/meta.json";
import RouteLink from "../../RouteLink";
import { useLang, useLocale } from "../../i18n";
import { parseRoute, routePath, SITE_ORIGIN, type Route } from "../../route";
import { CopyButton, fold, Stamp, wordFit, useIsoLayoutEffect } from "../ui";
import { fromParsed, fromPreset, iniChanges, resetOption, sandboxChanges, setOption, type Config } from "./config";
import { usePzServerCopy } from "./copy";
import { fullPreset, INI_DEFAULTS, PAGE_STAMP, presetById, SERVER, type IniOption, type PresetId, type SandboxOption, type Value } from "./data";
import { writeIni } from "./ini";
import { CONFIG_KEYS, decodeConfig, encodeConfig, INI_NO_LINK, INI_SECRET, isDefaultConfig } from "./link";
import { withForeign } from "../foreignQuery";
import { writeSandboxLua } from "./lua";
import OptionRow, { useShowValue, type Kind } from "./OptionRow";
import Paste, { type PastedFile } from "./Paste";
import { presetAnchor, presetsRoute } from "./Presets";
import QueryLink from "../QueryLink";
import { cutSay, gameDateFormat, shutoffRoute } from "./Shutoff";
import { cutAt, worldOf } from "./shutoffCalc";
// Las hojas, el buscador y los títulos son los de Objetos: la misma libreta. Lo propio va aparte.
import "../../styles/zomboid-items.css";
import "../../styles/zomboid-server.css";

type Nav = (r: Route) => void;

const DEFAULT_NAME = "servertest";
/** El nombre de los archivos: sin barras ni caracteres que un sistema de archivos rechace. Vacío, el del juego. */
const fileBase = (name: string): string => name.replace(/[^\w\- .]/g, "").trim() || DEFAULT_NAME;

/** Baja un texto como archivo, sin pasar por ningún servidor. */
function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function Generator({ route, navigate, missing }: { route: Route; navigate: Nav; missing: boolean }) {
  const t = usePzServerCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const show = useShowValue();

  const [config, setConfig] = useState<Config>(() => fromPreset(SERVER.baseline));
  const initial = useRef(config);
  const [q, setQ] = useState("");
  const needle = fold(useDeferredValue(q).trim());
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [name, setName] = useState(DEFAULT_NAME);
  const base = fileBase(name);

  // La dirección de la pestaña, sin ficha: la del link y la que se reescribe.
  const page = { ...route, view: "zomboid" as const, pzSection: "server" as const, detail: undefined };
  // Los presets comparados (`/servidor/presets-de-sandbox`, Task 4): un link debajo de las tarjetas y uno en cada una.
  const compare = presetsRoute(route);

  /** Escribe la configuración en la dirección, si la dirección sigue siendo la del generador. La de entrada, limpia. */
  const writeUrl = (c: Config) => {
    const here = parseRoute(window.location.pathname);
    if (here.pzSection !== "server" || here.detail) return;
    const qs = withForeign(window.location.search, CONFIG_KEYS, isDefaultConfig(c) ? "" : encodeConfig(c));
    window.history.replaceState(window.history.state, "", window.location.pathname + qs + window.location.hash);
  };

  useIsoLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("p") && !params.has("s") && !params.has("i")) return;
    // Lo que no se entiende se descarta (ver `link.ts`), y la dirección queda escrita sin eso.
    setConfig(decodeConfig(params));
  }, []);

  // Cada cambio va a la dirección; la configuración de entrada no (la dirección ya es la de la página).
  useEffect(() => {
    if (config !== initial.current) writeUrl(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // Lo que cambiás vos pasa por `setOption`, que copia lo que hace la pantalla del juego: `Zombies` arrastra la
  // población, `ZombieRespawn` la reaparición y `ZombieMigrate` la redistribución, y el día de inicio no pasa del último
  // del mes. El reset vuelve también las enlazadas. Elegir un preset o abrir un link no pasa por acá (ver `config.ts`).
  const onSet = useCallback((kind: Kind, key: string, value: Value) => setConfig((c) => setOption(c, kind, key, value)), []);
  const onReset = useCallback((kind: Kind, key: string) => setConfig((c) => resetOption(c, kind, key)), []);

  const sChanged = useMemo(() => new Set(sandboxChanges(config)), [config]);
  const iChanged = useMemo(() => new Set(iniChanges(config)), [config]);
  const changes = sChanged.size + iChanged.size;

  const presetsRef = useRef<HTMLElement>(null);
  /**
   * "Cargar en el generador" (Task 3). Un `SandboxVars.lua` reemplaza el sandbox (con la base que más se le parece y lo
   * de los mods) y deja el `.ini` como está; un `.ini` reemplaza el `.ini` y deja el sandbox. Así se pueden cargar los dos,
   * uno después del otro. Los valores entran como están, sin `setOption` (ver `fromParsed`). Si el archivo se llama como
   * los del servidor (`miserver_SandboxVars.lua`, `miserver.ini`), el nombre del servidor pasa a ser ése.
   */
  const loadFile = (file: PastedFile, fileName: string | null): boolean => {
    const lost = file.kind === "lua" ? sChanged.size : iChanged.size;
    if (lost && !window.confirm(t.paste.confirmLoad(lost))) return false;
    if (file.kind === "lua") {
      const loaded = fromParsed(file.parse);
      setConfig((c) => ({ ...loaded, ini: c.ini, extraIni: c.extraIni }));
    } else {
      const loaded = fromParsed(undefined, file.parse);
      setConfig((c) => ({ ...c, ini: loaded.ini, extraIni: loaded.extraIni }));
    }
    const server = fileName ? /^(.+?)(?:_SandboxVars\.lua|\.ini)$/i.exec(fileName)?.[1] : undefined;
    if (server && fileBase(server) === server) setName(server);
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    presetsRef.current?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    return true;
  };

  const pickPreset = (id: PresetId) => {
    if (id === config.preset && !sChanged.size) return;
    const p = presetById(id)!;
    if (sChanged.size && !window.confirm(t.confirmPreset(p.name[lang], sChanged.size))) return;
    // El preset es sólo de sandbox: el `.ini` (y lo que trajo tu archivo) queda como está.
    setConfig((c) => ({ ...c, preset: id, sandbox: { ...fullPreset(id) } }));
  };

  const luaFile = `${base}_SandboxVars.lua`;
  const iniFile = `${base}.ini`;
  const lua = useMemo(() => writeSandboxLua(config, lang), [config, lang]);
  const ini = useMemo(() => writeIni(config, lang), [config, lang]);
  const shareUrl =
    (typeof window === "undefined" ? SITE_ORIGIN : window.location.origin) +
    routePath(page) +
    (isDefaultConfig(config) ? "" : `?${encodeConfig(config)}`);

  const presetName = presetById(config.preset)!.name[lang];
  const basePreset = fullPreset(config.preset);

  // Las notas nuestras, por clave. Se arman una vez por idioma: las filas están memorizadas y una nota nueva en cada
  // render las redibujaría a todas.
  const notes = useMemo(() => {
    const out: Record<string, ReactNode> = {
      WaterShut: t.notes.shutRange("WaterShutModifier"),
      ElecShut: t.notes.shutRange("ElecShutModifier"),
      "ini:SpawnPoint": (
        <>
          {t.notes.spawnBefore}
          <RouteLink to={{ ...page, pzSection: "map" }} onNavigate={navigate}>
            {t.notes.spawnLink}
          </RouteLink>
          {t.notes.spawnAfter}
        </>
      ),
    };
    for (const k of INI_SECRET) out[`ini:${k}`] = t.notes.secret;
    for (const k of INI_NO_LINK) out[`ini:${k}`] = t.notes.noLink;
    // `ResetID` y `ServerPlayerID` son sorteadas y además no viajan: su nota avisa qué pasa en un servidor que ya existe.
    for (const o of SERVER.ini) if (o.random) out[`ini:${o.key}`] = INI_NO_LINK.includes(o.key) ? t.notes.serverIds : t.notes.random;
    return out;
    // `page` cambia en cada render; lo que importa es el idioma (y con él la ruta de la pestaña).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, lang, navigate]);

  // Junto a los dos modificadores, el día del corte con esta configuración ("el agua se corta el 23 de julio de 1993,
  // 7:00"), con la cuenta de la calculadora. Va aparte de `notes` porque cambia con la configuración, y memorizado por
  // su texto y su link: sólo esas dos filas se redibujan, cuando cambia la fecha o la configuración del link.
  const fmt = useMemo(() => gameDateFormat(locale), [locale]);
  const world = worldOf(config.sandbox);
  const waterLine = t.shutoff.line("water", cutSay(cutAt(world, Number(config.sandbox.WaterShutModifier), "water"), fmt));
  const powerLine = t.shutoff.line("power", cutSay(cutAt(world, Number(config.sandbox.ElecShutModifier), "power"), fmt));
  // Y el link a la calculadora (`/servidor/cortes-de-agua-y-luz`) con esta configuración, que la página lee de `?p=&s=`.
  const shutoff = shutoffRoute(route);
  const shutoffHref = routePath(shutoff) + (isDefaultConfig(config) ? "" : `?${encodeConfig(config)}`);
  const shutLink = (line: string, what: string) => (
    <>
      {what} {line}{" "}
      <QueryLink to={shutoff} href={shutoffHref} navigate={navigate}>
        {t.shutoff.lineLink} →
      </QueryLink>
    </>
  );
  // `shutLink` usa `navigate` y `shutoff`, que no están en las dependencias: `navigate` es el mismo en cada render, y
  // `shutoff` cambia sólo con el idioma, que ya viaja en `t` (y en `shutoffHref`).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const waterNote = useMemo(() => shutLink(waterLine, t.notes.shutDays.water), [t, waterLine, shutoffHref]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const powerNote = useMemo(() => shutLink(powerLine, t.notes.shutDays.power), [t, powerLine, shutoffHref]);
  const noteFor = (kind: Kind, key: string): ReactNode =>
    kind === "sandbox" && key === "WaterShutModifier" ? waterNote : kind === "sandbox" && key === "ElecShutModifier" ? powerNote : notes[kind === "ini" ? `ini:${key}` : key];

  const matches = (o: SandboxOption | IniOption, kind: Kind): boolean => {
    if (onlyChanged && !(kind === "sandbox" ? sChanged : iChanged).has(o.key)) return false;
    if (!needle) return true;
    const names = kind === "sandbox" ? `${(o as SandboxOption).name.en} ${(o as SandboxOption).name.es}` : "";
    return fold(`${names} ${o.key}`).includes(needle);
  };
  const filtering = onlyChanged || !!needle;

  const sandboxSheets = SERVER.pages.map((p) => ({ page: p, rows: SERVER.options.filter((o) => o.page === p.id && matches(o, "sandbox")) }));
  const iniSheets = SERVER.iniPages.map((p) => ({ page: p, rows: SERVER.ini.filter((o) => o.page === p.id && matches(o, "ini")) }));
  const shown = [...sandboxSheets, ...iniSheets].reduce((n, s) => n + s.rows.length, 0);
  const total = SERVER.options.length + SERVER.ini.length;
  const iniShown = iniSheets.some((s) => s.rows.length);

  const row = (kind: Kind, o: SandboxOption | IniOption) => {
    const value = (kind === "sandbox" ? config.sandbox : config.ini)[o.key];
    const baseText =
      kind === "sandbox" ? t.presetDefault(presetName, show(o, basePreset[o.key])) : t.iniDefault(show(o, INI_DEFAULTS[o.key]));
    return (
      <OptionRow
        kind={kind}
        opt={o}
        value={value}
        baseText={baseText}
        changed={(kind === "sandbox" ? sChanged : iChanged).has(o.key)}
        onSet={onSet}
        onReset={onReset}
        note={noteFor(kind, o.key)}
        key={o.key}
      />
    );
  };
  const changedIn = (kind: Kind, rows: (SandboxOption | IniOption)[]) => rows.filter((o) => (kind === "sandbox" ? sChanged : iChanged).has(o.key)).length;

  return (
    <main className="pz-main pzi pzsv">
      <section className="pz-page pzi-intro">
        <span className="pz-clip" />
        {missing && (
          <p className="pzi-missing" role="status">
            {t.notFound}
          </p>
        )}
        <h1 className="pzi-h1" style={wordFit(t.title)}>
          {t.title}
        </h1>
        {t.intro(num(SERVER.options.length), num(SERVER.ini.length), meta.version).map((p) => (
          <p key={p}>{p}</p>
        ))}
        <p className="pzi-hand">{t.hand}</p>
      </section>

      <Paste onLoad={loadFile} />

      <section className="pz-page pzsv-presets" aria-labelledby="pzsv-presets-title" ref={presetsRef}>
        <h2 className="pzi-h2" id="pzsv-presets-title">
          <Stamp name="star" />
          {t.presetsTitle}
          <span className="pzi-hand">{t.presetsNote}</span>
        </h2>
        <div className="pzsv-cards">
          {SERVER.presets.map((p) => {
            const on = p.id === config.preset;
            return (
              <div className="pzsv-preset-cell" key={p.id}>
                <button type="button" className={`pzsv-preset${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => pickPreset(p.id)}>
                  <b>{p.name[lang]}</b>
                  {p.desc[lang]
                    .split("\n")
                    .filter((line) => line.trim())
                    .map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                </button>
                {/* Afuera del botón (un enlace no puede ir adentro): lleva a este preset en la comparación. */}
                <QueryLink className="pzsv-preset-compare" to={compare} href={`${routePath(compare)}#${presetAnchor(p.id)}`} navigate={navigate}>
                  {/* Para el lector de pantalla, cada uno con su preset: si no, son cinco "en qué cambia" iguales. */}
                  <span className="visually-hidden">{`${p.name[lang]}: `}</span>
                  {t.presets.compareCard}
                </QueryLink>
              </div>
            );
          })}
        </div>
        <p className="pzsv-compare">
          <RouteLink to={compare} onNavigate={navigate}>
            {t.presets.compare} →
          </RouteLink>
        </p>
      </section>

      <section className="pz-page pzsv-bar" aria-label={t.toolbar}>
        <label className="pzi-search pzsv-search">
          <span className="visually-hidden">{t.search}</span>
          <Stamp name="eye" />
          <input type="search" value={q} placeholder={t.searchHint} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button type="button" className="pzi-chip pzsv-only" aria-pressed={onlyChanged} onClick={() => setOnlyChanged((v) => !v)}>
          {t.onlyChanged(num(changes))}
        </button>
        <label className="pzsv-name-field">
          <span>{t.serverName}</span>
          <input type="text" value={name} maxLength={64} autoComplete="off" spellCheck={false} onChange={(e) => setName(e.target.value)} />
          <small>{t.serverNameNote}</small>
        </label>
        <div className="pzsv-files">
          {[
            [luaFile, lua],
            [iniFile, ini],
          ].map(([file, text]) => (
            <div className="pzsv-file" key={file.endsWith(".ini") ? "ini" : "lua"}>
              <code>{file}</code>
              <button type="button" className="pzi-copy pzsv-dl" onClick={() => download(file, text)}>
                {t.download}
              </button>
              <CopyButton text={text} label={t.copy} done={t.copied} what={file} />
            </div>
          ))}
          <div className="pzsv-file is-link">
            <CopyButton text={shareUrl} label={t.copyLink} done={t.copied} what={t.linkWhat} />
            <small>{t.linkNote}</small>
          </div>
        </div>
      </section>

      <p className="pzi-count" aria-live="polite">
        {t.showing(num(shown), num(total))}
      </p>
      {!shown && <p className="pzi-empty">{onlyChanged && !needle ? t.emptyChanged : t.empty}</p>}

      {sandboxSheets.map(({ page: p, rows }) =>
        rows.length ? (
          <details className="pz-page pzsv-sheet" open key={`${p.id}-${filtering}`}>
            <summary>
              <h2 className="pzi-h2">
                <Stamp name={PAGE_STAMP[p.id] ?? "gears"} />
                {p.name[lang]} <small>{num(rows.length)}</small>
                {changedIn("sandbox", rows) > 0 && <span className="pzsv-count">{t.changedCount(changedIn("sandbox", rows))}</span>}
              </h2>
            </summary>
            <div className="pzsv-rows">
              {rows.map((o) => (
                <RowWithTitle key={o.key} title={(o as SandboxOption).title?.[lang]}>
                  {row("sandbox", o)}
                </RowWithTitle>
              ))}
            </div>
          </details>
        ) : null,
      )}

      {iniShown && (
        <details className="pz-page pzsv-sheet pzsv-ini" open key={`ini-${filtering}`}>
          <summary>
            <h2 className="pzi-h2">
              <Stamp name="satellite" />
              {t.iniTitle(iniFile)} <small>{num(SERVER.ini.length)}</small>
              {iChanged.size > 0 && <span className="pzsv-count">{t.changedCount(iChanged.size)}</span>}
            </h2>
          </summary>
          <p className="pzsv-about">{t.iniIntro}</p>
          {iniSheets.map(({ page: p, rows }) =>
            rows.length ? (
              <details className="pzsv-sheet pzsv-sub" open key={`${p.id}-${filtering}`}>
                <summary>
                  <h3 className="pzsv-h3">
                    {p.name[lang]} <small>{num(rows.length)}</small>
                    {changedIn("ini", rows) > 0 && <span className="pzsv-count">{t.changedCount(changedIn("ini", rows))}</span>}
                  </h3>
                </summary>
                <div className="pzsv-rows">{rows.map((o) => row("ini", o))}</div>
              </details>
            ) : null,
          )}
        </details>
      )}
    </main>
  );
}

/** Una fila, con el subtítulo del juego arriba si la hoja arranca una parte en ella ("Características de zombies"). */
function RowWithTitle({ title, children }: { title?: string; children: ReactNode }) {
  if (!title) return <>{children}</>;
  return (
    <>
      <h3 className="pzsv-sub-title">{title}</h3>
      {children}
    </>
  );
}
