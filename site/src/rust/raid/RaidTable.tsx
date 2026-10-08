/**
 * La tabla de raideo completa (2026-10-05): cada objetivo contra cada explosivo. Va entera en el HTML (es lo que más se
 * busca: "rust raid table") y se desliza adentro de su caja en el celular, sin mover la página.
 */
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { say } from "../items/data";
import { EXPLOSIVES, hitsFor, KINDS, TARGETS } from "./model";

type Nav = (r: Route) => void;

export default function RaidTable({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useRustCopy().raid;
  const { lang } = useLang();
  const locale = useLocale();
  return (
    <section className="rs-pnl" id="tabla">
      <h2 className="rs-hd">{t.table}</h2>
      <p className="rs-note">{t.tableNote}</p>
      <div className="rs-scroll">
        <table className="rs-table rs-raid-table">
          <thead>
            <tr>
              <th scope="col" />
              {EXPLOSIVES.map((e) => (
                <th scope="col" key={e.id} title={say(e.name, lang)}>
                  <img src={`/rust/items/${e.id}.webp`} alt={say(e.name, lang)} width={32} height={32} loading="lazy" decoding="async" />
                </th>
              ))}
            </tr>
          </thead>
          {KINDS.map((k) => (
            <tbody key={k}>
              <tr>
                <th scope="colgroup" colSpan={EXPLOSIVES.length + 1} className="rs-kind">
                  {t.kinds[k]}
                </th>
              </tr>
              {TARGETS.filter((x) => x.kind === k).map((x) => (
                <tr key={x.id}>
                  <th scope="row">
                    {x.slug ? (
                      <RouteLink className="rs-ref" to={{ ...route, view: "rust", rsSection: "items", detail: x.slug }} onNavigate={navigate}>
                        {say(x.name, lang)}
                      </RouteLink>
                    ) : (
                      say(x.name, lang)
                    )}
                  </th>
                  {EXPLOSIVES.map((e) => {
                    const n = hitsFor(x, e.id);
                    return (
                      <td key={e.id} data-cell={`${x.id}|${e.id}`}>
                        {n === null ? "—" : n.toLocaleString(locale)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}
