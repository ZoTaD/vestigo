/**
 * La portada de Stardew Valley (2026-10-22), con la estética A "Menú del juego": una caja con el título, la
 * introducción y una tarjeta por pestaña; los objetos más buscados como casilleros del inventario; y "Esta temporada",
 * con los cumpleaños y los festivales de la estación elegida (abre en primavera).
 *
 * `home.json` y `meta.json` viajan con el área; los nombres y los slugs bajan aparte (`homeData.ts`), y el prerender y
 * la llegada en frío los esperan en `preloadTab`.
 */
import { useEffect, useState } from "react";
import home from "@stardew/home.json";
import meta from "@stardew/meta.json";
import { useLang, useLocale } from "../i18n";
import RouteLink from "../RouteLink";
import type { Route, StardewTab } from "../route";
import { STARDEW_TABS, useStardewCopy } from "../stardewCopy";
import { loadHome, peekHome, type HomeData } from "./homeData";
import { Box, Slot, Sprite, type Nav } from "./ui";

type Season = { birthdays: [number, string][]; festivals: [number, [string, string]][] };

/** El sprite que representa a cada pestaña en su tarjeta: el melón, el ramo y el Junimo de piedra. */
const TAB_ICON: Record<StardewTab, { id: string; w: number; h: number }> = {
  items: { id: "254", w: 16, h: 16 },
  villagers: { id: "458", w: 16, h: 16 },
  bundles: { id: "(BC)55", w: 16, h: 32 },
};

/** Los datos de la portada en el idioma que se lee: los ya bajados en el primer render, y si faltan, se piden. */
function useHomeData(lang: "en" | "es"): HomeData | null {
  const [, setLoaded] = useState<HomeData | null>(null);
  useEffect(() => {
    let live = true;
    if (!peekHome(lang)) loadHome(lang).then((d) => live && setLoaded(d), () => undefined);
    return () => {
      live = false;
    };
  }, [lang]);
  return peekHome(lang);
}

export default function StardewHome({ route, navigate, live }: { route: Route; navigate: Nav; /** Las pestañas que ya tienen página. */ live: (tab: StardewTab) => boolean }) {
  const t = useStardewCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const data = useHomeData(lang);
  const [season, setSeason] = useState(0);
  const seasons = home.seasons as Season[];
  const shown = seasons[season];
  const c = meta.counts;
  const tabs = STARDEW_TABS.filter((s): s is StardewTab => s !== "home");
  return (
    <main className="sd-main sd-home">
      <Box className="sd-intro">
        <p className="sd-kicker">{t.home.kicker}</p>
        <h1 className="sd-h1">{t.home.h1}</h1>
        <p className="sd-lede">{t.home.lede(num(c.items), num(c.villagers), num(c.bundles))}</p>
        <ul className="sd-cards">
          {tabs.map((tab) => {
            const icon = TAB_ICON[tab];
            const body = (
              <>
                <Slot>
                  <Sprite id={icon.id} w={icon.w} h={icon.h} size={48} lazy={false} />
                </Slot>
                <span>
                  <b>{t.tabs[tab]}</b>
                  <span>{t.home.cards[tab]}</span>
                  {!live(tab) && <em>{t.soon}</em>}
                </span>
              </>
            );
            return (
              <li key={tab}>
                {live(tab) ? (
                  <RouteLink className="sd-card" to={{ ...route, view: "stardew", sdSection: tab, detail: undefined }} onNavigate={navigate}>
                    {body}
                  </RouteLink>
                ) : (
                  <span className="sd-card is-soon" aria-disabled="true">
                    {body}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Box>

      <div className="sd-cols">
        <Box className="sd-featured" aria-labelledby="sd-featured-h">
          <h2 className="sd-h2" id="sd-featured-h">
            {t.home.featured}
          </h2>
          <p className="sd-muted">{t.home.featuredHint}</p>
          <ul className="sd-grid">
            {(home.featured as string[]).map((id) => {
              const item = data?.items.get(id);
              return (
                <li key={id}>
                  {item ? (
                    <RouteLink className="sd-cell" to={{ ...route, view: "stardew", sdSection: "items", detail: item.slug }} onNavigate={navigate} title={item.name}>
                      <Slot>
                        <Sprite id={id} w={item.w} h={item.h} />
                      </Slot>
                      <span>{item.name}</span>
                    </RouteLink>
                  ) : (
                    <span className="sd-cell">
                      <Slot />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Box>

        <Box className="sd-season" aria-labelledby="sd-season-h">
          <h2 className="sd-h2" id="sd-season-h">
            {t.home.season}
          </h2>
          <div className="sd-pick" role="group" aria-label={t.home.seasonPick}>
            {t.seasons.map((name, i) => (
              <button type="button" className={`sd-pill${i === season ? " is-on" : ""}`} aria-pressed={i === season} onClick={() => setSeason(i)} key={name}>
                {name}
              </button>
            ))}
          </div>
          <h3 className="sd-h3">{t.home.birthdays}</h3>
          <ul className="sd-bdays">
            {shown.birthdays.map(([day, key]) => {
              const v = data?.villagers.get(key);
              const body = (
                <>
                  <img className="sd-portrait" src={`/stardew/portraits/${key.toLowerCase()}.png`} alt="" width={48} height={48} loading="lazy" decoding="async" />
                  <span>
                    <b>{v?.name ?? ""}</b>
                    <small>{t.home.day(day)}</small>
                  </span>
                </>
              );
              return (
                <li key={key}>
                  {v ? (
                    <RouteLink className="sd-bday" to={{ ...route, view: "stardew", sdSection: "villagers", detail: v.slug }} onNavigate={navigate}>
                      {body}
                    </RouteLink>
                  ) : (
                    <span className="sd-bday">{body}</span>
                  )}
                </li>
              );
            })}
          </ul>
          <h3 className="sd-h3">{t.home.festivals}</h3>
          <ul className="sd-fests">
            {shown.festivals.map(([day, name]) => (
              <li key={day}>
                <span className="sd-day">{day}</span>
                <b>{name[lang === "es" ? 1 : 0]}</b>
              </li>
            ))}
          </ul>
          <p className="sd-muted sd-about">{t.home.about(meta.version)}</p>
        </Box>
      </div>
    </main>
  );
}
