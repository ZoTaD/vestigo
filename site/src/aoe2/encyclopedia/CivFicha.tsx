/**
 * La ficha de una civ arriba de su árbol (2026-11-26, maqueta A elegida por ZoTaD): qué es de un vistazo. Escudo, tipo
 * y sus números en ranking; sus mejores unidades con nota S/A/B (`identidad.ts`); lo único con su texto del juego; los
 * bonos; y lo que le falta, con lo que más pesa en rojo. Las estadísticas llegan después del primer dibujo (el resumen
 * es grande y no hace falta para entender la civ).
 */
import { useEffect, useMemo, useState } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang } from "../../i18n";
import { CivShield, Panel, civBySlug, type Nav } from "../ui";
import { civTable, mapTable, mapsByGames } from "../stats/data";
import { mapLabel, useSummary } from "../stats/parts";
import { edad, loadAyuda, peekAyuda, type Arbol, type CivFx, type CivInfo, type Tecnologia, type Unidades } from "./data";
import { mejoresUnidades, pesa } from "./identidad";
import { useEncCopy } from "./copy";
import { Icono } from "./parts";

type Props = { civ: string; info: CivInfo; a: Arbol; u: Unidades; ts: Tecnologia[]; fx: CivFx; route: Route; navigate: Nav; picker: React.ReactNode };

