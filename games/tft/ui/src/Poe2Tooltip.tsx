import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

// En el prerender no hay ventana: ahí useLayoutEffect sólo avisa, una vez por página.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
import { useLang, type Lang } from "./i18n";
import { usePoe2Copy, type Poe2Copy } from "./poe2Copy";
import {
  loadEntry,
  levelText,
  nameOf,
  tx,
  type Base,
  type Cat,
  type Currency,
  type Entry,
  type Gem,
  type Txt,
  type Unique,
} from "./poe2EncyclopediaData";

/**
 * El tooltip del juego para cualquier ficha de la enciclopedia: la cabecera con
 * la textura de su rareza (gema, único, normal, moneda), los separadores del
 * juego y el texto en los colores del juego.
 *
 * Se usa de dos formas: quieto, grande, en la ficha (`<ItemTooltip />`), y
 * flotando junto al mouse en la lista y en el diario de parches (`useItemTip`).
 */

const RARITY: Record<Cat, string> = { gems: "gem", uniques: "unique", bases: "normal", currency: "currency" };

export function ItemTooltip({
  cat,
  entry,
  level = 1,
  floating,
  footer,
}: {
  cat: Cat;
  entry: Entry;
  level?: number;
  floating?: { x: number; y: number };
  footer?: ReactNode;
}) {
  const { lang } = useLang();
  const t = usePoe2Copy().enc;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useIsoLayoutEffect(() => {
    if (!floating) return;
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = floating.x + 22;
    if (left + w > window.innerWidth - 8) left = Math.max(8, floating.x - w - 22);
    const top = Math.max(8, Math.min(floating.y - h / 3, window.innerHeight - h - 8));
    setPos({ left, top });
  }, [floating?.x, floating?.y, entry]);

  let body: ReactNode = null;
  let base: string | null = null;
  if (cat === "gems") body = <GemBody g={entry as Gem} lang={lang} t={t} level={level} />;
  if (cat === "uniques") {
    const u = entry as Unique;
    base = u.base ? tx(u.base, lang) : null;
    body = <UniqueBody u={u} lang={lang} t={t} />;
  }
  if (cat === "bases") body = <BaseBody b={entry as Base} lang={lang} t={t} />;
  if (cat === "currency") body = <CurrencyBody c={entry as Currency} lang={lang} t={t} />;

  return (
    <div
      ref={ref}
      className={`p2-tt is-${RARITY[cat]}${floating ? "" : " is-static"}`}
      style={floating ? (pos ?? { left: floating.x + 22, top: floating.y, visibility: "hidden" }) : undefined}
      role={floating ? "tooltip" : undefined}
    >
      <div className="p2-tt-head">
        <div>{nameOf(entry, lang)}</div>
        {base && <div className="p2-tt-base">{base}</div>}
      </div>
      <div className="p2-tt-body">
        {body}
        {footer}
      </div>
    </div>
  );
}

/** Los bloques del tooltip van separados por el separador del juego, sin dejar uno colgando. */
function Blocks({ children }: { children: ReactNode[] }) {
  const parts = children.filter(Boolean);
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <div className="p2-tt-sep" />}
          {p}
        </Fragment>
      ))}
    </>
  );
}

const Lines = ({ lines, cls = "p2-tt-mod" }: { lines: string[]; cls?: string }) =>
  lines.length ? (
    <div>
      {lines.map((l, i) => (
        <div className={cls} key={i}>
          {l.split("\n").map((part, k) => (
            <div key={k}>{part}</div>
          ))}
        </div>
      ))}
    </div>
  ) : null;

