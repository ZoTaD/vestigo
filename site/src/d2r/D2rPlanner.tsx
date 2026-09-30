/**
 * El planificador de equipo (2026-09-29, idea de ZoTaD): el muñeco del
 * inventario del juego con sus diez casilleros y la grilla de los talismanes.
 * Se equipan únicos, piezas de conjunto y palabras rúnicas, y se ven los
 * totales: resistencias con la penalidad de la dificultad, velocidades,
 * hallazgo mágico y todas las stats como las escribe el juego.
 *
 * Las stats salen del mismo motor que las fichas (`stats.ts`), con las
 * bonificaciones de conjunto por cantidad de piezas puestas y las de las runas
 * según dónde van. El equipo viaja en `?b=` para compartirlo con un enlace.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import uniquesJson from "@d2r/wiki/uniques.json";
import runewordsJson from "@d2r/wiki/runewords.json";
import { useLang, useLocale } from "../i18n";
import type { Route } from "../route";
import { useD2rCopy } from "../d2rCopy";
import { HOME, gameImg } from "../d2rData";
import { describe, describeProps, sumStats, toStats, valueAt, type Prop, type Stat } from "./stats";
import { BASES, BASE_BY_CODE, E, tr, typeChain, type Base, type GameSet, type Runeword, type SetItem, type Unique } from "./wiki";
import { runewordProps } from "./D2rRunewords";
import { SETS } from "./sets";
import { D2Head, ItemIcon, SearchBox, fold } from "./ui";
import { bpState, bpTable, type BpKind } from "./breakpoints";

const UNIQUES = uniquesJson as unknown as Unique[];
const RUNEWORDS = runewordsJson as unknown as Runeword[];

type SlotKey = "head" | "amulet" | "weapon" | "body" | "shield" | "gloves" | "belt" | "boots" | "ring1" | "ring2";
const SLOT_KEYS: SlotKey[] = ["head", "amulet", "weapon", "body", "shield", "gloves", "belt", "boots", "ring1", "ring2"];

/**
 * Dónde está cada casillero en el panel de inventario del juego (1162×1507), en
 * porcentajes, y qué silueta muestra vacío.
 */
const SLOT_BOX: Record<SlotKey, { x: number; y: number; w: number; h: number; ghost: string }> = {
  weapon: { x: 8.35, y: 11.56, w: 18.76, h: 30.37, ghost: "weapon" },
  head: { x: 40.53, y: 11.75, w: 18.67, h: 14.13, ghost: "headarmor" },
  amulet: { x: 61.02, y: 22.69, w: 10.15, h: 7.96, ghost: "amulet" },
  body: { x: 40.53, y: 27.6, w: 18.85, h: 21.03, ghost: "chestarmor" },
  shield: { x: 73.15, y: 11.56, w: 18.5, h: 30.37, ghost: "shield" },
  gloves: { x: 8.35, y: 43.66, w: 18.76, h: 14.4, ghost: "glove" },
  ring1: { x: 28.74, y: 50.3, w: 10.15, h: 7.76, ghost: "ring" },
  belt: { x: 40.53, y: 50.3, w: 18.85, h: 7.76, ghost: "belt" },
  ring2: { x: 61.02, y: 50.3, w: 10.33, h: 7.76, ghost: "ring" },
  boots: { x: 73.15, y: 43.66, w: 18.5, h: 14.4, ghost: "boots" },
};
/** La grilla de abajo (10×4 casillas), donde van los talismanes. */
const GRID = { x: 7.92, y: 59.59, w: 84.17, h: 19.38, cols: 10, rows: 4 };

/** Qué tipos entran en cada casillero (por la cadena de tipos de la base). */
const SLOT_TYPES: Record<SlotKey | "charm", string[]> = {
  head: ["helm"], amulet: ["amul"], weapon: ["weap"], body: ["tors"], shield: ["shld"],
  gloves: ["glov"], belt: ["belt"], boots: ["boot"], ring1: ["ring"], ring2: ["ring"], charm: ["char"],
};
/** En qué lugar suman las runas de una palabra rúnica según el casillero. */
const SLOT_GAT: Partial<Record<SlotKey, 0 | 1 | 2>> = { weapon: 0, head: 1, body: 1, shield: 2 };
/** Los tipos de clase del juego, en el orden de las clases. */
const CLASS_TYPES = ["amaz", "sorc", "necr", "pala", "barb", "drui", "assn", "warl"];
/** La penalidad a las resistencias en Normal, Pesadilla e Infierno. */
const RES_PENALTY = [0, 40, 100];

