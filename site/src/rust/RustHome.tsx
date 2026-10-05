/**
 * La portada de Rust (2026-10-05), estética A "Inventario". A la izquierda, el panel principal: qué es la guía, con
 * las cifras de los datos, y los casilleros con los objetos más buscados (enlazan a su ficha cuando Objetos se
 * publica). A la derecha, la cuenta regresiva del wipe forzado y las herramientas. Abajo, el texto que lee Google.
 */
import home from "@rust/home.json";
import meta from "@rust/meta.json";
import { useEffect, useState } from "react";
import RouteLink from "../RouteLink";
import { useLang, useLocale } from "../i18n";
import { RUST_PUBLISHED, type Route, type RustTab } from "../route";
import { useRustCopy } from "../rustCopy";
import { nextForcedWipe } from "./wipe";

type Nav = (r: Route) => void;
type HomeItem = { id: string; slug: string; slugEs: string; name: { en: string; es: string | null } };

const isLive = (tab: RustTab) => RUST_PUBLISHED.includes(tab);

export default function RustHome({ route, navigate }: { route: Route; navigate: Nav }) {
  const c = useRustCopy();
  const t = c.home;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const items = num(meta.counts.items);
  const recipes = num(meta.counts.recipes);
  return (
    <main className="rs-main">
      <div className="rs-body">
        <section className="rs-pnl">
          <p className="rs-hd">{t.kicker}</p>
          <div className="rs-title">
            <h1 className="rs-h1">Rust</h1>
          </div>
          <p className="rs-lede">{t.lede(items, recipes)}</p>
          <h2 className="rs-hd">{t.slotsTitle}</h2>
          <ul className="rs-slots">
            {(home as HomeItem[]).map((it) => {
              const name = (lang === "es" && it.name.es) || it.name.en;
              const icon = <img src={`/rust/items/${it.id}.webp`} alt={name} width={64} height={64} />;
              return (
                <li key={it.id}>
                  {isLive("items") ? (
                    <RouteLink className="rs-slot" title={name} to={{ ...route, view: "rust", rsSection: "items", detail: it.slug }} onNavigate={navigate}>
                      {icon}
                    </RouteLink>
                  ) : (
                    <span className="rs-slot" title={name}>
                      {icon}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="rs-side">
          <Wipe />
          <section className="rs-pnl">
            <h2 className="rs-hd">{t.toolsTitle}</h2>
            <ul className="rs-tools">
              {t.tools.map((tool) => (
                <li key={tool.tab}>
                  {isLive(tool.tab) ? (
                    <RouteLink className="rs-tool" to={{ ...route, view: "rust", rsSection: tool.tab, detail: undefined }} onNavigate={navigate}>
                      <b>{tool.title}</b>
                      <span>{tool.text}</span>
                    </RouteLink>
                  ) : (
                    <div className="rs-tool">
                      <b>
                        {tool.title}
                        <em className="rs-soon">{c.soon}</em>
                      </b>
                      <span>{tool.text}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <section className="rs-pnl rs-about">
        <h2>{t.aboutTitle}</h2>
        {t.about(items, recipes).map((p) => (
          <p key={p}>{p}</p>
        ))}
      </section>
    </main>
  );
}

/**
 * La cuenta regresiva al wipe forzado. Sin reloj (el prerender) va sólo el día, en UTC; la hora y la cuenta dependen
 * de quien mira y aparecen al montar.
 */
function Wipe() {
  const t = useRustCopy().home.wipe;
  const locale = useLocale();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const wipe = nextForcedWipe(now ?? new Date());
  const day = wipe.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", ...(now ? {} : { timeZone: "UTC" }) });
  const time = now ? wipe.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : null;
  const left = now ? Math.max(0, wipe.getTime() - now.getTime()) : 0;
  return (
    <section className="rs-wipe">
      <h2 className="rs-hd">{t.title}</h2>
      <p className="rs-wipe-when">{time ? `${day} · ${time}` : day}</p>
      {now && (
        <p className="rs-count">
          <span>
            <b>{Math.floor(left / 86_400_000)}</b>
            {t.days}
          </span>
          <span>
            <b>{Math.floor(left / 3_600_000) % 24}</b>
            {t.hours}
          </span>
          <span>
            <b>{Math.floor(left / 60_000) % 60}</b>
            {t.minutes}
          </span>
        </p>
      )}
      <p className="rs-note">{t.note}</p>
    </section>
  );
}
