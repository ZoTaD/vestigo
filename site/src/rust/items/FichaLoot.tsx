/**
 * Dónde aparece un objeto de Rust y qué trae uno que se abre (2026-10-05). Las fuentes son cajas, NPC, objetos que se
 * abren (regalos, bolsas, huevos) y cosas del suelo; cada fila dice cuál es con una etiqueta, y si es de un evento. La
 * cantidad cuenta todas las tiradas de la fuente, y el estado sólo se muestra si el objeto tiene condición.
 *
 * Cada fuente enlaza su ficha en Cajas (2026-10-06), con lo demás que puede dar; la de un objeto que se abre sigue
 * enlazando la ficha de ese objeto. Los slugs de Cajas salen de `loot.json`, que se pide aparte: hasta que llega, los
 * nombres van sin enlace.
 */
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { useLoad } from "../../useLoad";
import { loadCrates, peekCrates } from "../crates/data";
import { say, type Ficha } from "./data";
import { condText, formatChance } from "./format";
import { Icon, RefLink, type Nav } from "./parts";

type Props = { ficha: Ficha; route: Route; navigate: Nav };

export function LootSection({ ficha, route, navigate }: Props) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const crates = useLoad(ficha.loot.length ? "crates" : null, () => peekCrates() ?? undefined, loadCrates).value;
  if (!ficha.loot.length) return null;
  const withCond = ficha.loot.some((l) => l.cond);
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.loot}</h2>
      <p className="rs-ficha-note">{t.lootNote}</p>
      <table className="rs-table rs-loot">
        <thead>
          <tr>
            <th scope="col">{t.lootBox}</th>
            <th scope="col">{t.lootAmount}</th>
            <th scope="col">{t.lootChance}</th>
            {withCond && <th scope="col">{t.lootCond}</th>}
          </tr>
        </thead>
        <tbody>
          {ficha.loot.map((l) => (
            <tr key={`${l.c}-${l.bp}`}>
              <th scope="row">
                {l.item ? (
                  <RefLink r={l.item} route={route} navigate={navigate}>
                    {say(l.name, lang)}
                  </RefLink>
                ) : crates?.byKey.has(l.c) ? (
                  <RouteLink className="rs-ref" to={{ ...route, view: "rust", rsSection: "crates", detail: crates.byKey.get(l.c)!.slug }} onNavigate={navigate}>
                    {say(l.name, lang)}
                  </RouteLink>
                ) : (
                  say(l.name, lang)
                )}
                {l.kind !== "box" && <em className="rs-tag">{t.kinds[l.kind]}</em>}
                {l.event && <em className="rs-tag">{t.events[l.event]}</em>}
                {l.bp && <em className="rs-tag">{t.blueprint}</em>}
              </th>
              <td>{l.min === l.max ? `× ${num(l.min)}` : `× ${num(l.min)}–${num(l.max)}`}</td>
              <td>{formatChance(l.chance, locale)}</td>
              {withCond && <td>{l.cond ? condText(l.cond, t.pct) : "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function ContentsSection({ ficha, route, navigate }: Props) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  if (!ficha.contents.length) return null;
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.contents}</h2>
      <table className="rs-table">
        <thead>
          <tr>
            <th scope="col">{t.recycledItem}</th>
            <th scope="col">{t.lootAmount}</th>
            <th scope="col">{t.lootChance}</th>
          </tr>
        </thead>
        <tbody>
          {ficha.contents.map((c) => (
            <tr key={`${c.id}-${c.bp}`}>
              <th scope="row">
                <RefLink r={c} route={route} navigate={navigate}>
                  <Icon id={c.id} size={28} />
                  <span>{say(c.name, lang)}</span>
                </RefLink>
                {c.bp && <em className="rs-tag">{t.blueprint}</em>}
              </th>
              <td>{c.min === c.max ? `× ${num(c.min)}` : `× ${num(c.min)}–${num(c.max)}`}</td>
              <td>{formatChance(c.chance, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
