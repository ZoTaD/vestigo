import type { CSSProperties } from "react";
import type { Special, SpecialCard } from "./deadlockNewsData";
import { headlineLines } from "./newsCopy";

/**
 * Edición especial de Vestigo News: una actualización grande sin notas de
 * balance ("City Never Sleeps", 2026-09-29). Lleva su propia portada —
 * titular, votación de héroes nuevos y cifras— y secciones con fotos en vez
 * de líneas de cambios. Los textos vienen del JSON de la edición, en los dos
 * idiomas; acá sólo quedan los rótulos fijos.
 *
 * El CSS vive con el resto del diario, bajo `.vn-x-*` en `styles/news.css`.
 */

const COPY = {
  en: {
    candidates: "The candidates",
    candidatesSub: "Six new heroes · you pick the order",
    releases: "Releases",
    city: "The city, remade",
    citySub: "Map and neutrals",
    wanted: "Wanted",
    wantedSub: "The new neutrals",
    todo: "Things to do",
    todoSub: "New spots on the map",
    pings: "New pings",
    pingsSub: "15,000+ new lines",
    more: "Everything else",
    moreSub: "HUD, shop, pings and more",
    source: "Official notes: playdeadlock.com",
  },
  es: {
    candidates: "Los candidatos",
    candidatesSub: "Seis héroes nuevos · el orden lo elegís vos",
    releases: "Salidas",
    city: "La ciudad, rehecha",
    citySub: "Mapa y neutrales",
    wanted: "Se buscan",
    wantedSub: "Los neutrales nuevos",
    todo: "Qué hacer en la ciudad",
    todoSub: "Lugares nuevos del mapa",
    pings: "Pings nuevos",
    pingsSub: "Más de 15.000 líneas nuevas",
    more: "Todo lo demás",
    moreSub: "HUD, tienda, pings y más",
    source: "Notas oficiales: playdeadlock.com",
  },
};

export const specialSource = (lang: "en" | "es") => COPY[lang].source;

const poster = (code: string, torn = false) =>
  `/deadlock/game/news/2026-09-29/poster-${code}${torn ? "-torn" : ""}.webp`;
const sticker = (code: string) => `/deadlock/game/news/2026-09-29/sticker-${code}.webp`;

/** La palabra más larga, para que el CSS achique el título sin cortarla (como en DeadlockNews). */
const fit = (title: string) => ({ "--vn-w": Math.max(1, ...title.split(" ").map((w) => w.length)) }) as CSSProperties;

const jump = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

function Sec({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="vn-sec">
      <h2>{title}</h2>
      <small className="vn-lbl">{sub}</small>
    </div>
  );
}

