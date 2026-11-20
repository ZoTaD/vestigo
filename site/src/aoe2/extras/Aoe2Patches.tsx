/**
 * Parches de AoE2 (2026-11-21): la lista de actualizaciones y la ficha de cada una (`/aoe2/patches/<número>`): link a las
 * notas oficiales, cómo le fue a cada civ en 1v1 la semana anterior y la siguiente (`games/aoe2/stats/patches.json`, del
 * recolector) y qué cambió en unidades, tecnologías y bonos de civ contra la actualización anterior
 * (`encyclopedia/patchdiff.json`; hay desde la segunda foto, la primera es la 188329).
 */
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang, useLocale } from "../../i18n";
import { Aoe2Loading, CivShield, Panel, civBySlug, type Nav } from "../ui";
import { useEnc } from "../encyclopedia/parts";
import { tecnologias, unidades } from "../encyclopedia/data";
import { pct } from "../stats/parts";
import { diferencias, parches, type Parche } from "./data";
import { useExtraCopy } from "./copy";

export default function Aoe2Patches({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useExtraCopy().pat;
  const ps = useEnc(parches);
  const locale = useLocale();
  if (!ps) return <Aoe2Loading />;
  if (route.detail) {
    const p = ps.find((x) => x.name === route.detail);
    return p ? <Ficha key={p.name} p={p} route={route} navigate={navigate} /> : <Panel h={t.notFound} />;
  }
  const fecha = (d: string) => new Date(d).toLocaleDateString(locale, { dateStyle: "long" });
  return (
    <Panel h={t.h} sub={t.sub}>
      <table className="a2-table">
        <tbody>
          {ps.map((p) => (
            <tr key={p.name}>
              <td>
                <RouteLink to={{ ...route, view: "aoe2", a2Section: "patches", detail: p.name }} onNavigate={navigate}>
                  {t.update(p.name)}
                </RouteLink>
                {p.minor && <span className="a2-note"> · {t.minor}</span>}
              </td>
              <td className="num">{fecha(p.date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Ficha({ p, route, navigate }: { p: Parche; route: Route; navigate: Nav }) {
  const t = useExtraCopy().pat;
  const { lang } = useLang();
  const locale = useLocale();
  const dif = useEnc(diferencias);
  const u = useEnc(unidades);
  const ts = useEnc(tecnologias);
  const d = dif?.[p.name];
  const nombreU = (id: number) => u?.units.find((x) => x.id === id)?.name[lang] ?? String(id);
  const nombreT = (id: number) => ts?.find((x) => x.id === id)?.name[lang] ?? String(id);
  const valor = (v: unknown): string => {
    if (Array.isArray(v)) return v.map((x) => (Array.isArray(x) ? `${x[1]}` : String(x))).join(" / ");
    if (v && typeof v === "object") return Object.entries(v as Record<string, number>).map(([k, n]) => `${n} ${k}`).join(" · ");
    return String(v);
  };
  return (
    <>
      <Panel className="a2-who">
        <h1 className="a2-alias">{t.update(p.name)}</h1>
        <p className="a2-note">
          {new Date(p.date).toLocaleDateString(locale, { dateStyle: "long" })}
          {p.minor ? ` · ${t.minor}` : ""}
        </p>
        <p>
          <a className="a2-btn" href={p.url} target="_blank" rel="noopener noreferrer">
            {t.notes}
          </a>
        </p>
      </Panel>
      <Panel h={t.civsH} sub={p.civs.length ? t.civsSub(p.days[0], p.days[1]) : undefined}>
        {p.civs.length ? (
          <table className="a2-table">
            <thead>
              <tr>
                <th />
                <th className="num">{t.before}</th>
                <th className="num">{t.after}</th>
                <th className="num">{t.change}</th>
              </tr>
            </thead>
            <tbody>
              {p.civs.map(([c, a, , b]) => (
                <tr key={c}>
                  <td>
                    <RouteLink className="a2-civ" to={{ ...route, view: "aoe2", a2Section: "civilizations", detail: c }} onNavigate={navigate}>
                      <CivShield civ={civBySlug(c)} size={26} />
                      <span>{civBySlug(c)?.name[lang] ?? c}</span>
                    </RouteLink>
                  </td>
                  <td className="num">{pct(a)}</td>
                  <td className="num">{pct(b)}</td>
                  <td className={`num ${b >= a ? "a2-up" : "a2-down"}`}>
                    <b>{`${b >= a ? "+" : "−"}${(Math.abs(b - a) * 100).toFixed(1)}`}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="a2-note">{t.noCivs}</p>
        )}
      </Panel>
      <Panel h={t.dataH} sub={d ? t.dataSub(d.from) : undefined}>
        {!d ? (
          <p className="a2-note">{t.noData}</p>
        ) : (
          <>
            {d.units.length > 0 && (
              <ul className="a2-kv">
                {d.units.map(([id, campo, a, b]) => (
                  <li key={`u${id}${campo}`}>
                    <span>
                      {nombreU(id)} · {t.fields[campo] ?? campo}
                    </span>
                    <b>
                      {valor(a)} → {valor(b)}
                    </b>
                  </li>
                ))}
              </ul>
            )}
            {d.techs.length > 0 && (
              <ul className="a2-kv">
                {d.techs.map(([id, campo, a, b]) => (
                  <li key={`t${id}${campo}`}>
                    <span>
                      {nombreT(id)} · {t.fields[campo] ?? campo}
                    </span>
                    <b>
                      {valor(a)} → {valor(b)}
                    </b>
                  </li>
                ))}
              </ul>
            )}
            {d.new.length > 0 && (
              <p>
                {t.newUnits}: {d.new.map(nombreU).join(", ")}
              </p>
            )}
            {Object.entries(d.civs).map(([c, x]) => (
              <div key={c} className="a2-patch-civ">
                <h3 className="a2-calc-h">{civBySlug(c)?.name[lang] ?? c}</h3>
                <ul className="a2-bullets">
                  {x.added.map((s) => (
                    <li key={`+${s}`}>
                      <b className="a2-up">{t.bonusAdded}:</b> {s}
                    </li>
                  ))}
                  {x.removed.map((s) => (
                    <li key={`-${s}`}>
                      <b className="a2-down">{t.bonusRemoved}:</b> {s}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </Panel>
    </>
  );
}
