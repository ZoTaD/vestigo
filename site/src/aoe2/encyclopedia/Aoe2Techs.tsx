/**
 * Tecnologías de AoE2 (2026-11-21): la lista por edificio y edad (más las únicas) y la ficha de cada una
 * (`/aoe2/technologies/<slug>`): costo, tiempo, edad, edificio, qué hace (texto del juego), unidades que mejora y civs.
 */
import { useMemo } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang, type Lang } from "../../i18n";
import { Aoe2Loading, Panel, type Nav } from "../ui";
import { arbol, civsCon, edad, loadAyuda, peekAyuda, tecnologias, unidades, type Arbol, type Tecnologia } from "./data";
import { useEncCopy } from "./copy";
import { CivLista } from "./Aoe2Units";
import { Costo, Datos, Fichas, Icono, useCargado, useEnc } from "./parts";

const nombreDe = (n: { en: string; es: string }, lang: Lang) => n[lang] || n.en;
const variante = (x: Tecnologia) => x.slug.endsWith(`-${x.id}`);

export default function Aoe2Techs({ route, navigate }: { route: Route; navigate: Nav }) {
  const ts = useEnc(tecnologias);
  const a = useEnc(arbol);
  if (!ts || !a) return <Aoe2Loading />;
  if (route.detail) return <Ficha key={route.detail} slug={route.detail} ts={ts} a={a} route={route} navigate={navigate} />;
  return <Lista ts={ts} a={a} route={route} navigate={navigate} />;
}

function Lista({ ts, a, route, navigate }: { ts: Tecnologia[]; a: Arbol; route: Route; navigate: Nav }) {
  const t = useEncCopy();
  const { lang } = useLang();
  const grupos = useMemo(() => {
    const comunes = ts.filter((x) => x.kind === "Research" && !variante(x));
    const out = new Map<number, Tecnologia[]>();
    for (const x of comunes) out.set(x.building, [...(out.get(x.building) ?? []), x]);
    return [...out.entries()]
      .map(([b, filas]) => ({ b: a.buildings.find((e) => e.id === b), filas: filas.sort((x, y) => x.age - y.age) }))
      .filter((g) => g.b);
  }, [ts, a]);
  const unicas = ts.filter((x) => x.kind !== "Research" && !variante(x)).sort((x, y) => nombreDe(x.name, lang).localeCompare(nombreDe(y.name, lang), lang));
  return (
    <>
      <Panel h={t.techs.h} sub={t.techs.sub} />
      <div className="a2-groups">
        {grupos.map((g) => (
          <section key={g.b!.id} className="a2-panel a2-group">
            <h2 className="a2-group-h">
              <Icono k="b" pic={g.b!.pic} size={28} />
              <span>{nombreDe(g.b!.name, lang)}</span>
            </h2>
            <ul className="a2-tiles">
              {g.filas.map((x) => (
                <li key={x.id}>
                  <RouteLink to={{ ...route, view: "aoe2", a2Section: "technologies", detail: x.slug }} onNavigate={navigate}>
                    <Icono k="t" pic={x.pic} size={44} />
                    <span>{nombreDe(x.name, lang)}</span>
                  </RouteLink>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <Panel h={t.techs.unique}>
        <Fichas items={unicas} k="t" route={route} navigate={navigate} />
      </Panel>
    </>
  );
}

function Ficha({ slug, ts, a, route, navigate }: { slug: string; ts: Tecnologia[]; a: Arbol; route: Route; navigate: Nav }) {
  const t = useEncCopy();
  const { lang } = useLang();
  const u = useEnc(unidades);
  const x = ts.find((f) => f.slug === slug);
  const ayuda = useCargado(() => (x ? peekAyuda(lang, x.id) : null), () => (x ? loadAyuda(lang, x.id) : Promise.resolve(null)), `${lang}:${x?.id}`);
  if (!x) return <Panel h={t.techs.notFound} />;
  const edificio = a.buildings.find((b) => b.id === x.building);
  const tiene = civsCon(a, `t${x.id}`);
  const todas = Object.keys(a.civs);
  const faltan = todas.filter((c) => !tiene.includes(c));
  const afecta = u ? x.units.map((i) => u.units.find((f) => f.id === i)).filter((f) => !!f && !f.slug.endsWith(`-${f.id}`)) : [];
  return (
    <>
      <Panel className="a2-who">
        <div className="a2-who-row">
          <Icono k="t" pic={x.pic} size={64} eager />
          <h1 className="a2-alias">{nombreDe(x.name, lang)}</h1>
        </div>
        {ayuda?.t[String(x.id)]?.map((p) => (
          <p key={p} className="a2-help">
            {p}
          </p>
        ))}
      </Panel>
      <Panel>
        <Datos
          filas={[
            [t.units.cost, <Costo key="c" cost={x.cost} />],
            [t.techs.time, t.sec(x.time)],
            [t.techs.researched, edificio ? nombreDe(edificio.name, lang) : "–"],
            [t.units.age, edad(lang, x.age)],
          ]}
        />
      </Panel>
      {afecta.length > 0 && (
        <Panel h={t.techs.affects}>
          <Fichas items={afecta as NonNullable<(typeof afecta)[number]>[]} k="u" route={route} navigate={navigate} />
        </Panel>
      )}
      <Panel h={t.units.civsH(tiene.length, todas.length)}>
        {faltan.length === 0 ? <p className="a2-note">{t.units.civsAll}</p> : <CivLista tiene={tiene} faltan={faltan} route={route} navigate={navigate} />}
      </Panel>
    </>
  );
}
