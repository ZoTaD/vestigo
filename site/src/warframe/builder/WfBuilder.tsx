/**
 * La pestaña Armador de Warframe (2026-10-27, etapa 3): la maqueta B "Hoja técnica" con las cifras grandes de la C.
 *
 * - Arriba, las cifras grandes base → build con la diferencia, y "Fijar como referencia" para comparar contra otra
 *   variante en vez de contra el objeto sin mods.
 * - A la izquierda (arriba en el teléfono), el objeto, la capacidad, el potenciador, las Formas y "Copiar enlace"; después
 *   aura o postura, exilio y los 8 casilleros en lista. Tocar uno abre ahí su rango, su polaridad y el buscador de mods
 *   que le entran.
 * - A la derecha, la tabla base / build / cambio y los mods de la build, con lo que no se cuenta dicho.
 *
 * La build vive en la dirección (`buildUrl.ts`) y se lee después del primer dibujo: el prerender sale sin objeto (cómo
 * empezar y unos de ejemplo) y la hidratación coincide. Cada cambio la reescribe con `replaceState`, sin sumar entradas
 * al historial. Las cuentas son las de `calc.ts`; acá sólo se muestran.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLang, useLocale } from "../../i18n";
import { LazyRows, skipSprite } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import { routePath, type Route } from "../../route";
import { useLoad } from "../../useLoad";
import { useWfCopy, type WfCopy, type WfDamage } from "../../warframeCopy";
import { fold, loadBuilderItems, loadBuilderMods, peekBuilderItems, peekBuilderMods, POLS, say, type BuildItem, type BuildMod, type Kind, type Lang, type Pol } from "../data";
import { Icon, Panel, WfLoading, type Nav } from "../ui";
import { decodeBuild, encodeBuild } from "./buildUrl";
import { capacity, emptyBuild, formas, frameStats, modDrain, modFamily, modFits, weaponStats, type Build, type FStat, type SlotId, type WStat } from "./calc";
import { PolGlyph } from "./PolGlyph";
import { delta, deltaDigits, frameRows, TILE_KEYS, weaponRows, type Fmt, type Row } from "./sheet";

/** Los de ejemplo de la pantalla vacía. */
const STARTERS: Record<"frames" | "weapons", string[]> = {
  frames: ["excalibur", "rhino", "mesa", "saryn", "wisp", "volt"],
  weapons: ["braton", "hek", "paris", "lato", "skana", "kronen-prime"],
};
const KINDS: Kind[] = ["warframe", "primary", "secondary", "melee"];
/** El alto de una fila de las listas (objetos y mods) con su separación, en px, medido en el navegador (2026-10-27). */
const ITEM_ROW = 50;
const MOD_ROW = 48;
const CHUNK = 40;

export default function WfBuilder({ route, navigate }: { route: Route; navigate: Nav }) {
  const items = useLoad("items", () => peekBuilderItems() ?? undefined, () => loadBuilderItems());
  if (items.failed) return <WfLoading onRetry={items.retry} />;
  if (!items.value) return <WfLoading />;
  return <Builder items={items.value} route={route} navigate={navigate} />;
}

/** Lo que se compara contra la build: el objeto sin mods o una variante fijada. */
type Ref = { w?: WStat; f?: FStat };

