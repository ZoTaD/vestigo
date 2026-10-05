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
