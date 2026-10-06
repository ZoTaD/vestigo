/**
 * La portada de la sección Diablo II (2026-09-29). Diseño:
 * docs/design/2026-09-29-d2r-portada.md. "Como estar adentro del juego": la
 * puerta del monasterio de la pantalla de carga que se abre al entrar, el logo
 * en llamas, los botones del menú principal y el tooltip dorado del juego.
 *
 * Lo que tiene página enlaza a su pestaña; lo que todavía no (gemas,
 * talismanes, el Cubo, las herramientas que vienen) se muestra sin enlace.
 */
import { useEffect, useRef, useState } from "react";
import { useLang, useLocale } from "../i18n";
import RouteLink from "../RouteLink";
import type { D2rTab, Route } from "../route";
import { SEASON, useD2rCopy } from "../d2rCopy";
import { HOME, META, gameImg, type Loc, type Rune } from "../d2rData";
import { useIsoLayoutEffect } from "../floatingTip";
import { D2Head } from "./ui";

type Nav = (r: Route) => void;

export default function D2rHome({ route, navigate }: { route: Route; navigate: Nav }) {
  const tab = (t: D2rTab): Route => ({ ...route, view: "d2r", d2Section: t, detail: undefined });
  return (
    <>
      <Hero tab={tab} navigate={navigate} />
      <main className="d2-main">
        <Stash tab={tab} navigate={navigate} />
        <Tools tab={tab} navigate={navigate} />
        <Runes tab={tab} navigate={navigate} />
        <Classes tab={tab} navigate={navigate} />
        <Events tab={tab} navigate={navigate} />
      </main>
    </>
  );
}

const DOOR_FRAMES = 10;
const door = (i: number, small: boolean) => gameImg(`door/${i}${small ? "-m" : ""}`);

/**
 * La puerta del monasterio: los 10 cuadros de la pantalla de carga del juego.
 * El HTML trae la puerta cerrada; al cargar se piden los otros nueve cuadros
 * (del mismo tamaño que eligió el navegador) y la puerta se abre. Con
 * "reducir movimiento", queda abierta sin animar.
 */
function Door() {
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = img.current;
    if (!el) return;
    const small = (el.currentSrc || el.src).includes("-m.");
    const show = (i: number) => {
      el.removeAttribute("srcset");
      el.src = door(i, small);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      show(DOOR_FRAMES - 1);
      return;
    }
    let dead = false;
    const timers: number[] = [];
    const load = (i: number) =>
      new Promise<void>((done) => {
        const im = new Image();
        im.onload = im.onerror = () => done();
        im.src = door(i, small);
      });
    Promise.all(Array.from({ length: DOOR_FRAMES - 1 }, (_, i) => load(i + 1))).then(() => {
      if (dead) return;
      let i = 1;
      // Los primeros cuadros van lentos (la puerta cuesta), después la luz entra de golpe.
      const step = () => {
        if (dead) return;
        show(i);
        if (++i < DOOR_FRAMES) timers.push(window.setTimeout(step, i < 3 ? 260 : 120));
      };
      timers.push(window.setTimeout(step, 400));
    });
    return () => {
      dead = true;
      timers.forEach(clearTimeout);
    };
  }, []);
  return (
    <img
      ref={img}
      className="d2-door"
      src={door(0, false)}
      srcSet={`${door(0, true)} 756w, ${door(0, false)} 1512w`}
      sizes="100vw"
      width={1512}
      height={1008}
      alt=""
    />
  );
}

function Hero({ tab, navigate }: { tab: (t: D2rTab) => Route; navigate: Nav }) {
  const t = useD2rCopy();
  const menu: { to: D2rTab; label: string }[] = [
    { to: "runewords", label: t.menu.runewords },
    { to: "planner", label: t.menu.planner },
    { to: "uniques", label: t.menu.uniques },
  ];
  return (
    <section className="d2-hero">
      <Door />
      <img className="d2-banner is-l" src={gameImg("banner")} alt="" width={300} height={1040} />
      <img className="d2-banner is-r" src={gameImg("banner")} alt="" width={300} height={1040} />
      <div className="d2-hero-in">
        <h1 className="d2-logo">
          <picture>
            {/* El logo en llamas (AVIF animado); quien pide menos movimiento o no tiene AVIF ve el cuadro quieto. */}
            <source srcSet={gameImg("logo", "avif")} type="image/avif" media="(prefers-reduced-motion: no-preference)" />
            <img className="d2-logo-fire" src={gameImg("logo-still")} alt={t.logoAlt} width={584} height={328} />
          </picture>
          <img className="d2-logo-sub" src={gameImg("resurrected")} alt={t.resurrectedAlt} width={474} height={28} />
        </h1>
        <p className="d2-tagline">{t.tagline}</p>
        <ul className="d2-chips">
          <li>
            <b>{t.season(SEASON)}</b> · {t.ladder}
          </li>
          <li>
            <b>{t.patch(META.patch)}</b>
          </li>
          <li className="is-new">Reign of the Warlock</li>
        </ul>
        <nav className="d2-menu">
          {menu.map((m) => (
            <RouteLink className="d2-btn" to={tab(m.to)} onNavigate={navigate} key={m.to}>
              <span>{m.label}</span>
            </RouteLink>
          ))}
        </nav>
      </div>
    </section>
  );
}

