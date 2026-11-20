/**
 * Árbol tecnológico de AoE2 (2026-11-21): sin civ, los escudos para elegir; con civ (`/aoe2/tech-tree/<slug>`), lo que
 * le falta de lo común arriba y después cada edificio con sus unidades y tecnologías por edad, como las columnas del
 * árbol del juego. Lo que la civ no tiene va apagado; las únicas y regionales de otras civs no se muestran.
 */
import { useMemo } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang, type Lang } from "../../i18n";
import civsJson from "@aoe2/civs.json";
import { Aoe2Loading, CivShield, Panel, civBySlug, type Civ, type Nav } from "../ui";
import { arbol, estado, loadCivInfo, peekCivInfo, tecnologias, unidades, type Arbol, type Tecnologia, type Unidad } from "./data";
import { useEncCopy } from "./copy";
import { Fichas, Icono, useCargado, useEnc } from "./parts";

const nombreDe = (n: { en: string; es: string }, lang: Lang) => n[lang] || n.en;
const EDAD_CORTA: Record<Lang, string[]> = { en: ["", "Dark", "Feudal", "Castle", "Imperial"], es: ["", "Oscura", "Feudal", "Castillos", "Imperial"] };

export default function Aoe2TechTree({ route, navigate }: { route: Route; navigate: Nav }) {
  const a = useEnc(arbol);
  const u = useEnc(unidades);
  const ts = useEnc(tecnologias);
  if (!a || !u || !ts) return <Aoe2Loading />;
  const civ = route.detail && a.civs[route.detail] ? route.detail : null;
  return civ ? <Arbolito key={civ} civ={civ} a={a} us={u.units} ts={ts} route={route} navigate={navigate} /> : <Elegir a={a} route={route} navigate={navigate} />;
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

type Nodo = { k: "u" | "t"; id: number; slug: string; name: { en: string; es: string }; pic: number; age: number; off: boolean };

function Arbolito({ civ, a, us, ts, route, navigate }: { civ: string; a: Arbol; us: Unidad[]; ts: Tecnologia[]; route: Route; navigate: Nav }) {
  const t = useEncCopy();
  const { lang } = useLang();
  const info = useCargado(() => peekCivInfo(civ), () => loadCivInfo(civ), civ);
  const c = civBySlug(civ);
  const civs = (civsJson as Civ[]).filter((x) => a.civs[x.slug]).sort((x, y) => x.name[lang].localeCompare(y.name[lang], lang));
  const edificios = useMemo(() => {
    const nodos = new Map<number, Nodo[]>();
    const sumar = (b: number, n: Nodo) => nodos.set(b, [...(nodos.get(b) ?? []), n]);
    for (const x of us) {
      const s = estado(a, civ, `u${x.id}`);
      // Lo único o regional de otra civ no está en su árbol; tampoco las variantes repetidas.
      if ((x.kind === "UniqueUnit" || x.kind === "RegionalUnit") && s === "0") continue;
      if (x.slug.endsWith(`-${x.id}`)) continue;
      sumar(x.building, { k: "u", id: x.id, slug: x.slug, name: x.name, pic: x.pic, age: x.age, off: s === "0" });
    }
    for (const x of ts) {
      const s = estado(a, civ, `t${x.id}`);
      if (x.kind !== "Research" && s === "0") continue;
      if (x.slug.endsWith(`-${x.id}`)) continue;
      sumar(x.building, { k: "t", id: x.id, slug: x.slug, name: x.name, pic: x.pic, age: x.age, off: s === "0" });
    }
    return a.buildings
      .filter((b) => nodos.has(b.id))
      .map((b) => ({ b, off: estado(a, civ, `b${b.id}`) === "0", nodos: nodos.get(b.id)!.sort((x, y) => x.age - y.age || (x.k === y.k ? 0 : x.k === "u" ? -1 : 1)) }));
  }, [a, civ, us, ts]);
  const falta = info ? [...info.missU.map((x) => ({ ...x, k: "u" as const })), ...info.missT.map((x) => ({ ...x, k: "t" as const }))] : [];
  return (
    <>
      <Panel className="a2-who">
        <div className="a2-who-row">
          <CivShield civ={c} size={64} />
          <div>
            <small className="a2-kicker">{t.tree.h}</small>
            <h1 className="a2-alias">{c?.name[lang] ?? civ}</h1>
          </div>
        </div>
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
        <p className="a2-note">{t.tree.sub}</p>
      </Panel>
      {info && (
        <Panel h={t.tree.missingH} sub={t.tree.missingSub}>
          {falta.length ? (
            <>
              <Fichas items={falta.filter((x) => x.k === "u")} k="u" route={route} navigate={navigate} />
              <Fichas items={falta.filter((x) => x.k === "t")} k="t" route={route} navigate={navigate} />
            </>
          ) : (
            <p className="a2-note">{t.tree.nothingMissing}</p>
          )}
        </Panel>
      )}
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
                      <li key={`${n.k}${n.id}`} className={n.off ? "is-off" : undefined} title={nombreDe(n.name, lang)}>
                        <RouteLink to={{ ...route, view: "aoe2", a2Section: n.k === "u" ? "units" : "technologies", detail: n.slug }} onNavigate={navigate} prefetch="press" aria-label={nombreDe(n.name, lang)}>
                          <Icono k={n.k} pic={n.pic} size={40} off={n.off} />
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
