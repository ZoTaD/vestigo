// `DeadlockBuildVsBandCard` y no `DeadlockBuildVsBand`: los datos viven en
// `deadlockBuildVsBand.ts` y en Windows los dos nombres serían el mismo archivo.
import { useEffect, useState } from "react";
import { useLang, useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { text } from "./localized";
import { heroImg, heroName } from "./deadlockReportData";
import GameImg from "./GameImg";
import { ItemIcon } from "./DeadlockItemTip";
import { catalogItem } from "./deadlockItemsData";
import type { SeasonPick } from "./deadlockSeasons";
import { BUILD_VS_MIN, useBuildHeroes, useBuildVsBand, type ItemDiff } from "./deadlockBuildVsBand";

/** Cuántos héroes se ofrecen para comparar. */
const HEROES = 5;

/**
 * "Tu build contra la de tu banda": tres o cuatro listas cortas con íconos de
 * objetos, para el héroe elegido entre tus más jugados de la temporada.
 */
export default function DeadlockBuildVsBandCard({
  accountId,
  badge,
  band,
  pick,
}: {
  accountId: number | null;
  badge: number;
  band: string;
  pick: SeasonPick;
}) {
  const copy = useCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const c = copy.deadlock.report.buildVs;
  const heroes = useBuildHeroes(accountId, pick);
  const opciones = heroes
    ? [...heroes].filter(([, n]) => n >= BUILD_VS_MIN).sort((a, b) => b[1] - a[1]).slice(0, HEROES)
    : [];
  const [heroe, setHeroe] = useState<number | null>(null);
  const elegido = opciones.some(([h]) => h === heroe) ? heroe : (opciones[0]?.[0] ?? null);
  const partidas = elegido != null ? (heroes?.get(elegido) ?? 0) : 0;
  const state = useBuildVsBand(accountId, elegido, partidas, badge, pick);

  // Otra cuenta u otra temporada: vuelve al héroe más jugado.
  useEffect(() => setHeroe(null), [accountId, pick]);

  if (!heroes || opciones.length === 0 || badge <= 0) return null;

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const min = (v: number) => v.toLocaleString(locale, { maximumFractionDigits: 0 });
  const nombre = (id: number) => {
    const n = catalogItem(id)?.name;
    return n ? text(n, lang, "") : String(id);
  };

  const lista = (title: string, rows: ItemDiff[], kind: "rate" | "minute") =>
    rows.length > 0 && (
      <div className="dl-buildvs-group">
        <h3>{title}</h3>
        <ul>
          {rows.map((r) => (
            <li key={r.itemId}>
              <ItemIcon itemId={r.itemId} size={28} />
              <span className="dl-buildvs-name">{nombre(r.itemId)}</span>
              <span className="dl-buildvs-num">
                {kind === "rate" ? c.rate(pct(r.mine), pct(r.band)) : c.minute(min(r.mineMin), min(r.bandMin))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="box dl-pcard dl-buildvs">
      <h2 className="box-title dl-pcard-title">{c.title}</h2>
      <p className="detail-note">{c.lead(band)}</p>
      {opciones.length > 1 && (
        <div className="seg is-wrap dl-buildvs-heroes" role="group" aria-label={c.pick}>
          {opciones.map(([h]) => {
            const n = heroName(h);
            const label = n ? text(n, lang, "") : String(h);
            return (
              <button key={h} type="button" aria-pressed={elegido === h} title={label} onClick={() => setHeroe(h)}>
                <GameImg src={heroImg(h) ?? ""} alt={label} width={24} height={24} loading="lazy" decoding="async" />
              </button>
            );
          })}
        </div>
      )}
      {state.status === "loading" && <p className="detail-note">{c.loading}</p>}
      {state.status === "failed" && <p className="detail-note">{c.failed}</p>}
      {state.status === "ready" &&
        (() => {
          const d = state.diff;
          if (!d) return <p className="detail-note">{c.none}</p>;
          const vacio = d.more.length + d.skip.length + d.later.length + d.earlier.length === 0;
          if (vacio) return <p className="detail-note">{c.same}</p>;
          return (
            <div className="dl-buildvs-groups">
              {lista(c.more, d.more, "rate")}
              {lista(c.skip, d.skip, "rate")}
              {lista(c.later, d.later, "minute")}
              {lista(c.earlier, d.earlier, "minute")}
            </div>
          );
        })()}
    </div>
  );
}
