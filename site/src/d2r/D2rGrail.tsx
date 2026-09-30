/**
 * El Grial (2026-09-29): marcar lo que ya encontraste. Son las listas de la
 * Crónica del juego (únicos, piezas de conjunto y palabras rúnicas: lo que
 * cae y no tiene `disableChronicle`) más las runas. A diferencia de la Crónica,
 * que tapa lo que falta con "¿¿??", acá se ve entero: nombre, nivel y, en las
 * palabras rúnicas, sus runas en orden.
 *
 * El progreso se guarda en este navegador (ids por lista) y viaja en `?g=`
 * para compartirlo: `u403-<bits>.s135-<bits>…`, un mapa de bits en base64url
 * sobre los ids de cada lista en orden alfabético. Si una lista cambió de
 * tamaño (un parche sumó únicos), ese pedazo se ignora en vez de marcar mal.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import uniquesJson from "@d2r/wiki/uniques.json";
import runewordsJson from "@d2r/wiki/runewords.json";
import runesJson from "@d2r/wiki/runes.json";
import { useLang, useLocale } from "../i18n";
import type { Route } from "../route";
import { useD2rCopy } from "../d2rCopy";
import { BASE_BY_CODE, catName, gameStr, tr, type Rune, type Runeword, type Unique } from "./wiki";
import { CATEGORY_ORDER } from "./items";
import { SETS } from "./sets";
import { runeShort } from "./runes";
import { Chips, D2Head, ItemIcon, SearchBox, fold, type Tone } from "./ui";

type ListKey = "u" | "s" | "w" | "r";
const LIST_KEYS: ListKey[] = ["u", "s", "w", "r"];
/** Las tres que cuenta la Crónica del juego (las runas son aparte). */
const CHRONICLE: ListKey[] = ["u", "s", "w"];
type Progress = Record<ListKey, Set<string>>;
type Filter = "all" | "missing" | "found";

const UNIQUES = uniquesJson as unknown as Unique[];
const RUNEWORDS = (runewordsJson as unknown as Runeword[]).slice().sort((a, b) => a.lvl - b.lvl || a.name.en.localeCompare(b.name.en));
const RUNES = (runesJson as unknown as Rune[]).slice().sort((a, b) => a.code.localeCompare(b.code));
const RUNE_BY_CODE = new Map(RUNES.map((r) => [r.code, r]));

/** Los ids de cada lista en orden alfabético: es el orden de los bits en `?g=`. */
const IDS: Record<ListKey, string[]> = {
  u: UNIQUES.map((x) => x.id).sort(),
  s: SETS.flatMap((s) => s.items.map((i) => i.id)).sort(),
  w: RUNEWORDS.map((x) => x.id).sort(),
  r: RUNES.map((x) => x.id).sort(),
};
const KNOWN: Record<ListKey, Set<string>> = { u: new Set(IDS.u), s: new Set(IDS.s), w: new Set(IDS.w), r: new Set(IDS.r) };

const KEY = "vestigo:d2r:grail";
const empty = (): Progress => ({ u: new Set(), s: new Set(), w: new Set(), r: new Set() });

function load(): Progress {
  const p = empty();
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Record<ListKey, string[]>> | null;
    for (const k of LIST_KEYS) for (const id of o?.[k] ?? []) if (KNOWN[k].has(id)) p[k].add(id);
  } catch {
    /* sin almacenamiento: el progreso vive sólo en esta pestaña */
  }
  return p;
}

