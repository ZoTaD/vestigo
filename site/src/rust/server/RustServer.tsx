/**
 * La pestaña Servidor de Rust (2026-10-09, `/rust/server`): el calendario de wipes forzados, el generador de la línea
 * de arranque y del `server.cfg`, y la referencia de todas las convars y comandos con buscador (de a tandas,
 * `LazyRows`). Plan: docs/superpowers/plans/2026-10-09-rust-servidor.md.
 */
import { useEffect, useMemo, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import { LazyRows } from "../../LazyRows";
import type { Route } from "../../route";
import { useLoad } from "../../useLoad";
import RsLoading from "../RsLoading";
import { forcedWipe } from "../wipe";
import { useServerCopy } from "./copy";
import { cfgValue, filterConvars, loadServer, peekServer, serverCfg, startupLine, type Convar, type Filter, type ServerData, type Setup } from "./data";
import "../../styles/rust-server.css";

/** El alto medio de una fila de la referencia, en px (medido en el navegador a 1.280 px: de 33 a 57, media 48). */
const ROW = 48;
const FILTERS: Filter[] = ["all", "server", "client", "command"];

export default function RustServer(_props: { route: Route; navigate: (r: Route) => void }) {
  const data = useLoad("server", () => peekServer() ?? undefined, loadServer);
  if (data.failed) return <RsLoading onRetry={data.retry} />;
  if (!data.value) return <RsLoading />;
  return <ServerPage d={data.value} />;
}

function ServerPage({ d }: { d: ServerData }) {
  const t = useServerCopy();
  const locale = useLocale();
  return (
    <main className="rs-main rs-server">
      <section className="rs-pnl">
        <div className="rs-title">
          <h1 className="rs-h1">{t.h1}</h1>
        </div>
        <p className="rs-lede">{t.lede(d.vars.length.toLocaleString(locale))}</p>
      </section>
      <div className="rs-server-cols">
        <Wipes />
        <Generator d={d} />
      </div>
      <Reference d={d} />
    </main>
  );
}

/** Los próximos seis wipes forzados. El prerender los muestra en UTC; en el navegador, en la hora de quien mira. */
function Wipes() {
  const t = useServerCopy();
  const locale = useLocale();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  // Sin reloj todavía (el prerender, que corre en el build), los de desde el día del build; el navegador los rehace.
  const base = now ?? new Date();
  const list: Date[] = [];
  for (let i = 0; list.length < 6 && i < 8; i++) {
    const y = base.getUTCFullYear() + Math.floor((base.getUTCMonth() + i) / 12);
    const m = (base.getUTCMonth() + i) % 12;
    const w = forcedWipe(y, m);
    if (w.getTime() > base.getTime() - 86_400_000) list.push(w);
  }
  const fmt = (w: Date) =>
    w.toLocaleString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", ...(now ? {} : { timeZone: "UTC", timeZoneName: "short" }) });
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.wipeTitle}</h2>
      <ol className="rs-wipes">
        {list.map((w, i) => (
          <li key={w.toISOString()} className={i === 0 ? "is-next" : undefined}>
            <time dateTime={w.toISOString()}>{fmt(w)}</time>
          </li>
        ))}
      </ol>
      <p className="rs-note">{t.wipeNote}</p>
    </section>
  );
}

