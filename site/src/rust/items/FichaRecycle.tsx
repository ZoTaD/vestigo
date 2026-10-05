/**
 * El reciclaje de un objeto de Rust en las cuatro recicladoras (2026-10-05). Una fila por recicladora y no una columna:
 * cuatro columnas de "× 12 + 50 %" no entran a 375 px sin scroll. En cada fila, lo que sale seguro y la chance de uno
 * más (`recycle.ts`), con la chatarra fija escalada.
 */
import { useLang, useLocale } from "../../i18n";
import type { Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { say, type Ficha, type Ref } from "./data";
import { Icon, RefLink, type Nav } from "./parts";
import { recycleScrap, recycleYield, type RecycleYield } from "./recycle";

/** La chatarra no viene en `recycle.out` (se escala distinto): se nombra a mano, con su ficha. */
const SCRAP: Ref = { id: "scrap", slug: "scrap", name: { en: "Scrap", es: "Chatarra" } };

export default function RecycleSection({ ficha, route, navigate }: { ficha: Ficha; route: Route; navigate: Nav }) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const r = ficha.recycle;
  if (!r) return null;
  const yieldText = (y: RecycleYield) =>
    y.n === 0 ? t.chance(y.pct) : y.pct ? `× ${num(y.n)} + ${t.pct(y.pct)}` : `× ${num(y.n)}`;
  const chip = (ref: Ref, text: string) => (
    <RefLink r={ref} route={route} navigate={navigate}>
      <Icon id={ref.id} size={28} />
      <span>{say(ref.name, lang)}</span>
      <b>{text}</b>
    </RefLink>
  );
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.recycle}</h2>
      <table className="rs-table rs-recycle">
        <thead>
          <tr>
            <th scope="col">{t.recycler}</th>
            <th scope="col">{t.recycleGives}</th>
          </tr>
        </thead>
        <tbody>
          {r.eff.map(({ key, eff }) => (
            <tr key={key}>
              <th scope="row">
                {t.recyclers[key]} <span className="rs-dim">{t.pct(Math.round(eff * 100))}</span>
              </th>
              <td>
                <ul className="rs-yields">
                  {r.scrap > 0 && <li>{chip(SCRAP, `× ${num(recycleScrap(r.scrap, eff))}`)}</li>}
                  {r.out.map((o) => {
                    const y = recycleYield(o.amount, eff);
                    return y.n || y.pct ? <li key={o.id}>{chip(o, yieldText(y))}</li> : null;
                  })}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="rs-ficha-note">{t.recycleNote}</p>
    </section>
  );
}

/** Cuántas filas de "se obtiene reciclando" se ven de entrada: los fragmentos de metal tienen más de 300. */
export const RECYCLED_FIRST = 20;
/** Las dos recicladoras de esta tabla: las que más se usan (la de monumento y la de zona segura). */
const FROM_KEYS = ["green", "yellow"] as const;

/** Qué objetos dan éste al reciclarlos, con lo que da cada uno en la verde y en la amarilla. */
export function RecycledFrom({ ficha, route, navigate }: { ficha: Ficha; route: Route; navigate: Nav }) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const rf = ficha.recycledFrom;
  if (!rf) return null;
  const num = (n: number) => n.toLocaleString(locale);
  const cols = FROM_KEYS.map((k) => rf.eff.find((e) => e.key === k)).filter((e): e is NonNullable<typeof e> => !!e);
  const cell = (amount: number, scrap: boolean, eff: number) => {
    if (scrap) return `× ${num(recycleScrap(amount, eff))}`;
    const y = recycleYield(amount, eff);
    return y.n === 0 ? (y.pct ? t.chance(y.pct) : "—") : y.pct ? `× ${num(y.n)} + ${t.pct(y.pct)}` : `× ${num(y.n)}`;
  };
  const row = (r: (typeof rf.rows)[number]) => (
    <tr key={r.id}>
      <th scope="row">
        <RefLink r={r} route={route} navigate={navigate}>
          <Icon id={r.id} size={28} />
          <span>{say(r.name, lang)}</span>
        </RefLink>
      </th>
      {cols.map((c) => (
        <td key={c.key}>{cell(r.amount, r.scrap, c.eff)}</td>
      ))}
    </tr>
  );
  const head = (
    <thead>
      <tr>
        <th scope="col">{t.recycledItem}</th>
        {cols.map((c) => (
          <th scope="col" key={c.key}>
            {t.recyclers[c.key]}
          </th>
        ))}
      </tr>
    </thead>
  );
  const rest = rf.rows.slice(RECYCLED_FIRST);
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.recycledFrom}</h2>
      <table className="rs-table">
        {head}
        <tbody>{rf.rows.slice(0, RECYCLED_FIRST).map(row)}</tbody>
      </table>
      {rest.length > 0 && (
        // `<details>` nativo: sin JS igual se abre, el foco no se pierde y las filas siguen en el HTML para los buscadores.
        <details className="rs-more">
          <summary className="rs-btn">{t.showRest(num(rest.length))}</summary>
          <table className="rs-table">
            {head}
            <tbody>{rest.map(row)}</tbody>
          </table>
        </details>
      )}
    </section>
  );
}
