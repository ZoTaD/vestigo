/**
 * La ficha de un objeto de Rust (2026-10-05). Arriba, el ícono en su casillero, el nombre y la descripción oficiales y
 * los datos para copiar (shortname, itemid, comando de admin). Después, cada sección sólo si tiene algo: crafteo, se usa
 * en, reciclaje (en las dos recicladoras), dónde aparece y dónde comprarlo.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { say, type Ficha, type Ref } from "./data";
import { recycleYield } from "./recycle";

type Nav = (r: Route) => void;

export default function ItemFicha({ ficha, route, navigate }: { ficha: Ficha; route: Route; navigate: Nav }) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const name = say(ficha.name, lang);
  const desc = say(ficha.desc, lang);
  const link = (r: Ref, children: ReactNode) =>
    r.slug ? (
      <RouteLink className="rs-ref" to={{ ...route, view: "rust", rsSection: "items", detail: r.slug }} onNavigate={navigate}>
        {children}
      </RouteLink>
    ) : (
      <span className="rs-ref">{children}</span>
    );
  const icon = (id: string, size = 40) => <img src={`/rust/items/${id}.webp`} alt="" width={size} height={size} />;
  const command = `inventory.give ${ficha.id} 1`;
  const c = ficha.craft;
  const r = ficha.recycle;
  return (
    <main className="rs-main rs-ficha">
      <RouteLink className="rs-back" to={{ ...route, view: "rust", rsSection: "items", detail: undefined }} onNavigate={navigate}>
        ← {t.back}
      </RouteLink>
      <section className="rs-pnl rs-ficha-top">
        <span className="rs-slot rs-slot-big">{icon(ficha.id, 128)}</span>
        <div className="rs-title">
          <p className="rs-hd">{t.cats[ficha.cat] ?? ficha.cat}</p>
          <h1 className="rs-h1" style={{ "--rs-word": longestWord(name) } as CSSProperties}>
            {name}
          </h1>
          {desc && <p className="rs-lede">{desc}</p>}
        </div>
        <dl className="rs-facts">
          <Copyable label={t.shortname} value={ficha.id} />
          <Copyable label={t.itemid} value={String(ficha.itemid)} />
          <Copyable label={t.command} value={command} />
          <div>
            <dt>{t.stack}</dt>
            <dd>{num(ficha.stack)}</dd>
          </div>
          {ficha.condition && (
            <div>
              <dt>{t.condition}</dt>
              <dd>
                {num(ficha.condition.max)} · {ficha.condition.repairable ? t.repairable : t.notRepairable}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {c && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.craft}</h2>
          <ul className="rs-ings">
            {c.ingredients.map((g) => (
              <li key={g.id}>
                {link(g, <>
                  <span className="rs-slot">{icon(g.id)}<b className="rs-qty">{num(g.amount)}</b></span>
                  <span>{say(g.name, lang)}</span>
                </>)}
              </li>
            ))}
          </ul>
          <p className="rs-meta">
            <span>{t.gives(c.amount)}</span>
            <span>{t.seconds(num(c.time))}</span>
            <span>{c.workbench ? t.workbench(c.workbench) : t.noWorkbench}</span>
            {c.researchScrap !== null && <span>{t.research(num(c.researchScrap))}</span>}
            {c.default && <span>{t.defaultBp}</span>}
          </p>
        </section>
      )}

      {ficha.usedIn.length > 0 && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.usedIn}</h2>
          <ul className="rs-refs">
            {ficha.usedIn.map((u) => (
              <li key={u.id}>{link(u, <>{icon(u.id, 32)}<span>{say(u.name, lang)}</span></>)}</li>
            ))}
          </ul>
        </section>
      )}

      {r && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.recycle}</h2>
          <table className="rs-table">
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">{t.recycleMonument} ({Math.round(r.eff.monument * 100)} %)</th>
                <th scope="col">{t.recycleSafe} ({Math.round(r.eff.safezone * 100)} %)</th>
              </tr>
            </thead>
            <tbody>
              {r.scrap > 0 && (
                <tr>
                  <th scope="row">{link({ id: "scrap", slug: "scrap", name: { en: "Scrap", es: "Chatarra" } }, <>{icon("scrap", 28)}<span>{lang === "es" ? "Chatarra" : "Scrap"}</span></>)}</th>
                  <td>{num(r.scrap)}</td>
                  <td>{num(r.scrap)}</td>
                </tr>
              )}
              {r.out.map((o) => (
                <tr key={o.id}>
                  <th scope="row">{link(o, <>{icon(o.id, 28)}<span>{say(o.name, lang)}</span></>)}</th>
                  {[r.eff.monument, r.eff.safezone].map((eff, i) => {
                    const y = recycleYield(o.amount, eff);
                    return <td key={i}>{y.kind === "fixed" ? num(y.n) : t.chance(y.pct)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {ficha.loot.length > 0 && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.loot}</h2>
          <p className="rs-ficha-note">{t.lootNote}</p>
          <table className="rs-table">
            <thead>
              <tr>
                <th scope="col">{t.lootBox}</th>
                <th scope="col">{t.lootAmount}</th>
                <th scope="col">{t.lootChance}</th>
              </tr>
            </thead>
            <tbody>
              {ficha.loot.map((l) => (
                <tr key={`${l.c}-${l.bp}`}>
                  <th scope="row">
                    {say(l.name, lang)}
                    {l.bp && <em className="rs-tag">{t.blueprint}</em>}
                  </th>
                  <td>{l.min === l.max ? `× ${num(l.min)}` : `× ${num(l.min)}–${num(l.max)}`}</td>
                  <td>{formatChance(l.chance, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {ficha.shops.length > 0 && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.shops}</h2>
          <ul className="rs-shops">
            {ficha.shops.map((s, i) => (
              <li key={i}>
                <b>{say(s.shop, lang)}</b>
                <span>
                  {t.shopRow(s.amount, s.bp ? `${name} (${t.blueprint})` : name, s.price, say(s.currency.name, lang))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

/**
 * Cuántas letras tiene la palabra más larga del nombre. Con eso el título de la ficha baja lo justo para que esa palabra
 * entre entera en su columna (`rust-items.css`): "Transmisor de radiofrecuencia" no cabía a 375 px con el mínimo de
 * la portada, y las palabras no se cortan.
 */
