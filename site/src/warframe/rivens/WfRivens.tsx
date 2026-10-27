/**
 * La pestaña Rivens de Warframe (2026-10-27, etapa 3): cuánto puede valer cada stat de un Riven a rango 8.
 *
 * - Un buscador de arma (o los 7 tipos de Riven) y, con el arma elegida, el aviso de que desde el Hotfix 44.1.3 no hay
 *   disposición (con el valor del export, sin puntos).
 * - La tabla de cada stat con su mínimo y máximo en las cuatro combinaciones (2 o 3 positivos, con o sin negativo); en el
 *   teléfono, una tarjeta por stat.
 * - "¿Qué tan buena salió mi tirada?": stat + combinación + valor → % dentro de su rango.
 *
 * El arma vive en la dirección (`?w=<slug>`) y se lee después del primer dibujo, como en el armador: el prerender sale sin
 * arma y la hidratación coincide. Las cuentas son las de `riven.ts`; acá sólo se muestran.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import { LazyRows, skipSprite } from "../../LazyRows";
import type { Route } from "../../route";
import { useLoad } from "../../useLoad";
import { useWfCopy } from "../../warframeCopy";
import { fold, loadRivens, peekRivens, say, type Lang, type RivenData, type RivenStat, type RivenType, type RivenWeapon } from "../data";
import { Icon, Panel, WfLoading, type Nav } from "../ui";
import { COMBOS, rivenFromShown, rivenGrade, rivenRange, rivenShown, rivenToShown, type Combo } from "./riven";

/** El alto de una fila de la lista de armas con su separación, en px, medido en el navegador (2026-10-27). */
const ROW = 50;
const CHUNK = 40;
/** La disposición cuando no hay arma elegida y el tipo no la trae: hoy es la misma para todas. */
const D_DEFAULT = 1.2;

export default function WfRivens(_props: { route: Route; navigate: Nav }) {
  const data = useLoad("rivens", () => peekRivens() ?? undefined, () => loadRivens());
  if (data.failed) return <WfLoading onRetry={data.retry} />;
  if (!data.value) return <WfLoading />;
  return <Rivens data={data.value} />;
}

/** Lo elegido: un arma (que trae su tipo) o sólo un tipo. */
type Sel = { type: string; weapon?: RivenWeapon };

function Rivens({ data }: { data: RivenData }) {
  const t = useWfCopy();
  const c = t.rivens;
  const { lang } = useLang();
  const [sel, setSel] = useState<Sel | null>(null);
  const [picking, setPicking] = useState(false);
  // El `?w=` de una dirección vieja o mal escrita: se dice en vez de mostrar rangos.
  const [missing, setMissing] = useState<string | null>(null);
  // Hasta leer la dirección no se escribe: si no, el primer dibujo (sin arma) la borraría.
  const ready = useRef(false);

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("w");
    if (slug) {
      const w = data.weapons.find((x) => x.slug === slug);
      if (w) setSel({ type: w.type, weapon: w });
      else setMissing(slug);
    }
    ready.current = true;
  }, [data]);

  useEffect(() => {
    if (!ready.current) return;
    const url = window.location.pathname + (sel?.weapon ? `?w=${sel.weapon.slug}` : "");
    if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, "", url);
  }, [sel]);

  const type = sel ? data.types.find((x) => x.key === sel.type) : undefined;
  // La disposición sale del arma; con sólo un tipo, de la primera arma de ese tipo (hoy es igual para todas).
  const d = sel?.weapon?.d ?? data.weapons.find((w) => w.type === sel?.type)?.d ?? D_DEFAULT;
  const choose = (s: Sel) => {
    setSel(s);
    setMissing(null);
    setPicking(false);
  };

  return (
    <main className="wf-main wf-rv">
      <Panel className="wf-rv-intro">
        <p className="wf-kicker">{t.tabs.rivens}</p>
        <h1 className="wf-h1">{c.h1}</h1>
        <p className="wf-lede">{c.lede}</p>
      </Panel>

      <Panel>
        {missing && (
          <p className="wf-rv-missing" role="status">
            {c.noRiven(missing)}
          </p>
        )}
        {sel && type && <Head sel={sel} type={type} d={d} picking={picking} setPicking={setPicking} lang={lang} />}
        {(!sel || picking) && <Picker data={data} onPick={choose} lang={lang} current={sel?.weapon?.slug} />}
      </Panel>

      {sel && type && (
        <>
          <Ranges type={type} d={d} />
          <Roll key={type.key} type={type} d={d} lang={lang} />
        </>
      )}
    </main>
  );
}

