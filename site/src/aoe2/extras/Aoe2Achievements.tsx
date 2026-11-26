/**
 * Logros de AoE2 (2026-11-21): cada logro de Steam con lo que pide y qué parte de los jugadores lo tiene, del más común
 * al más raro, con buscador. Datos: `games/aoe2/data/achievements.json` (`games/coh3/tools/achievements.py --game aoe2`);
 * íconos en `public/aoe2/a/`.
 */
import { useState } from "react";
import type { Route } from "../../route";
import { useLang } from "../../i18n";
import { LazyRows } from "../../LazyRows";
import { SettledImg } from "../../SettledImg";
import { Aoe2Loading, Panel, type Nav } from "../ui";
import { useEnc } from "../encyclopedia/parts";
import { logros } from "./data";
import { useExtraCopy } from "./copy";

export default function Aoe2Achievements(_: { route: Route; navigate: Nav }) {
  const t = useExtraCopy().ach;
  const { lang } = useLang();
  const d = useEnc(logros);
  const [q, setQ] = useState("");
  if (!d) return <Aoe2Loading />;
  const aguja = q.trim().toLowerCase();
  const filas = d.list.filter((a) => !aguja || `${a.name[lang]} ${a.desc[lang]} ${a.name.en}`.toLowerCase().includes(aguja));
  return (
    <>
      <Panel h={t.h} sub={t.sub}>
        <div className="a2-search-row">
          <input type="search" value={q} placeholder={t.search} aria-label={t.search} onChange={(e) => setQ(e.target.value)} />
        </div>
        <p className="a2-note">{t.results(filas.length)}</p>
      </Panel>
      <Panel>
        <ul className="a2-ach">
          {/* 370 logros: de a tandas (regla de rendimiento). */}
          <LazyRows
            tag="li"
            eager
            rowHeight={64}
            items={filas}
            render={(a) => (
              <li key={a.slug}>
                {a.icon ? <SettledImg className="a2-ico" src={`/aoe2/a/${a.icon}.jpg`} width={48} height={48} /> : <span className="a2-ico a2-ach-empty" aria-hidden="true" />}
                <span className="a2-ach-t">
                  <b>
                    {a.name[lang] || a.name.en}
                    {a.hidden && <em className="a2-small">{t.hidden}</em>}
                  </b>
                  <small>{a.desc[lang] || a.desc.en}</small>
                </span>
                <span className="a2-ach-pct" title={t.pct}>
                  <span className="a2-ach-bar" style={{ width: `${Math.min(100, a.pct ?? 0)}%` }} />
                  <b>{a.pct == null ? "–" : `${a.pct.toLocaleString(lang, { maximumFractionDigits: 1 })} %`}</b>
                </span>
              </li>
            )}
          />
        </ul>
      </Panel>
    </>
  );
}