function longestWord(name: string): number {
  return Math.max(1, ...name.split(/[\s-]+/).map((w) => [...w].length));
}

/** 0,0123 → "1,2 %"; por debajo de 0,1 % se dice "< 0,1 %" en vez de un cero que miente. */
function formatChance(p: number, locale: string): string {
  if (p >= 0.995) return "100 %";
  if (p < 0.001) return `< ${(0.1).toLocaleString(locale)} %`;
  const pct = p * 100;
  return `${pct.toLocaleString(locale, { maximumFractionDigits: pct < 10 ? 1 : 0 })} %`;
}

/** Un dato con botón de copiar. Sin JS (el prerender) se ve el texto, que se puede seleccionar igual. */
function Copyable({ label, value }: { label: string; value: string }) {
  const t = useRustCopy().items;
  const [done, setDone] = useState(false);
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <code>{value}</code>
        <button
          type="button"
          className="rs-copy"
          aria-label={`${t.copy}: ${label}`}
          onClick={() => {
            navigator.clipboard?.writeText(value).then(() => {
              setDone(true);
              window.setTimeout(() => setDone(false), 1500);
            }, () => undefined);
          }}
        >
          {done ? t.copied : t.copy}
        </button>
        {/* El botón cambia de texto pero conserva su `aria-label`: el aviso de "Copiado" va aparte, para el lector. */}
        <span className="rs-sr" aria-live="polite">
          {done ? t.copied : ""}
        </span>
      </dd>
    </div>
  );
}