/**
 * Las cuatro resistencias como las muestra la hoja del personaje: lo que suma el equipo menos la penalidad de la
 * dificultad, con el tope de 75 (más lo que sume la resistencia máxima). En Infierno arrancan en −100: con poco
 * equipo quedan negativas, y es lo que ve el juego.
 */
export function resistances(val: (stat: string) => number, d: number) {
  return (["fire", "cold", "light", "poison"] as const).map((r) => {
    const gear = val(`${r}resist`);
    const raw = gear - RES_PENALTY[d];
    const cap = 75 + val(`max${r}resist`);
    return { key: r, gear, raw, shown: Math.min(raw, cap), cap };
  });
}

type Ref = { k: "u" | "s" | "r"; id: string };
type Build = { c: number; l: number; d: number; p: "max" | "min"; s: Partial<Record<SlotKey, Ref>>; ch: Ref[] };
const EMPTY: Build = { c: 1, l: 90, d: 2, p: "max", s: {}, ch: [] };

const SET_ITEMS = new Map<string, { item: SetItem; set: GameSet }>();
for (const set of SETS) for (const item of set.items) SET_ITEMS.set(item.id, { item, set });

/** Lo que hace falta de un ítem equipado: nombre, ícono, base y propiedades propias. */
function resolve(ref: Ref | undefined): { name: { en: string; es: string }; img: string | null; base?: Base; props: Prop[]; req: number; tone: "unique" | "set"; set?: GameSet; item?: SetItem; rw?: Runeword } | null {
  if (!ref) return null;
  if (ref.k === "u") {
    const u = UNIQUES.find((x) => x.id === ref.id);
    return u ? { name: u.name, img: u.img, base: BASE_BY_CODE.get(u.base), props: u.props as Prop[], req: u.req, tone: "unique" } : null;
  }
  if (ref.k === "s") {
    const hit = SET_ITEMS.get(ref.id);
    return hit ? { name: hit.item.name, img: hit.item.img, base: BASE_BY_CODE.get(hit.item.base), props: hit.item.props as Prop[], req: hit.item.req, tone: "set", set: hit.set, item: hit.item } : null;
  }
  const rw = RUNEWORDS.find((x) => x.id === ref.id);
  return rw ? { name: rw.name, img: null, props: rw.props as Prop[], req: rw.lvl, tone: "unique", rw } : null;
}

/** ¿Entra esta base en el casillero, para esta clase? */
function fits(base: Base | undefined, slot: SlotKey | "charm", cls: number): boolean {
  if (!base) return false;
  const chain = base.chain ?? typeChain(base.type, base.type2);
  if (!SLOT_TYPES[slot].some((t) => chain.includes(t))) return false;
  const own = CLASS_TYPES.find((c) => chain.includes(c));
  return !own || own === CLASS_TYPES[cls];
}

/** Las palabras rúnicas que se pueden armar en alguna base de ese casillero (para esa clase). */
function runewordsFor(slot: SlotKey, cls: number): Runeword[] {
  const bases = BASES.filter((b) => b.kind !== "misc" && b.spawnable && fits(b, slot, cls));
  return RUNEWORDS.filter((rw) =>
    bases.some((b) => b.sockets >= rw.runes.length && rw.types.some((t) => (b.chain ?? []).includes(t)) && !rw.exclude.some((t) => (b.chain ?? []).includes(t))),
  );
}

