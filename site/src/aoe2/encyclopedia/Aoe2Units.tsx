/**
 * Unidades de AoE2 (2026-11-21): la lista por edificio (comunes, únicas por civ y regionales) y la ficha de cada una
 * (`/aoe2/units/<slug>`): cifras, bonus de ataque y clases de armadura con su nombre del juego, línea de mejora,
 * tecnologías que la mejoran, civs que la tienen y counters calculados con el daño del juego.
 */
import { useMemo, useState } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang, type Lang } from "../../i18n";
import { CivShield, Panel, civBySlug, Aoe2Loading, type Nav } from "../ui";
import { arbol, civsCon, edad, loadAyuda, peekAyuda, tecnologias, unidades, type Arbol, type Unidad, type Unidades } from "./data";
import { useEncCopy } from "./copy";
import { Costo, Datos, Fichas, Icono, useCargado, useEnc } from "./parts";

type Vista = "common" | "unique" | "regional";
const VISTAS: Vista[] = ["common", "unique", "regional"];
const vistaDe = (u: Unidad): Vista => (u.kind === "UniqueUnit" ? "unique" : u.kind === "RegionalUnit" ? "regional" : "common");
/** Una variante repetida (mismo nombre que otra, con el id en el slug): no va en la lista, sí tiene ficha. */
const variante = (u: Unidad) => u.slug.endsWith(`-${u.id}`);
const nombreDe = (n: { en: string; es: string }, lang: Lang) => n[lang] || n.en;

export default function Aoe2Units({ route, navigate }: { route: Route; navigate: Nav }) {
  const u = useEnc(unidades);
  const a = useEnc(arbol);
  if (!u || !a) return <Aoe2Loading />;
  if (route.detail) return <Ficha key={route.detail} slug={route.detail} u={u} a={a} route={route} navigate={navigate} />;
  return <Lista u={u} a={a} route={route} navigate={navigate} />;
}

