/**
 * Zonas de Terror (2026-09-29): las 34 áreas que pueden quedar aterrorizadas,
 * por acto, con sus mapas, su waypoint y las inmunidades de sus monstruos en
 * Infierno (resistencia de 100 o más); arriba, el nivel de los monstruos en cada
 * dificultad y los Heraldos de Infierno. Todo de la configuración del juego
 * (`desecratedzones.json`).
 */
import { useMemo, useState } from "react";
import zonesJson from "@d2r/wiki/zones.json";
import { useLang, useLocale } from "../i18n";
import type { Route } from "../route";
import { useD2rCopy } from "../d2rCopy";
import type { Loc } from "./stats";
import { tr } from "./wiki";
import { Chips, D2Head, SearchBox, fold } from "./ui";

type Elem = "physical" | "magic" | "fire" | "light" | "cold" | "poison";
interface Zone {
  id: string;
  key: string;
  act: number;
  levels: { id: number; name: Loc }[];
  waypoint: Loc | null;
  monsters: { name: Loc; imm: Elem[] }[];
  immune: Record<Elem, number>;
}
interface ZonesFile {
  meta: {
    duration: number;
    diff: Record<"normal" | "nightmare" | "hell", { min: number; max: number; boost: number; xp: number }>;
    heralds: { tier: number; health: number; damage: number; minions: number; tc: number }[];
  };
  zones: Zone[];
}

const DATA = zonesJson as unknown as ZonesFile;
const ELEMS: Elem[] = ["fire", "cold", "light", "poison", "magic", "physical"];

export default function D2rZones(_: { route: Route; navigate: (r: Route) => void }) {
  const t = useD2rCopy();
  const tz = t.zones;
  const { lang } = useLang();
  const locale = useLocale();
  const [act, setAct] = useState(0);
  const [q, setQ] = useState("");
  const { meta, zones } = DATA;

  const shown = useMemo(() => {
    const needle = fold(q.trim());
    const has = (l: Loc) => fold(l.en).includes(needle) || fold(l.es).includes(needle);
    return zones.filter((z) => (!act || z.act === act) && (!needle || z.levels.some((l) => has(l.name)) || z.monsters.some((m) => has(m.name))));
  }, [act, q, zones]);

  return (
    <>
      <D2Head as="h1" title={t.tabs["terror-zones"]} lede={tz.lede(zones.length.toLocaleString(locale), meta.duration)} />

      <div className="d2-zone-info">
        <section>
          <h2 className="d2-h3">{tz.levelTitle}</h2>
          <dl className="d2-plan-kv">
            {(["normal", "nightmare", "hell"] as const).map((d) => (
              <div key={d}>
                <dt>{tz.diffs[d]}</dt>
                <dd>{tz.range(meta.diff[d].min, meta.diff[d].max)}</dd>
              </div>
            ))}
          </dl>
          <p className="d2-zone-note">{tz.boost(meta.diff.hell.boost, meta.diff.hell.xp)}</p>
        </section>
        {meta.heralds.length > 0 && (
          <section>
            <h2 className="d2-h3">{tz.heralds}</h2>
            <div className="d2-table-wrap">
              <table className="d2-table">
                <thead>
                  <tr>
                    <th>{tz.heraldCols.tier}</th>
                    <th>{tz.heraldCols.health}</th>
                    <th>{tz.heraldCols.damage}</th>
                    <th>{tz.heraldCols.minions}</th>
                    <th>{tz.heraldCols.tc}</th>
                  </tr>
                </thead>
                <tbody>
                  {meta.heralds.map((h) => (
                    <tr key={h.tier}>
                      <td>{h.tier}</td>
                      <td>+{h.health}%</td>
                      <td>+{h.damage}%</td>
                      <td>{h.minions}</td>
                      <td>{h.tc ? `+${h.tc}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      <div className="d2-filters">
        <SearchBox value={q} onChange={setQ} placeholder={t.wiki.search} />
        <Chips<number>
          label={t.tabs["terror-zones"]}
          value={act}
          onChange={setAct}
          options={[{ value: 0, label: t.wiki.all }, ...[1, 2, 3, 4, 5].map((n) => ({ value: n, label: tz.act(n) }))]}
        />
      </div>

      {[1, 2, 3, 4, 5].map((a) => {
        const inAct = shown.filter((z) => z.act === a);
        if (!inAct.length) return null;
        return (
          <section className="d2-cat" key={a}>
            <h2 className="d2-cat-h">{tz.act(a)}</h2>
            <ul className="d2-zones">
              {inAct.map((z) => (
                <li className="d2-zone" key={z.key}>
                  <h3 className="d2-zone-h">{tr(z.levels[0]?.name, lang)}</h3>
                  {z.levels.length > 1 && <p className="d2-zone-levels">{z.levels.slice(1).map((l) => tr(l.name, lang)).join(" · ")}</p>}
                  {z.waypoint && (
                    <p className="d2-zone-wp">
                      {tz.waypoint}: {tr(z.waypoint, lang)}
                    </p>
                  )}
                  <p className="d2-zone-imm-h">{tz.immune}</p>
                  <ul className="d2-zone-imm">
                    {ELEMS.filter((e) => z.immune[e] > 0).map((e) => (
                      <li key={e} className={`is-${e}`}>
                        {tz.elements[e]} <b>{z.immune[e]}</b>
                      </li>
                    ))}
                    {ELEMS.every((e) => !z.immune[e]) && <li className="is-none">{tz.none}</li>}
                  </ul>
                  <details className="d2-zone-mons">
                    <summary>{tz.monsters(z.monsters.length)}</summary>
                    <ul>
                      {z.monsters.map((m, i) => (
                        <li key={i}>
                          {tr(m.name, lang)}
                          {m.imm.length > 0 && <small> · {m.imm.map((e) => tz.elements[e]).join(", ")}</small>}
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {shown.length === 0 && <p className="d2-empty">{t.wiki.noResults}</p>}
    </>
  );
}
