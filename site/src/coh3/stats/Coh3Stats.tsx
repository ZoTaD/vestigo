/**
 * Estadísticas de CoH3 (2026-11-04), a la par de "Stats" de coh3stats: por modo de automatch y banda de ELO, el
 * porcentaje de victorias y la popularidad de cada facción, Eje contra Aliados, facción contra facción (1v1), los mapas
 * (tabla ordenable) y la duración de las partidas. Todo de `summary.json` (`stats/data.ts`).
 */
import type { Route } from "../../route";
import { FACTIONS, SIDE, useCoh3Copy, type Faction } from "../../coh3Copy";
import { Coh3Loading, FactionTag, Panel, sortRows, useNum, useSort, type Nav } from "../ui";
import { wr, type BandStats, type ModeStats } from "./data";
import { useStatsCopy } from "./copy";
import { ModeBandPicker, useMapName, useModeBand, useSummary, WindowLine } from "./parts";
import "./stats.css";

const pct = (num: (v: number, d?: number) => string, p: number | null, d = 1) => (p == null ? "—" : `${num(p * 100, d)} %`);

export default function Coh3Stats(_: { route: Route; navigate: Nav }) {
  const t = useStatsCopy();
  const s = useSummary();
  const mb = useModeBand();
  if (s === "error") return <Coh3Loading onRetry={() => window.location.reload()} />;
  if (!s) return <Coh3Loading />;
  const md = s.modes[mb.mode];
  const bd = md?.bands[mb.band];
  return (
    <main className="c3-main c3-stats">
      <header className="c3-head">
        <div className="c3-k">{t.stats.k}</div>
        <h1 className="c3-h1">{t.stats.h1}</h1>
        <p className="c3-lede">{t.stats.lede}</p>
        <WindowLine s={s} />
        <ModeBandPicker {...mb} />
      </header>
      {!md || !bd || bd.g < 20 ? (
        <Panel>
          <p>{t.stats.noData}</p>
        </Panel>
      ) : (
        <>
          <div className="c3-grid2">
            <WinRates bd={bd} />
            <div className="c3-stack">
              <Popularity bd={bd} />
              <Sides bd={bd} />
            </div>
          </div>
          {mb.mode === "1v1" && md.fvf[mb.band] && <Fvf fvf={md.fvf[mb.band]!} />}
          <Maps md={md} />
          <Duration md={md} step={s.durStep} />
        </>
      )}
    </main>
  );
}