function GemBody({ g, lang, t, level }: { g: Gem; lang: Lang; t: Poe2Copy["enc"]; level: number }) {
  const lv = Math.min(level, Math.max(1, g.nlev));
  const sets = g.sets.map((s) => ({
    label: s.label ? tx(s.label, lang) : null,
    lines: [
      ...s.levels.map((l) => levelText(lang === "es" ? l.es : l.en, lv)).filter((x): x is string => !!x),
      ...s.static.map((x) => tx(x, lang)),
    ],
  })).filter((s) => s.lines.length);
  return (
    <Blocks>
      {[
        <div key="h">
          {g.tags.length > 0 && <div className="p2-tt-tags">{g.tags.map((x) => tx(x, lang)).join(", ")}</div>}
          <div>
            <span className="p2-tt-k">{t.level}: </span>
            <span className="p2-tt-w">{lv}</span>
          </div>
          {g.cast ? (
            <div>
              <span className="p2-tt-k">{t.castTime}: </span>
              <span className="p2-tt-w">{t.seconds(fmt(g.cast / 1000, lang))}</span>
            </div>
          ) : null}
        </div>,
        tx(g.desc, lang) ? <div className="p2-tt-desc" key="d">{tx(g.desc, lang)}</div> : null,
        ...sets.map((s, i) => (
          <div key={`s${i}`}>
            {s.label && <div className="p2-tt-set">{s.label}</div>}
            <Lines lines={s.lines} />
          </div>
        )),
      ]}
    </Blocks>
  );
}

function UniqueBody({ u, lang, t }: { u: Unique; lang: Lang; t: Poe2Copy["enc"] }) {
  return (
    <Blocks>
      {[
        <div key="h">
          <div className="p2-tt-k">{tx(u.cls, lang)}</div>
          {u.lvl > 0 && (
            <div>
              <span className="p2-tt-k">{t.reqLevel} </span>
              <span className="p2-tt-w">{u.lvl}</span>
            </div>
          )}
        </div>,
        u.imps.length ? <Lines key="i" lines={u.imps.map((m) => tx(m, lang))} /> : null,
        u.mods.length ? <Lines key="m" lines={u.mods.map((m) => tx(m, lang))} /> : <div key="m" className="p2-tt-k is-small">{t.noMods}</div>,
        u.flavour ? <div className="p2-tt-flavour" key="f">{tx(u.flavour, lang)}</div> : null,
      ]}
    </Blocks>
  );
}

/** Las propiedades de una base como las escribe el juego: "Armadura: 178". */
export function baseProps(b: Base, lang: Lang, t: Poe2Copy["enc"]): [string, string][] {
  const p = b.props;
  const n = (v: number | [number, number] | undefined) => (Array.isArray(v) ? (v[0] === v[1] ? `${v[0]}` : `${v[0]}-${v[1]}`) : `${v}`);
  const out: [string, string][] = [];
  if (p.physical_damage_min != null) out.push([t.props.physical, `${p.physical_damage_min}-${p.physical_damage_max}`]);
  if (p.critical_strike_chance != null) out.push([t.props.crit, `${fmt((p.critical_strike_chance as number) / 100, lang)}%`]);
  if (p.attack_time != null) out.push([t.props.aps, fmt(1000 / (p.attack_time as number), lang)]);
  if (p.reload_time != null) out.push([t.props.reload, fmt((p.reload_time as number) / 1000, lang)]);
  if (p.range != null && b.group === "weapon") out.push([t.props.range, fmt((p.range as number) / 10, lang)]);
  if (p.block != null) out.push([t.props.block, `${p.block}%`]);
  if (p.armour != null) out.push([t.props.armour, n(p.armour)]);
  if (p.evasion != null) out.push([t.props.evasion, n(p.evasion)]);
  if (p.energy_shield != null) out.push([t.props.energy_shield, n(p.energy_shield)]);
  if (p.spirit != null) out.push([t.props.spirit, n(p.spirit)]);
  return out;
}

function flaskLines(b: Base, lang: Lang, t: Poe2Copy["enc"]): string[] {
  const p = b.props;
  const out: string[] = [];
  const amount = (p.life_per_use ?? p.mana_per_use) as number | undefined;
  if (amount != null && p.duration != null) {
    const what = p.life_per_use != null ? t.props.life : t.props.mana;
    out.push(t.props.recovers.replace("{0}", `${amount} ${what}`).replace("{1}", fmt((p.duration as number) / 10, lang)));
  }
  if (p.charges_per_use != null && p.charges_max != null)
    out.push(t.props.perUse.replace("{0}", `${p.charges_per_use}`).replace("{1}", `${p.charges_max}`));
  return out;
}

