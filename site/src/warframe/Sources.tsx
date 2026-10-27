/**
 * "Dónde cae" (2026-10-27): una tabla por tipo de fuente, de mayor a menor chance. Reliquias (con su rareza y el rótulo
 * de Vault), misiones (con rotación y %), botines de bounty, otros (jefes, tiendas) y enemigos (con el % efectivo). Sin
 * ninguna fuente no hay tablas vacías: sólo el texto "No cae en misiones". La usan Arsenal, Reliquias y, después, Dónde
 * farmear y Mods.
 */
import { Fragment, type ReactNode } from "react";
import { useLang, useLocale } from "../i18n";
import { LazyRows } from "../LazyRows";
import RouteLink from "../RouteLink";
import type { Route } from "../route";
import { useWfCopy } from "../warframeCopy";
import { refName, scoreOf as score, sortSources, type Refs, type Source } from "./data";
import { Rarity, type Nav } from "./ui";

/** Una fila de tabla que pasa de a tandas cuando la tabla es larga (un recurso común cae en cientos de misiones). */
const LONG = 100;
/** El alto de una fila de la tabla, en px, medido en el navegador (2026-10-27). */
const ROW = 36;

function Table<T>({ caption, head, rows, render }: { caption: string; head: ReactNode; rows: readonly T[]; render: (row: T, i: number) => ReactNode }) {
  return (
    <div className="wf-src">
      <h4 className="wf-h3">{caption}</h4>
      <div className="wf-table-wrap">
        <table className="wf-table">
          <thead>
            <tr>{head}</tr>
          </thead>
          <tbody>{rows.length > LONG ? <LazyRows items={rows} tag="tr" rowHeight={ROW} render={render} /> : rows.map(render)}</tbody>
        </table>
      </div>
    </div>
  );
}

export default function Sources({ list, refs = {}, route, navigate }: { list: readonly Source[]; refs?: Refs; route?: Route; navigate?: Nav }) {
  const t = useWfCopy();
  const c = t.sources;
  const { lang } = useLang();
  const locale = useLocale();
  if (!list.length) return <p className="wf-dim wf-nodrops">{t.noDrops}</p>;
  const pct = (n: number) => `${n.toLocaleString(locale, { maximumFractionDigits: 2 })} %`;
  const sorted = sortSources(list);
  const relics = sorted.filter((s): s is Extract<Source, { k: "relic" }> => s.k === "relic");
  const missions = sorted.filter((s): s is Extract<Source, { k: "mission" }> => s.k === "mission");
  const bounties = sorted.filter((s): s is Extract<Source, { k: "bounty" }> => s.k === "bounty");
  const others = sorted.filter((s): s is Extract<Source, { k: "other" }> => s.k === "other");
  const enemies = sorted.filter((s): s is Extract<Source, { k: "enemy" }> => s.k === "enemy");
  /** El nombre de una reliquia, enlazado a su ficha si está en el sitio. */
  const relicLink = (name: string) => {
    const r = refs[name];
    if (route && navigate && r?.tab === "relics" && r.slug) {
      return (
        <RouteLink to={{ ...route, view: "warframe", wfSection: "relics", detail: r.slug }} onNavigate={navigate}>
          {r ? refName(r, lang) : name}
        </RouteLink>
      );
    }
    return r ? refName(r, lang) : name;
  };
  /** Los grupos, el de mejor chance primero (a igual chance, el orden de siempre). Las reliquias no traen cifra: van después. */
  const best = (g: readonly Source[]): number => (g.length ? score(sortSources(g)[0]) : -1);
  const groups: { key: string; rows: readonly Source[]; node: ReactNode }[] = [
    { key: "relics", rows: relics, node: (
        <Table
          caption={c.relic}
          head={
            <>
              <th>{c.relic}</th>
              <th>{c.rarity}</th>
              <th></th>
            </>
          }
          rows={relics}
          render={(s) => (
            <tr key={s.relic}>
              <td>{relicLink(s.relic)}</td>
              <td>
                <Rarity r={s.rarity} />
              </td>
              <td className="wf-dim">{s.vaulted ? "Vault" : ""}</td>
            </tr>
          )}
        />
    ) },
    { key: "missions", rows: missions, node: (
        <Table
          caption={c.mission}
          head={
            <>
              <th>{c.where}</th>
              <th>{c.rot}</th>
              <th className="is-num">{c.chance}</th>
            </>
          }
          rows={missions}
          render={(s, i) => (
            <tr key={i}>
              <td>{s.where}</td>
              <td>{s.rot ?? ""}</td>
              <td className="is-num">{pct(s.chance)}</td>
            </tr>
          )}
        />
    ) },
    { key: "bounties", rows: bounties, node: (
        <Table
          caption={c.bounty}
          head={
            <>
              <th>{c.where}</th>
              <th>{c.tier}</th>
              <th>{c.stage}</th>
              <th>{c.rot}</th>
              <th className="is-num">{c.chance}</th>
            </>
          }
          rows={bounties}
          render={(s, i) => (
            <tr key={i}>
              <td>{s.where}</td>
              <td>{s.tier}</td>
              <td>{s.stage}</td>
              <td>{s.rot ?? ""}</td>
              <td className="is-num">{pct(s.chance)}</td>
            </tr>
          )}
        />
    ) },
    { key: "others", rows: others, node: (
        <Table
          caption={c.other}
          head={
            <>
              <th>{c.where}</th>
              <th className="is-num">{c.chance}</th>
            </>
          }
          rows={others}
          render={(s, i) => (
            <tr key={i}>
              <td>{s.where}</td>
              <td className="is-num">{pct(s.chance)}</td>
            </tr>
          )}
        />
    ) },
    { key: "enemies", rows: enemies, node: (
        <Table
          caption={c.enemy}
          head={
            <>
              <th>{c.enemy}</th>
              <th className="is-num">{c.eff}</th>
            </>
          }
          rows={enemies}
          render={(s, i) => (
            <tr key={i}>
              <td>{s.who}</td>
              <td className="is-num">{pct(s.eff)}</td>
            </tr>
          )}
        />
    ) },
  ];
  groups.sort((a, b) => best(b.rows) - best(a.rows));
  return (
    <div className="wf-sources">
      {groups.filter((g) => g.rows.length > 0).map((g) => (
        <Fragment key={g.key}>{g.node}</Fragment>
      ))}
    </div>
  );
}
