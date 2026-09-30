/**
 * Clases (2026-09-29): las ocho, y la ficha de cada una (`/d2r/classes/sorceress`)
 * con sus tres árboles de habilidades como en el juego: el árbol con sus
 * flechas y cada ícono en su casillero (fila y columna de `skilldesc.txt`).
 * Al pasar el mouse o tocar una habilidad: nivel requerido, lo que pide antes y
 * qué hace. Debajo, la misma información en texto, que es lo que lee Google.
 */
import { useEffect, useRef, useState } from "react";
import classesJson from "@d2r/wiki/classes.json";
import { useLang } from "../i18n";
import RouteLink from "../RouteLink";
import type { Route } from "../route";
import { useD2rCopy } from "../d2rCopy";
import { gameImg } from "../d2rData";
import { useIsoLayoutEffect } from "../floatingTip";
import type { Loc } from "./stats";
import { tr } from "./wiki";
import { BackLink, D2Head } from "./ui";

interface Skill {
  id: number;
  slug: string;
  name: Loc;
  short: Loc | null;
  long: Loc | null;
  page: 1 | 2 | 3;
  row: number;
  col: number;
  lvl: number;
  max: number;
  reqs: number[];
}
interface GameClass {
  id: string;
  code: string;
  name: Loc;
  tabs: Loc[];
  skills: Skill[];
}

const CLASSES = classesJson as unknown as GameClass[];
type Nav = (r: Route) => void;

/**
 * Dónde está cada casillero en el árbol del juego (895×1169), en porcentajes:
 * tres columnas y seis filas de 130 px, medidas sobre la imagen.
 */
const COL_LEFT = [13.52, 42.79, 71.84];
const ROW_TOP = [11.21, 26.43, 41.66, 56.89, 72.11, 87.34];
const CELL_W = 14.53;
const CELL_H = 11.12;

export default function D2rClasses({ route, navigate }: { route: Route; navigate: Nav }) {
  const cls = route.detail ? CLASSES.find((c) => c.id === route.detail) : undefined;
  if (route.detail && cls) return <ClassDetail cls={cls} route={route} navigate={navigate} />;
  return <ClassList route={route} navigate={navigate} missing={!!route.detail} />;
}

function ClassList({ route, navigate, missing }: { route: Route; navigate: Nav; missing: boolean }) {
  const t = useD2rCopy();
  const { lang } = useLang();
  return (
    <>
      <D2Head as="h1" title={t.tabs.classes} lede={t.classes.tabLede} />
      {missing && <p className="d2-empty">{t.wiki.notFound}</p>}
      <ul className="d2-cls-list">
        {CLASSES.map((c) => (
          <li key={c.id}>
            <RouteLink className="d2-cls-card" to={{ ...route, detail: c.id }} onNavigate={navigate}>
              <img src={gameImg(`class/${c.id}`)} alt="" width={120} height={120} loading="lazy" />
              <span>
                <b>{tr(c.name, lang)}</b>
                <small>{c.tabs.map((x) => tr(x, lang)).join(" · ")}</small>
                {c.id === "warlock" && <em className="d2-badge is-new">{t.wiki.newRotw}</em>}
              </span>
            </RouteLink>
          </li>
        ))}
      </ul>
    </>
  );
}