function Builder({ items, route, navigate }: { items: BuildItem[]; route: Route; navigate: Nav }) {
  const t = useWfCopy();
  const c = t.builder;
  const { lang } = useLang();
  const locale = useLocale();
  const [build, setBuild] = useState<Build | null>(null);
  const [open, setOpen] = useState<SlotId | null>(null);
  const [picking, setPicking] = useState(false);
  const [pinned, setPinned] = useState<Ref | null>(null);
  const [failed, setFailed] = useState(false);
  // Hasta leer la dirección no se escribe: si no, el primer dibujo (sin build) la borraría.
  const ready = useRef(false);

  // La build de la dirección, después del primer dibujo. El objeto dice qué archivo de mods bajar.
  useEffect(() => {
    const search = window.location.search;
    const item = items.find((x) => x.slug === new URLSearchParams(search).get("i"));
    if (!item) {
      ready.current = true;
      return;
    }
    let alive = true;
    loadBuilderMods(item.kind).then(
      (mods) => {
        if (!alive) return;
        ready.current = true;
        const b = decodeBuild(search, items, mods);
        setBuild(b);
        // Llegando de una ficha del Arsenal (sólo el objeto), el primer casillero ya abierto dice por dónde seguir.
        if (b && !b.slots.some((s) => s.mod)) setOpen(0);
      },
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [items]);

  // Cada cambio reescribe la dirección sin sumar una entrada al historial.
  useEffect(() => {
    if (!ready.current) return;
    const url = window.location.pathname + (build ? `?${encodeBuild(build)}` : "");
    if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, "", url);
  }, [build]);

  const choose = (item: BuildItem) => {
    setFailed(false);
    loadBuilderMods(item.kind).then(
      () => {
        ready.current = true;
        setBuild(emptyBuild(item));
        setPinned(null);
        setPicking(false);
        setOpen(0);
      },
      () => setFailed(true),
    );
  };

  /** Cambia un casillero en una build nueva: las filas se recalculan por referencia (`useMemo`). */
  const patch = (id: SlotId, p: Partial<Build["slots"][number]>) => setBuild((b) => (b ? { ...b, slots: b.slots.map((s) => (s.id === id ? { ...s, ...p } : s)) } : b));

  const num = (n: number, d = 2) => n.toLocaleString(locale, { maximumFractionDigits: d });

  return (
    <main className="wf-main wf-bd">
      <Panel className="wf-bd-intro">
        <p className="wf-kicker">{t.tabs.builder}</p>
        <h1 className="wf-h1">{c.h1}</h1>
        <p className="wf-lede">{c.lede}</p>
      </Panel>

      {failed && (
        <Panel>
          <p role="alert">
            {t.loadError}{" "}
            <button type="button" className="wf-btn" onClick={() => window.location.reload()}>
              {t.retry}
            </button>
          </p>
        </Panel>
      )}

      {!build ? (
        <Panel className="wf-bd-start">
          <p className="wf-bd-howto">{c.start}</p>
          <Starters items={items} route={route} lang={lang} onPick={choose} />
          <ItemPicker items={items} onPick={choose} lang={lang} />
        </Panel>
      ) : (
        <>
          <Board build={build} pinned={pinned} setPinned={setPinned} num={num} />
          <div className="wf-bd-sheet">
            <Panel className="wf-bd-left">
              <ItemHead build={build} route={route} navigate={navigate} picking={picking} setPicking={setPicking} />
              {picking && <ItemPicker items={items} onPick={choose} lang={lang} current={build.item.slug} />}
              <CapLine build={build} setBuild={setBuild} num={num} />
              <Slots build={build} open={open} setOpen={setOpen} patch={patch} lang={lang} />
            </Panel>
            <Panel className="wf-bd-right">
              <StatTable build={build} pinned={pinned} num={num} />
              <ModsIn build={build} lang={lang} num={num} />
            </Panel>
          </div>
        </>
      )}
    </main>
  );
}

/* ---------- Sin objeto: cómo empezar ---------- */

/** La dirección del armador con un objeto: es un enlace de verdad (para abrirlo en otra pestaña y para el rastreador). */
const builderHref = (route: Route, slug: string) => `${routePath({ ...route, view: "warframe", wfSection: "builder", detail: undefined })}?i=${slug}`;

function Starters({ items, route, lang, onPick }: { items: BuildItem[]; route: Route; lang: Lang; onPick: (it: BuildItem) => void }) {
  const c = useWfCopy().builder;
  const bySlug = useMemo(() => new Map(items.map((x) => [x.slug, x])), [items]);
  return (
    <div className="wf-bd-starters">
      {(["frames", "weapons"] as const).map((g) => (
        <section key={g}>
          <h2 className="wf-h3">{c[g]}</h2>
          <ul>
            {STARTERS[g].map((slug) => {
              const it = bySlug.get(slug);
              if (!it) return null;
              return (
                <li key={slug}>
                  <a
                    className="wf-bd-starter"
                    href={builderHref(route, slug)}
                    onClick={(e) => {
                      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                      e.preventDefault();
                      onPick(it);
                    }}
                  >
                    <Icon img={it.icon} size={48} />
                    <span>
                      <b>{say(it.name, lang)}</b>
                      <small>{c.kind1[it.kind]}</small>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** El buscador de objetos: la lista aparece al escribir o al elegir un tipo, dibujada de a tandas. */
function ItemPicker({ items, onPick, lang, current }: { items: BuildItem[]; onPick: (it: BuildItem) => void; lang: Lang; current?: string }) {
  const c = useWfCopy().builder;
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind | "all" | null>(null);
  const sorted = useMemo(
    () => [...items].sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || say(a.name, lang).localeCompare(say(b.name, lang), lang)),
    [items, lang],
  );
  const q = fold(query.trim());
  const listOpen = q !== "" || kind !== null;
  const shown = useMemo(
    () => (listOpen ? sorted.filter((x) => (kind === null || kind === "all" || x.kind === kind) && (!q || fold(x.name[0]).includes(q) || fold(x.name[1]).includes(q))) : []),
    [sorted, kind, q, listOpen],
  );
  const chip = (k: Kind | "all", label: string) => (
    <button type="button" className={`wf-pill${kind === k ? " is-on" : ""}`} aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)} key={k}>
      {label}
    </button>
  );
  return (
    <div className="wf-bd-picker">
      <label className="wf-find">
        <span className="wf-label">{c.pick}</span>
        <input type="search" value={query} placeholder={c.searchPlaceholder} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="wf-chips" role="group" aria-label={c.pick}>
        {chip("all", c.all)}
        {KINDS.map((k) => chip(k, c.kinds[k]))}
      </div>
      {listOpen && (
        <>
          <p className="wf-count" aria-live="polite">
            {shown.length ? c.count(shown.length.toLocaleString(lang)) : c.none}
          </p>
          <ul className="wf-bd-list">
            <LazyRows
              items={shown}
              rowHeight={ITEM_ROW}
              chunk={CHUNK}
              tag="li"
              // Se abre al tocar (nunca al cargar la página): la primera tanda va ya, así no parpadea vacía.
              eager
              margin={300}
              render={(it, i) => (
                <li key={it.slug}>
                  <button type="button" className={`wf-bd-item${it.slug === current ? " is-on" : ""}`} onClick={() => onPick(it)}>
                    {skipSprite(i, CHUNK) ? <Icon img={null} size={36} /> : <Icon img={it.icon} size={36} />}
                    <b>{say(it.name, lang)}</b>
                    <small>{c.kind1[it.kind]}</small>
                  </button>
                </li>
              )}
            />
          </ul>
        </>
      )}
    </div>
  );
}

/* ---------- Con objeto ---------- */

type NumFn = (n: number, d?: number) => string;

/** Una cifra escrita según su formato, con dos decimales como mucho. */
function fmtValue(v: number, fmt: Fmt, num: NumFn): string {
  if (fmt === "frac") return `${num(v * 100)} %`;
  if (fmt === "pct") return `${num(v)} %`;
  if (fmt === "mult") return `×${num(v)}`;
  if (fmt === "sec") return `${num(v)} s`;
  return num(v);
}

function rowLabel(r: Row, t: WfCopy): string {
  const c = t.builder;
  if (r.sub) return t.damage[r.sub as WfDamage];
  if (r.key in c.w) return c.w[r.key as keyof WfCopy["builder"]["w"]];
  return c.f[r.key as keyof WfCopy["builder"]["f"]];
}

/** Las filas de la build contra la referencia (el objeto sin mods o la variante fijada). */
function useRows(build: Build, pinned: Ref | null): Row[] {
  return useMemo(() => {
    if (build.item.f) {
      const s = frameStats(build.item, build.slots);
      return frameRows(pinned?.f ?? s.base, s.mod);
    }
    const s = weaponStats(build.item, build.slots);
    return weaponRows(build.item.kind, pinned?.w ?? s.base, s.mod);
  }, [build, pinned]);
}

function Delta({ r, num }: { r: Row; num: NumFn }) {
  const c = useWfCopy().builder;
  const d = delta(r.base, r.now, r.inv);
  if (!d) return <span className="wf-dim">—</span>;
  const txt = d.pct === null ? c.isNew : `${d.pct > 0 ? "+" : "−"}${num(Math.abs(d.pct), deltaDigits(d.pct))} %`;
  return <span className={d.good ? "wf-up" : "wf-down"}>{txt}</span>;
}

function Board({ build, pinned, setPinned, num }: { build: Build; pinned: Ref | null; setPinned: (r: Ref | null) => void; num: NumFn }) {
  const t = useWfCopy();
  const c = t.builder;
  const rows = useRows(build, pinned);
  const keys = TILE_KEYS[build.item.f ? "frame" : build.item.kind === "melee" ? "melee" : "weapon"];
  const tiles = keys.map((k) => rows.find((r) => r.key === k && !r.sub)).filter((r): r is Row => !!r);
  const pin = () => {
    if (pinned) return setPinned(null);
    setPinned(build.item.f ? { f: frameStats(build.item, build.slots).mod } : { w: weaponStats(build.item, build.slots).mod });
  };
  return (
    <Panel className="wf-bd-board">
      <div className="wf-bd-board-h">
        <h2 className="wf-h2">{c.compare}</h2>
        <p className="wf-bd-legend">
          <span>{pinned ? c.legendRef : c.legendBase}</span>
          <span>{c.legendBuild}</span>
        </p>
        <button type="button" className={`wf-btn${pinned ? " is-on" : ""}`} aria-pressed={!!pinned} onClick={pin}>
          {pinned ? c.unpin : c.pin}
        </button>
      </div>
      <dl className="wf-bd-tiles">
        {tiles.map((r) => (
          <div className={`wf-bd-tile${r.key === "perShot" || r.key === "perHit" ? " is-hero" : ""}`} key={r.key}>
            <dt>{rowLabel(r, t)}</dt>
            <dd>
              <span className="wf-bd-ref">{fmtValue(r.base, r.fmt, num)}</span>
              <span className="wf-bd-now">{fmtValue(r.now, r.fmt, num)}</span>
              <span className="wf-bd-d">
                <Delta r={r} num={num} />
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/** Las letras de la palabra más larga del nombre: el nombre se achica para que entre entera, sin cortarla. */
const longestWord = (name: string): number => Math.max(...name.split(/\s+/).map((w) => w.length), 1);

function ItemHead({ build, route, navigate, picking, setPicking }: { build: Build; route: Route; navigate: Nav; picking: boolean; setPicking: (b: boolean) => void }) {
  const c = useWfCopy().builder;
  const { lang } = useLang();
  const it = build.item;
  const name = say(it.name, lang);
  return (
    <div className="wf-bd-head">
      <Icon img={it.icon} size={64} lazy={false} />
      <div>
        <h2 className="wf-bd-name" style={{ "--len": longestWord(name) } as CSSProperties}>
          {name}
        </h2>
        <p className="wf-bd-sub">
          {c.kind1[it.kind]} · {c.rank(it.cap)}
        </p>
        <p className="wf-bd-links">
          <button type="button" className="wf-btn" aria-expanded={picking} onClick={() => setPicking(!picking)}>
            {picking ? c.close : c.change}
          </button>
          <RouteLink className="wf-bd-link" to={{ ...route, view: "warframe", wfSection: "arsenal", detail: it.slug }} onNavigate={navigate}>
            {c.toArsenal}
          </RouteLink>
        </p>
      </div>
    </div>
  );
}

function CapLine({ build, setBuild, num }: { build: Build; setBuild: (fn: (b: Build | null) => Build | null) => void; num: NumFn }) {
  const c = useWfCopy().builder;
  const cap = capacity(build);
  const over = cap.free < 0;
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(id);
  }, [copied]);
  const copy = () => {
    const url = `${window.location.origin}${window.location.pathname}?${encodeBuild(build)}`;
    navigator.clipboard?.writeText(url).then(() => setCopied("ok"), () => setCopied("fail")) ?? setCopied("fail");
  };
  return (
    <>
      <dl className="wf-bd-cap">
        <div>
          <dt>{c.capacity}</dt>
          <dd className={over ? "wf-down" : undefined}>
            {num(cap.used)} / {num(cap.total)}
          </dd>
        </div>
        <div>
          <dt>{c.free}</dt>
          <dd className={over ? "wf-down" : undefined}>{num(cap.free)}</dd>
        </div>
        <div>
          <dt>{c.formas}</dt>
          <dd>{formas(build)}</dd>
        </div>
      </dl>
      {over && (
        <p className="wf-bd-over" role="status">
          {c.over(num(-cap.free))}
        </p>
      )}
      <div className="wf-bd-opts">
        <label className="wf-bd-check">
          <input type="checkbox" checked={build.reactor} onChange={(e) => setBuild((b) => (b ? { ...b, reactor: e.target.checked } : b))} />
          <span>{build.item.kind === "warframe" ? c.reactor : c.catalyst}</span>
        </label>
        <button type="button" className="wf-btn is-acc" onClick={copy}>
          {c.copy}
        </button>
        <span className="wf-bd-copied" aria-live="polite">
          {copied === "ok" ? c.copied : copied === "fail" ? c.copyFail : ""}
        </span>
      </div>
    </>
  );
}

type Patch = (id: SlotId, p: Partial<Build["slots"][number]>) => void;

function Slots({ build, open, setOpen, patch, lang }: { build: Build; open: SlotId | null; setOpen: (s: SlotId | null) => void; patch: Patch; lang: Lang }) {
  const c = useWfCopy().builder;
  const top = build.slots.find((s) => s.id === "aura" || s.id === "stance");
  const exi = build.slots.find((s) => s.id === "exilus")!;
  const normal = build.slots.filter((s) => typeof s.id === "number");
  const slot = (id: SlotId, label: string) => <SlotRow key={String(id)} build={build} id={id} label={label} open={open === id} setOpen={setOpen} patch={patch} lang={lang} />;
  return (
    <div className="wf-bd-slots">
      {top && (
        <>
          <p className="wf-bd-lab">{top.id === "aura" ? c.aura : c.stance}</p>
          {slot(top.id, "")}
        </>
      )}
      <p className="wf-bd-lab">{c.exilus}</p>
      {slot(exi.id, "")}
      <p className="wf-bd-lab">{c.slots}</p>
      {normal.map((s) => slot(s.id, String((s.id as number) + 1)))}
    </div>
  );
}

/** El estado de la polaridad de un casillero con su mod: igual (celeste), distinta (rojizo) o nada. */
const polState = (slotPol: Pol | null, mod: BuildMod | null): "match" | "miss" | null =>
  !slotPol || !mod ? null : slotPol === mod.pol ? "match" : "miss";

/** Lo primero que dice un mod, en una línea. */
const firstLine = (m: BuildMod, lang: Lang): string => (m.text[0] ? say(m.text[0], lang).replace(/\n/g, " ") : "");

function SlotRow({ build, id, label, open, setOpen, patch, lang }: { build: Build; id: SlotId; label: string; open: boolean; setOpen: (s: SlotId | null) => void; patch: Patch; lang: Lang }) {
  const t = useWfCopy();
  const c = t.builder;
  const s = build.slots.find((x) => x.id === id)!;
  const m = s.mod;
  const st = polState(s.pol, m);
  const dr = m ? modDrain(m, s.rank, s.pol) : null;
  const pick = (mod: BuildMod) => {
    patch(id, { mod, rank: mod.max });
    // Como en la maqueta: al elegir, se abre el casillero siguiente.
    setOpen(typeof id === "number" && id < 7 ? ((id + 1) as SlotId) : null);
  };
  return (
    <div className={`wf-bd-slot${open ? " is-open" : ""}`}>
      <button type="button" className="wf-bd-row" aria-expanded={open} onClick={() => setOpen(open ? null : id)}>
        <span className="wf-bd-k">
          <PolGlyph pol={s.pol} state={st} />
          {label}
        </span>
        <span className="wf-bd-what">
          {m ? (
            <>
              <b className={`wf-rarity is-${m.rarity.toLowerCase()}`}>{say(m.name, lang)}</b>
              <small>{firstLine(m, lang)}</small>
            </>
          ) : (
            <>
              <b className="wf-dim">{c.empty}</b>
              <small>
                {s.pol ? t.polarity[s.pol] : c.noPol} · {c.tap}
              </small>
            </>
          )}
        </span>
        <span className="wf-bd-rk">{m ? `R ${s.rank}/${m.max}` : ""}</span>
        <span className={`wf-bd-dr${st ? ` is-${st}` : ""}`}>{dr === null ? "—" : dr < 0 ? `+${-dr}` : dr}</span>
      </button>
      {open && (
        <div className="wf-bd-drawer">
          {m && (
            <div className="wf-bd-line">
              <span className="wf-label">{c.rankLabel}</span>
              <span className="wf-bd-step">
                <button type="button" aria-label={c.rankDown} disabled={s.rank <= 0} onClick={() => patch(id, { rank: Math.max(0, s.rank - 1) })}>
                  −
                </button>
                <span>
                  {s.rank} / {m.max}
                </span>
                <button type="button" aria-label={c.rankUp} disabled={s.rank >= m.max} onClick={() => patch(id, { rank: Math.min(m.max, s.rank + 1) })}>
                  +
                </button>
              </span>
              <button type="button" className="wf-btn" onClick={() => patch(id, { mod: null, rank: 0 })}>
                {c.remove}
              </button>
            </div>
          )}
          <div className="wf-bd-line" role="group" aria-label={c.polarity}>
            <span className="wf-label">{c.polarity}</span>
            {POLS.map((p) => (
              <button type="button" className={`wf-bd-pchip${s.pol === p ? " is-on" : ""}`} aria-pressed={s.pol === p} title={t.polarity[p]} onClick={() => patch(id, { pol: p })} key={p}>
                <PolGlyph pol={p} />
              </button>
            ))}
            <button type="button" className={`wf-bd-pchip${!s.pol ? " is-on" : ""}`} aria-pressed={!s.pol} title={c.noPol} onClick={() => patch(id, { pol: null })}>
              <PolGlyph pol={null} />
            </button>
          </div>
          <ModPicker build={build} id={id} onPick={pick} lang={lang} />
        </div>
      )}
    </div>
  );
}

/** El buscador de mods de un casillero: los que le entran, sin los de una familia que ya está en otro (el juego no deja repetir). */
function ModPicker({ build, id, onPick, lang }: { build: Build; id: SlotId; onPick: (m: BuildMod) => void; lang: Lang }) {
  const t = useWfCopy();
  const c = t.builder;
  const [query, setQuery] = useState("");
  const [pol, setPol] = useState<Pol | null>(null);
  const all = peekBuilderMods(build.item.kind) ?? [];
  const usados = useMemo(() => new Set(build.slots.filter((s) => s.mod && s.id !== id).map((s) => modFamily(s.mod!.name))), [build, id]);
  const fits = useMemo(
    () => all.filter((m) => modFits(m, build.item, id) && !usados.has(modFamily(m.name))).sort((a, b) => say(a.name, lang).localeCompare(say(b.name, lang), lang)),
    [all, build.item, id, usados, lang],
  );
  const q = fold(query.trim());
  const shown = fits.filter((m) => (!pol || m.pol === pol) && (!q || fold(`${m.name[0]} ${m.name[1]} ${m.text.map((x) => say(x, lang)).join(" ")}`).includes(q)));
  const current = build.slots.find((s) => s.id === id)?.mod?.slug;
  return (
    <div className="wf-bd-mods">
      <label className="wf-find">
        <span className="wf-label">{c.modSearch(fits.length.toLocaleString(lang))}</span>
        <input type="search" value={query} placeholder={c.modSearch(fits.length.toLocaleString(lang))} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="wf-bd-pols" role="group" aria-label={c.polarity}>
        <button type="button" className={`wf-pill${pol === null ? " is-on" : ""}`} aria-pressed={pol === null} onClick={() => setPol(null)}>
          {c.all}
        </button>
        {POLS.filter((p) => fits.some((m) => m.pol === p)).map((p) => (
          <button type="button" className={`wf-pill${pol === p ? " is-on" : ""}`} aria-pressed={pol === p} onClick={() => setPol(pol === p ? null : p)} key={p}>
            <PolGlyph pol={p} />
            {t.polarity[p]}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="wf-dim">{fits.length ? c.none : c.noMods}</p>
      ) : (
        <ul className="wf-bd-list is-mods">
          <LazyRows
            items={shown}
            rowHeight={MOD_ROW}
            chunk={CHUNK}
            tag="li"
            eager
            margin={200}
            render={(m) => (
              <li key={m.slug}>
                <button type="button" className={`wf-bd-mod${m.slug === current ? " is-on" : ""}`} onClick={() => onPick(m)}>
                  <PolGlyph pol={m.pol} />
                  <span>
                    <b className={`wf-rarity is-${m.rarity.toLowerCase()}`}>{say(m.name, lang)}</b>
                    <small>{firstLine(m, lang)}</small>
                  </span>
                  <span className="wf-bd-dr">{m.drain < 0 ? `+${-m.drain + m.max}` : m.drain + m.max}</span>
                </button>
              </li>
            )}
          />
        </ul>
      )}
    </div>
  );
}

function StatTable({ build, pinned, num }: { build: Build; pinned: Ref | null; num: NumFn }) {
  const t = useWfCopy();
  const c = t.builder;
  const rows = useRows(build, pinned);
  let group = "";
  return (
    <>
      <h2 className="wf-h2">{c.stats}</h2>
      <div className="wf-table-wrap">
        <table className="wf-bd-table">
          <thead>
            <tr>
              <th>{c.stat}</th>
              <th>{pinned ? c.ref : c.base}</th>
              <th>{c.build}</th>
              <th>{c.delta}</th>
            </tr>
          </thead>
          <tbody>
            {rows.flatMap((r) => {
              const out = [];
              if (r.group !== group) {
                group = r.group;
                out.push(
                  <tr className="is-group" key={`g-${group}`}>
                    <td colSpan={4}>{c.groups[r.group]}</td>
                  </tr>,
                );
              }
              out.push(
                <tr className={r.sub ? "is-sub" : undefined} key={r.key}>
                  <td>
                    {rowLabel(r, t)}
                    {r.key === "perShot" && <small>{c.w.perShotNote}</small>}
                  </td>
                  <td className="is-base">{r.base ? fmtValue(r.base, r.fmt, num) : "—"}</td>
                  <td className="is-now">{fmtValue(r.now, r.fmt, num)}</td>
                  <td>
                    <Delta r={r} num={num} />
                  </td>
                </tr>,
              );
              return out;
            })}
          </tbody>
        </table>
      </div>
      <p className="wf-bd-note wf-dim">{c.note}</p>
    </>
  );
}

/** Los mods de la build, cada uno con lo que suma a su rango; lo que la tabla de patrones no reconoce se dice. */
function ModsIn({ build, lang, num }: { build: Build; lang: Lang; num: NumFn }) {
  const t = useWfCopy();
  const c = t.builder;
  const puestos = build.slots.filter((s) => s.mod);
  const fxName = (k: string) => (k in c.fx ? c.fx[k as keyof WfCopy["builder"]["fx"]] : t.damage[k as WfDamage]);
  return (
    <section className="wf-bd-in">
      <h3 className="wf-h3">{c.modsIn}</h3>
      {puestos.length === 0 ? (
        <p className="wf-dim">{c.noModsYet}</p>
      ) : (
        <ul>
          {puestos.map((s) => {
            const m = s.mod!;
            const sumado = m.fx.map(([k, vals]) => {
              const v = vals[Math.max(0, Math.min(s.rank, vals.length - 1))] ?? 0;
              return `${v > 0 ? "+" : "−"}${num(Math.abs(v))} % ${fxName(k)}`;
            });
            // Sin nada reconocido no suma; con menos líneas reconocidas que las que tiene, suma en parte.
            const flag = m.fx.length === 0 ? c.notCounted : m.text.length > m.fx.length ? c.partly : null;
            return (
              <li key={String(s.id)}>
                <span>
                  <b className={`wf-rarity is-${m.rarity.toLowerCase()}`}>{say(m.name, lang)}</b> <span className="wf-dim">R{s.rank}</span>
                  {flag && <em className="wf-bd-flag">{flag}</em>}
                </span>
                <span className="wf-bd-fx">
                  {sumado.join(" · ")}
                  {flag &&
                    m.text.map((x, i) => (
                      <small key={i}>{say(x, lang)}</small>
                    ))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
