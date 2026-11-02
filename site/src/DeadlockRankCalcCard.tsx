// `DeadlockRankCalcCard` y no `DeadlockRankCalc`: la aritmética vive en
// `deadlockRankCalc.ts` y en Windows los dos nombres serían el mismo archivo.
import { useState } from "react";
import { useLang, useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { rankLabel, rankOf } from "./deadlockReportData";
import rankPoints from "@deadlock/rank-points.json";
import {
  ETERNUS,
  badgeAt,
  badgeStart,
  lossesToDrop,
  nextBadge,
  nextTier,
  subSpan,
  winsTo,
} from "./deadlockRankCalc";

/**
 * "¿Cuántas victorias para subir?" (2/11).
 *
 * Dos usos con la misma cuenta: en Rangos, con el rango que eligió el visitante
 * y dos controles (puntos dentro del subnivel y racha); en el perfil, ya
 * rellena con el progreso exacto y la racha que devuelve `players/{id}/rank`.
 * La aritmética vive en `deadlockRankCalc.ts`; los puntos por victoria son los
 * medidos en `rank-points.json`, así que si Valve cambia la escalera la
 * calculadora la sigue sola.
 */

interface RankPointsFile {
  wins: { streak: number; typical: number; n: number }[];
  loss: { typical: number };
}

const DATA = rankPoints as unknown as RankPointsFile;
const POINTS = DATA.wins.filter((w) => w.n > 0).map((w) => w.typical);
const LOSS = DATA.loss.typical;
/** Racha más alta que distingue la escalera; de ahí para arriba suma igual. */
const STREAK_MAX = Math.max(0, POINTS.length - 1);

export default function DeadlockRankCalc({
  badge,
  progress,
  streak,
}: {
  badge: number;
  /** Progreso absoluto, si se sabe (perfil). Sin él aparecen los controles. */
  progress?: number | null;
  streak?: number;
}) {
  const copy = useCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const t = copy.deadlock.ladder.calc;
  const fijo = progress != null;
  const [dentro, setDentro] = useState(0);
  const [racha, setRacha] = useState(0);

  const actual = fijo ? badgeAt(progress) : badge;
  const p = fijo ? progress : badgeStart(badge) + dentro;
  const s = fijo ? (streak ?? 0) : racha;
  const tope = subSpan(actual);
  const sigSub = nextBadge(actual);
  const sigRango = nextTier(actual);
  const nombre = (b: number) => {
    const r = rankOf(b);
    return r ? rankLabel(r, lang) : String(b);
  };
  const victorias = (target: number | null) => {
    if (target == null) return null;
    const n = winsTo(p, s, target, POINTS);
    return n == null ? t.far : t.wins(n);
  };
  const signo = (v: number) => (v > 0 ? "+" : "−") + Math.abs(v).toLocaleString(locale);

  if (POINTS.length === 0) return null;

  return (
    <div className="dl-calc">
      {!fijo && (
        <div className="dl-calc-inputs">
          <label className="field dl-calc-range">
            <span className="field-label">
              {t.progress} <b>{dentro.toLocaleString(locale)}</b> / {tope.toLocaleString(locale)}
            </span>
            <input
              type="range"
              min={0}
              max={tope - 10}
              step={10}
              value={Math.min(dentro, tope - 10)}
              onChange={(e) => setDentro(Number(e.target.value))}
              aria-label={t.progress}
            />
          </label>
          <div className="dl-calc-streak">
            <span className="field-label">{t.streak}</span>
            <div className="seg" role="group" aria-label={t.streak}>
              {Array.from({ length: STREAK_MAX + 1 }, (_, k) => (
                <button key={k} type="button" aria-pressed={racha === k} onClick={() => setRacha(k)}>
                  {t.streakN(k, k === STREAK_MAX)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {Math.floor(actual / 10) >= ETERNUS ? (
        <p className="dl-calc-note">{t.eternus}</p>
      ) : (
        <dl className="dl-calc-out">
          <div>
            <dt>{t.nextSub}</dt>
            <dd>
              <b>{victorias(sigSub)}</b>
              {sigSub != null && <span>{t.to(nombre(sigSub))}</span>}
            </dd>
          </div>
          {sigRango != null && sigRango !== sigSub && (
            <div>
              <dt>{t.nextTier}</dt>
              <dd>
                <b>{victorias(sigRango)}</b>
                <span>{t.to(nombre(sigRango))}</span>
              </dd>
            </div>
          )}
          <div>
            <dt>{t.drop}</dt>
            <dd>
              <b>{t.losses(lossesToDrop(p, LOSS))}</b>
            </dd>
          </div>
        </dl>
      )}
      <p className="dl-calc-note">{t.note(signo(POINTS[0]), signo(LOSS))}</p>
    </div>
  );
}
