/**
 * Las secciones de la ficha de Rust que no son crafteo, reciclaje ni botín (2026-10-05): lo que hace al usarlo y la
 * reparación. Más adelante: se obtiene de, se convierte en, construcción, qué lo detecta y skins. Cada una devuelve
 * `null` si no hay nada que mostrar.
 */
import { useLang, useLocale } from "../../i18n";
import type { Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { say, type Ficha } from "./data";
import { formatDuration } from "./format";
import { Icon, RefLink, type Nav } from "./parts";

type Props = { ficha: Ficha; route: Route; navigate: Nav };

/** "+20" o "−10" (con el signo menos tipográfico). */
function signed(n: number, num: (n: number) => string): string {
  return `${n > 0 ? "+" : "−"}${num(Math.abs(n))}`;
}

export function UseSection({ ficha, route, navigate }: Props) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const u = ficha.use;
  if (!u) return null;
  const mods = u.mods;
  if (!u.effects.length && !mods.length && !u.spoil) return null;
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.use}</h2>
      {(u.effects.length > 0 || mods.length > 0) && (
        <dl className="rs-facts">
          {u.effects.map((e, i) => (
            <div key={i}>
              <dt>{t.stats[e.stat]}</dt>
              <dd>
                {signed(e.amount, num)}
                {e.time > 0 && ` · ${t.overTime(formatDuration(e.time))}`}
              </dd>
            </div>
          ))}
          {mods.map((m, i) => (
            <div key={i}>
              <dt>{t.mods[m.stat]}</dt>
              <dd>{t.modRow(`${signed(Math.round(m.value * 100), (n) => t.pct(n))}`, formatDuration(m.duration))}</dd>
            </div>
          ))}
        </dl>
      )}
      {u.spoil && (
        <p className="rs-meta">
          <span>{(u.spoil.into ? t.spoilInto : t.spoil)(formatDuration(u.spoil.hours * 3600))}</span>
          {u.spoil.into && (
            <RefLink r={u.spoil.into} route={route} navigate={navigate}>
              {say(u.spoil.into.name, lang)}
            </RefLink>
          )}
        </p>
      )}
    </section>
  );
}

export function RepairSection({ ficha, route, navigate }: Props) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const r = ficha.repair;
  if (!r) return null;
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.repair}</h2>
      <p className="rs-ficha-note">{t.repairMax}</p>
      <ul className="rs-ings">
        {r.cost.map((g) => (
          <li key={g.id}>
            <RefLink r={g} route={route} navigate={navigate}>
              <span className="rs-slot">
                <Icon id={g.id} />
                <b className="rs-qty">{num(g.amount)}</b>
              </span>
              <span>{say(g.name, lang)}</span>
            </RefLink>
          </li>
        ))}
      </ul>
      <p className="rs-meta">
        <span>{t.repairLoss(num(Math.round(r.loss * 100)))}</span>
        {r.bp && <span>{t.repairBp}</span>}
      </p>
    </section>
  );
}
