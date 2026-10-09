/**
 * Lo que aparece en un monumento de Rust (2026-10-09): las cajas y barriles, los NPC y lo que se junta del suelo, con
 * cuántos hay con el monumento lleno. Cada caja o NPC se abre y muestra su botín, que la ficha baja recién entonces
 * (`monuments-loot.json`), así el HTML de la ficha no carga cientos de filas que nadie abrió.
 */
import { useEffect, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import { LazyRows } from "../../LazyRows";
import type { Route } from "../../route";
import { formatChance } from "../items/format";
import { Icon, RefLink, type Nav } from "../items/parts";
import { useMonumentsCopy } from "./copy";
import { loadMonumentLoot, peekMonumentLoot, say, type Monument, type MonumentLoot, type Monuments, type SpawnRow } from "./data";

/** El alto de una fila de la tabla de botín, medido en el navegador. */
const LOOT_ROW = 47;

type Props = { d: Monuments; m: Monument; route: Route; navigate: Nav };

/** "6" si es fijo; "0–26" si cambia. */
export function spawnCount(r: { lo: number; hi: number }, num: (n: number) => string): string {
  return r.lo === r.hi ? num(r.hi) : `${num(r.lo)}–${num(r.hi)}`;
}

/** El promedio con una cifra decimal debajo de 10 y sin decimales arriba; `null` si el número es fijo. */
export function spawnAverage(r: { lo: number; hi: number; avg: number }, locale: string): string | null {
  if (r.lo === r.hi) return null;
  return r.avg.toLocaleString(locale, { maximumFractionDigits: r.avg < 10 ? 1 : 0 });
}

export function MonumentSpawns({ d, m, route, navigate }: Props) {
  const t = useMonumentsCopy().spawns;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const sp = m.spawns;
  const notes = (
    <>
      {sp.respawn && <p className="rs-note">{t.respawn(sp.respawn[0], sp.respawn[1])}</p>}
      {m.spawnsByTier && <p className="rs-note">{t.byTier}</p>}
      {m.variants > 1 && <p className="rs-note">{t.variants}</p>}
    </>
  );
  return (
    <>
      {sp.loot.length > 0 && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.lootTitle}</h2>
          <p className="rs-farm-p">{t.note}</p>
          <ul className="rs-mon-srcs">
            {sp.loot.map((r) => (
              <SourceRow key={`${r.id}-${r.power ? 1 : 0}`} d={d} r={r} route={route} navigate={navigate} />
            ))}
          </ul>
          {notes}
        </section>
      )}
      {sp.npc.length > 0 && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.npcTitle}</h2>
          <ul className="rs-mon-srcs">
            {sp.npc.map((r) => (
              <SourceRow key={r.id} d={d} r={r} route={route} navigate={navigate} />
            ))}
          </ul>
          {!sp.loot.length && notes}
        </section>
      )}
      {sp.pickup.length > 0 && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.pickupTitle}</h2>
          <ul className="rs-farm-compost">
            {sp.pickup.map((p) => (
              <li key={p.item.id}>
                <RefLink r={p.item} route={route} navigate={navigate}>
                  <Icon id={p.item.id} size={32} />
                  <span>{say(p.item.name, lang)}</span>
                </RefLink>
                <b>{spawnCount(p, num)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function SourceRow({ d, r, route, navigate }: { d: Monuments; r: SpawnRow; route: Route; navigate: Nav }) {
  const t = useMonumentsCopy().spawns;
  const { lang } = useLang();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const src = d.sources[r.id];
  if (!src) return null;
  const avg = spawnAverage(r, locale);
  const head = (
    <>
      <span className="rs-mon-src-name">
        {say({ en: src.en, es: src.es }, lang)}
        {r.power && <em className="rs-tag">{t.power}</em>}
        {src.event && <em className="rs-tag">{t.events[src.event] ?? src.event}</em>}
      </span>
      <span className="rs-mon-src-n">
        <b>{spawnCount(r, (n) => n.toLocaleString(locale))}</b>
        {avg && <span className="rs-dim">{t.about(avg)}</span>}
      </span>
    </>
  );
  if (!src.loot) {
    return (
      <li>
        <div className="rs-mon-src-head">{head}</div>
      </li>
    );
  }
  return (
    <li>
      <details onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="rs-mon-src-head">{head}</summary>
        {open && <LootTable id={r.id} route={route} navigate={navigate} />}
      </details>
    </li>
  );
}

function LootTable({ id, route, navigate }: { id: string; route: Route; navigate: Nav }) {
  const t = useMonumentsCopy().spawns;
  const tb = useMonumentsCopy().blueprint;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const [loot, setLoot] = useState<MonumentLoot | null>(peekMonumentLoot);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (loot) return;
    let alive = true;
    loadMonumentLoot().then(
      (x) => alive && setLoot(x),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [loot]);
  if (failed) return <p className="rs-note">{t.failed}</p>;
  if (!loot) return <p className="rs-note">{t.loading}</p>;
  const rows = loot.tables[id] ?? [];
  if (!rows.length) return <p className="rs-note">{t.noLoot}</p>;
  return (
    <div className="rs-mon-loot">
      <table className="rs-table rs-loot">
        <thead>
          <tr>
            <th scope="col">{t.item}</th>
            <th scope="col">{t.amount}</th>
            <th scope="col">{t.chance}</th>
          </tr>
        </thead>
        <tbody>
          <LazyRows
            items={rows}
            rowHeight={LOOT_ROW}
            tag="tr"
            chunk={40}
            render={([sid, chance, lo, hi, bp]) => {
              const it = loot.items[sid] ?? { slug: null, name: { en: sid, es: null } };
              return (
                <tr key={`${sid}-${bp ? 1 : 0}`}>
                  <th scope="row">
                    <RefLink r={{ id: sid, ...it }} route={route} navigate={navigate}>
                      <Icon id={sid} size={28} />
                      <span>{say(it.name, lang)}</span>
                    </RefLink>
                    {bp && <em className="rs-tag">{tb}</em>}
                  </th>
                  <td>{lo === hi ? `× ${num(lo)}` : `× ${num(lo)}–${num(hi)}`}</td>
                  <td>{formatChance(chance, locale)}</td>
                </tr>
              );
            }}
          />
        </tbody>
      </table>
      <p className="rs-note">{t.tableNote}</p>
    </div>
  );
}
