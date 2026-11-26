/**
 * Calculadora de AoE2 (2026-11-21): unidad A contra unidad B, cada una con su civ, en una edad. Aplica los bonos de la
 * civ hasta esa edad y las tecnologías que la civ tiene y que tocan a la unidad (se pueden destildar); calcula el daño
 * por golpe, los golpes y los segundos para matar con el motor de `calc.ts`. La elección viaja en la dirección
 * (`?a=knight&ca=franks&b=halberdier&cb=britons&e=4`) para compartirla.
 */
import { useEffect, useMemo, useState } from "react";
import type { Route } from "../../route";
import { useLang, type Lang } from "../../i18n";
import civsJson from "@aoe2/civs.json";
import { Aoe2Loading, CivShield, Panel, civBySlug, type Civ, type Nav } from "../ui";
import { arbol, civFx, edad, estado, tecnologias, unidades, type Arbol, type CivFx, type Tecnologia, type Unidad } from "./data";
import { aplicar, duelo, type Combatiente, type Fx } from "./calc";
import { useEncCopy } from "./copy";
import { Icono, useEnc } from "./parts";

const nombreDe = (n: { en: string; es: string }, lang: Lang) => n[lang] || n.en;
type Lado = { civ: string; unit: string; off: number[] };

export { armar, mejorasPara } from "./armar";
import { armar, mejorasPara } from "./armar";

function leerQuery(): Partial<Record<"a" | "b" | "ca" | "cb" | "e", string>> {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  return Object.fromEntries(["a", "b", "ca", "cb", "e"].map((k) => [k, p.get(k) ?? undefined]).filter(([, v]) => v));
}

export default function Aoe2Calculator(_: { route: Route; navigate: Nav }) {
  const u = useEnc(unidades);
  const a = useEnc(arbol);
  const ts = useEnc(tecnologias);
  const fx = useEnc(civFx);
  if (!u || !a || !ts || !fx) return <Aoe2Loading />;
  return <Calculadora us={u.units} a={a} ts={ts} fx={fx} />;
}

