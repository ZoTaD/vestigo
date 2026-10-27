/**
 * La portada de Warframe (2026-10-27), con la estética A "Arsenal": el título y la introducción, el bloque "Ahora mismo"
 * y una tarjeta por pestaña.
 *
 * "Ahora mismo" tiene dos partes. Los ciclos de los mundos abiertos se calculan acá (`cycles.ts`): salen siempre. Baro,
 * las fisuras y la incursión vienen de la API de warframestat (`live.ts`) y sólo después de montar: el prerender no los
 * trae, y si la API cae o tarda el bloque se queda con los ciclos y nada más, sin error en consola.
 */
import { useEffect, useState } from "react";
import meta from "@warframe/meta.json";
import { useLang, useLocale } from "../i18n";
import RouteLink from "../RouteLink";
import type { Route, WfTab } from "../route";
import { useWfCopy, WF_TABS, type WfEra } from "../warframeCopy";
import { cambion, cetus, vallis } from "./cycles";
import { fetchLive, type Live } from "./live";
import { Icon, Panel, type Nav } from "./ui";

/** El ícono de cada pestaña en su tarjeta: uno de sus propios datos (Ash, una reliquia Lith, Aggristone y un mod único). */
const TAB_ICON: Record<WfTab, string> = {
  arsenal: "storeicons-warframes-ash",
  relics: "relics-reliclithd",
  farming: "storeicons-resources-duviri-duviriaggristone",
  mods: "lotus-interface-cards-images-unique-shrinemaidennaginataaugment",
};

/** El orden de las eras en el bloque de fisuras. */
const ERA_ORDER: WfEra[] = ["Lith", "Meso", "Neo", "Axi", "Requiem", "Omnia"];

/** La hora de hoy, y la de cada segundo después. Antes de montar es `null`: el prerender y la hidratación coinciden. */
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Una cuenta regresiva corta: "2 d 4 h", "1 h 05 min", "12 min 08 s" o "45 s". */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m) return `${m} min ${String(r).padStart(2, "0")} s`;
  return `${r} s`;
}

/** La API en vivo: `undefined` mientras se pide, `null` si no respondió, y lo que haya si sí. */
function useLive(lang: "en" | "es"): Live | null | undefined {
  const [live, setLive] = useState<Live | null | undefined>(undefined);
  useEffect(() => {
    const ctl = new AbortController();
    fetchLive(lang, ctl.signal).then((l) => !ctl.signal.aborted && setLive(l));
    return () => ctl.abort();
  }, [lang]);
  return live;
}

export default function WarframeHome({ route, navigate, live: has }: { route: Route; navigate: Nav; /** Las pestañas que ya tienen página. */ live: (tab: WfTab) => boolean }) {
  const t = useWfCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const c = meta.counts;
  const tabs = WF_TABS.filter((s): s is WfTab => s !== "home");
  const now = useNow();
  const live = useLive(lang);
  const L = t.home.live;
  const cycles = [
    { key: "cetus", name: L.cetus, at: now === null ? null : cetus(now) },
    { key: "vallis", name: L.vallis, at: now === null ? null : vallis(now) },
    { key: "cambion", name: L.cambion, at: now === null ? null : cambion(now) },
  ];
  const fissures = live?.fissures.filter((f) => now === null || f.endsAt > now) ?? [];
  const byEra = ERA_ORDER.map((era) => ({ era, rows: fissures.filter((f) => f.era === era) })).filter((e) => e.rows.length);
  return (
    <main className="wf-main wf-home">
      <Panel className="wf-intro">
        <p className="wf-kicker">{t.home.kicker}</p>
        <h1 className="wf-h1">{t.home.h1}</h1>
        <p className="wf-lede">{t.home.lede(num(c.arsenal), num(c.relics), num(c.farming), num(c.mods))}</p>
        <ul className="wf-cards">
          {tabs.map((tab) => {
            const body = (
              <>
                <Icon img={TAB_ICON[tab]} size={64} lazy={false} />
                <span>
                  <b>{t.tabs[tab]}</b>
                  <span>{t.home.cards[tab]}</span>
                  {!has(tab) && <em>{t.soon}</em>}
                </span>
              </>
            );
            return (
              <li key={tab}>
                {has(tab) ? (
                  <RouteLink className="wf-card" to={{ ...route, view: "warframe", wfSection: tab, detail: undefined }} onNavigate={navigate}>
                    {body}
                  </RouteLink>
                ) : (
                  <span className="wf-card is-soon" aria-disabled="true">
                    {body}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel className="wf-live" aria-labelledby="wf-live-h">
        <h2 className="wf-h2" id="wf-live-h">
          {L.heading}
        </h2>
        <ul className="wf-cycles" aria-label={L.cycles}>
          {cycles.map(({ key, name, at }) => (
            <li className="wf-cycle" key={key} data-state={at?.state}>
              <small>{name}</small>
              <b>{at ? L.state[at.state] : "—"}</b>
              <span>{at && now !== null ? L.left(countdown(at.endsAt - now)) : " "}</span>
            </li>
          ))}
        </ul>

        {live && (
          <div className="wf-live-grid">
            {live.baro && (
              <section className="wf-baro" aria-label={L.baro}>
                <h3 className="wf-h3">{L.baro}</h3>
                <p>
                  <b>{live.baro.location}</b>
                </p>
                {now !== null && (
                  <p className="wf-dim">
                    {live.baro.active ? L.baroHere(countdown((live.baro.endsAt ?? now) - now)) : L.baroSoon(countdown((live.baro.startsAt ?? now) - now))}
                  </p>
                )}
              </section>
            )}
            {live.sortie && (
              <section className="wf-sortie" aria-label={L.sortie}>
                <h3 className="wf-h3">{L.sortie}</h3>
                <p className="wf-dim">{L.sortieBoss(live.sortie.boss)}</p>
                <ol>
                  {live.sortie.missions.map((m, i) => (
                    <li key={i}>
                      <b>{m.type}</b> <span>{m.node}</span>
                      <small>{m.modifier}</small>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            <section className="wf-fissures" aria-label={L.fissures}>
              <h3 className="wf-h3">{L.fissures}</h3>
              {byEra.length === 0 ? (
                <p className="wf-dim">{L.fissuresNone}</p>
              ) : (
                <ul>
                  {byEra.map(({ era, rows }) => (
                    <li key={era}>
                      <b>
                        {t.era[era]} <em>{rows.length}</em>
                      </b>
                      <span>
                        {rows.map((f, i) => (
                          <span key={i} className={f.hard ? "is-hard" : undefined}>
                            {f.node} · {f.mission}
                            {f.hard ? ` · ${L.steel}` : ""}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
        <p className="wf-dim wf-about">{t.home.about}</p>
      </Panel>
    </main>
  );
}