export default function CivFicha({ civ, info, a, u, ts, fx, route, navigate, picker }: Props) {
  const t = useEncCopy();
  const { lang } = useLang();
  const c = civBySlug(civ);
  const nombre = c?.name[lang] ?? civ;
  const d = info.desc[lang];
  const mejores = useMemo(() => mejoresUnidades(civ, a, u.units, ts, fx, lang, u.classes), [civ, a, u, ts, fx, lang]);
  const estilos = [...new Set(mejores.filter((m) => m.tier !== "B").map((m) => t.tree.styles[m.unidad.building]).filter(Boolean))].slice(0, 3);
  const porId = useMemo(() => ({ u: new Map(u.units.map((x) => [x.id, x])), t: new Map(ts.map((x) => [x.id, x])) }), [u, ts]);
  const ir = (k: "u" | "t", slug: string): Route => ({ ...route, view: "aoe2", a2Section: k === "u" ? "units" : "technologies", detail: slug });
  const uu = info.uu[0];
  const falta = [
    ...info.missU.map((x) => ({ ...x, k: "u" as const, peso: pesa("u", x.id, porId.u, porId.t) })),
    ...info.missT.map((x) => ({ ...x, k: "t" as const, peso: pesa("t", x.id, porId.u, porId.t) })),
  ].sort((x, y) => Number(y.peso) - Number(x.peso));

  return (
    <>
      <Panel className="a2-ficha-head">
        <CivShield civ={c} size={88} />
        <div className="a2-ficha-who">
          <small className="a2-kicker">{t.tree.h}</small>
          <h1 className="a2-alias">{nombre}</h1>
          <p className="a2-ficha-kind">{d.kind}</p>
          {estilos.length > 0 && (
            <ul className="a2-ficha-tags">
              {estilos.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {picker}
        </div>
        <Numeros civ={civ} />
      </Panel>

      <div className="a2-two a2-ficha-cols">
        <Panel h={t.tree.bestH} sub={t.tree.bestSub}>
          <ul className="a2-best">
            {mejores.map((m) => (
              <li key={m.unidad.id}>
                <RouteLink to={ir("u", m.unidad.slug)} onNavigate={navigate} className="a2-best-row">
                  <Icono k="u" pic={m.unidad.pic} size={56} eager />
                  <span className="a2-best-body">
                    <b>{m.unidad.name[lang] || m.unidad.name.en}</b>
                    <span className="a2-best-why">
                      {m.unica && <span className="a2-tag is-gold">{t.tree.uniqueUnit}</span>}
                      {m.unicas.map((x) => (
                        <span key={x.id} className="a2-tag is-gold">
                          {x.name[lang] || x.name.en}
                        </span>
                      ))}
                      {m.bonos.map((b) => (
                        <span key={b} className="a2-tag is-good">
                          {b}
                        </span>
                      ))}
                      {m.faltan.length === 0 ? (
                        <span className="a2-tag is-good">{t.tree.allUpgrades}</span>
                      ) : (
                        m.faltan.slice(0, 3).map((x) => (
                          <span key={x.id} className="a2-tag is-bad">
                            {t.tree.without(x.name[lang] || x.name.en)}
                          </span>
                        ))
                      )}
                    </span>
                  </span>
                  <span className={`a2-tier is-${m.tier}`} title={t.tree.tierTip[m.tier]}>
                    {m.tier}
                  </span>
                </RouteLink>
              </li>
            ))}
          </ul>
        </Panel>

        <div>
          <Panel h={t.tree.uniqH} sub={t.tree.uniqSub(nombre)}>
            <ul className="a2-uniq">
              {uu && <Unico k="u" id={uu.id} pic={uu.pic} nombre={uu.name[lang] || uu.name.en} kicker={t.tree.uuK} to={ir("u", info.uu.at(-1)?.slug ?? uu.slug)} navigate={navigate} />}
              {[...info.ut].sort((x, y) => (porId.t.get(x.id)?.age ?? 0) - (porId.t.get(y.id)?.age ?? 0)).map((x) => (
                <Unico key={x.id} k="t" id={x.id} pic={x.pic} nombre={x.name[lang] || x.name.en} kicker={t.tree.utK(edad(lang, porId.t.get(x.id)?.age ?? 0))} to={ir("t", x.slug)} navigate={navigate} />
              ))}
            </ul>
          </Panel>
          <Panel h={t.civ.bonusesH}>
            <ul className="a2-ficha-bonus">
              {d.bonuses.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            {d.team && (
              <p className="a2-note">
                <b className="a2-gold">{t.tree.teamK}</b> {d.team}
              </p>
            )}
          </Panel>
        </div>
      </div>

      <Panel h={t.tree.missingH} sub={falta.some((x) => x.peso) ? t.tree.missingWeight : t.tree.missingSub}>
        {falta.length ? (
          <ul className="a2-falta">
            {falta.map((x) => (
              <li key={`${x.k}${x.id}`} className={x.peso ? "is-peso" : undefined}>
                <RouteLink to={ir(x.k, x.slug)} onNavigate={navigate}>
                  <Icono k={x.k} pic={x.pic} size={32} off />
                  <span>{x.name[lang] || x.name.en}</span>
                </RouteLink>
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-note">{t.tree.nothingMissing}</p>
        )}
      </Panel>
    </>
  );
}

/** Una unidad o tecnología única con su texto del juego (la primera parte de la ayuda). */
function Unico({ k, id, pic, nombre, kicker, to, navigate }: { k: "u" | "t"; id: number; pic: number; nombre: string; kicker: string; to: Route; navigate: Nav }) {
  const { lang } = useLang();
  const [ayuda, setAyuda] = useState(() => peekAyuda(lang, id));
  useEffect(() => {
    if (ayuda !== undefined) return;
    let vivo = true;
    void loadAyuda(lang, id).then((x) => vivo && setAyuda(x));
    return () => {
      vivo = false;
    };
  }, [lang, id, ayuda]);
  const texto = ayuda?.[k]?.[String(id)]?.[0];
  return (
    <li>
      <RouteLink to={to} onNavigate={navigate} className="a2-uniq-card">
        <Icono k={k} pic={pic} size={56} eager />
        <span>
          <small>{kicker}</small>
          <b>{nombre}</b>
          {texto && <span className="a2-uniq-txt">{texto}</span>}
        </span>
      </RouteLink>
    </li>
  );
}

/** % de victorias, cuánto se juega y su mejor mapa en RM 1v1 de los últimos 28 días (sin muestra chica). */
function Numeros({ civ }: { civ: string }) {
  const t = useEncCopy();
  const { lang } = useLang();
  const s = useSummary();
  if (!s) return null;
  const fila = civTable(s, { mode: "rm1v1", band: "all", window: "28" }).find((r) => r.civ === civ);
  if (!fila || fila.small) return null;
  const mapa = mapsByGames(s, "28", "rm1v1")
    .slice(0, 12)
    .map((m) => ({ m: m.map, r: mapTable(s, "28", "rm1v1", m.map).find((r) => r.civ === civ) }))
    .filter((x) => x.r && !x.r.small)
    .sort((x, y) => y.r!.wr - x.r!.wr)[0];
  const p = (n: number) => `${(n * 100).toLocaleString(lang, { maximumFractionDigits: 1 })}%`;
  return (
    <dl className="a2-ficha-nums">
      <div>
        <dt>{t.tree.stats.wr}</dt>
        <dd>{p(fila.wr)}</dd>
      </div>
      <div>
        <dt>{t.tree.stats.pick}</dt>
        <dd>{p(fila.pick)}</dd>
      </div>
      {mapa && (
        <div>
          <dt>{t.tree.stats.map}</dt>
          <dd>{mapLabel(mapa.m, lang)}</dd>
        </div>
      )}
    </dl>
  );
}