function Generator({ d }: { d: ServerData }) {
  const t = useServerCopy();
  const def = useMemo(() => new Map(d.vars.map((v) => [v.name, v.default])), [d]);
  const num = (k: string, fb: number) => (typeof def.get(k) === "number" ? (def.get(k) as number) : fb);
  const str = (k: string, fb: string) => (typeof def.get(k) === "string" ? (def.get(k) as string) : fb);
  const [s, setS] = useState<Setup>(() => ({
    hostname: str("server.hostname", "My Untitled Rust Server"),
    identity: str("server.identity", "my_server_identity"),
    description: "",
    url: "",
    headerimage: "",
    port: num("server.port", 28015),
    maxplayers: 100,
    worldsize: num("server.worldsize", 4500),
    seed: num("server.seed", 1337),
    saveinterval: num("server.saveinterval", 600),
    pve: false,
    rconPort: 28016,
    rconPassword: "CHANGE_ME",
  }));
  const [windows, setWindows] = useState(true);
  const set = <K extends keyof Setup>(k: K, v: Setup[K]) => setS((x) => ({ ...x, [k]: v }));
  const text = (k: "hostname" | "identity" | "description" | "url" | "headerimage" | "rconPassword") => (
    <label className="rs-srv-field" key={k}>
      <span>{t.fields[k]}</span>
      <input value={s[k]} onChange={(e) => set(k, e.target.value)} spellCheck={false} autoComplete="off" />
    </label>
  );
  const number = (k: "port" | "maxplayers" | "worldsize" | "seed" | "saveinterval" | "rconPort", min: number, max: number) => (
    <label className="rs-srv-field is-num" key={k}>
      <span>{t.fields[k]}</span>
      <input type="number" min={min} max={max} value={s[k]} onChange={(e) => set(k, Math.max(min, Math.min(max, Math.round(Number(e.target.value) || 0))))} />
    </label>
  );
  return (
    <section className="rs-pnl rs-srv-gen">
      <h2 className="rs-hd">{t.setupTitle}</h2>
      <p className="rs-farm-p">{t.setupLede}</p>
      <div className="rs-srv-form">
        {text("hostname")}
        {text("identity")}
        {text("description")}
        {text("url")}
        {text("headerimage")}
        {number("maxplayers", 1, 1000)}
        {number("worldsize", 1000, 6000)}
        <div className="rs-srv-seed">
          {number("seed", 0, 2147483647)}
          <button type="button" className="rs-btn" onClick={() => set("seed", Math.floor(Math.random() * 2147483647))}>
            {t.randomSeed}
          </button>
        </div>
        {number("port", 1, 65535)}
        {number("saveinterval", 60, 3600)}
        {number("rconPort", 1, 65535)}
        {text("rconPassword")}
        <label className="rs-srv-check">
          <input type="checkbox" checked={s.pve} onChange={(e) => set("pve", e.target.checked)} /> {t.fields.pve}
        </label>
      </div>
      <div className="rs-srv-os" role="group">
        <button type="button" className={`rs-cat${windows ? " is-on" : ""}`} aria-pressed={windows} onClick={() => setWindows(true)}>
          {t.windows}
        </button>
        <button type="button" className={`rs-cat${!windows ? " is-on" : ""}`} aria-pressed={!windows} onClick={() => setWindows(false)}>
          {t.linux}
        </button>
      </div>
      <Code title={t.startup} text={startupLine(s, windows)} />
      {serverCfg(s) && <Code title={t.cfg} text={serverCfg(s)} />}
      <p className="rs-note">{t.cfgNote}</p>
    </section>
  );
}

function Code({ title, text }: { title: string; text: string }) {
  const t = useServerCopy();
  const [done, setDone] = useState(false);
  return (
    <div className="rs-srv-code">
      <p className="rs-sub">
        {title}{" "}
        <button
          type="button"
          className="rs-copy"
          onClick={() => navigator.clipboard?.writeText(text).then(() => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1500);
          }, () => undefined)}
        >
          {done ? t.copied : t.copy}
        </button>
      </p>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  );
}

function Reference({ d }: { d: ServerData }) {
  const t = useServerCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const rows = useMemo(() => filterConvars(d.vars, filter, q), [d, filter, q]);
  const date = d.source.date ? new Date(`${d.source.date}T00:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" }) : null;
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.refTitle}</h2>
      <label className="rs-search">
        <span className="rs-sr">{t.search}</span>
        <input type="search" value={q} placeholder={t.searchPlaceholder} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="rs-cats" role="group" aria-label={t.search}>
        {FILTERS.map((f) => (
          <button type="button" key={f} className={`rs-cat${f === filter ? " is-on" : ""}`} aria-pressed={f === filter} onClick={() => setFilter(f)}>
            {t.filters[f]}
          </button>
        ))}
      </div>
      <p className="rs-count-line">{t.count(rows.length.toLocaleString(locale))}</p>
      {rows.length === 0 ? (
        <p className="rs-empty">{t.empty}</p>
      ) : (
        <ul className="rs-convars">
          <LazyRows items={rows} rowHeight={ROW} tag="li" chunk={80} render={(v) => <Row v={v} es={lang === "es"} key={v.name} />} />
        </ul>
      )}
      {date && <p className="rs-note">{t.listDate(date)}</p>}
    </section>
  );
}

function Row({ v, es }: { v: Convar; es: boolean }) {
  const t = useServerCopy();
  return (
    <li>
      <div className="rs-cv-head">
        <code>{v.name}</code>
        {v.kind === "command" ? <em className="rs-tag">{t.command}</em> : v.sides.map((s) => <em className="rs-tag" key={s}>{s === "server" ? t.server : t.client}</em>)}
        {v.saved && <em className="rs-tag">{t.saved}</em>}
        {v.admin && <em className="rs-tag">{t.admin}</em>}
        {v.anyone && <em className="rs-tag">{t.anyone}</em>}
        {v.default !== undefined && (
          <span className="rs-cv-def">
            {t.def}: <code>{cfgValue(v.default)}</code>
          </span>
        )}
      </div>
      {v.help && <p lang={es ? "en" : undefined}>{v.help}</p>}
    </li>
  );
}