export function reqLine(req: Base["req"], t: Poe2Copy["enc"]): string | null {
  const parts: string[] = [];
  if (req.level) parts.push(`${t.level} ${req.level}`);
  for (const k of ["strength", "dexterity", "intelligence"] as const) if (req[k]) parts.push(`${req[k]} ${t.attrs[k]}`);
  return parts.length ? parts.join(", ") : null;
}

function BaseBody({ b, lang, t }: { b: Base; lang: Lang; t: Poe2Copy["enc"] }) {
  const props = baseProps(b, lang, t);
  const req = reqLine(b.req, t);
  return (
    <Blocks>
      {[
        <div key="p">
          <div className="p2-tt-k">{tx(b.cls, lang)}</div>
          {props.map(([k, v]) => (
            <div key={k}>
              <span className="p2-tt-k">{k}: </span>
              <span className="p2-tt-w">{v}</span>
            </div>
          ))}
          {flaskLines(b, lang, t).map((l) => <div key={l} className="p2-tt-w">{l}</div>)}
        </div>,
        req ? (
          <div key="r">
            <span className="p2-tt-k">{t.requires}: </span>
            <span className="p2-tt-w">{req}</span>
          </div>
        ) : null,
        b.implicits.length ? <Lines key="i" lines={b.implicits.map((m) => tx(m, lang))} /> : null,
      ]}
    </Blocks>
  );
}

function CurrencyBody({ c, lang, t }: { c: Currency; lang: Lang; t: Poe2Copy["enc"] }) {
  return (
    <Blocks>
      {[
        c.stack ? (
          <div key="s">
            <span className="p2-tt-k">{t.stack}: </span>
            <span className="p2-tt-w">1 / {c.stack}</span>
          </div>
        ) : null,
        c.lvl ? (
          <div key="l">
            <span className="p2-tt-k">{t.reqLevel} </span>
            <span className="p2-tt-w">{c.lvl}</span>
          </div>
        ) : null,
        c.desc ? <div className="p2-tt-w" key="d">{tx(c.desc, lang)}</div> : null,
        c.effects.length ? (
          <div key="e">
            {c.effects.map((e, i) => (
              <div key={i} className="p2-tt-eff">
                <span className="p2-tt-k">{tx(e.on, lang)}: </span>
                {e.lines.map((l, k) => <div className="p2-tt-mod" key={k}>{tx(l, lang)}</div>)}
              </div>
            ))}
          </div>
        ) : null,
        c.dirs ? <div className="p2-tt-k is-small" key="h">{tx(c.dirs, lang)}</div> : null,
      ]}
    </Blocks>
  );
}

function fmt(v: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === "es" ? "es-AR" : "en-US", { maximumFractionDigits: 2 }).format(v);
}

/**
 * El tooltip flotante por id (`gems/untether`): al pasar el mouse se pide la
 * categoría (una vez por visita) y se dibuja la ficha junto al puntero.
 */
export function useItemTip() {
  const [tip, setTip] = useState<{ cat: Cat; entry: Entry; x: number; y: number } | null>(null);
  const want = useRef<string | null>(null);
  const bind = useCallback(
    (id: string) => ({
      onMouseMove: (e: MouseEvent) => {
        const { clientX: x, clientY: y } = e;
        if (want.current === id) {
          setTip((cur) => (cur ? { ...cur, x, y } : cur));
          return;
        }
        want.current = id;
        loadEntry(id).then((hit) => {
          if (hit && want.current === id) setTip({ ...hit, x, y });
        });
      },
      onMouseLeave: () => {
        want.current = null;
        setTip(null);
      },
    }),
    [],
  );
  const node = tip ? <ItemTooltip cat={tip.cat} entry={tip.entry} floating={{ x: tip.x, y: tip.y }} /> : null;
  return { bind, node };
}

export type { Txt };
