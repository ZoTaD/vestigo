/**
 * Generador de regex de PoE2 (2026-09-25): elegís modificadores para buscar o
 * evitar y sale el texto para pegar en la búsqueda del juego. El idioma del
 * juego va aparte del idioma del sitio. La selección viaja en el link (`?r=`).
 */
import { useEffect, useMemo, useState } from "react";
import { useLang } from "../i18n";
import { fold } from "../poe2EncyclopediaData";
import { buildRegex, MAX_CHARS, type GameLang, type Pool, type RxData } from "./regex";
import { useRegexCopy } from "./copy";

const files = import.meta.glob<{ default: unknown }>("@poe2/regex/regex.json");
let pending: Promise<RxData> | null = null;
const loadData = () => (pending ??= Object.values(files)[0]().then((m) => m.default as RxData));

const MODES: Pool[] = ["waystone", "tablet", "gear", "relic"];
const GEAR_CATS = ["all", "life", "mana", "resistance", "speed", "attack", "caster", "critical", "defences", "attribute", "gem", "minion", "elemental", "physical", "chaos"] as const;
const TABLET_CATS = ["all", "breach", "delirium", "ritual", "expedition", "abyss", "map_boss", "incursion"] as const;
const HEADER_KEYS = ["rarity", "pack", "drop", "magic", "rare", "effect"] as const;
type Rar = "Normal" | "Magic" | "Rare";

interface Sel { w: boolean; min?: number }
interface State {
  mode: Pool;
  game: GameLang;
  match: "any" | "all";
  sel: Record<string, Sel>; // "modo:índice"
  tier: [number, number];
  corr: "any" | "yes" | "no";
  rar: Rar[];
  head: Record<string, number>;
}

function readState(lang: GameLang): State {
  const base: State = { mode: "waystone", game: lang, match: "any", sel: {}, tier: [1, 16], corr: "any", rar: [], head: {} };
  if (typeof window === "undefined") return base;
  const r = new URLSearchParams(window.location.search).get("r");
  if (!r) return base;
  try {
    const s = JSON.parse(decodeURIComponent(escape(atob(r.replace(/-/g, "+").replace(/_/g, "/")))));
    return { ...base, ...s };
  } catch {
    return base;
  }
}