function Calculadora({ us, a, ts, fx }: { us: Unidad[]; a: Arbol; ts: Tecnologia[]; fx: CivFx }) {
  const t = useEncCopy();
  const { lang } = useLang();
  const porSlug = useMemo(() => new Map(us.map((x) => [x.slug, x])), [us]);
  const civs = useMemo(() => (civsJson as Civ[]).filter((c) => a.civs[c.slug]).sort((x, y) => x.name[lang].localeCompare(y.name[lang], lang)), [a, lang]);
  const primeraCon = (slug: string, pref: string) => (estado(a, pref, `u${porSlug.get(slug)?.id}`) !== "0" ? pref : civs.find((c) => estado(a, c.slug, `u${porSlug.get(slug)?.id}`) !== "0")?.slug ?? pref);
  const [e, setE] = useState(4);
  const [lados, setLados] = useState<[Lado, Lado]>([
    { civ: "franks", unit: "knight", off: [] },
    { civ: "britons", unit: "halberdier", off: [] },
  ]);
  // Lo que venga en la dirección (link desde una ficha o compartido) manda, ya en el navegador.
  useEffect(() => {
    const q = leerQuery();
    // Sólo unidades que pelean (con ataque y recarga) y una civ que la tenga; si no, la primera que la tiene.
    const pelea = (s?: string) => !!s && !!porSlug.get(s)?.attacks.length && (porSlug.get(s)?.reload ?? 0) > 0;
    const ua = pelea(q.a) ? q.a! : "knight";
    const ub = pelea(q.b) ? q.b! : "halberdier";
    const tiene = (c: string | undefined, u: string) => !!c && !!a.civs[c] && estado(a, c, `u${porSlug.get(u)!.id}`) !== "0";
    const ca = tiene(q.ca, ua) ? q.ca! : primeraCon(ua, "franks");
    const cb = tiene(q.cb, ub) ? q.cb! : primeraCon(ub, "britons");
    if (q.e && /^[2-4]$/.test(q.e)) setE(Number(q.e));
    setLados([
      { civ: ca, unit: ua, off: [] },
      { civ: cb, unit: ub, off: [] },
    ]);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams({ a: lados[0].unit, ca: lados[0].civ, b: lados[1].unit, cb: lados[1].civ, e: String(e) });
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${p}`);
  }, [lados, e]);

  const set = (i: 0 | 1, l: Partial<Lado>) => setLados((ls) => (i === 0 ? [{ ...ls[0], ...l }, ls[1]] : [ls[0], { ...ls[1], ...l }]));
  const armados = lados.map((l) => {
    const x = porSlug.get(l.unit)!;
    const todas = mejorasPara(ts, a, l.civ, x, e);
    const usadas = todas.filter((m) => !l.off.includes(m.id));
    return { x, todas, c: armar(x, l.civ, e, fx, usadas) };
  });
  const [A, B] = armados;
  const ab = duelo(A.c, B.c);
  const ba = duelo(B.c, A.c);
  const nA = nombreDe(A.x.name, lang);
  const nB = nombreDe(B.x.name, lang);
  const veredicto = Math.abs(ab.segundos - ba.segundos) < 0.05 ? t.calc.tie : ab.segundos < ba.segundos ? t.calc.winner(nA) : t.calc.winner(nB);
  return (
    <>
      <Panel h={t.calc.h} sub={t.calc.sub}>
        <label className="a2-pick">
          {t.calc.age}{" "}
          <select value={e} onChange={(ev) => setE(Number(ev.target.value))}>
            {[2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {edad(lang, n)}
              </option>
            ))}
          </select>
        </label>
      </Panel>
      <div className="a2-two">
        {([0, 1] as const).map((i) => {
          const l = lados[i];
          const { x, todas, c } = armados[i];
          const disponibles = us.filter((u) => estado(a, l.civ, `u${u.id}`) !== "0" && !u.slug.endsWith(`-${u.id}`) && u.attacks.length > 0 && u.reload > 0);
          return (
            <Panel key={i} h={t.calc.side(i + 1)} className="a2-calc-side">
              <div className="a2-calc-pick">
                <CivShield civ={civBySlug(l.civ)} size={40} />
                <label>
                  {t.calc.civ}
                  <select value={l.civ} onChange={(ev) => set(i, { civ: ev.target.value, unit: estado(a, ev.target.value, `u${x.id}`) !== "0" ? l.unit : "militia", off: [] })}>
                    {civs.map((cv) => (
                      <option key={cv.slug} value={cv.slug}>
                        {cv.name[lang]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="a2-calc-pick">
                <Icono k="u" pic={x.pic} size={40} eager />
                <label>
                  {t.calc.unit}
                  <select value={l.unit} onChange={(ev) => set(i, { unit: ev.target.value, off: [] })}>
                    {disponibles.map((u) => (
                      <option key={u.id} value={u.slug}>
                        {nombreDe(u.name, lang)}
                        {u.age > e ? ` (${edad(lang, u.age)})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <dl className="a2-facts">
                <div>
                  <dt>{t.units.hp}</dt>
                  <dd>{c.hp}</dd>
                </div>
                <div>
                  <dt>{t.units.attack}</dt>
                  <dd>{c.attacks[4] ?? c.attacks[3] ?? 0}</dd>
                </div>
                <div>
                  <dt>{t.units.melee}</dt>
                  <dd>{c.armors[4] ?? 0}</dd>
                </div>
                <div>
                  <dt>{t.units.pierce}</dt>
                  <dd>{c.armors[3] ?? 0}</dd>
                </div>
              </dl>
              <h3 className="a2-calc-h">{t.calc.upgrades}</h3>
              {todas.length ? (
                <ul className="a2-checks">
                  {todas.map((m) => (
                    <li key={m.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={!l.off.includes(m.id)}
                          onChange={() => set(i, { off: l.off.includes(m.id) ? l.off.filter((z) => z !== m.id) : [...l.off, m.id] })}
                        />
                        <Icono k="t" pic={m.pic} size={24} />
                        <span>{nombreDe(m.name, lang)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="a2-note">{t.calc.noUpgrades}</p>
              )}
            </Panel>
          );
        })}
      </div>
      <Panel h={veredicto} sub={t.calc.note} className="a2-calc-res">
        <table className="a2-table">
          <thead>
            <tr>
              <th />
              <th className="num">{t.calc.perHit}</th>
              <th className="num">{t.calc.hits}</th>
              <th className="num">{t.calc.seconds}</th>
            </tr>
          </thead>
          <tbody>
            {[
              [t.calc.vs(nA, nB), ab, A.c.accuracy],
              [t.calc.vs(nB, nA), ba, B.c.accuracy],
            ].map(([txt, d, acc]) => {
              const r = d as ReturnType<typeof duelo>;
              return (
                <tr key={txt as string}>
                  <td>{txt as string}</td>
                  <td className="num">
                    <b>{r.dano}</b>
                  </td>
                  <td className="num">
                    {r.golpes}
                    {(acc as number) < 100 && <small className="a2-note"> · {t.calc.expected(Math.ceil(r.esperados))}</small>}
                  </td>
                  <td className="num">{t.sec(Number(r.segundos.toFixed(1)))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
