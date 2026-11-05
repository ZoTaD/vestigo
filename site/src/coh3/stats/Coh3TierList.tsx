/**
 * La Tier list de CoH3 (2026-11-04): para el modo y la banda de ELO elegidos, la letra de cada facción en general y
 * en cada mapa (S/A/B/C/D por porcentaje de victorias, `tierOf`), y en 1v1 el mejor y el peor cruce de cada una.
 * coh3stats tiene los porcentajes pero no los ordena así; la de battlegroups necesita leer replays (ver `bgNote`).
 *
 * Una casilla sin letra: el intervalo de confianza del 95 % es más ancho que ±6 puntos (`wilson`), o sea muy pocas
 * partidas para decir algo.
 */
import type { Route } from "../../route";
import { FACTIONS, SIDE, useCoh3Copy, type Faction } from "../../coh3Copy";
import { Coh3Loading, FactionTag, Panel, sortRows, useNum, useSort, type Nav } from "../ui";
import { tierOf, wilson, wr, type GW } from "./data";
import { useStatsCopy } from "./copy";
import { ModeBandPicker, useMapName, useModeBand, useSummary, WindowLine } from "./parts";
import "./stats.css";

/** ¿Alcanzan las partidas para darle letra? */
const enough = (x: GW | undefined): x is GW => !!x && x.g >= 30 && wilson(x)[1] - wilson(x)[0] <= 0.12;

function TierCell({ x }: { x: GW | undefined }) {
  const t = useStatsCopy();
  const num = useNum();
  if (!enough(x)) return <span className="c3-tier is-none" title={t.tier.lowSample}>·</span>;
  const p = x.w / x.g;
  const tier = tierOf(p);
  return (
    <span className={`c3-tier is-${tier}`} title={`${num(p * 100, 1)} % · ${num(x.g)}`}>
      <b>{tier}</b>
      <small>
        {num(p * 100, 1)} % · {num(x.g)}
      </small>
    </span>
  );
}

type Key = "map" | "g" | Faction;

export default function Coh3TierList(_: { route: Route; navigate: Nav }) {
  const t = useStatsCopy();
  const c = useCoh3Copy();
  const num = useNum();
  const name = useMapName();
  const s = useSummary();
  const mb = useModeBand();
  const { sort, th } = useSort<Key>({ key: "g", dir: -1 }, ["map"]);
  if (s === "error") return <Coh3Loading onRetry={() => window.location.reload()} />;
  if (!s) return <Coh3Loading />;
  const md = s.modes[mb.mode];
  const bd = md?.bands[mb.band];
  // Los mapas no se parten por banda en el resumen: en una banda que no es "todo ELO" se muestran los de todo el modo.
  const rows = md ? Object.entries(md.maps).filter(([, m]) => m.g >= 30).map(([id, m]) => ({ id, m })) : [];
  const cols: Record<Key, (r: (typeof rows)[number]) => string | number | null> = {
    map: (r) => name(r.id),
    g: (r) => r.m.g,
    american: (r) => wr(r.m.f.american),
    british: (r) => wr(r.m.f.british),
    german: (r) => wr(r.m.f.german),
    dak: (r) => wr(r.m.f.dak),
  };
  const overall = bd ? FACTIONS.filter((f) => bd.f[f]).sort((a, b) => (wr(bd.f[b]) ?? 0) - (wr(bd.f[a]) ?? 0)) : [];
  const fvf = mb.mode === "1v1" ? md?.fvf[mb.band] : undefined;
  return (
    <main className="c3-main c3-tierlist">
      <header className="c3-head">
        <div className="c3-k">{t.tier.k}</div>
        <h1 className="c3-h1">{t.tier.h1}</h1>
        <p className="c3-lede">{t.tier.lede}</p>
        <WindowLine s={s} />
        <ModeBandPicker {...mb} />
      </header>
      {!bd || bd.g < 20 ? (
        <Panel>
          <p>{t.stats.noData}</p>
        </Panel>
      ) : (
        <>
          <Panel k={t.tier.overall} h={t.stats.gamesN(num(bd.g))}>
            <ol className="c3-tierrow">
              {overall.map((f) => (
                <li key={f}>
                  <FactionTag f={f} size={40} short={false} />
                  <TierCell x={bd.f[f]} />
                </li>
              ))}
            </ol>
          </Panel>
          {fvf && (
            <Panel k={t.tier.matchups} lede={t.tier.matchupsLede}>
              <ul className="c3-mups">
                {FACTIONS.map((f) => {
                  const foes = FACTIONS.filter((o) => SIDE[o] !== SIDE[f])
                    .map((o) => ({ o, x: fvf[`${f}>${o}`] }))
                    .filter((v) => v.x && v.x.g > 0)
                    .sort((a, b) => (wr(b.x) ?? 0) - (wr(a.x) ?? 0));
                  if (!foes.length) return null;
                  const best = foes[0], worst = foes[foes.length - 1];
                  return (
                    <li key={f} className="c3-mup">
                      <FactionTag f={f} size={34} short={false} />
                      <span>
                        <small>{t.tier.bestVs}</small> <FactionTag f={best.o} size={20} /> <b className="c3-up">{num((wr(best.x) ?? 0) * 100, 1)} %</b>
                      </span>
                      <span>
                        <small>{t.tier.worstVs}</small> <FactionTag f={worst.o} size={20} /> <b className={(wr(worst.x) ?? 0) >= 0.5 ? "c3-up" : "c3-down"}>{num((wr(worst.x) ?? 0) * 100, 1)} %</b>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
          <Panel k={t.stats.maps} lede={t.tier.legend}>
            <table className="c3-table c3-tiertable is-stack">
              <thead>
                <tr>
                  {th("map", t.stats.map)}
                  {th("g", t.stats.games)}
                  {FACTIONS.map((f) => th(f, c.factionShort[f]))}
                </tr>
              </thead>
              <tbody>
                {sortRows(rows, cols, sort).map((r) => (
                  <tr key={r.id}>
                    <td className="is-l">
                      <strong>{name(r.id)}</strong>
                    </td>
                    <td data-l={t.stats.games}>{num(r.m.g)}</td>
                    {FACTIONS.map((f) => (
                      <td key={f} data-l={c.factionShort[f]}>
                        <TierCell x={r.m.f[f]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <p className="c3-note">{t.tier.bgNote}</p>
        </>
      )}
    </main>
  );
}