const encode = (b: Build) => {
  const parts = [`c${b.c}`, `l${b.l}`, `d${b.d}`, b.p === "min" ? "pmin" : ""].filter(Boolean);
  for (const k of SLOT_KEYS) if (b.s[k]) parts.push(`${k}~${b.s[k]!.k}~${b.s[k]!.id}`);
  b.ch.forEach((r) => parts.push(`ch~${r.k}~${r.id}`));
  return parts.join(".");
};
function decode(q: string | null): Build {
  if (!q) return EMPTY;
  const b: Build = { ...EMPTY, s: {}, ch: [] };
  for (const part of q.split(".")) {
    if (/^c\d$/.test(part)) b.c = Math.min(7, Number(part.slice(1)));
    else if (/^l\d+$/.test(part)) b.l = Math.max(1, Math.min(99, Number(part.slice(1))));
    else if (/^d\d$/.test(part)) b.d = Math.min(2, Number(part.slice(1)));
    else if (part === "pmin") b.p = "min";
    else {
      const [slot, k, id] = part.split("~");
      if (!id || !["u", "s", "r"].includes(k)) continue;
      const ref = { k: k as Ref["k"], id };
      if (slot === "ch") b.ch.push(ref);
      else if ((SLOT_KEYS as string[]).includes(slot)) b.s[slot as SlotKey] = ref;
    }
  }
  return b;
}

