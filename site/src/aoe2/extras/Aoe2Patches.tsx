/**
 * Parches de AoE2 (2026-11-21): la lista de actualizaciones y la ficha de las que tienen datos (`/aoe2/patches/<número>`):
 * link a las notas oficiales, cómo le fue a cada civ en 1v1 la semana anterior y la siguiente
 * (`games/aoe2/stats/patches.json`) y qué cambió en unidades, tecnologías y bonos de civ contra la actualización anterior
 * (`encyclopedia/patchdiff.json`; la primera foto es la 188329). Las actualizaciones sin datos van directo a sus notas.
 */
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang, useLocale, type Lang } from "../../i18n";
import { Aoe2Loading, CivShield, Panel, civBySlug, type Nav } from "../ui";
import { useEnc } from "../encyclopedia/parts";
import { tecnologias, unidades } from "../encyclopedia/data";
import { useEncCopy } from "../encyclopedia/copy";
import { pct } from "../stats/parts";
import { conFicha, diferencias, parches, type Cambio, type Dif, type Parche } from "./data";
import { useExtraCopy } from "./copy";

/** Las fechas en UTC: el parche sale a las 17 UTC y en otra zona caería otro día (y el prerender no coincidiría). */
const fecha = (d: string, locale: string) => new Date(d).toLocaleDateString(locale, { dateStyle: "long", timeZone: "UTC" });

export default function Aoe2Patches({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useExtraCopy().pat;
  const ps = useEnc(parches);
  const dif = useEnc(diferencias);
  const locale = useLocale();
  if (!ps || !dif) return <Aoe2Loading />;
  if (route.detail) {
    const p = ps.find((x) => x.name === route.detail && conFicha(x, dif));
    return p ? <Ficha key={p.name} p={p} d={dif[p.name]} route={route} navigate={navigate} /> : <Panel h={t.notFound} />;
  }
  const con = ps.filter((p) => conFicha(p, dif));
  const sin = ps.filter((p) => !conFicha(p, dif));
  return (
    <>
      <Panel h={t.h} sub={t.sub}>
        {!con.length && <p className="a2-note">{t.noData}</p>}
        <table className="a2-table">
          <tbody>
            {con.map((p) => (
              <tr key={p.name}>
                <td>
                  <RouteLink to={{ ...route, view: "aoe2", a2Section: "patches", detail: p.name }} onNavigate={navigate}>
                    {t.update(p.name)}
                  </RouteLink>
                  {p.minor && <span className="a2-note"> · {t.minor}</span>}
                </td>
                <td className="num">{fecha(p.date, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {sin.length > 0 && (
        <Panel h={t.oldNotes}>
          <table className="a2-table">
            <tbody>
              {sin.map((p) => (
                <tr key={p.name}>
                  <td>
                    <a href={p.url} target="_blank" rel="noopener noreferrer">
                      {t.update(p.name)}
                    </a>
                    {p.minor && <span className="a2-note"> · {t.minor}</span>}
                  </td>
                  <td className="num">{fecha(p.date, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}

function Ficha({ p, d, route, navigate }: { p: Parche; d: Dif | undefined; route: Route; navigate: Nav }) {
  const t = useExtraCopy().pat;
  const { lang } = useLang();
  const locale = useLocale();
  return (
    <>
      <Panel className="a2-who">
        <h1 className="a2-alias">{t.update(p.name)}</h1>
        <p className="a2-note">
          {fecha(p.date, locale)}
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
        {d ? <Cambios d={d} lang={lang} /> : <p className="a2-note">{t.noData}</p>}
      </Panel>
    </>
  );
}

/** Los cambios de cifras y bonos. Baja unidades y tecnologías (para nombrarlas) sólo si hay algo que nombrar. */
function Cambios({ d, lang }: { d: Dif; lang: Lang }) {
  const t = useExtraCopy().pat;
  const hayCifras = d.units.length > 0 || d.techs.length > 0 || d.new.length > 0;
  const civs = Object.entries(d.civs);
  if (!hayCifras && !civs.length) return <p className="a2-note">{t.noChanges}</p>;
  return (
    <>
      {hayCifras ? <Cifras d={d} lang={lang} /> : <p className="a2-note">{t.noChanges}</p>}
      {civs.map(([c, x]) => (
        <div key={c}>
          <h3 className="a2-calc-h">{civBySlug(c)?.name[lang] ?? c}</h3>
          <ul className="a2-bullets">
            {x.added.map((s) => (
              <li key={`+${s.en}`}>
                <b className="a2-up">{t.bonusAdded}:</b> {s[lang] || s.en}
              </li>
            ))}
            {x.removed.map((s) => (
              <li key={`-${s.en}`}>
                <b className="a2-down">{t.bonusRemoved}:</b> {s[lang] || s.en}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function Cifras({ d, lang }: { d: Dif; lang: Lang }) {
  const t = useExtraCopy().pat;
  const enc = useEncCopy();
  const u = useEnc(unidades);
  const ts = useEnc(tecnologias);
  if (!u || !ts) return <Aoe2Loading />;
  const nombreU = (id: number) => u.units.find((x) => x.id === id)?.name[lang] ?? String(id);
  const nombreT = (id: number) => ts.find((x) => x.id === id)?.name[lang] ?? String(id);
  const campo = (c: string) => {
    const [k, cls] = c.split(".");
    const base = t.fields[k] ?? k;
    const n = cls ? u.classes[cls] : undefined;
    return cls ? `${base} (${n ? n[lang] || n.en : cls})` : base;
  };
  const valor = (v: unknown): string => {
    if (v == null) return "–";
    if (typeof v === "object") return Object.entries(v as Record<string, number>).map(([k, n]) => `${n} ${enc.res[k as keyof typeof enc.res] ?? k}`).join(" · ");
    return typeof v === "number" ? Number(v.toFixed(2)).toLocaleString(lang) : String(v);
  };
  const fila = (nombre: string, [id, c, a, b]: Cambio) => (
    <li key={`${nombre}${id}${c}`}>
      <span>
        {nombre} · {campo(c)}
      </span>
      <b>
        {valor(a)} → {valor(b)}
      </b>
    </li>
  );
  return (
    <>
      {d.units.length > 0 && <ul className="a2-kv">{d.units.map((x) => fila(nombreU(x[0]), x))}</ul>}
      {d.techs.length > 0 && <ul className="a2-kv">{d.techs.map((x) => fila(nombreT(x[0]), x))}</ul>}
      {d.new.length > 0 && (
        <p>
          {t.newUnits}: {d.new.map(nombreU).join(", ")}
        </p>
      )}
    </>
  );
}
