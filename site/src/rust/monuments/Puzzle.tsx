/**
 * La sección "Puzzle" de la ficha de un monumento de Rust (2026-10-09): qué llevar, los pasos numerados con sus objetos
 * como casilleros enlazados, qué hay en la sala del final y los cambios recientes. Datos: `puzzles.ts`
 * (`games/rust/tools/puzzles.py`). Se engancha en `RustMonuments.tsx` con una sola línea.
 */
import { useLang, useLocale } from "../../i18n";
import type { Route } from "../../route";
import { useLoad } from "../../useLoad";
import { Icon, RefLink } from "../items/parts";
import { say } from "./data";
import { loadPuzzles, peekPuzzles, type Conf, type ItemN } from "./puzzles";
import "../../styles/rust-puzzles.css";

type Nav = (r: Route) => void;

const COPY = {
  en: {
    title: "Puzzle: step by step",
    bring: "Bring",
    nothing: "Nothing: no card or fuse needed.",
    inside: "What's inside",
    changes: "Recent changes",
    conf: { high: "", medium: "to verify", low: "unconfirmed" } as Record<Conf, string>,
    reset: (min: number) => `Doors and loot reset every ${min} minutes; players nearby hold the reset back.`,
    checked: (d: string) => `Checked on ${d}.`,
  },
  es: {
    title: "Puzzle: paso a paso",
    bring: "Llevá",
    nothing: "Nada: no pide tarjeta ni fusible.",
    inside: "Lo que hay adentro",
    changes: "Cambios recientes",
    conf: { high: "", medium: "a verificar", low: "sin confirmar" } as Record<Conf, string>,
    reset: (min: number) => `Las puertas y el botín se reinician cada ${min} minutos; si hay jugadores cerca, el reinicio espera.`,
    checked: (d: string) => `Revisado el ${d}.`,
  },
};

export default function MonumentPuzzleSection({ id, route, navigate }: { id: string; route: Route; navigate: Nav }) {
  const { lang } = useLang();
  const locale = useLocale();
  const t = COPY[lang === "es" ? "es" : "en"];
  const data = useLoad("rust-puzzles", () => peekPuzzles() ?? undefined, loadPuzzles);
  const p = data.value?.monuments[id];
  if (!p) return null;
  const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  const text = (x: { en: string; es: string }) => (lang === "es" ? x.es : x.en);
  const slots = (items: ItemN[], size: number) =>
    items.map((r) => (
      <RefLink r={r.item} route={route} navigate={navigate} key={r.item.id}>
        <span className="rs-slot">
          <Icon id={r.item.id} size={size} />
          {r.n > 1 && <b className="rs-qty">×{r.n}</b>}
        </span>
        <span className="rs-pz-name">{say(r.item.name, lang)}</span>
      </RefLink>
    ));
  return (
    <section className="rs-pnl rs-pz" id="puzzle">
      <h2 className="rs-hd">{t.title}</h2>
      <div className="rs-pz-need">
        <h3 className="rs-sub">{t.bring}</h3>
        {p.needs.length ? <div className="rs-pz-items">{slots(p.needs, 48)}</div> : <p className="rs-farm-p">{t.nothing}</p>}
      </div>
      <ol className="rs-pz-steps">
        {p.steps.map((s, i) => (
          <li key={i}>
            <span className="rs-pz-n" aria-hidden="true">
              {i + 1}
            </span>
            <div className="rs-pz-body">
              <p>
                {text(s)}
                {t.conf[s.conf] && <em className="rs-tag">{t.conf[s.conf]}</em>}
              </p>
              {s.items.length > 0 && <div className="rs-pz-items is-small">{slots(s.items, 36)}</div>}
            </div>
          </li>
        ))}
      </ol>
      {p.reward && (
        <>
          <h3 className="rs-sub">{t.inside}</h3>
          <p className="rs-farm-p">{text(p.reward)}</p>
          {p.reward.items.length > 0 && <div className="rs-pz-items">{slots(p.reward.items, 48)}</div>}
        </>
      )}
      {p.changes.length > 0 && (
        <>
          <h3 className="rs-sub">{t.changes}</h3>
          <ul className="rs-pz-changes">
            {p.changes.map((c, i) => (
              <li key={i}>
                <time dateTime={c.date}>{day(c.date)}</time>
                <span>{text(c)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="rs-note">
        {t.reset(p.resetMin)} {t.checked(day(p.verified))}
      </p>
    </section>
  );
}