function ClassDetail({ cls, route, navigate }: { cls: GameClass; route: Route; navigate: Nav }) {
  const t = useD2rCopy();
  const { lang } = useLang();
  const byId = new Map(cls.skills.map((s) => [s.id, s]));
  const [open, setOpen] = useState<{ skill: Skill; el: HTMLElement } | null>(null);
  const tip = useRef<HTMLDivElement>(null);

  // El tooltip arriba de la habilidad, o abajo si no entra; nunca afuera de la pantalla.
  useIsoLayoutEffect(() => {
    const box = tip.current;
    if (!open || !box) return;
    const r = open.el.getBoundingClientRect();
    const x = Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, r.left + r.width / 2 - box.offsetWidth / 2));
    const y = r.top - box.offsetHeight - 8 >= 8 ? r.top - box.offsetHeight - 8 : r.bottom + 8;
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const reqNames = (s: Skill) => s.reqs.map((id) => tr(byId.get(id)?.name, lang)).filter(Boolean).join(", ");

  return (
    <article className="d2-detail">
      <BackLink to={{ ...route, detail: undefined }} navigate={navigate} label={t.tabs.classes} />
      <div className="d2-detail-top">
        <img src={gameImg(`class/${cls.id}`)} alt="" width={96} height={96} />
        <div>
          <h1 className="d2-detail-h">{tr(cls.name, lang)}</h1>
          <p className="d2-detail-sub">{cls.tabs.map((x) => tr(x, lang)).join(" · ")}</p>
        </div>
      </div>

      <div className="d2-trees">
        {([1, 2, 3] as const).map((page) => (
          <section className="d2-tree" key={page} aria-labelledby={`d2-tree-${page}`}>
            <h2 className="d2-tree-h" id={`d2-tree-${page}`}>
              {tr(cls.tabs[page - 1], lang)}
            </h2>
            <div className="d2-tree-board" style={{ backgroundImage: `url(${gameImg(`tree/${cls.id}-${page}`)})` }}>
              {cls.skills
                .filter((s) => s.page === page)
                .map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className="d2-tree-skill"
                    style={{ left: `${COL_LEFT[s.col - 1]}%`, top: `${ROW_TOP[s.row - 1]}%`, width: `${CELL_W}%`, height: `${CELL_H}%` }}
                    aria-label={tr(s.name, lang)}
                    aria-describedby={open?.skill === s ? "d2-skill-tip" : undefined}
                    onMouseEnter={(e) => setOpen({ skill: s, el: e.currentTarget })}
                    onMouseLeave={() => setOpen(null)}
                    onFocus={(e) => setOpen({ skill: s, el: e.currentTarget })}
                    onBlur={() => setOpen(null)}
                    onClick={(e) => setOpen((o) => (o?.skill === s ? null : { skill: s, el: e.currentTarget }))}
                  >
                    <img src={`/d2r/skills/${cls.id}/${s.id}.webp`} alt="" loading="lazy" />
                  </button>
                ))}
            </div>
          </section>
        ))}
      </div>

      {open && (
        <div className="d2-tip" id="d2-skill-tip" role="tooltip" ref={tip}>
          <div className="d2-tip-name d2-tone-white">{tr(open.skill.name, lang)}</div>
          <div>{t.classes.reqLevel(open.skill.lvl)}</div>
          {open.skill.reqs.length > 0 && (
            <div className="d2-tip-dim">
              {t.classes.requires}: {reqNames(open.skill)}
            </div>
          )}
          {open.skill.short && <div className="d2-tip-rw">{tr(open.skill.short, lang)}</div>}
        </div>
      )}

      <D2Head title={t.classes.skills} />
      <div className="d2-skill-cols">
        {([1, 2, 3] as const).map((page) => (
          <section key={page}>
            <h3 className="d2-h3">{tr(cls.tabs[page - 1], lang)}</h3>
            <ul className="d2-skill-list">
              {cls.skills
                .filter((s) => s.page === page)
                .sort((a, b) => a.lvl - b.lvl || a.col - b.col)
                .map((s) => (
                  <li key={s.id}>
                    <img src={`/d2r/skills/${cls.id}/${s.id}.webp`} alt="" width={44} height={44} loading="lazy" />
                    <div>
                      <b>{tr(s.name, lang)}</b>
                      <small>
                        {t.classes.reqLevel(s.lvl)}
                        {s.reqs.length > 0 && ` · ${t.classes.requires}: ${reqNames(s)}`}
                      </small>
                      {s.short && <p>{tr(s.short, lang)}</p>}
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
}
