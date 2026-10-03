/**
 * La ficha de un moodle de Project Zomboid (2026-09-30), como una página de la libreta: la cabecera con el moodle como
 * se ve en la partida (el círculo teñido y el ícono encima), su nombre y en qué hoja de la lista está; debajo, sus
 * niveles, qué hacer y los otros moodles de su hoja.
 *
 * Cada nivel lleva su círculo con el tinte del juego para ese nivel, su número, su nombre y su descripción: la gravedad
 * va por el tinte y la cifra, nunca por un borde de color. "Qué hacer" es texto nuestro (`advice.ts`), con enlaces a
 * las fichas de los objetos que sirven (vendas, analgésicos, antibióticos…), a rasgos y a otros moodles.
 */
import { Fragment, type CSSProperties } from "react";
import meta from "@zomboid/meta.json";
import RouteLink from "../../RouteLink";
import { useLang } from "../../i18n";
import type { PzTab, Route } from "../../route";
import { Stamp, wordFit } from "../ui";
import { ADVICE, adviceParts } from "./advice";
import { useMoodlesCopy } from "./copy";
import { isGoodMoodle, moodleGroup, moodleIcon, moodlesIn, moodleTint, type Moodle } from "./data";
import { ChangesSlot } from "../patches/changes";

type Nav = (r: Route) => void;

export default function MoodleFicha({ moodle, route, navigate }: { moodle: Moodle; route: Route; navigate: Nav }) {
  const t = useMoodlesCopy();
  const { lang } = useLang();
  const group = moodleGroup(moodle.id);
  const name = moodle[lang];
  const other = moodle[lang === "es" ? "en" : "es"];
  const neighbours = moodlesIn(group).filter((m) => m.id !== moodle.id);
  const advice = ADVICE[moodle.id]?.[lang];
  const toList: Route = { ...route, view: "zomboid", pzSection: "moodles", detail: undefined };
  const to = (sec: PzTab, id: string): Route => ({ ...route, view: "zomboid", pzSection: sec, detail: id });

  return (
    <main className="pz-main pzi pzi-ficha pzmo">
      <nav className="pzi-crumb">
        <RouteLink to={toList} onNavigate={navigate}>
          ← {t.back}
        </RouteLink>
      </nav>

      <section className="pz-page pzi-head pzmo-head">
        <span className="pz-clip" />
        <div className="pzi-headmain">
          {/* Como aparece primero en la partida: con el tinte de su nivel más bajo. */}
          <MoodleBadge moodle={moodle} level={moodle.levels[0]?.level ?? 1} size={80} lazy={false} />
          <div className="pzi-titles">
            <p className="pzi-kick">{t.kicker(meta.version)}</p>
            <h1 className="pzi-h1" style={wordFit(name)}>
              {name}
            </h1>
            <p className="pzi-hand">{t.otherName(other)}</p>
          </div>
        </div>
        <p className="pzmo-meta">
          <span>
            {t.groups[group]} · {t.levelCount(moodle.levels.length)}
          </span>
          {isGoodMoodle(moodle) && <em className="pzi-hand">{t.good}</em>}
        </p>
      </section>

      <div className="pzi-sheets">
        <div className="pzi-relcol">
          <section className="pz-page pzi-rel pzmo-levels">
            <h2 className="pzi-h2">
              <Stamp name="arrownorth" />
              {t.levels}
              <small>{moodle.levels.length}</small>
            </h2>
            <ol className="pzmo-levellist">
              {moodle.levels.map((l) => (
                <li className="pzmo-level" key={l.level}>
                  <MoodleBadge moodle={moodle} level={l.level} size={48} />
                  <span className="pzmo-lvl">{t.level(l.level)}</span>
                  <b className="pzmo-lname">{l.name[lang]}</b>
                  <span className="pzmo-ldesc">{l.desc[lang]}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <div className="pzi-relcol">
          {advice && (
            <section className="pz-page pzi-rel pzmo-advice">
              <h2 className="pzi-h2">
                <Stamp name="checkmark" />
                {t.advice}
              </h2>
              <p className="pzmo-advicetext">
                {adviceParts(advice).map((p, i) =>
                  typeof p === "string" ? (
                    <Fragment key={i}>{p}</Fragment>
                  ) : (
                    <RouteLink className="pzmo-link" to={to(p.sec, p.id)} onNavigate={navigate} key={i}>
                      {p.text}
                    </RouteLink>
                  ),
                )}
              </p>
            </section>
          )}
          {neighbours.length > 0 && (
            <section className="pz-page pzi-rel pzmo-related">
              <h2 className="pzi-h2">
                <Stamp name="asterisk" />
                {t.related(t.groups[group])}
              </h2>
              <ul className="pzi-links">
                {neighbours.map((m) => (
                  <li key={m.id}>
                    <RouteLink to={to("moodles", m.id)} onNavigate={navigate}>
                      <MoodleBadge moodle={m} level={m.levels[0]?.level ?? 1} size={32} />
                      <span>{m[lang]}</span>
                    </RouteLink>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
      <ChangesSlot kind="moodles" changes={moodle.changes} route={route} navigate={navigate} />
    </main>
  );
}

/**
 * El moodle como lo dibuja el juego: el círculo (`Moodles_BGsolid`) teñido con el color de su nivel, el aro
 * (`Moodles_BGoutline`) y el ícono encima. El tamaño va declarado para que la página no se corra al llegar la imagen.
 */
export function MoodleBadge({ moodle, level, size, lazy = true }: { moodle: Moodle; level: number; size: number; lazy?: boolean }) {
  const style = { "--pzmo-tint": moodleTint(level, isGoodMoodle(moodle)), width: size, height: size } as CSSProperties;
  return (
    <span className="pzmo-badge" style={style} aria-hidden="true">
      <img src={moodleIcon(moodle)} alt="" width={size} height={size} loading={lazy ? "lazy" : undefined} decoding="async" />
    </span>
  );
}