/** El arma (o el tipo) elegida, con el aviso de la disposición. */
function Head({ sel, type, d, picking, setPicking, lang }: { sel: Sel; type: RivenType; d: number; picking: boolean; setPicking: (b: boolean) => void; lang: Lang }) {
  const c = useWfCopy().rivens;
  const locale = useLocale();
  return (
    <div className="wf-rv-head">
      {sel.weapon ? <Icon img={sel.weapon.icon} size={64} lazy={false} /> : <span />}
      <div>
        <h2 className="wf-rv-name">{sel.weapon ? say(sel.weapon.name, lang) : say(type.name, lang)}</h2>
        <p className="wf-rv-sub">{c.typeOf(say(type.name, lang))}</p>
      </div>
      <button type="button" className="wf-btn" aria-pressed={picking} onClick={() => setPicking(!picking)}>
        {c.change}
      </button>
      <p className="wf-rv-notice">{c.notice(d.toLocaleString(locale))}</p>
    </div>
  );
}

function Picker({ data, onPick, lang, current }: { data: RivenData; onPick: (s: Sel) => void; lang: Lang; current?: string }) {
  const c = useWfCopy().rivens;
  const [query, setQuery] = useState("");
  const sorted = useMemo(() => [...data.weapons].sort((a, b) => say(a.name, lang).localeCompare(say(b.name, lang), lang)), [data, lang]);
  const q = fold(query.trim());
  const shown = useMemo(() => (q ? sorted.filter((w) => fold(w.name[0]).includes(q) || fold(w.name[1]).includes(q)) : []), [sorted, q]);
  const typeName = useMemo(() => new Map(data.types.map((x) => [x.key, x.name])), [data]);
  return (
    <div className="wf-rv-picker">
      <label className="wf-find">
        <span className="wf-label">{c.pick}</span>
        <input type="search" value={query} placeholder={c.searchPlaceholder} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
      </label>
      {q !== "" && (
        <>
          <p className="wf-count" aria-live="polite">
            {shown.length ? c.count(shown.length.toLocaleString(lang)) : c.none}
          </p>
          <ul className="wf-bd-list">
            <LazyRows
              items={shown}
              rowHeight={ROW}
              chunk={CHUNK}
              tag="li"
              // Se abre al escribir (nunca al cargar la página): la primera tanda va ya, así no parpadea vacía.
              eager
              margin={300}
              render={(w, i) => (
                <li key={w.slug}>
                  <button type="button" className={`wf-bd-item${w.slug === current ? " is-on" : ""}`} onClick={() => onPick({ type: w.type, weapon: w })}>
                    {skipSprite(i, CHUNK) ? <Icon img={null} size={36} /> : <Icon img={w.icon} size={36} />}
                    <b>{say(w.name, lang)}</b>
                    <small>{say(typeName.get(w.type) ?? ["", ""], lang)}</small>
                  </button>
                </li>
              )}
            />
          </ul>
        </>
      )}
      <div className="wf-chips" role="group" aria-label={c.typesLabel}>
        <span className="wf-label">{c.typesLabel}</span>
        {data.types.map((x) => (
          <button type="button" className="wf-pill" key={x.key} onClick={() => onPick({ type: x.key })}>
            {say(x.name, lang)}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- La tabla de rangos ---------- */

/** Una cifra con dos decimales, según el idioma. */
const useNum = () => {
  const locale = useLocale();
  return (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** `[mínimo, máximo]` como lo escribe el juego para ese stat: `160,37 – 196,01 %` o `×1,30 – ×1,45`. */
function useRange() {
  const num = useNum();
  return (s: RivenStat, d: number, combo: Combo, curse: boolean): string => {
    const [lo, hi] = rivenRange(s.value, d, combo, curse, 8).map((v) => rivenToShown(s.tag, v));
    return rivenShown(s.tag) === "factor" ? `×${num(lo)} – ×${num(hi)}` : `${num(lo)} – ${num(hi)} %`;
  };
}

function Ranges({ type, d }: { type: RivenType; d: number }) {
  const c = useWfCopy().rivens;
  const { lang } = useLang();
  const range = useRange();
  return (
    <Panel className="wf-rv-ranges">
      <h2 className="wf-h2">{c.rangeH}</h2>
      <div className="wf-table-wrap">
        <table className="wf-bd-table wf-rv-table">
          <thead>
            <tr>
              <th>{c.stat}</th>
              {COMBOS.map((k) => (
                <th key={k}>{c.combos[k]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {type.stats.map((s) => (
              <tr key={s.tag}>
                <td>{say(s.name, lang)}</td>
                {COMBOS.map((k) => (
                  <td key={k} data-label={c.combos[k]}>
                    <span className="is-pos">{range(s, d, k, false)}</span>
                    {k.endsWith("-") && <span className="is-neg wf-down">{range(s, d, k, true)}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="wf-bd-note wf-dim">{c.rangeNote}</p>
    </Panel>
  );
}

/* ---------- ¿Qué tan buena salió? ---------- */

function Roll({ type, d, lang }: { type: RivenType; d: number; lang: Lang }) {
  const c = useWfCopy().rivens;
  const locale = useLocale();
  const range = useRange();
  const [tag, setTag] = useState(type.stats[0].tag);
  const [combo, setCombo] = useState<Combo>("2");
  const [curse, setCurse] = useState(false);
  const [text, setText] = useState("");
  const stat = type.stats.find((s) => s.tag === tag) ?? type.stats[0];
  const neg = combo.endsWith("-") && curse;
  const typed = text.trim() === "" ? null : Number(text.trim().replace(",", ".").replace("−", "-"));
  const grade = typed !== null && Number.isFinite(typed) ? rivenGrade(stat.value, d, combo, neg, rivenFromShown(stat.tag, typed)) : null;
  const out = typed !== null && grade === null;
  return (
    <Panel className="wf-rv-roll">
      <h2 className="wf-h2">{c.rollH}</h2>
      <p className="wf-rv-rolllede">{c.rollLede}</p>
      <div className="wf-rv-form">
        <label className="wf-find">
          <span className="wf-label">{c.rollStat}</span>
          <select value={stat.tag} onChange={(e) => setTag(e.target.value)}>
            {type.stats.map((s) => (
              <option value={s.tag} key={s.tag}>
                {say(s.name, lang)}
              </option>
            ))}
          </select>
        </label>
        <label className="wf-find">
          <span className="wf-label">{c.rollCombo}</span>
          <select
            value={combo}
            onChange={(e) => {
              const k = e.target.value as Combo;
              setCombo(k);
              if (!k.endsWith("-")) setCurse(false);
            }}
          >
            {COMBOS.map((k) => (
              <option value={k} key={k}>
                {c.combos[k]}
              </option>
            ))}
          </select>
        </label>
        <div className="wf-find">
          <span className="wf-label">{c.rollSide}</span>
          <div className="wf-chips" role="group" aria-label={c.rollSide}>
            <button type="button" className={`wf-pill${!neg ? " is-on" : ""}`} aria-pressed={!neg} onClick={() => setCurse(false)}>
              {c.positive}
            </button>
            <button type="button" className={`wf-pill${neg ? " is-on" : ""}`} aria-pressed={neg} disabled={!combo.endsWith("-")} onClick={() => setCurse(true)}>
              {c.negative}
            </button>
          </div>
        </div>
        <label className="wf-find">
          <span className="wf-label">{c.rollValue}</span>
          <input type="text" inputMode="decimal" value={text} placeholder={c.rollPlaceholder} autoComplete="off" onChange={(e) => setText(e.target.value)} />
        </label>
      </div>
      <div className="wf-rv-result" aria-live="polite">
        {grade !== null ? (
          <>
            <b className="wf-rv-grade">{grade.toLocaleString(locale, { maximumFractionDigits: 0 })} %</b>
            <span>{c.rollResult}</span>
          </>
        ) : out ? (
          <span className="wf-down">{c.rollOut}</span>
        ) : null}
        <small className="wf-dim">
          {c.rollRange}: {range(stat, d, combo, neg)}
        </small>
      </div>
    </Panel>
  );
}
