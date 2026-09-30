/**
 * Bases (2026-09-29): todas las armas y armaduras que pueden caer, por
 * categoría, con sus tres niveles (normal, excepcional, élite), defensa o daño,
 * requisitos y engarces máximos. Es la tabla que se mira para elegir dónde
 * armar una palabra rúnica.
 *
 * Los engarces máximos son los de la base, topeados por los de su tipo con un
 * nivel de objeto alto (`MaxSockets3` de itemtypes): una armadura de mago
 * nunca sale con más de 4 aunque su base diga otra cosa.
 */
import { useMemo, useState } from "react";
import { useLang, useLocale } from "../i18n";
import type { Route } from "../route";
import { useD2rCopy } from "../d2rCopy";
import { BASES, TYPES, catName, tr, type Base } from "./wiki";
import { CATEGORY_ORDER, groupOf } from "./items";
import { Chips, D2Head, ItemIcon, SearchBox, fold } from "./ui";

type Group = "armor" | "weapon";
type Tier = "all" | "n" | "x" | "e";

/** Los engarces que puede tener de verdad una base. */
export function maxSockets(b: Base): number {
  const cap = TYPES[b.type]?.sockets?.[2];
  return cap ? Math.min(b.sockets, cap) : b.sockets;
}

const LIST = BASES.filter((b) => b.kind !== "misc" && b.spawnable && b.cat);

export default function D2rBases(_: { route: Route; navigate: (r: Route) => void }) {
  const t = useD2rCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const [group, setGroup] = useState<Group>("armor");
  const [tier, setTier] = useState<Tier>("all");
  const [q, setQ] = useState("");

  const byCat = useMemo(() => {
    const needle = fold(q.trim());
    const map = new Map<string, Base[]>();
    for (const b of LIST) {
      if (groupOf(b.cat) !== group) continue;
      if (tier !== "all" && b.tier !== tier) continue;
      if (needle && !fold(b.name.en).includes(needle) && !fold(b.name.es).includes(needle)) continue;
      map.set(b.cat!, [...(map.get(b.cat!) ?? []), b]);
    }
    const order = (c: string) => (CATEGORY_ORDER.includes(c) ? CATEGORY_ORDER.indexOf(c) : 999);
    return [...map.entries()].sort((a, b) => order(a[0]) - order(b[0])).map(([c, bs]) => [c, bs.sort((a, b) => a.req.lvl - b.req.lvl || a.lvl - b.lvl)] as const);
  }, [group, tier, q]);

  const tierName = (b: Base) => (b.tier ? t.basesTab.tier[b.tier] : "");
  const dmgText = (b: Base) => {
    const d = b.dmg ?? {};
    const parts: string[] = [];
    if (d.one && b.hands !== 2) parts.push(`${d.one[0]}-${d.one[1]}${d.two ? ` ${t.basesTab.oneHand}` : ""}`);
    if (d.two) parts.push(`${d.two[0]}-${d.two[1]} ${t.basesTab.twoHand}`);
    if (d.throw) parts.push(`${d.throw[0]}-${d.throw[1]}`);
    return parts.join(" · ");
  };

  return (
    <>
      <D2Head as="h1" title={t.tabs.bases} lede={t.basesTab.lede} />
      <div className="d2-filters">
        <SearchBox value={q} onChange={setQ} placeholder={t.wiki.search} />
        <Chips<Group>
          label={t.tabs.bases}
          value={group}
          onChange={setGroup}
          options={[
            { value: "armor", label: catName("armo", lang) },
            { value: "weapon", label: catName("weap", lang) },
          ]}
        />
        <Chips<Tier>
          label={t.basesTab.col.name}
          value={tier}
          onChange={setTier}
          options={[{ value: "all", label: t.wiki.all }, ...(["n", "x", "e"] as const).map((k) => ({ value: k, label: t.basesTab.tier[k] }))]}
        />
      </div>
      {byCat.map(([cat, bs]) => (
        <section className="d2-cat" key={cat}>
          <h2 className="d2-cat-h">
            {catName(cat, lang)} <small>{bs.length.toLocaleString(locale)}</small>
          </h2>
          <div className="d2-table-wrap">
            <table className="d2-table is-stack">
              <thead>
                <tr>
                  <th>{t.basesTab.col.name}</th>
                  <th>{group === "armor" ? t.basesTab.col.def : t.basesTab.col.dmg}</th>
                  {group === "weapon" && <th>{t.basesTab.col.speed}</th>}
                  {group === "armor" && <th>{t.basesTab.col.block}</th>}
                  <th>{t.basesTab.col.str}</th>
                  <th>{t.basesTab.col.dex}</th>
                  <th>{t.basesTab.col.lvl}</th>
                  <th>{t.basesTab.col.sockets}</th>
                </tr>
              </thead>
              <tbody>
                {bs.map((b) => (
                  <tr key={b.code}>
                    <th scope="row">
                      <span className="d2-table-name">
                        <ItemIcon asset={b.img} size="sm" />
                        <span>
                          <b>{tr(b.name, lang)}</b>
                          <small className={`d2-tier is-${b.tier}`}>{tierName(b)}</small>
                        </span>
                      </span>
                    </th>
                    <td data-label={group === "armor" ? t.basesTab.col.def : t.basesTab.col.dmg}>
                      {group === "armor" ? (b.def ? `${b.def[0]}-${b.def[1]}` : "—") : dmgText(b) || "—"}
                    </td>
                    {group === "weapon" && <td data-label={t.basesTab.col.speed}>{b.speed ?? 0}</td>}
                    {group === "armor" && <td data-label={t.basesTab.col.block}>{b.block ? `${b.block}%` : "—"}</td>}
                    <td data-label={t.basesTab.col.str}>{b.req.str || "—"}</td>
                    <td data-label={t.basesTab.col.dex}>{b.req.dex || "—"}</td>
                    <td data-label={t.basesTab.col.lvl}>{b.req.lvl || "—"}</td>
                    <td data-label={t.basesTab.col.sockets}>{maxSockets(b) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {byCat.length === 0 && <p className="d2-empty">{t.wiki.noResults}</p>}
    </>
  );
}