function Lista({ u, a, route, navigate }: { u: Unidades; a: Arbol; route: Route; navigate: Nav }) {
  const t = useEncCopy();
  const { lang } = useLang();
  const [vista, setVista] = useState<Vista>("common");
  const edificios = useMemo(() => new Map(a.buildings.map((b) => [b.id, b])), [a]);
  const grupos = useMemo(() => {
    const filas = u.units.filter((x) => vistaDe(x) === vista && !variante(x));
    const out = new Map<string, { titulo: string; civ?: string; pic?: number; filas: Unidad[] }>();
    for (const x of filas) {
      let k: string;
      let g: { titulo: string; civ?: string; pic?: number };
      if (vista === "unique") {
        const c = civsCon(a, `u${x.id}`)[0] ?? "";
        k = c;
        g = { titulo: civBySlug(c)?.name[lang] ?? c, civ: c };
      } else {
        const b = edificios.get(x.building);
        k = String(x.building);
        g = { titulo: b ? nombreDe(b.name, lang) : "", pic: b?.pic };
      }
      const e = out.get(k) ?? { ...g, filas: [] };
      e.filas.push(x);
      out.set(k, e);
    }
    return [...out.values()].sort((x, y) => (vista === "unique" ? x.titulo.localeCompare(y.titulo, lang) : 0));
  }, [u, a, vista, lang, edificios]);
  return (
    <>
      <Panel h={t.units.h} sub={vista === "unique" ? t.units.uniqueSub : vista === "regional" ? t.units.regionalSub : t.units.sub}>
        <div className="a2-seg" role="radiogroup">
          {VISTAS.map((v) => (
            <button key={v} type="button" role="radio" aria-checked={v === vista} className={v === vista ? "is-on" : undefined} onClick={() => setVista(v)}>
              {t.units.show[v]}
            </button>
          ))}
        </div>
      </Panel>
      <div className="a2-groups">
        {grupos.map((g) => (
          <section key={g.titulo} className="a2-panel a2-group">
            <h2 className="a2-group-h">
              {g.civ ? <CivShield civ={civBySlug(g.civ)} size={28} /> : g.pic != null ? <Icono k="b" pic={g.pic} size={28} /> : null}
              <span>{g.titulo}</span>
            </h2>
            <ul className="a2-tiles">
              {g.filas.map((x) => (
                <li key={x.id}>
                  <RouteLink to={{ ...route, view: "aoe2", a2Section: "units", detail: x.slug }} onNavigate={navigate}>
                    <Icono k="u" pic={x.pic} size={44} />
                    <span>{nombreDe(x.name, lang)}</span>
                  </RouteLink>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

function Ficha({ slug, u, a, route, navigate }: { slug: string; u: Unidades; a: Arbol; route: Route; navigate: Nav }) {
  const t = useEncCopy();
  const { lang } = useLang();
  const techs = useEnc(tecnologias);
  const x = u.units.find((f) => f.slug === slug);
  const ayuda = useCargado(() => (x ? peekAyuda(lang, x.id) : null), () => (x ? loadAyuda(lang, x.id) : Promise.resolve(null)), `${lang}:${x?.id}`);
  if (!x) return <Panel h={t.units.notFound} />;
  const porId = new Map(u.units.map((f) => [f.id, f]));
  const clase = (c: number) => {
    const n = u.classes[String(c)];
    return n ? nombreDe(n, lang) : String(c);
  };
  const ataque = x.attacks.find(([c]) => c === 4)?.[1] ?? 0;
  const perforante = x.attacks.find(([c]) => c === 3)?.[1] ?? 0;
  const armadura = (c: number) => x.armors.find(([k]) => k === c)?.[1] ?? 0;
  // Sólo lo que tiene nombre en el juego (sin las clases "sin usar") y, en ataque, los bonus a favor: los negativos son
  // resistencias del otro y confunden más de lo que dicen.
  const conNombre = (c: number) => !!u.classes[String(c)];
  const bonus = x.attacks.filter(([c, v]) => c !== 3 && c !== 4 && v > 0 && conNombre(c));
  const clases = x.armors.filter(([c]) => c !== 3 && c !== 4 && conNombre(c));
  const edificio = a.buildings.find((b) => b.id === x.building);
  const tiene = civsCon(a, `u${x.id}`);
  const todas = Object.keys(a.civs);
  const faltan = todas.filter((c) => !tiene.includes(c));
  const linea = x.line.map((i) => porId.get(i)).filter((f): f is Unidad => !!f);
  // Primero las comunes (por edad) y después las únicas o regionales de cada civ.
  const mejoras = techs
    ? x.upgrades
        .map((i) => techs.find((f) => f.id === i))
        .filter((f) => !!f)
        .sort((p, q) => Number(p.kind !== "Research") - Number(q.kind !== "Research") || p.age - q.age)
    : [];
  const n = (v: number, d = 2) => Number(v.toFixed(d)).toLocaleString(lang);
  const filas: [string, React.ReactNode][] = [
    [t.units.hp, n(x.hp)],
    ...(ataque || perforante ? ([[t.units.attack, `${n(ataque || perforante)}${x.projectiles > 1 ? ` · ${t.units.projectiles(x.projectiles)}` : ""}`]] as [string, string][]) : []),
    [t.units.melee, n(armadura(4))],
    [t.units.pierce, n(armadura(3))],
    ...(x.range ? ([[t.units.range, n(x.range)]] as [string, string][]) : []),
    ...(x.minRange ? ([[t.units.minRange, n(x.minRange)]] as [string, string][]) : []),
    ...(x.reload ? ([[t.units.reload, t.sec(Number(x.reload.toFixed(2)))]] as [string, string][]) : []),
    ...(x.accuracy && x.range ? ([[t.units.accuracy, `${x.accuracy}%`]] as [string, string][]) : []),
    [t.units.speed, n(x.speed)],
    [t.units.los, n(x.los)],
    [t.units.cost, <Costo key="c" cost={x.cost} />],
    [t.units.time, t.sec(x.time)],
    [t.units.building, edificio ? nombreDe(edificio.name, lang) : "–"],
    [t.units.age, edad(lang, x.age)],
  ];
  return (
    <>
      <Panel className="a2-who">
        <div className="a2-who-row">
          <Icono k="u" pic={x.pic} size={64} eager />
          <h1 className="a2-alias">{nombreDe(x.name, lang)}</h1>
        </div>
        {ayuda?.u[String(x.id)]?.map((p) => (
          <p key={p} className="a2-help">
            {p}
          </p>
        ))}
      </Panel>
      <div className="a2-two">
        <Panel h={t.units.stats}>
          <Datos filas={filas} />
          {x.attacks.length > 0 && x.reload > 0 && (
          <p>
            <RouteLink className="a2-btn" to={{ ...route, view: "aoe2", a2Section: "calculator", detail: undefined }} onNavigate={navigate} search={`?a=${x.slug}`}>
              {t.units.calc}
            </RouteLink>
          </p>
          )}
        </Panel>
        <div>
          {bonus.length > 0 && (
            <Panel h={t.units.bonusH} sub={t.units.bonusSub}>
              <ul className="a2-kv">
                {bonus.map(([c, v]) => (
                  <li key={c}>
                    <span>{clase(c)}</span>
                    <b className={v < 0 ? "a2-down" : "a2-up"}>{v > 0 ? `+${v}` : v}</b>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {clases.length > 0 && (
            <Panel h={t.units.armorH} sub={t.units.armorSub}>
              <ul className="a2-kv">
                {clases.map(([c, v]) => (
                  <li key={c}>
                    <span>{clase(c)}</span>
                    <b>{v}</b>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
      {(x.good.length > 0 || x.bad.length > 0) && (
        <Panel sub={t.units.countersSub} className="a2-two">
          <div>
            <h2>{t.units.goodH}</h2>
            {x.good.length ? <Fichas items={x.good.map((i) => porId.get(i)!).filter(Boolean)} k="u" route={route} navigate={navigate} /> : <p className="a2-note">{t.units.noCounters}</p>}
          </div>
          <div>
            <h2>{t.units.badH}</h2>
            {x.bad.length ? <Fichas items={x.bad.map((i) => porId.get(i)!).filter(Boolean)} k="u" route={route} navigate={navigate} /> : <p className="a2-note">{t.units.noCounters}</p>}
          </div>
        </Panel>
      )}
      {linea.length > 1 && (
        <Panel h={t.units.lineH}>
          <Fichas items={linea} k="u" route={route} navigate={navigate} />
        </Panel>
      )}
      {mejoras.length > 0 && (
        <Panel h={t.units.upgradesH}>
          <Fichas items={mejoras} k="t" route={route} navigate={navigate} />
        </Panel>
      )}
      <Panel h={t.units.civsH(tiene.length, todas.length)}>
        {faltan.length === 0 ? (
          <p className="a2-note">{t.units.civsAll}</p>
        ) : (
          <CivLista tiene={tiene} faltan={faltan} route={route} navigate={navigate} />
        )}
      </Panel>
    </>
  );
}

/** Las civs que la tienen (si son menos) o las que no (si faltan pocas), con escudo y link al árbol. */
export function CivLista({ tiene, faltan, route, navigate }: { tiene: string[]; faltan: string[]; route: Route; navigate: Nav }) {
  const t = useEncCopy();
  const { lang } = useLang();
  const muestra = faltan.length <= tiene.length ? faltan : tiene;
  const nombre = (c: string) => civBySlug(c)?.name[lang] ?? c;
  return (
    <>
      {faltan.length <= tiene.length && <p className="a2-note">{t.units.civsWithout(faltan.length)}</p>}
      <ul className="a2-civgrid">
        {[...muestra].sort((x, y) => nombre(x).localeCompare(nombre(y), lang)).map((c) => (
          <li key={c}>
            <RouteLink to={{ ...route, view: "aoe2", a2Section: "tech-tree", detail: c }} onNavigate={navigate}>
              <CivShield civ={civBySlug(c)} size={28} />
              <span>{nombre(c)}</span>
            </RouteLink>
          </li>
        ))}
      </ul>
    </>
  );
}
