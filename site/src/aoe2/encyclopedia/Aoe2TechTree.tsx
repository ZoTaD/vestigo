/**
 * Árbol tecnológico de AoE2 (2026-11-21): sin civ, los escudos para elegir; con civ (`/aoe2/tech-tree/<slug>`), desde el
 * 2026-11-26 la ficha de la civ arriba (`CivFicha`: qué es de un vistazo) y el árbol completo abajo, edificio por
 * edificio y edad por edad, con el nombre de cada cosa, lo que no tiene tachado y lo que sus bonos mejoran marcado. Las
 * únicas de otras civs y lo regional (lo que tiene menos del 30% de las civs) no se muestran si no lo tiene.
 */
import { useMemo } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang, type Lang } from "../../i18n";
import civsJson from "@aoe2/civs.json";
import { Aoe2Loading, CivShield, Panel, civBySlug, type Civ, type Nav } from "../ui";
import { arbol, civFx, estado, loadCivInfo, peekCivInfo, tecnologias, unidades, type Arbol, type CivFx, type Tecnologia, type Unidades } from "./data";
import { COMUN, bonosDe, parteCivs } from "./identidad";
import CivFicha from "./CivFicha";
import { useEncCopy } from "./copy";
import { Icono, useCargado, useEnc } from "./parts";

const nombreDe = (n: { en: string; es: string }, lang: Lang) => n[lang] || n.en;
const EDAD_CORTA: Record<Lang, string[]> = { en: ["", "Dark", "Feudal", "Castle", "Imperial"], es: ["", "Oscura", "Feudal", "Castillos", "Imperial"] };

export default function Aoe2TechTree({ route, navigate }: { route: Route; navigate: Nav }) {
  const a = useEnc(arbol);
  const u = useEnc(unidades);
  const ts = useEnc(tecnologias);
  const fx = useEnc(civFx);
  if (!a || !u || !ts || !fx) return <Aoe2Loading />;
  const civ = route.detail && a.civs[route.detail] ? route.detail : null;
  return civ ? <Arbolito key={civ} civ={civ} a={a} u={u} ts={ts} fx={fx} route={route} navigate={navigate} /> : <Elegir a={a} route={route} navigate={navigate} />;
}

function Elegir({ a, route, navigate }: { a: Arbol; route: Route; navigate: Nav }) {
  const t = useEncCopy();
  const { lang } = useLang();
  const civs = (civsJson as Civ[]).filter((c) => a.civs[c.slug]).sort((x, y) => x.name[lang].localeCompare(y.name[lang], lang));
  return (
    <Panel h={t.tree.h} sub={t.tree.sub}>
      <ul className="a2-civgrid">
        {civs.map((c) => (
          <li key={c.slug}>
            <RouteLink to={{ ...route, view: "aoe2", a2Section: "tech-tree", detail: c.slug }} onNavigate={navigate}>
              <CivShield civ={c} size={32} />
              <span>{c.name[lang]}</span>
            </RouteLink>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

type Nodo = { k: "u" | "t"; id: number; slug: string; name: { en: string; es: string }; pic: number; age: number; s: "0" | "1" | "2"; bono: string | null };

function Arbolito({ civ, a, u, ts, fx, route, navigate }: { civ: string; a: Arbol; u: Unidades; ts: Tecnologia[]; fx: CivFx; route: Route; navigate: Nav }) {
  const t = useEncCopy();
  const { lang } = useLang();
  const info = useCargado(() => peekCivInfo(civ), () => loadCivInfo(civ), civ);
  const civs = (civsJson as Civ[]).filter((x) => a.civs[x.slug]).sort((x, y) => x.name[lang].localeCompare(y.name[lang], lang));
  const edificios = useMemo(() => {
    const nodos = new Map<number, Nodo[]>();
    const sumar = (b: number, n: Nodo) => nodos.set(b, [...(nodos.get(b) ?? []), n]);
    for (const x of u.units) {
      const s = estado(a, civ, `u${x.id}`);
      // Lo único o regional de otra civ no está en su árbol; tampoco las variantes repetidas.
      if ((x.kind === "UniqueUnit" || x.kind === "RegionalUnit" || parteCivs(a, `u${x.id}`) < COMUN) && s === "0") continue;
      // Una variante (mismo nombre, otro id) sólo si es de esta civ: el Huscarle de los godos, el Konnik de la Krepost.
      if (x.slug.endsWith(`-${x.id}`) && s === "0") continue;
      const bono = s === "0" ? null : (bonosDe(x, civ, fx, lang, u.classes)[0] ?? null);
      sumar(x.building, { k: "u", id: x.id, slug: x.slug, name: x.name, pic: x.pic, age: x.age, s, bono });
    }
    for (const x of ts) {
      const s = estado(a, civ, `t${x.id}`);
      if ((x.kind !== "Research" || parteCivs(a, `t${x.id}`) < COMUN) && s === "0") continue;
      if (x.slug.endsWith(`-${x.id}`) && s === "0") continue;
      sumar(x.building, { k: "t", id: x.id, slug: x.slug, name: x.name, pic: x.pic, age: x.age, s, bono: null });
    }
    return a.buildings
      .filter((b) => nodos.has(b.id))
      .map((b) => ({ b, off: estado(a, civ, `b${b.id}`) === "0", nodos: nodos.get(b.id)!.sort((x, y) => x.age - y.age || (x.k === y.k ? 0 : x.k === "u" ? -1 : 1)) }));
  }, [a, civ, u, ts, fx, lang]);
  const picker = (
    <label className="a2-pick">
      {t.tree.pick}{" "}
      <select value={civ} onChange={(e) => navigate({ ...route, view: "aoe2", a2Section: "tech-tree", detail: e.target.value })}>
        {civs.map((x) => (
          <option key={x.slug} value={x.slug}>
            {x.name[lang]}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      {info ? <CivFicha civ={civ} info={info} a={a} u={u} ts={ts} fx={fx} route={route} navigate={navigate} picker={picker} /> : <Panel>{picker}</Panel>}
      <Panel h={t.tree.fullH} sub={t.tree.fullSub}>
        <p className="a2-tree-legend">
          <span className="is-have">{t.tree.legend.have}</span>
          <span className="is-miss">✕ {t.tree.legend.miss}</span>
          <span className="is-bonus">{t.tree.legendBonus}</span>
        </p>
      </Panel>
      <div className="a2-tree">
        {edificios.map(({ b, off, nodos }) => (
          <section key={b.id} className={`a2-panel a2-tree-b${off ? " is-off" : ""}`}>
            <h2 className="a2-group-h">
              <Icono k="b" pic={b.pic} size={32} off={off} />
              <span>{nombreDe(b.name, lang)}</span>
            </h2>
            {[1, 2, 3, 4].map((e) => {
              const fila = nodos.filter((n) => n.age === e);
              if (!fila.length) return null;
              return (
                <div key={e} className="a2-tree-age">
                  <small>{EDAD_CORTA[lang][e]}</small>
                  <ul>
                    {fila.map((n) => (
                      <li key={`${n.k}${n.id}`} className={n.s === "0" ? "is-off" : undefined}>
                        <RouteLink to={{ ...route, view: "aoe2", a2Section: n.k === "u" ? "units" : "technologies", detail: n.slug }} onNavigate={navigate} prefetch="press">
                          <Icono k={n.k} pic={n.pic} size={44} off={n.s === "0"} />
                          {n.bono && <em>{n.bono}</em>}
                          <span>{nombreDe(n.name, lang)}</span>
                          {n.s === "2" && <small>{t.tree.withTech}</small>}
                        </RouteLink>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </>
  );
}