export default function D2rPlanner(_: { route: Route; navigate: (r: Route) => void }) {
  const t = useD2rCopy();
  const tp = t.planner;
  const { lang } = useLang();
  const locale = useLocale();
  const [b, setB] = useState<Build>(EMPTY);
  const [picking, setPicking] = useState<SlotKey | "charm" | null>(null);
  const [copied, setCopied] = useState(false);
  const loaded = useRef(false);

  // El equipo llega en `?b=` y cada cambio lo vuelve a escribir (sin sumar historial).
  // La escritura se salta la primera vuelta: en ese momento el estado todavía es
  // el vacío (el leído llega en el render siguiente) y borraría el enlace.
  useEffect(() => {
    setB(decode(new URLSearchParams(window.location.search).get("b")));
  }, []);
  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    const url = new URL(window.location.href);
    const code = encode(b);
    if (code === encode(EMPTY)) url.searchParams.delete("b");
    else url.searchParams.set("b", code);
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [b]);

  const equipped = useMemo(() => {
    const out: { slot: SlotKey | "charm"; ref: Ref; it: NonNullable<ReturnType<typeof resolve>> }[] = [];
    for (const k of SLOT_KEYS) {
      const it = resolve(b.s[k]);
      if (it) out.push({ slot: k, ref: b.s[k]!, it });
    }
    b.ch.forEach((ref) => {
      const it = resolve(ref);
      if (it) out.push({ slot: "charm", ref, it });
    });
    return out;
  }, [b]);

  // Cuántas piezas de cada conjunto hay puestas.
  const setCount = useMemo(() => {
    const m = new Map<string, { set: GameSet; n: number }>();
    for (const e of equipped) if (e.it.set) m.set(e.it.set.id, { set: e.it.set, n: (m.get(e.it.set.id)?.n ?? 0) + 1 });
    return m;
  }, [equipped]);

  const stats: Stat[] = useMemo(() => {
    const props: Prop[] = [];
    for (const e of equipped) {
      if (e.it.rw) props.push(...runewordProps(e.it.rw, SLOT_GAT[e.slot as SlotKey] ?? 1));
      else props.push(...e.it.props);
      // Las bonificaciones de la pieza según cuántas del conjunto hay puestas.
      if (e.it.item && e.it.set) {
        const n = setCount.get(e.it.set.id)?.n ?? 1;
        for (const bonus of e.it.item.bonus) if (bonus.n <= n) props.push(...(bonus.props as Prop[]));
      }
    }
    for (const { set, n } of setCount.values()) {
      for (const p of set.partial) if (p.n <= n) props.push(...(p.props as Prop[]));
      if (n >= set.items.length) props.push(...(set.full as Prop[]));
    }
    // Cada stat con su valor para el nivel y los valores elegidos (perfectos o mínimos).
    return sumStats(toStats(props, E)).map((st) => {
      const v = valueAt(st, b.l, b.p);
      return st.a !== undefined ? st : { ...st, min: v, max: v, perLevel: undefined };
    });
  }, [equipped, setCount, b.l, b.p]);

  const val = (name: string) => stats.filter((s) => s.s === name).reduce((n, s) => n + s.max, 0);
  // "Todas las resistencias" ya llega partida en las cuatro (res-all pone las cuatro stats).
  const res = resistances(val, b.d);
  const reqLevel = Math.max(0, ...equipped.map((e) => e.it.req));
  const lines = useMemo(() => describe(stats, E, lang, b.l).map((l) => l.text), [stats, lang, b.l]);

  const set = (patch: Partial<Build>) => setB((x) => ({ ...x, ...patch }));
  const equip = (slot: SlotKey | "charm", ref: Ref | null) => {
    setB((x) => {
      if (slot === "charm") return ref ? { ...x, ch: [...x.ch, ref].slice(0, 10) } : x;
      const s = { ...x.s };
      if (ref) s[slot] = ref;
      else delete s[slot];
      return { ...x, s };
    });
    setPicking(null);
  };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* sin portapapeles: el enlace igual está en la barra de direcciones */
    }
  };

  return (
    <>
      <D2Head as="h1" title={tp.title} lede={tp.lede} />
      <div className="d2-plan">
        <div className="d2-plan-doll">
          <div className="d2-doll" style={{ backgroundImage: `url(${gameImg("inventory")})` }}>
            {SLOT_KEYS.map((k) => {
              const box = SLOT_BOX[k];
              const it = resolve(b.s[k]);
              return (
                <button
                  type="button"
                  key={k}
                  className={`d2-doll-slot${it ? " is-full" : ""}${it?.tone === "set" ? " is-set" : ""}`}
                  style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
                  onClick={() => setPicking(k)}
                  aria-label={`${tp.slots[k]}${it ? `: ${tr(it.name, lang)}` : ""}`}
                  title={it ? tr(it.name, lang) : tp.slots[k]}
                >
                  {it ? (
                    it.img || it.base?.img ? (
                      <img src={`/d2r/items/${it.img ?? it.base?.img}.webp`} alt="" />
                    ) : (
                      <span className="d2-doll-rw">{tr(it.name, lang)}</span>
                    )
                  ) : (
                    <img className="d2-doll-ghost" src={gameImg(`paperdoll/${box.ghost}`)} alt="" />
                  )}
                </button>
              );
            })}
            <div className="d2-doll-grid" style={{ left: `${GRID.x}%`, top: `${GRID.y}%`, width: `${GRID.w}%`, height: `${GRID.h}%` }}>
              {b.ch.map((ref, i) => {
                const it = resolve(ref);
                const h = it?.base?.size?.[1] ?? 1;
                return (
                  <button
                    type="button"
                    key={i}
                    className="d2-doll-charm"
                    style={{ gridColumn: `${i + 1}`, gridRow: `1 / span ${h}` }}
                    onClick={() => setB((x) => ({ ...x, ch: x.ch.filter((_, j) => j !== i) }))}
                    title={`${it ? tr(it.name, lang) : ""} · ${tp.remove}`}
                  >
                    {it?.img && <img src={`/d2r/items/${it.img}.webp`} alt="" />}
                  </button>
                );
              })}
              {b.ch.length < 10 && (
                <button type="button" className="d2-doll-add" style={{ gridColumn: `${b.ch.length + 1}` }} onClick={() => setPicking("charm")} aria-label={tp.addCharm} title={tp.addCharm}>
                  +
                </button>
              )}
            </div>
          </div>
          <div className="d2-plan-actions">
            <button type="button" className="d2-chip" onClick={share}>
              {copied ? tp.copied : tp.share}
            </button>
            <button type="button" className="d2-chip" onClick={() => setB({ ...EMPTY, c: b.c, l: b.l, d: b.d, p: b.p })}>
              {tp.clear}
            </button>
          </div>
        </div>

        <div className="d2-plan-side">
          <div className="d2-plan-controls">
            <div className="d2-plan-classes" role="group" aria-label={tp.cls}>
              {E.classes.map((c, i) => {
                const name = tr(HOME.classes.find((h) => h.id === c.id)?.name, lang) || c.id;
                return (
                  <button type="button" key={c.id} className={`d2-plan-class${b.c === i ? " is-on" : ""}`} aria-pressed={b.c === i} onClick={() => set({ c: i })} title={name}>
                    <img src={gameImg(`class/${c.id}`)} alt={name} />
                  </button>
                );
              })}
            </div>
            <label className="d2-plan-field">
              {tp.level}
              <input type="number" min={1} max={99} value={b.l} onChange={(e) => set({ l: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })} />
            </label>
            <div className="d2-chips-row" role="group" aria-label={tp.difficulty}>
              {tp.diffs.map((d, i) => (
                <button type="button" key={d} className={`d2-chip${b.d === i ? " is-on" : ""}`} aria-pressed={b.d === i} onClick={() => set({ d: i })}>
                  {d}
                </button>
              ))}
            </div>
            <div className="d2-chips-row" role="group" aria-label={tp.values}>
              {(["max", "min"] as const).map((p) => (
                <button type="button" key={p} className={`d2-chip${b.p === p ? " is-on" : ""}`} aria-pressed={b.p === p} onClick={() => set({ p })}>
                  {tp[p]}
                </button>
              ))}
            </div>
          </div>

          {equipped.length === 0 ? (
            <p className="d2-empty">{tp.empty}</p>
          ) : (
            <div className="d2-plan-totals">
              {reqLevel > b.l && <p className="d2-plan-warn">{tp.reqWarn(reqLevel)}</p>}
              <h2 className="d2-h3">{tp.resist}</h2>
              <ul className="d2-plan-res">
                {res.map((r) => (
                  <li key={r.key} className={`is-${r.key}`}>
                    <span>{tp.res[r.key]}</span>
                    <b className={r.shown < 0 ? "is-neg" : r.shown >= r.cap ? "is-cap" : ""}>{r.shown}%</b>
                    {RES_PENALTY[b.d] > 0 && <small>{tp.resGear(r.gear)}</small>}
                    {r.raw > r.cap && <small>{tp.resOver(r.raw - r.cap)}</small>}
                  </li>
                ))}
              </ul>
              {/* Sin esto, un −90% en Infierno parecía un error: es la penalidad de la dificultad, como en el juego. */}
              {RES_PENALTY[b.d] > 0 && <p className="d2-plan-note">{tp.resPenalty(tp.diffs[b.d], RES_PENALTY[b.d])}</p>}
              <h2 className="d2-h3">{tp.speeds}</h2>
              <dl className="d2-plan-kv">
                {(
                  [
                    ["fcr", "item_fastercastrate"],
                    ["fhr", "item_fastergethitrate"],
                    ["fbr", "item_fasterblockrate"],
                    ["ias", "item_fasterattackrate"],
                    ["frw", "item_fastermovevelocity"],
                  ] as const
                ).map(([k, s]) => {
                  // FCR, FHR y FBR con sus cuadros para la clase y el arma puestas (los breakpoints).
                  const table = k === "fcr" || k === "fhr" || k === "fbr" ? bpTable(E.classes[b.c].id, k as BpKind, resolve(b.s.weapon)?.base?.wclass ?? "HTH") : null;
                  const st = table ? bpState(table, val(s)) : null;
                  return (
                    <div key={k}>
                      <dt>{tp[k]}</dt>
                      <dd>
                        {val(s)}%
                        {st && (
                          <small className="d2-plan-bp">
                            {t.bp.now(st.frames)}
                            {st.next ? ` · ${t.bp.next(st.next[0], st.next[0] - val(s))}` : ` · ${t.bp.maxed}`}
                          </small>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              <h2 className="d2-h3">{tp.finds}</h2>
              <dl className="d2-plan-kv">
                <div>
                  <dt>{tp.mf}</dt>
                  <dd>{val("item_magicbonus") + val("item_find_magic_perlevel")}%</dd>
                </div>
                <div>
                  <dt>{tp.gf}</dt>
                  <dd>{val("item_goldbonus") + val("item_find_gold_perlevel")}%</dd>
                </div>
              </dl>
              {setCount.size > 0 && (
                <>
                  <h2 className="d2-h3">{tp.setsActive}</h2>
                  <ul className="d2-plan-sets">
                    {[...setCount.values()].map(({ set, n }) => (
                      <li key={set.id} className="d2-tone-set">
                        {tr(set.name, lang)} <small>{n}/{set.items.length}</small>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <h2 className="d2-h3">{tp.allStats}</h2>
              <ul className="d2-box-lines d2-tone-magic d2-plan-lines">
                {lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {picking && (
        <Picker
          slot={picking}
          cls={b.c}
          current={picking === "charm" ? undefined : b.s[picking]}
          onPick={(ref) => equip(picking, ref)}
          onClose={() => setPicking(null)}
          locale={locale}
        />
      )}
    </>
  );
}

/** La lista para elegir un ítem de un casillero: únicos, piezas de conjunto y palabras rúnicas. */
function Picker({ slot, cls, current, onPick, onClose, locale }: { slot: SlotKey | "charm"; cls: number; current?: Ref; onPick: (r: Ref | null) => void; onClose: () => void; locale: string }) {
  const t = useD2rCopy();
  const tp = t.planner;
  const { lang } = useLang();
  const [q, setQ] = useState("");
  const input = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    input.current?.querySelector("input")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const options = useMemo(() => {
    const needle = fold(q.trim());
    const ok = (n: { en: string; es: string }) => !needle || fold(n.en).includes(needle) || fold(n.es).includes(needle);
    const out: { ref: Ref; name: string; img: string | null; tone: string; kind: string; req: number; preview: string[] }[] = [];
    for (const u of UNIQUES) {
      if (!fits(BASE_BY_CODE.get(u.base), slot, cls) || !ok(u.name)) continue;
      out.push({ ref: { k: "u", id: u.id }, name: tr(u.name, lang), img: u.img, tone: "unique", kind: tp.kindUnique, req: u.req, preview: describeProps(u.props as Prop[], E, lang).slice(0, 3) });
    }
    for (const { item, set } of SET_ITEMS.values()) {
      if (!fits(BASE_BY_CODE.get(item.base), slot, cls) || !ok(item.name)) continue;
      out.push({ ref: { k: "s", id: item.id }, name: tr(item.name, lang), img: item.img, tone: "set", kind: tr(set.name, lang), req: item.req, preview: describeProps(item.props as Prop[], E, lang).slice(0, 3) });
    }
    if (slot !== "charm" && SLOT_GAT[slot] !== undefined) {
      for (const rw of runewordsFor(slot, cls)) {
        if (!ok(rw.name)) continue;
        out.push({ ref: { k: "r", id: rw.id }, name: tr(rw.name, lang), img: null, tone: "unique", kind: tp.kindRw, req: rw.lvl, preview: describeProps(runewordProps(rw, SLOT_GAT[slot]!), E, lang).slice(0, 3) });
      }
    }
    return out.sort((a, b) => a.req - b.req);
  }, [q, slot, cls, lang, tp]);

  return (
    <div className="d2-pick" role="dialog" aria-modal="true" aria-label={tp.choose} onClick={onClose}>
      <div className="d2-pick-in" onClick={(e) => e.stopPropagation()}>
        <div className="d2-pick-head">
          <b>{slot === "charm" ? tp.addCharm : tp.slots[slot]}</b>
          <button type="button" className="d2-chip" onClick={onClose}>
            {tp.close}
          </button>
        </div>
        <div ref={input}>
          <SearchBox value={q} onChange={setQ} placeholder={tp.searchItem} />
        </div>
        {current && (
          <button type="button" className="d2-chip d2-pick-remove" onClick={() => onPick(null)}>
            {tp.remove}
          </button>
        )}
        <p className="d2-count">{t.wiki.count(options.length.toLocaleString(locale))}</p>
        <ul className="d2-pick-list">
          {options.map((o) => (
            <li key={`${o.ref.k}-${o.ref.id}`}>
              <button type="button" className={`d2-pick-opt${current && current.k === o.ref.k && current.id === o.ref.id ? " is-on" : ""}`} onClick={() => onPick(o.ref)}>
                <ItemIcon asset={o.img} size="sm" />
                <span className="d2-pick-txt">
                  <b className={`d2-tone-${o.tone}`}>{o.name}</b>
                  <small>
                    {o.kind} · {t.wiki.level} {o.req}
                  </small>
                  <small className="d2-tone-magic">{o.preview.join(" · ")}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
