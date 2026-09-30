import type { CSSProperties } from "react";
import { useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import rankPoints from "@deadlock/rank-points.json";

/**
 * Cuántos puntos de rango da cada partida (2026-09-30).
 *
 * Desde el rework del 30/7 los puntos no son fijos y Valve no publicó la
 * fórmula; "¿por qué me dieron +430?" es de lo más preguntado en los foros.
 * Medido: ganar da +300, la racha suma de a 20 desde la tercera victoria
 * seguida hasta +430, perder da −300 y un escudo de descenso se lleva el golpe.
 * Datos: `npm run build:rank-points`.
 */

interface RankPointsFile {
  from: string;
  to: string;
  matches: number;
  wins: { streak: number; n: number; points: number; typical: number }[];
  loss: { n: number; points: number; typical: number };
  shield: { n: number; points: number; flat: number };
  calibration: { win: number; loss: number; n: number };
}

const DATA = rankPoints as unknown as RankPointsFile;

export default function DeadlockRankPoints() {
  const copy = useCopy();
  const locale = useLocale();
  const t = copy.deadlock.ladder.points;
  const signo = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toLocaleString(locale);
  const fecha = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(locale, { day: "numeric", month: "long" });
  const conDatos = DATA.wins.filter((w) => w.n > 0);
  if (conDatos.length === 0) return null;
  const max = Math.max(...conDatos.map((w) => w.typical));
  const min = Math.min(...conDatos.map((w) => w.typical));
  const ultimo = DATA.wins.length - 1;

  return (
    <section className="box dl-rp">
      <div className="box-head">
        <h2 className="box-title">{t.title}</h2>
        <p className="box-lead">{t.lead(DATA.matches.toLocaleString(locale), fecha(DATA.from), fecha(DATA.to))}</p>
      </div>

      <p className="dl-rp-head">{t.streakHead}</p>
      <ol className="dl-rp-stairs">
        {DATA.wins.map((w) => (
          <li
            key={w.streak}
            title={t.avg(signo(w.points))}
            style={{ "--h": `${45 + ((w.typical - min) / Math.max(1, max - min)) * 55}%` } as CSSProperties}
          >
            <span className="dl-rp-bar">
              <strong>{signo(w.typical)}</strong>
            </span>
            <span className="dl-rp-nth">{t.nth(w.streak, w.streak === ultimo)}</span>
          </li>
        ))}
      </ol>

      <ul className="dl-rp-stamps">
        <li data-tone="bad">
          <strong>{signo(DATA.loss.typical)}</strong>
          <span>{t.loss}</span>
        </li>
        <li data-tone="shield">
          <strong>{signo(DATA.shield.flat)}</strong>
          <span>
            {t.shield}
            <small>{t.shieldNote}</small>
          </span>
        </li>
        <li>
          <strong>
            {signo(DATA.calibration.win)} / {signo(DATA.calibration.loss)}
          </strong>
          <span>{t.calibration}</span>
        </li>
      </ul>
    </section>
  );
}