/** La portada: titular, votación y cifras. */
export function SpecialFront({ s, lang, locale }: { s: Special; lang: "en" | "es"; locale: string }) {
  const headline = s.headline[lang];
  const lines = headlineLines(headline);
  const day = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  return (
    <section className="vn-front vn-x-front">
      <div>
        <div className="vn-kicker vn-lbl">{s.kicker[lang]}</div>
        <h2
          className="vn-headline"
          style={
            {
              // Un carácter de aire: Reaver ensancha las M y las Ñ, y el pincel se pasaba.
              "--vn-hl-len": Math.max(...lines.map((l) => l.length)) + 1,
            } as CSSProperties
          }
        >
          <span>
            {lines.map((l, i) => (
              <span key={i} className="vn-hl-line">
                {l}
              </span>
            ))}
          </span>
        </h2>
        <p className="vn-deck">{s.deck[lang]}</p>
      </div>
      <div className="vn-score">
        {s.art && <img className="vn-x-art" src={s.art} alt="City Never Sleeps" width={900} height={512} />}
        {s.vote && (
          <div className="vn-x-vote">
            <div className="vn-lbl vn-x-vote-title">{s.vote.title[lang]}</div>
            <div className="vn-x-stickers">
              {s.candidates.map((c) => (
                <a key={c.code} href={`#vn-c-${c.code}`} onClick={jump(`vn-c-${c.code}`)} title={c.name[lang]}>
                  <img src={sticker(c.code)} alt={c.name[lang]} width={160} height={160} />
                </a>
              ))}
            </div>
            <p>{s.vote.text[lang]}</p>
            <div className="vn-x-dates vn-lbl">
              <span>{COPY[lang].releases}</span>
              {s.vote.dates.map((d) => (
                <b key={d}>{day(d)}</b>
              ))}
            </div>
          </div>
        )}
        <div className="vn-totals vn-lbl">
          {s.stats.map((x) => (
            <div key={x.label.en}>
              <b>{x.n}</b>
              {x.label[lang]}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cards({ cards, lang, kind }: { cards: SpecialCard[]; lang: "en" | "es"; kind: "haunt" | "todo" | "ping" }) {
  return (
    <div className={`vn-x-cards vn-x-${kind}`}>
      {cards.map((c) => (
        <figure key={c.name.en} className="vn-x-card">
          <div className="vn-x-pic">
            <img src={c.img} alt="" loading="lazy" />
          </div>
          <figcaption>
            {c.where && <span className="vn-lbl">{c.where}</span>}
            <b style={fit(c.name[lang])}>{c.name[lang]}</b>
            {lang === "es" && c.name.es !== c.name.en && <small>{c.name.en}</small>}
            <p>{c.text[lang]}</p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/** El cuerpo: candidatos, el Broker, la ciudad, los neutrales y el resto. */
export function SpecialBody({ s, lang }: { s: Special; lang: "en" | "es" }) {
  const t = COPY[lang];
  return (
    <>
      <Sec title={t.candidates} sub={t.candidatesSub} />
      <div className="vn-x-posters">
        {s.candidates.map((c) => (
          <figure
            key={c.code}
            id={`vn-c-${c.code}`}
            className="vn-x-poster"
            style={{ "--hc": c.color } as CSSProperties}
          >
            <div className="vn-x-sheet">
              <img
                src={poster(c.code)}
                alt={`${c.name[lang]} — ${c.slogan[lang]}`}
                width={560}
                height={805}
                loading="lazy"
              />
              <img className="vn-x-torn" src={poster(c.code, true)} alt="" width={560} height={805} loading="lazy" />
            </div>
            <figcaption>
              <img className="vn-x-face" src={sticker(c.code)} alt="" width={64} height={64} loading="lazy" />
              <div>
                <b style={fit(c.name[lang])}>{c.name[lang]}</b>
                <i>“{c.slogan[lang]}”</i>
                <span className="vn-x-tags">
                  {c.tags[lang].map((tag) => (
                    <span key={tag} className="vn-lbl">
                      {tag}
                    </span>
                  ))}
                </span>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>

      {s.broker && (
        <>
          <Sec title={s.broker.title[lang]} sub={s.broker.sub[lang]} />
          <div className="vn-x-broker">
            <div className="vn-x-shop">
              <img src={s.broker.img} alt="" loading="lazy" />
              <img className="vn-x-logo" src={s.broker.logo} alt={s.broker.title[lang]} loading="lazy" />
            </div>
            <ul className="vn-x-points">
              {s.broker.points.map((p) => (
                <li key={p.en}>{p[lang]}</li>
              ))}
            </ul>
            <div className="vn-x-corrupt">
              {s.broker.cards.map((src) => (
                <img key={src} src={src} alt="" loading="lazy" />
              ))}
            </div>
          </div>
        </>
      )}

      <Sec title={t.city} sub={t.citySub} />
      <p className="vn-x-lede">{s.cityText[lang]}</p>
      <div className="vn-x-places">
        {s.places.map((p) => (
          <figure key={p.name} className="vn-x-place">
            <img src={p.img} alt="" loading="lazy" />
            <figcaption>
              <span className="vn-lbl">{p.where[lang]}</span>
              <b style={fit(p.name)}>{p.name}</b>
            </figcaption>
          </figure>
        ))}
      </div>

      <Sec title={t.wanted} sub={t.wantedSub} />
      <Cards cards={s.haunts} lang={lang} kind="haunt" />

      <Sec title={t.todo} sub={t.todoSub} />
      <Cards cards={s.todo} lang={lang} kind="todo" />

      {s.pings && (
        <>
          <Sec title={t.pings} sub={t.pingsSub} />
          <Cards cards={s.pings} lang={lang} kind="ping" />
        </>
      )}

      <Sec title={t.more} sub={t.moreSub} />
      <div className="vn-x-more">
        {s.more.map((g) => (
          <div key={g.title.en} className="vn-x-group">
            <h3>{g.title[lang]}</h3>
            <ul className="vn-x-points">
              {g.points.map((p) => (
                <li key={p.en}>{p[lang]}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