function Stash({ tab, navigate }: { tab: (t: D2rTab) => Route; navigate: Nav }) {
  const t = useD2rCopy().stash;
  const locale = useLocale();
  const c = HOME.counts;
  const n = (x: number) => x.toLocaleString(locale);
  // Cada casillero con el color de texto que el juego usa para esa clase de ítem.
  const slots: { key: string; to?: D2rTab; icon: string[]; name: string; count: string; tone: string; tall?: boolean }[] = [
    { key: "runes", to: "runes", icon: ["rune/ber"], name: t.runes, count: t.runesN(n(c.runes)), tone: "rune" },
    // Jah + Ith + Ber: Enigma, la palabra rúnica más famosa del juego.
    { key: "runewords", to: "runewords", icon: ["rune/jah", "rune/ith", "rune/ber"], name: t.runewords, count: t.runewordsN(n(c.runewords)), tone: "unique" },
    { key: "uniques", to: "uniques", icon: ["item/unique-warlock-helm"], name: t.uniques, count: t.uniquesN(n(c.uniques)), tone: "unique" },
    { key: "sets", to: "sets", icon: ["item/amulet"], name: t.sets, count: t.setsN(n(c.sets), n(c.setItems)), tone: "set" },
    { key: "bases", to: "bases", icon: ["item/crystal-sword"], name: t.bases, count: t.basesN(n(c.bases)), tone: "white", tall: true },
    { key: "gems", icon: ["item/perfect-skull"], name: t.gems, count: t.gemsN(n(c.gems)), tone: "white" },
    { key: "charms", icon: ["item/charm-large"], name: t.charms, count: t.charmsN, tone: "magic", tall: true },
    { key: "cube", icon: ["item/horadric-cube"], name: t.cube, count: t.cubeN(n(c.cubeRecipes)), tone: "white" },
  ];
  return (
    <section className="d2-block" aria-labelledby="d2-stash">
      <D2Head id="d2-stash" title={t.title} lede={t.lede} />
      <ul className="d2-stash">
        {slots.map((s) => {
          const body = (
            <>
              <span className={`d2-slot-ic${s.icon.length > 1 ? " is-trio" : ""}${s.tall ? " is-tall" : ""}`}>
                {s.icon.map((ic) => (
                  <img src={gameImg(ic)} alt="" key={ic} loading="lazy" decoding="async" />
                ))}
              </span>
              <h3 className={`d2-tone-${s.tone}`}>{s.name}</h3>
              <span className="d2-slot-n">{s.count}</span>
            </>
          );
          return (
            <li key={s.key}>
              {s.to ? (
                <RouteLink className="d2-slot is-link" to={tab(s.to)} onNavigate={navigate}>
                  {body}
                </RouteLink>
              ) : (
                <div className="d2-slot">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Tools({ tab, navigate }: { tab: (t: D2rTab) => Route; navigate: Nav }) {
  const t = useD2rCopy();
  const tools: { key: string; icon: string; name: string; desc: string; to?: D2rTab }[] = [
    { key: "drops", icon: "quest/a2q6", ...t.tools.drops, to: "drops" },
    { key: "runewords", icon: "quest/a4q2", ...t.tools.runewords, to: "runewords" },
    { key: "planner", icon: "quest/a3q1", ...t.tools.planner, to: "planner" },
    { key: "breakpoints", icon: "quest/a1q1", ...t.tools.breakpoints, to: "breakpoints" },
    { key: "grail", icon: "quest/a3q4", ...t.tools.grail, to: "grail" },
  ];
  return (
    <section className="d2-block" aria-labelledby="d2-tools">
      <D2Head id="d2-tools" title={t.tools.title} lede={t.tools.lede} />
      <ul className="d2-tools">
        {tools.map((tool) => {
          const body = (
            <>
              <img src={gameImg(tool.icon)} alt="" width={171} height={171} loading="lazy" decoding="async" />
              <div>
                <h3>{tool.name}</h3>
                <p>{tool.desc}</p>
                {!tool.to && <span className="d2-soon">{t.soon}</span>}
              </div>
            </>
          );
          return (
            <li key={tool.key}>
              {tool.to ? (
                <RouteLink className="d2-tool is-link" to={tab(tool.to)} onNavigate={navigate}>
                  {body}
                </RouteLink>
              ) : (
                <div className="d2-tool">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Cuántas palabras rúnicas se nombran en el tooltip antes del "y N más". */
const TOOLTIP_RUNEWORDS = 6;

/**
 * Las 33 runas con el tooltip del juego: nivel requerido y en qué palabras
 * rúnicas aparece. Con el mouse se abre al pasar; en el celular, al tocar (y
 * se cierra tocando afuera o desplazando la página). Cada runa lleva a su ficha.
 */
function Runes({ tab, navigate }: { tab: (t: D2rTab) => Route; navigate: Nav }) {
  const t = useD2rCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const [open, setOpen] = useState<{ rune: Rune; el: HTMLElement } | null>(null);
  const tip = useRef<HTMLDivElement>(null);
  const say = (l: Loc) => (lang === "es" ? l.es : l.en);

  // Se ubica arriba de la runa, o abajo si no entra; nunca afuera de la pantalla. `useIsoLayoutEffect` y no
  // `useLayoutEffect`: la portada se prerenderiza y ahí el segundo avisa en cada render (ver `floatingTip.ts`).
  useIsoLayoutEffect(() => {
    const box = tip.current;
    if (!open || !box) return;
    const r = open.el.getBoundingClientRect();
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const y = r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8;
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const shown = open?.rune.runewords.slice(0, TOOLTIP_RUNEWORDS) ?? [];
  const rest = open ? open.rune.runewords.length - shown.length : 0;

  return (
    <section className="d2-block" aria-labelledby="d2-runes">
      <D2Head id="d2-runes" title={t.runes.title(HOME.counts.runes.toLocaleString(locale))} lede={t.runes.lede} />
      <ol className="d2-runes">
        {HOME.runes.map((r, i) => (
          <li key={r.id}>
            <RouteLink
              className="d2-rune"
              to={{ ...tab("runes"), detail: r.id }}
              onNavigate={navigate}
              aria-describedby={open?.rune === r ? "d2-tip" : undefined}
              onMouseEnter={(e) => setOpen({ rune: r, el: e.currentTarget })}
              onMouseLeave={() => setOpen(null)}
              onFocus={(e) => setOpen({ rune: r, el: e.currentTarget })}
              onBlur={() => setOpen(null)}
            >
              <img src={gameImg(`rune/${r.id}`)} alt="" width={98} height={98} loading="lazy" decoding="async" />
              <span className="d2-rune-name">{say(r.name).replace(/^(Runa |)(.*?)( Rune|)$/, "$2")}</span>
              <span className="d2-rune-no">#{i + 1}</span>
            </RouteLink>
          </li>
        ))}
      </ol>
      {open && (
        <div className="d2-tip" id="d2-tip" role="tooltip" ref={tip}>
          <div className="d2-tip-name">{say(open.rune.name)}</div>
          <div>{t.runes.level(open.rune.lvl)}</div>
          {open.rune.runewords.length ? (
            <>
              <div>{t.runes.appears(open.rune.runewords.length)}</div>
              <div className="d2-tip-rw">
                {shown.map(say).join(" · ")}
                {rest > 0 && ` ${t.runes.more(rest)}`}
              </div>
            </>
          ) : (
            <div className="d2-tip-dim">{t.runes.none}</div>
          )}
        </div>
      )}
    </section>
  );
}

function Classes({ tab, navigate }: { tab: (t: D2rTab) => Route; navigate: Nav }) {
  const t = useD2rCopy();
  const { lang } = useLang();
  return (
    <section className="d2-block" aria-labelledby="d2-classes">
      <D2Head id="d2-classes" title={t.classes.title} lede={t.classes.lede} />
      <ul className="d2-classes">
        {HOME.classes.map((c) => (
          <li key={c.id}>
            <RouteLink className="d2-class" to={{ ...tab("classes"), detail: c.id }} onNavigate={navigate}>
              <span className="d2-class-pic">
                <img src={gameImg(`class/${c.id}`)} alt="" width={120} height={120} loading="lazy" decoding="async" />
                {/* La clase que trajo Reign of the Warlock (feb-2026). */}
                {c.id === "warlock" && <small>{t.classes.isNew}</small>}
              </span>
              <b>{lang === "es" ? c.name.es : c.name.en}</b>
            </RouteLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

const EVENT_ICON: Record<string, string> = { terror: "event/terror", uber: "event/uberdiablo", pandemonium: "event/pandemoniumevent", cow: "event/cowking" };

function Events({ tab, navigate }: { tab: (t: D2rTab) => Route; navigate: Nav }) {
  const t = useD2rCopy();
  const { lang } = useLang();
  return (
    <section className="d2-block" aria-labelledby="d2-events">
      <D2Head id="d2-events" title={t.events.title} />
      <ul className="d2-events">
        {HOME.events.map((ev) => {
          const body = (
            <>
              <span className={`d2-event-ic${ev.id === "terror" ? " is-terror" : ""}`}>
                <img src={gameImg(EVENT_ICON[ev.id])} alt="" loading="lazy" decoding="async" />
              </span>
              <div>
                <h3>{lang === "es" ? ev.name.es : ev.name.en}</h3>
                <p>{t.events.desc[ev.id]}</p>
              </div>
            </>
          );
          // Las Zonas de Terror tienen su pestaña; los otros eventos, todavía no.
          return (
            <li key={ev.id}>
              {ev.id === "terror" ? (
                <RouteLink className="d2-event is-link" to={tab("terror-zones")} onNavigate={navigate}>
                  {body}
                </RouteLink>
              ) : (
                <div className="d2-event">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
