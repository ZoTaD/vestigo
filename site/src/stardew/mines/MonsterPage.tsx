/**
 * La ficha de un monstruo de Stardew Valley (etapa 3, tarea 6), en dos cajas del menú como las de Objetos y Aldeanos:
 * la cabecera (el sprite grande en su casillero, el nombre, dónde sale y si tiene versión peligrosa, y sus cifras) y los
 * cruces: el botín con la probabilidad de cada cosa (enlazado a Objetos), en qué pisos sale, y la meta del Gremio de
 * Aventureros con su premio y los otros monstruos que cuentan para ella.
 */
import type { CSSProperties } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useStardewCopy } from "../../stardewCopy";
import { say } from "../data";
import { Box, Slot, type Nav } from "../ui";
import { GearPix, MonsterPix, pct, signed } from "./pix";
import { gearName, itemSlug, lootRows, type MinesData, type Monster } from "./state";

/** Las letras de la palabra más larga del nombre: el título se achica para que entre entera, sin cortarla. */
const longestWord = (name: string): number => Math.max(...name.split(/\s+/).map((w) => w.length), 1);

export default function MonsterPage({ data, monster, route, navigate }: { data: MinesData; monster: Monster; route: Route; navigate: Nav }) {
  const t = useStardewCopy();
  const m = t.mines;
  const c = m.monster;
  const { lang } = useLang();
  const locale = useLocale();
  const name = say(monster.name, lang);
  const zones = new Map(data.zones.map((z) => [z.key, z]));
  const goal = monster.slayer ? data.slayer[monster.slayer] : undefined;
  const mates = goal ? goal.targets.map((k) => data.monsters.find((x) => x.key === k)).filter((x): x is Monster => !!x) : [];
  const loot = lootRows(monster);
  const mineRoute = (slug?: string): Route => ({ ...route, view: "stardew", sdSection: "mines", detail: slug });
  const stats: [string, string][] = [
    [m.stats.hp, monster.hp.toLocaleString(locale)],
    [m.stats.dmg, monster.dmg.toLocaleString(locale)],
    [m.stats.def, monster.def.toLocaleString(locale)],
    [m.stats.speed, signed(monster.speed, locale)],
    [m.stats.xp, monster.xp.toLocaleString(locale)],
  ];

  /** Un objeto del botín o un premio: casillero con su sprite y su nombre (o `label`), enlazado a Objetos si tiene ficha. */
  const thing = (id: string, label?: string) => {
    const slug = itemSlug(data, id);
    const body = (
      <>
        <Slot>
          <GearPix id={id} box={40} />
        </Slot>
        <span>
          <b>{label ?? gearName(data, id, lang)}</b>
        </span>
      </>
    );
    return slug ? (
      <RouteLink className="sd-ref" to={{ ...route, view: "stardew", sdSection: "items", detail: slug }} onNavigate={navigate} prefetch="press">
        {body}
      </RouteLink>
    ) : (
      <span className="sd-ref">{body}</span>
    );
  };

  return (
    <main className="sd-main sd-ficha sd-mn-ficha">
      <RouteLink className="sd-back" to={mineRoute()} onNavigate={navigate}>
        ← {t.tabs.mines}
      </RouteLink>

      <Box className="sd-top">
        <div className="sd-head">
          <span className="sd-slot sd-slot-big">
            <MonsterPix m={monster} box={104} lazy={false} />
          </span>
          <div className="sd-title">
            <h1 className="sd-h1 sd-name" style={{ "--sd-word": longestWord(name) } as CSSProperties}>
              {name}
            </h1>
            <ul className="sd-tags">
              {[...new Set(monster.where.map((w) => w.zone))].map((k) => {
                const z = zones.get(k);
                return z && <li key={k}>{say(z.name, lang)}</li>;
              })}
              {monster.dangerous && <li className="sd-mn-dtag">{m.dangerousTag}</li>}
            </ul>
          </div>
        </div>
        <h2 className="visually-hidden">{c.statsTitle}</h2>
        <dl className="sd-mn-bigstats">
          {stats.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Box>

      <Box className="sd-cross">
        <section className="sd-sec">
          <h2 className="sd-h2">{c.lootTitle}</h2>
          {loot.length ? (
            <>
              <p className="sd-muted">{c.lootHint}</p>
              <ul className="sd-rows">
                {loot.map(([id, p, n]) => (
                  <li className="sd-source" data-loot={id} key={id}>
                    {thing(id)}
                    <span className="sd-row-end">
                      {n > 1 && <small>{m.upTo(n)}</small>}
                      {pct(p, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="sd-muted">{m.noLoot}</p>
          )}
        </section>

        <section className="sd-sec">
          <h2 className="sd-h2">{c.whereTitle}</h2>
          <ul className="sd-rows">
            {monster.where.map((w, i) => {
              const z = zones.get(w.zone);
              return (
                <li className="sd-source" key={i}>
                  <b>{z ? say(z.name, lang) : w.zone}</b>
                  <span className="sd-row-end">{w.floors ? m.floors(w.floors[0], w.floors[1]) : m.noFloors}</span>
                </li>
              );
            })}
          </ul>
          {monster.dangerous && <p className="sd-note">{c.dangerous}</p>}
        </section>

        {goal && (
          <section className="sd-sec">
            <h2 className="sd-h2">{c.slayerTitle}</h2>
            <p className="sd-mn-goal">
              <b>{say(goal.name, lang)}</b> · {c.slayerGoal(goal.count.toLocaleString(locale))}{" "}
              {mates.map((x, i) => (
                <span key={x.key}>
                  {i > 0 && ", "}
                  {x.key === monster.key ? (
                    <b>{say(x.name, lang)}</b>
                  ) : (
                    <RouteLink to={mineRoute(x.slug)} onNavigate={navigate} prefetch="press">
                      {say(x.name, lang)}
                    </RouteLink>
                  )}
                </span>
              ))}
            </p>
            <ul className="sd-rows">
              <li className="sd-source">
                <span className="sd-src-k">{c.reward}</span>
                {goal.reward ? thing(goal.reward, goal.rewardName ? say(goal.rewardName, lang) : undefined) : <b>{goal.phone ? c.phone : "—"}</b>}
              </li>
            </ul>
          </section>
        )}
      </Box>
    </main>
  );
}