function save(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(LIST_KEYS.map((k) => [k, [...p[k]]]))));
  } catch {
    /* ídem */
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** El progreso como texto corto para la dirección. */
export function encodeGrail(p: Progress): string {
  return LIST_KEYS.map((k) => {
    const ids = IDS[k];
    let bits = "";
    for (let i = 0; i < ids.length; i += 6) {
      let v = 0;
      for (let j = 0; j < 6 && i + j < ids.length; j++) if (p[k].has(ids[i + j])) v |= 1 << j;
      bits += B64[v];
    }
    return `${k}${ids.length}-${bits.replace(/A+$/, "")}`;
  }).join(".");
}

export function decodeGrail(code: string): Progress {
  const p = empty();
  for (const part of code.split(".")) {
    const m = /^([uswr])(\d+)-([A-Za-z0-9_-]*)$/.exec(part);
    if (!m) continue;
    const k = m[1] as ListKey;
    const ids = IDS[k];
    if (Number(m[2]) !== ids.length) continue;
    [...m[3]].forEach((ch, c) => {
      const v = B64.indexOf(ch);
      for (let j = 0; j < 6; j++) if (v & (1 << j) && ids[c * 6 + j]) p[k].add(ids[c * 6 + j]);
    });
  }
  return p;
}

const catOf = (u: Unique) => BASE_BY_CODE.get(u.base)?.cat ?? "misc";

interface Entry {
  id: string;
  name: string;
  tone: Tone;
  img: string | null | undefined;
  meta: string;
  search: string[];
  /** Las palabras rúnicas no tienen ícono: van sus runas en orden. */
  runes?: string[];
}
interface Group {
  key: string;
  title: string;
  tone: Tone;
  entries: Entry[];
}

export default function D2rGrail(_: { route: Route; navigate: (r: Route) => void }) {
  const t = useD2rCopy();
  const tg = t.grail;
  const { lang } = useLang();
  const locale = useLocale();
  const [mine, setMine] = useState<Progress>(empty);
  const [shared, setShared] = useState<Progress | null>(null);
  const [list, setList] = useState<ListKey>("u");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState(false);
  const [sure, setSure] = useState(false);
  const sureTimer = useRef<number>();

  // Después del primer render (el prerender sale sin marcas): lo guardado y, si
  // la dirección trae `?g=`, el Grial de otra persona para mirarlo.
  useEffect(() => {
    setMine(load());
    const g = new URLSearchParams(window.location.search).get("g");
    if (g) setShared(decodeGrail(g));
  }, []);

  const view = shared ?? mine;
  const n = (k: ListKey) => view[k].size;
  const num = (x: number) => x.toLocaleString(locale);
  const chronicleTotal = CHRONICLE.reduce((s, k) => s + IDS[k].length, 0);
  const chronicleFound = CHRONICLE.reduce((s, k) => s + n(k), 0);

  const dropG = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("g");
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
  };

  const toggle = (id: string) => {
    if (shared) return;
    setMine((p) => {
      const next = { ...p, [list]: new Set(p[list]) };
      if (next[list].has(id)) next[list].delete(id);
      else next[list].add(id);
      save(next);
      return next;
    });
  };

  const share = async () => {
    const url = new URL(window.location.href);
    url.search = `?g=${encodeGrail(mine)}`;
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* sin portapapeles: no hay nada más que hacer */
    }
  };

  const reset = () => {
    if (!sure) {
      setSure(true);
      window.clearTimeout(sureTimer.current);
      sureTimer.current = window.setTimeout(() => setSure(false), 3000);
      return;
    }
    setSure(false);
    const p = empty();
    save(p);
    setMine(p);
  };

  const groups: Group[] = useMemo(() => {
    const lvl = t.wiki.level;
    if (list === "u") {
      const byCat = new Map<string, Unique[]>();
      for (const u of UNIQUES) byCat.set(catOf(u), [...(byCat.get(catOf(u)) ?? []), u]);
      const order = (c: string) => (CATEGORY_ORDER.includes(c) ? CATEGORY_ORDER.indexOf(c) : 999);
      return [...byCat.entries()]
        .sort((a, b) => order(a[0]) - order(b[0]))
        .map(([cat, us]) => ({
          key: cat,
          title: catName(cat, lang) || cat,
          tone: "unique" as Tone,
          entries: us
            .slice()
            .sort((a, b) => a.req - b.req)
            .map((u) => ({ id: u.id, name: tr(u.name, lang), tone: "unique" as Tone, img: u.img, meta: `${tr(BASE_BY_CODE.get(u.base)?.name, lang)} · ${lvl} ${u.req}`, search: [u.name.en, u.name.es] })),
        }));
    }
    if (list === "s") {
      return SETS.map((s) => ({
        key: s.id,
        title: tr(s.name, lang),
        tone: "set" as Tone,
        entries: s.items.map((i) => ({ id: i.id, name: tr(i.name, lang), tone: "set" as Tone, img: i.img, meta: `${tr(BASE_BY_CODE.get(i.base)?.name, lang)} · ${lvl} ${i.req}`, search: [i.name.en, i.name.es, s.name.en, s.name.es] })),
      }));
    }
    if (list === "w") {
      const bySockets = new Map<number, Runeword[]>();
      for (const rw of RUNEWORDS) bySockets.set(rw.runes.length, [...(bySockets.get(rw.runes.length) ?? []), rw]);
      return [...bySockets.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([k, rws]) => ({
          key: String(k),
          title: t.wiki.sockets(k),
          tone: "unique" as Tone,
          entries: rws.map((rw) => ({ id: rw.id, name: tr(rw.name, lang), tone: "unique" as Tone, img: null, meta: `${lvl} ${rw.lvl}`, search: [rw.name.en, rw.name.es], runes: rw.runes })),
        }));
    }
    return [
      {
        key: "runes",
        title: tg.lists.r,
        tone: "rune" as Tone,
        entries: RUNES.map((r) => ({ id: r.id, name: tr(r.name, lang), tone: "rune" as Tone, img: r.img, meta: `${lvl} ${r.lvl}`, search: [r.name.en, r.name.es] })),
      },
    ];
  }, [list, lang, t, tg]);

  const needle = fold(q.trim());
  const shown = groups
    .map((g) => ({
      ...g,
      found: g.entries.filter((e) => view[list].has(e.id)).length,
      entries: g.entries.filter(
        (e) =>
          (!needle || e.search.some((s) => fold(s).includes(needle))) &&
          (filter === "all" || (filter === "found") === view[list].has(e.id)),
      ),
    }))
    .filter((g) => g.entries.length > 0);

  const reward =
    list === "u" ? "Unique" : list === "s" ? "Set" : list === "w" ? "Runeword" : null;

  return (
    <>
      <D2Head as="h1" title={t.tabs.grail} lede={tg.lede(num(IDS.u.length), num(IDS.s.length), num(IDS.w.length), num(IDS.r.length))} />

      {shared && (
        <div className="d2-grail-shared" role="status">
          <p>{tg.shared(num(chronicleFound), num(chronicleTotal))}</p>
          <div className="d2-chips-row">
            <button
              type="button"
              className="d2-chip is-on"
              onClick={() => {
                save(shared);
                setMine(shared);
                setShared(null);
                dropG();
              }}
            >
              {tg.keep}
            </button>
            <button
              type="button"
              className="d2-chip"
              onClick={() => {
                setShared(null);
                dropG();
              }}
            >
              {tg.mine}
            </button>
          </div>
        </div>
      )}

      <div className="d2-grail-lists" role="group" aria-label={t.tabs.grail}>
        {LIST_KEYS.map((k) => (
          <button type="button" key={k} className={`d2-grail-list${k === list ? " is-on" : ""}`} aria-pressed={k === list} onClick={() => setList(k)}>
            <b>{tg.lists[k]}</b>
            <span className="d2-grail-n">
              {num(n(k))} / {num(IDS[k].length)}
            </span>
            <Bar pct={(100 * n(k)) / IDS[k].length} />
          </button>
        ))}
      </div>
      <p className="d2-grail-total">
        {tg.total}: <b>{num(chronicleFound)}</b> / {num(chronicleTotal)} · {Math.floor((100 * chronicleFound) / chronicleTotal)}%
      </p>

      {reward && (
        <p className="d2-grail-reward">
          {tg.reward}: <b>{gameStr(`ChronicleRewards${reward}Title`, lang)}</b> · {gameStr(`ChronicleRewards${reward}Description`, lang)}
          {n(list) === IDS[list].length && <em className="d2-badge is-ok">{tg.complete}</em>}
        </p>
      )}

      <div className="d2-filters">
        <SearchBox value={q} onChange={setQ} placeholder={t.wiki.search} />
        <Chips<Filter>
          label={tg.lists[list]}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: gameStr("ChronicleFilterSelect", lang) || t.wiki.all },
            { value: "missing", label: gameStr("ChronicleFilterRemaining", lang) },
            { value: "found", label: gameStr("ChronicleFilterDiscovered", lang) },
          ]}
        />
        {!shared && (
          <div className="d2-chips-row d2-grail-actions">
            <button type="button" className="d2-chip" onClick={share}>
              {copied ? tg.copied : tg.share}
            </button>
            <button type="button" className={`d2-chip${sure ? " is-on" : ""}`} onClick={reset}>
              {sure ? tg.resetSure : tg.reset}
            </button>
          </div>
        )}
      </div>

      {shown.map((g) => (
        <section className="d2-cat" key={g.key}>
          <h2 className={`d2-cat-h d2-tone-${g.tone}`}>
            {g.title}
            <small>
              {num(g.found)} / {num(groups.find((x) => x.key === g.key)!.entries.length)}
            </small>
          </h2>
          <ul className="d2-cards d2-grail-grid">
            {g.entries.map((e) => (
              <Item key={e.id} entry={e} on={view[list].has(e.id)} onToggle={() => toggle(e.id)} locked={!!shared}>
                {e.runes && (
                  <small className="d2-grail-runes">
                    {e.runes.map((c, i) => (
                      <span key={i}>{RUNE_BY_CODE.get(c) ? runeShort(RUNE_BY_CODE.get(c)!) : c}</span>
                    ))}
                  </small>
                )}
              </Item>
            ))}
          </ul>
        </section>
      ))}
      {shown.length === 0 && <p className="d2-empty">{t.wiki.noResults}</p>}
    </>
  );
}

/** La barra de progreso de la Crónica: el marco del juego y su relleno dorado, recortado al porcentaje. */
function Bar({ pct }: { pct: number }) {
  return (
    <span className="d2-grail-bar" aria-hidden="true">
      <i style={{ "--p": `${Math.min(100, pct)}%` } as CSSProperties} />
    </span>
  );
}

/** Un casillero: la casilla del juego, el ícono y el nombre. Se marca y desmarca tocándolo. */
function Item({ entry, on, onToggle, locked, children }: { entry: Entry; on: boolean; onToggle: () => void; locked: boolean; children?: ReactNode }) {
  return (
    <li>
      <button type="button" className={`d2-grail-it${on ? " is-on" : ""}`} aria-pressed={on} onClick={onToggle} disabled={locked}>
        <span className="d2-grail-check" aria-hidden="true" />
        {!entry.runes && <ItemIcon asset={entry.img} size="sm" />}
        <span className="d2-card-txt">
          <b className={`d2-tone-${entry.tone}`}>{entry.name}</b>
          <small>{entry.meta}</small>
          {children}
        </span>
      </button>
    </li>
  );
}
