/**
 * La ficha de una fuente de botín de Rust (2026-10-06): qué es (caja, NPC, recolectable u objeto que se abre), si es de
 * un evento, si los objetos salen gastados, y la tabla de todo lo que puede dar con su ícono, la cantidad y la
 * probabilidad, de lo más probable a lo menos. Las cifras se escriben como en "Dónde aparece" de la ficha de un objeto
 * (`FichaLoot.tsx`), que es la misma tabla leída al revés.
 *
 * La élite da 146 filas y el científico 211: la tabla va de a tandas (`LazyRows`), y el prerender la escribe entera.
 */
import type { CSSProperties } from "react";
import { LazyRows } from "../../LazyRows";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { say } from "../items/data";
import { formatChance, longestWord } from "../items/format";
import { RefLink } from "../items/parts";
import { peekCrates } from "./data";
import { crateName, type CrateEntry, type CrateRow } from "./model";

type Nav = (r: Route) => void;

/** El alto de una fila con su ícono de 28 px (47 px medidos a 1.400 px de ancho), de respaldo hasta que se dibuja la primera tanda (que se mide sola). */
const RS_CRATE_ROW = 47;

export default function CrateFicha({ entry, rows, route, navigate }: { entry: CrateEntry; rows: CrateRow[]; route: Route; navigate: Nav }) {
  const r = useRustCopy();
  const t = r.crates;
  const it = r.items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const name = crateName(entry, lang, it.events);
  const opened = entry.item ? peekCrates()?.items.get(entry.item) : undefined;
  return (
    <main className="rs-main rs-ficha rs-crate-ficha">
      <RouteLink className="rs-back" to={{ ...route, view: "rust", rsSection: "crates", detail: undefined }} onNavigate={navigate}>
        ← {t.back}
      </RouteLink>
      <section className={`rs-pnl rs-ficha-top${opened ? "" : " rs-crate-top"}`}>
        {opened && (
          <span className="rs-slot rs-slot-big">
            <img src={`/rust/items/${opened.id}.webp`} alt="" width={128} height={128} />
          </span>
        )}
        <div className="rs-title">
          <p className="rs-hd">
            {t.groups[entry.kind]}
            {entry.event && <em className="rs-tag">{it.events[entry.event]}</em>}
          </p>
          <h1 className="rs-h1" style={{ "--rs-word": longestWord(name) } as CSSProperties}>
            {name}
          </h1>
          <p className="rs-lede">{t.drops[entry.kind](entry.n, num(entry.n))}</p>
          {entry.worn !== "none" && <p className="rs-ficha-note">{t.worn[entry.worn]}</p>}
          {opened && (
            <RouteLink className="rs-btn" to={{ ...route, view: "rust", rsSection: "items", detail: opened.slug }} onNavigate={navigate}>
              {t.openItem}
            </RouteLink>
          )}
        </div>
      </section>
      <section className="rs-pnl">
        <h2 className="rs-hd">{t.table}</h2>
        <p className="rs-ficha-note">{t.note}</p>
        <table className="rs-table rs-crate-table">
          <thead>
            <tr>
              <th scope="col">{t.item}</th>
              <th scope="col">{it.lootAmount}</th>
              <th scope="col">{it.lootChance}</th>
            </tr>
          </thead>
          <tbody>
            <LazyRows items={rows} rowHeight={RS_CRATE_ROW} tag="tr" eager render={(row) => (
              <tr key={`${row.id}-${row.bp}`}>
                <th scope="row">
                  <RefLink r={row} route={route} navigate={navigate}>
                    <img src={`/rust/items/${row.id}.webp`} alt="" width={28} height={28} loading="lazy" decoding="async" />
                    <span>{say(row.name, lang)}</span>
                  </RefLink>
                  {row.bp && <em className="rs-tag">{it.blueprint}</em>}
                </th>
                <td>{row.min === row.max ? `× ${num(row.min)}` : `× ${num(row.min)}–${num(row.max)}`}</td>
                <td>{formatChance(row.chance, locale)}</td>
              </tr>
            )} />
          </tbody>
        </table>
      </section>
    </main>
  );
}