function WinRates({ bd }: { bd: BandStats }) {
  const t = useStatsCopy();
  const num = useNum();
  const rows = FACTIONS.filter((f) => bd.f[f]).sort((a, b) => (wr(bd.f[b]) ?? 0) - (wr(bd.f[a]) ?? 0));
  return (
    <Panel k={t.stats.winrate} h={t.stats.gamesN(num(bd.g))} lede={t.stats.winrateLede}>
      <ul className="c3-bars">
        {rows.map((f) => {
          const p = wr(bd.f[f]) ?? 0;
          // La barra va de 40 % a 60 %: con todo cerca del 50 %, una barra de 0 a 100 no deja ver la diferencia.
          const w = Math.max(0, Math.min(1, (p - 0.4) / 0.2));
          return (
            <li key={f} className="c3-bar">
              <FactionTag f={f} size={30} />
              <span className="c3-bar-track is-mid">
                <span className={`c3-bar-fill ${p >= 0.5 ? "is-up" : "is-down"}`} style={{ width: `${w * 100}%` }} />
              </span>
              <b className={p >= 0.5 ? "c3-up" : "c3-down"}>{pct(num, p)}</b>
              <small className="c3-dim">{t.stats.gamesN(num(bd.f[f]!.g))}</small>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Popularity({ bd }: { bd: BandStats }) {
  const t = useStatsCopy();
  const num = useNum();
  const total = FACTIONS.reduce((a, f) => a + (bd.f[f]?.g ?? 0), 0);
  return (
    <Panel k={t.stats.pick} lede={t.stats.pickLede}>
      <div className="c3-share" role="img" aria-label={t.stats.pick}>
        {FACTIONS.map((f) => {
          const p = (bd.f[f]?.g ?? 0) / (total || 1);
          return <span key={f} className={`c3-share-i is-${f}`} style={{ flexGrow: p }} title={`${num(p * 100, 1)} %`} />;
        })}
      </div>
      <ul className="c3-share-l">
        {FACTIONS.map((f) => (
          <li key={f}>
            <FactionTag f={f} size={20} /> <b>{num(((bd.f[f]?.g ?? 0) / (total || 1)) * 100, 1)} %</b>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Sides({ bd }: { bd: BandStats }) {
  const t = useStatsCopy();
  const num = useNum();
  const p = bd.axisW / bd.g;
  return (
    <Panel k={t.stats.sides}>
      <div className="c3-sides">
        <span className={p >= 0.5 ? "c3-up" : "c3-down"}>
          <small>{t.stats.axis}</small>
          <b>{num(p * 100, 1)} %</b>
        </span>
        <span className="c3-sides-bar">
          <span style={{ width: `${p * 100}%` }} />
        </span>
        <span className={p < 0.5 ? "c3-up" : "c3-down"}>
          <small>{t.stats.allies}</small>
          <b>{num((1 - p) * 100, 1)} %</b>
        </span>
      </div>
    </Panel>
  );
}

function Fvf({ fvf }: { fvf: Record<string, { g: number; w: number }> }) {
  const t = useStatsCopy();
  const c = useCoh3Copy();
  const num = useNum();
  return (
    <Panel k={t.stats.fvf} lede={t.stats.fvfLede}>
      <table className="c3-mu">
        <thead>
          <tr>
            <th className="c3-mu-corner">{t.stats.rowVsCol}</th>
            {FACTIONS.map((f) => (
              <th key={f} scope="col">
                <FactionTag f={f} size={28} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FACTIONS.map((r) => (
            <tr key={r}>
              <th scope="row">
                <FactionTag f={r} size={26} />
              </th>
              {FACTIONS.map((col) => {
                const x = SIDE[r] === SIDE[col] ? null : fvf[`${r}>${col}`];
                const p = wr(x);
                if (p == null) return <td key={col} className="c3-mu-na" aria-label={c.t.none} />;
                const v = (p - 0.5) / 0.05;
                return (
                  <td key={col} className={p >= 0.5 ? "is-up" : "is-down"} style={{ ["--v" as string]: Math.min(1, Math.abs(v)) }} title={t.stats.gamesN(num(x!.g))}>
                    <b>{num(p * 100, 1)} %</b>
                    <small>{num(x!.g)}</small>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

type MapKey = "map" | "g" | "axis" | Faction;

function Maps({ md }: { md: ModeStats }) {
  const t = useStatsCopy();
  const c = useCoh3Copy();
  const num = useNum();
  const name = useMapName();
  const rows = Object.entries(md.maps)
    .filter(([, m]) => m.g >= 10)
    .map(([id, m]) => ({ id, m }));
  const { sort, th } = useSort<MapKey>({ key: "g", dir: -1 }, ["map"]);
  const cols: Record<MapKey, (r: (typeof rows)[number]) => string | number | null> = {
    map: (r) => name(r.id),
    g: (r) => r.m.g,
    axis: (r) => r.m.axisW / r.m.g,
    american: (r) => wr(r.m.f.american),
    british: (r) => wr(r.m.f.british),
    german: (r) => wr(r.m.f.german),
    dak: (r) => wr(r.m.f.dak),
  };
  const sorted = sortRows(rows, cols, sort);
  return (
    <Panel k={t.stats.maps} lede={t.stats.mapsLede}>
      <table className="c3-table is-stack">
        <thead>
          <tr>
            {th("map", t.stats.map)}
            {th("g", t.stats.games)}
            {th("axis", t.stats.axisWin)}
            {FACTIONS.map((f) => th(f, c.factionShort[f]))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id}>
              <td className="is-l">
                <strong>{name(r.id)}</strong>
              </td>
              <td data-l={t.stats.games}>{num(r.m.g)}</td>
              <td data-l={t.stats.axisWin}>{pct(num, r.m.axisW / r.m.g)}</td>
              {FACTIONS.map((f) => {
                const p = wr(r.m.f[f]);
                return (
                  <td key={f} data-l={c.factionShort[f]} className={p == null ? "" : p >= 0.5 ? "c3-up" : "c3-down"}>
                    {pct(num, p)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Duration({ md, step }: { md: ModeStats; step: number }) {
  const t = useStatsCopy();
  const num = useNum();
  const max = Math.max(1, ...md.dur);
  const total = md.dur.reduce((a, b) => a + b, 0) || 1;
  const m = step / 60;
  return (
    <Panel k={t.stats.dur} lede={t.stats.durLede}>
      <ol className="c3-hist">
        {md.dur.map((n, i) => (
          <li key={i} title={`${num((n / total) * 100, 1)} %`}>
            <span className="c3-hist-bar" style={{ height: `${(n / max) * 100}%` }} />
            <small>{i === md.dur.length - 1 ? `${i * m}+` : `${i * m}–${(i + 1) * m}`}</small>
          </li>
        ))}
      </ol>
      <p className="c3-note">{t.stats.min}</p>
    </Panel>
  );
}
