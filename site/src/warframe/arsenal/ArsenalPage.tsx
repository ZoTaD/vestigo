/**
 * La ficha de un objeto del Arsenal (2026-10-27), la de la maqueta A: el ícono grande a la izquierda (sin `lazy`: es la
 * imagen principal) con el rango de maestría, el nombre y la descripción; las estadísticas en paneles con barra; las
 * habilidades (o el daño por tipo en un arma); las partes, cada una con dónde cae; y la receta con sus ingredientes
 * enlazados. Una sección sin nada no se dibuja.
 *
 * Recibe la ficha ya cargada: todo lo que nombra viene en sus `refs`. El texto "X Blueprint" / "Plano de X" del plano
 * principal lo arma la interfaz (`copy.arsenal.blueprint`): el dato trae sólo el nombre del objeto.
 */
import type { CSSProperties } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useWfCopy, type WfCopy } from "../../warframeCopy";
import { duration, refName, say, type ArsenalFicha, type Refs, type Stats } from "../data";
import Sources from "../Sources";
import { Icon, Panel, type Nav } from "../ui";

/** Hasta dónde llena la barra cada cifra (el máximo real del juego, redondeado): lo que pasa se llena entero. */
const CAP: Partial<Record<keyof Stats, number>> = { health: 1200, shield: 1200, armor: 600, energy: 300, sprint: 1.5, total: 1000, crit: 50, critMult: 4, status: 60, fireRate: 20 };
/** El orden de las cifras de un Warframe y el de un arma. */
const FRAME_STATS = ["health", "shield", "armor", "energy", "sprint"] as const;
const GUN_STATS = ["total", "crit", "critMult", "status", "fireRate", "magazine", "reload", "multishot"] as const;

/** Las letras de la palabra más larga del nombre: el título se achica para que entre entera, sin cortarla. */
const longestWord = (name: string): number => Math.max(...name.split(/\s+/).map((w) => w.length), 1);

function Bar({ value, cap }: { value: number; cap?: number }) {
  if (!cap) return null;
  return (
    <span className="wf-bar" aria-hidden="true">
      <i style={{ width: `${Math.min(100, (value / cap) * 100)}%` }} />
    </span>
  );
}