function writeState(s: State): void {
  const url = new URL(window.location.href);
  const empty = !Object.keys(s.sel).length && s.tier[0] === 1 && s.tier[1] === 16 && s.corr === "any" && !s.rar.length && !Object.keys(s.head).length;
  if (empty) url.searchParams.delete("r");
  else url.searchParams.set("r", btoa(unescape(encodeURIComponent(JSON.stringify(s)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}

export default function Poe2Regex() {
  const t = useRegexCopy();
  const { lang } = useLang();
  const [D, setD] = useState<RxData | null>(null);
  const [failed, setFailed] = useState(false);
  const [S, setS] = useState<State>(() => readState(lang));
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => { loadData().then(setD).catch(() => setFailed(true)); }, []);
  useEffect(() => { writeState(S); }, [S]);
  const set = (p: Partial<State>) => setS((s) => ({ ...s, ...p }));

  const regex = useMemo(() => {
    if (!D) return "";
    const picks = Object.entries(S.sel)
      .filter(([k]) => k.startsWith(S.mode + ":"))
      .map(([k, v]) => ({ line: D.pools[S.mode][Number(k.split(":")[1])], want: v.w, min: v.min }))
      .filter((p) => p.line);
    return buildRegex(D, {
      lang: S.game,
      match: S.match,
      picks,
      tier: S.mode === "waystone" ? S.tier : null,
      corrupted: S.mode === "waystone" && S.corr !== "any" ? S.corr : null,
      rarity: S.mode === "waystone" || S.mode === "tablet" ? S.rar : null,
      header: S.mode === "waystone" ? S.head : undefined,
    });
  }, [D, S]);

  if (failed) return <p className="p2-loading">{t.failed}</p>;
  if (!D) return <p className="p2-loading">{t.loading}</p>;

  const pool = D.pools[S.mode];
  const cats = S.mode === "gear" ? GEAR_CATS : S.mode === "tablet" ? TABLET_CATS : null;
  const f = fold(q.trim());
  const shown = pool
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => (!f || fold(line.en).includes(f) || fold(line.es).includes(f)) && (!cats || cat === "all" || line.tags.includes(cat)));
  const G = S.game;
  const show = (text: string, range: [number, number] | null, min?: number) => {
    const r = min ? `≥${min}` : range && range[0] >= 0 ? (range[0] === range[1] ? `${range[0]}` : `(${range[0]}–${range[1]})`) : "#";
    let first = true;
    return text.replace(/#/g, () => (first ? ((first = false), r) : "#"));
  };
  const toggle = (k: string, w: boolean) =>
    setS((s) => {
      const sel = { ...s.sel };
      if (sel[k]?.w === w) delete sel[k];
      else sel[k] = { w, min: sel[k]?.min };
      return { ...s, sel };
    });
  const setMin = (k: string, v: string) =>
    setS((s) => {
      const sel = { ...s.sel };
      const n = Math.max(0, Math.floor(Number(v)));
      sel[k] = { w: sel[k]?.w ?? true, min: n || undefined };
      return { ...s, sel };
    });
  const copy = async (text: string, msg: string) => {
    try { await navigator.clipboard.writeText(text); } catch { window.prompt("", text); }
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 1500);
  };
  const chosen = Object.entries(S.sel).filter(([k]) => k.startsWith(S.mode + ":"));
  const n = regex.length;

  return (
    <div className="p2r">
      <div className="p2r-bar">
        <div className="p2-stabs p2r-modes" role="tablist">
          {MODES.map((m) => (
            <button key={m} type="button" role="tab" aria-selected={S.mode === m} className={`p2-stab${S.mode === m ? " is-on" : ""}`}
              onClick={() => { set({ mode: m }); setCat("all"); setQ(""); }}>{t.modes[m]}</button>
          ))}
        </div>
        <div className="p2r-lang">
          <span>{t.gameLang}</span>
          <div className="p2-mode" role="group" aria-label={t.gameLang}>
            {(["es", "en"] as GameLang[]).map((l) => (
              <button key={l} type="button" className={`p2-mode-b${S.game === l ? " is-on" : ""}`} aria-pressed={S.game === l} onClick={() => set({ game: l })}>
                {l === "es" ? "Español" : "English"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p2r-grid">
        <section className="p2-panel p2r-mods">
          <div className="p2-plate-head is-small"><h2 className="p2-plate">{t.list}</h2></div>
          <div className="p2r-opts">
            <div className="p2r-opt">
              <span>{t.match}</span>
              <div className="p2r-row">
                {(["any", "all"] as const).map((m) => (
                  <button key={m} type="button" className={`p2r-chip${S.match === m ? " is-on" : ""}`} aria-pressed={S.match === m} onClick={() => set({ match: m })}>{t[m]}</button>
                ))}
              </div>
            </div>
            {S.mode === "waystone" && (
              <>
                <div className="p2r-opt">
                  <span>{t.tier}</span>
                  <div className="p2r-row">
                    <input className="p2r-num" type="number" min={1} max={16} value={S.tier[0]} aria-label={`${t.tier} min`}
                      onChange={(e) => set({ tier: [Math.max(1, Math.min(16, +e.target.value || 1)), S.tier[1]] })} />
                    –
                    <input className="p2r-num" type="number" min={1} max={16} value={S.tier[1]} aria-label={`${t.tier} max`}
                      onChange={(e) => set({ tier: [S.tier[0], Math.max(1, Math.min(16, +e.target.value || 16))] })} />
                  </div>
                </div>
                <div className="p2r-opt">
                  <span>{t.corrupt}</span>
                  <div className="p2r-row">
                    {(["any", "yes", "no"] as const).map((k) => (
                      <button key={k} type="button" className={`p2r-chip${S.corr === k ? " is-on" : ""}`} aria-pressed={S.corr === k} onClick={() => set({ corr: k })}>{t.corr[k]}</button>
                    ))}
                  </div>
                </div>
              </>
            )}
            {(S.mode === "waystone" || S.mode === "tablet") && (
              <div className="p2r-opt">
                <span>{t.rarity}</span>
                <div className="p2r-row">
                  {(["Normal", "Magic", "Rare"] as Rar[]).map((r) => {
                    const on = S.rar.includes(r);
                    return <button key={r} type="button" className={`p2r-chip${on ? " is-on" : ""}`} aria-pressed={on}
                      onClick={() => set({ rar: on ? S.rar.filter((x) => x !== r) : [...S.rar, r] })}>{t.rarities[r]}</button>;
                  })}
                </div>
              </div>
            )}
          </div>
          {S.mode === "waystone" && (
            <div className="p2r-head">
              <span className="p2r-head-t">{t.header}</span>
              {HEADER_KEYS.map((k) => (
                <label key={k} className="p2r-head-f">
                  <span>{t.headerKeys[k]}</span>
                  <input className="p2r-num" type="number" min={0} value={S.head[k] ?? ""}
                    onChange={(e) => {
                      const v = Math.max(0, Math.floor(+e.target.value));
                      const head = { ...S.head };
                      if (v) head[k] = v; else delete head[k];
                      set({ head });
                    }} />
                </label>
              ))}
            </div>
          )}
          <div className="p2r-tools">
            <input className="p2r-input" type="search" placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="p2r-count">{t.count(shown.length, pool.length)}</span>
          </div>
          {cats && (
            <div className="p2r-cats">
              {cats.map((c) => (
                <button key={c} type="button" className={`p2r-chip${cat === c ? " is-on" : ""}`} aria-pressed={cat === c} onClick={() => setCat(c)}>
                  {S.mode === "gear" ? t.cats[c as keyof typeof t.cats] : t.tcats[c as keyof typeof t.tcats]}
                </button>
              ))}
            </div>
          )}
          <ul className="p2r-list">
            {shown.map(({ line, i }) => {
              const k = `${S.mode}:${i}`;
              const v = S.sel[k];
              const hasNum = line[G].includes("#");
              return (
                <li key={k} className={`p2r-mod${v ? (v.w ? " is-want" : " is-avoid") : ""}`}>
                  <div className="p2r-mod-t">
                    <span className="p2r-mod-n">{show(line[G], line.range, v?.w ? v.min : undefined)}</span>
                    <code className="p2r-mod-rx">{line.tok[G]}</code>
                  </div>
                  <div className="p2r-mod-a">
                    {hasNum && (
                      <input className="p2r-num" type="number" min={0} placeholder={t.min} aria-label={t.min}
                        value={v?.min ?? ""} onChange={(e) => setMin(k, e.target.value)} />
                    )}
                    <button type="button" className={`p2r-chip${v?.w ? " is-on" : ""}`} aria-pressed={!!v?.w} onClick={() => toggle(k, true)}>{t.want}</button>
                    <button type="button" className={`p2r-chip is-no${v && !v.w ? " is-on" : ""}`} aria-pressed={!!v && !v.w} onClick={() => toggle(k, false)}>{t.avoid}</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="p2-panel p2r-out">
          <div className="p2-plate-head is-small"><h2 className="p2-plate">{t.out}</h2></div>
          <div className="p2r-out-in">
            <output className={`p2r-rx${regex ? "" : " is-empty"}`}>{regex || t.empty}</output>
            <div className={`p2r-meter${n > MAX_CHARS ? " is-over" : ""}`}>
              <div className="p2r-meter-t"><div className="p2r-meter-f" style={{ width: `${Math.min(100, (n / MAX_CHARS) * 100)}%` }} /></div>
              <span>{n > MAX_CHARS ? t.over : t.chars(n)}</span>
            </div>
            <div className="p2r-btns">
              <button type="button" className="p2r-btn is-gold" disabled={!regex} onClick={() => copy(regex, t.copied)}>{flash === t.copied ? t.copied : t.copy}</button>
              <button type="button" className="p2r-btn" onClick={() => copy(window.location.href, t.linkCopied)}>{flash === t.linkCopied ? t.linkCopied : t.link}</button>
              <button type="button" className="p2r-btn" onClick={() => set({ sel: {}, tier: [1, 16], corr: "any", rar: [], head: {} })}>{t.clear}</button>
            </div>
            {!!chosen.length && (
              <div className="p2r-chosen" aria-label={t.selected}>
                {chosen.map(([k, v]) => {
                  const line = pool[Number(k.split(":")[1])];
                  if (!line) return null;
                  return (
                    <button key={k} type="button" className={`p2r-tag${v.w ? "" : " is-no"}`} onClick={() => toggle(k, v.w)} title="×">
                      {v.w ? "" : "✕ "}{show(line[G], null, v.min)}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="p2r-how">
              <h3>{t.howTitle}</h3>
              <ol>{t.how.map((h, i) => <li key={i}>{h}</li>)}</ol>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