export default function ArsenalPage({ ficha, route, navigate }: { ficha: ArsenalFicha; route: Route; navigate: Nav }) {
  const t = useWfCopy();
  const c = t.arsenal;
  const { lang } = useLang();
  const locale = useLocale();
  const name = say(ficha.name, lang);
  const num = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 });
  const s = ficha.stats ?? {};
  const isFrame = ficha.kind === "warframe" || ficha.kind === "archwing" || ficha.kind === "companion" || (ficha.stats?.health !== undefined);
  const keys = (isFrame ? FRAME_STATS : GUN_STATS).filter((k) => s[k] !== undefined);
  const damage = (s.damage ?? []).filter(([, n]) => n > 0);
  const damageMax = Math.max(...damage.map(([, n]) => n), 1);
  const abilities = ficha.abilities ?? [];
  const listTo: Route = { ...route, view: "warframe", wfSection: "arsenal", detail: undefined };

  const value = (k: (typeof FRAME_STATS)[number] | (typeof GUN_STATS)[number]): string => {
    const v = s[k]!;
    return k === "crit" || k === "status" ? `${num(v)} %` : k === "critMult" ? `×${num(v)}` : num(v);
  };

  return (
    <main className="wf-main wf-ficha">
      <Panel className="wf-head">
        <Icon img={ficha.img} size={256} big lazy={false} />
        <div className="wf-head-text">
          <RouteLink className="wf-back" to={listTo} onNavigate={navigate}>
            {t.tabs.arsenal}
          </RouteLink>
          <p className="wf-kicker">
            {c.kinds[ficha.kind]}
            {ficha.mr > 0 ? ` · ${c.mastery(ficha.mr)}` : ""}
          </p>
          <h1 className="wf-h1 is-name" style={{ "--len": longestWord(name) } as CSSProperties}>
            {name}
          </h1>
          <p className="wf-lede">{say(ficha.desc, lang)}</p>
        </div>
      </Panel>

      {(keys.length > 0 || damage.length > 0) && (
        <Panel>
          <h2 className="wf-h2">{c.stats}</h2>
          {keys.length > 0 && (
            <dl className="wf-stats">
              {keys.map((k) => (
                <div className="wf-stat" key={k}>
                  <dt>{c.stat[k]}</dt>
                  <dd>{value(k)}</dd>
                  <Bar value={s[k]!} cap={CAP[k]} />
                </div>
              ))}
              {s.trigger && (
                <div className="wf-stat">
                  <dt>{c.stat.trigger}</dt>
                  <dd>{c.trigger[s.trigger] ?? s.trigger}</dd>
                </div>
              )}
            </dl>
          )}
          {damage.length > 0 && (
            <>
              <h3 className="wf-h3 wf-sub">{c.damage}</h3>
              <dl className="wf-stats">
                {damage.map(([type, n]) => (
                  <div className="wf-stat" key={type}>
                    <dt>{t.damage[type as keyof WfCopy["damage"]] ?? type}</dt>
                    <dd>{num(n)}</dd>
                    <Bar value={n} cap={damageMax} />
                  </div>
                ))}
              </dl>
            </>
          )}
        </Panel>
      )}

      {(abilities.length > 0 || ficha.passive) && (
        <Panel>
          <h2 className="wf-h2">{c.abilities}</h2>
          {abilities.length > 0 && (
            <ol className="wf-abilities">
              {abilities.map((a, i) => (
                <li key={i}>
                  <b>{say(a.name, lang)}</b>
                  <span>{say(a.desc, lang)}</span>
                </li>
              ))}
            </ol>
          )}
          {ficha.passive && (
            <p className="wf-passive">
              <b>{c.passive}</b> {say(ficha.passive, lang)}
            </p>
          )}
        </Panel>
      )}

      {ficha.parts.length > 0 && (
        <Panel>
          <h2 className="wf-h2">{c.parts}</h2>
          <ul className="wf-parts">
            {ficha.parts.map((p, i) => (
              <li key={i}>
                <div className="wf-part-head">
                  <Icon img={p.img ?? ficha.img} size={48} />
                  <b>{p.kind === "blueprint" ? c.blueprint(say(p.name, lang)) : say(p.name, lang)}</b>
                  {p.n > 1 && <span className="wf-dim">×{p.n}</span>}
                </div>
                <Sources list={p.sources} refs={ficha.refs} route={route} navigate={navigate} />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {ficha.recipe && (
        <Panel>
          <h2 className="wf-h2">{c.recipe}</h2>
          <dl className="wf-stats">
            <div className="wf-stat">
              <dt>{c.credits}</dt>
              <dd>{num(ficha.recipe.credits)}</dd>
            </div>
            <div className="wf-stat">
              <dt>{c.time}</dt>
              <dd>{duration(ficha.recipe.seconds, c.units)}</dd>
            </div>
          </dl>
          <h3 className="wf-h3 wf-sub">{c.ingredients}</h3>
          <ul className="wf-ings">
            {ficha.recipe.ingredients.map((ing, i) => (
              <li key={i}>
                <Ingredient r={ficha.refs[ing.ref]} n={ing.n} self={ficha.slug} route={route} navigate={navigate} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </main>
  );
}

/** Un ingrediente: su ícono y nombre, enlazado a su página (otro objeto del Arsenal, o Dónde farmear) si la tiene. */
function Ingredient({ r, n, self, route, navigate }: { r: Refs[string] | undefined; n: number; self: string; route: Route; navigate: Nav }) {
  const { lang } = useLang();
  const locale = useLocale();
  if (!r) return null;
  const inner = (
    <>
      <Icon img={r.img} size={40} />
      <span>{refName(r, lang)}</span>
      <b>×{n.toLocaleString(locale)}</b>
    </>
  );
  // Las partes del propio objeto no enlazan a sí mismas.
  if (r.tab && r.slug && !(r.tab === "arsenal" && r.slug === self)) {
    return (
      <RouteLink className="wf-ing" to={{ ...route, view: "warframe", wfSection: r.tab, detail: r.slug }} onNavigate={navigate}>
        {inner}
      </RouteLink>
    );
  }
  return <span className="wf-ing">{inner}</span>;
}
