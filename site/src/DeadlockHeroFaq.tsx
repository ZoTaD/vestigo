import { useLang, useLocale, type Lang } from "./i18n";
import type { Hero } from "./deadlockData";
import { upgradePriority, useHeroBuilds } from "./deadlockBuildsData";

/**
 * Preguntas frecuentes al pie de la página de build de un héroe.
 *
 * Son las preguntas con las que se llega a esta página desde un buscador ("best
 * Graves build", "is Graves good", "what to max first on Graves") contestadas
 * con las cifras de la misma página, en texto: el prerender las escribe en el
 * HTML (las builds se cargan antes, ver `entry-server.tsx`) y así el buscador
 * lee la respuesta y no sólo el tablero de íconos. Nada que la página no diga.
 */

const pct = (x: number, locale: string) => `${(x * 100).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;

const lista = (xs: string[], lang: Lang) => {
  if (xs.length <= 1) return xs.join("");
  const y = lang === "es" ? " y " : " and ";
  return `${xs.slice(0, -1).join(", ")}${y}${xs[xs.length - 1]}`;
};

const COPY = {
  en: {
    title: "Questions about",
    good: (h: string) => `Is ${h} good right now?`,
    goodA: (h: string, tier: string, rank: number, of: number, wr: string, pick: string, band: string) =>
      `${h} is ${tier}-tier, #${rank} of ${of} heroes by win rate in ${band} lobbies: ${wr} of matches won, picked in ${pick} of them.`,
    trendUp: (pts: string) => ` Its win rate is up ${pts} points against the previous 15 days.`,
    trendDown: (pts: string) => ` Its win rate is down ${pts} points against the previous 15 days.`,
    build: (h: string) => `What is the best ${h} build?`,
    buildA: (h: string, name: string, wr: string, n: string, items: string) =>
      `The most played build is “${name}”, which wins ${wr} of its ${n} matches. The items that add the most to it: ${items}. The full buy order, by game phase, is at the top of this page.`,
    max: (h: string) => `What should I max first on ${h}?`,
    maxA: (order: string) => `Max ${order}, in that order. The skill path above shows which point goes where, level by level.`,
    counter: (h: string) => `What do ${h} players buy against specific heroes?`,
    counterA: (rows: string) => `${rows}.`,
    counterRow: (item: string, foes: string) => `${item} against ${foes}`,
    hard: (h: string) => `Is ${h} hard to play?`,
    hardA: {
      hard: (h: string, pts: string) => `It rewards practice: ${h} wins ${pts} points more in Phantom+ lobbies than in Sentinel and below.`,
      easy: (h: string, pts: string) => `It is easier to pick up: ${h} wins ${pts} points more in Sentinel and below than in Phantom+, where opponents know how to answer it.`,
      mid: (h: string) => `About average: ${h} wins about the same in high and low ranks.`,
    },
  },
  es: {
    title: "Preguntas sobre",
    good: (h: string) => `¿${h} está fuerte ahora?`,
    goodA: (h: string, tier: string, rank: number, of: number, wr: string, pick: string, band: string) =>
      `${h} está en el tier ${tier}, puesto ${rank} de ${of} héroes por winrate en salas ${band}: gana el ${wr} de sus partidas y se elige en el ${pick}.`,
    trendUp: (pts: string) => ` Su winrate subió ${pts} puntos contra los 15 días anteriores.`,
    trendDown: (pts: string) => ` Su winrate bajó ${pts} puntos contra los 15 días anteriores.`,
    build: (h: string) => `¿Cuál es la mejor build de ${h}?`,
    buildA: (h: string, name: string, wr: string, n: string, items: string) =>
      `La build más jugada es “${name}”, que gana el ${wr} de sus ${n} partidas. Los objetos que más le suman: ${items}. El orden de compra completo, por etapa de la partida, está arriba de todo.`,
    max: (h: string) => `¿Qué habilidad subo primero con ${h}?`,
    maxA: (order: string) => `Subí ${order}, en ese orden. El camino de habilidades de arriba muestra dónde va cada punto, nivel por nivel.`,
    counter: (h: string) => `¿Qué compran los que juegan ${h} contra ciertos héroes?`,
    counterA: (rows: string) => `${rows}.`,
    counterRow: (item: string, foes: string) => `${item} contra ${foes}`,
    hard: (h: string) => `¿${h} es difícil?`,
    hardA: {
      hard: (h: string, pts: string) => `Premia la práctica: ${h} gana ${pts} puntos más en salas Fantasma+ que en Centinela y abajo.`,
      easy: (h: string, pts: string) => `Es fácil de agarrar: ${h} gana ${pts} puntos más en Centinela y abajo que en Fantasma+, donde los rivales saben cómo responderle.`,
      mid: (h: string) => `Lo normal: ${h} gana más o menos lo mismo en rangos altos y bajos.`,
    },
  },
};

export default function DeadlockHeroFaq({
  hero,
  rank,
  of,
  bandName,
  buildName,
}: {
  hero: Hero;
  rank: number;
  of: number;
  bandName: string;
  /** El nombre que la página le da a una build ("Bonus health bruiser"). */
  buildName: (damage: string, trait: string) => string;
}) {
  const { lang } = useLang();
  const locale = useLocale();
  const t = COPY[lang];
  const view = useHeroBuilds(hero.heroId);
  const h = hero.name;
  const qa: { q: string; a: string }[] = [];

  let good = t.goodA(h, hero.tier, rank, of, pct(hero.winRate, locale), pct(hero.pickRate, locale), bandName);
  // `trend` y `skillGap` ya vienen en puntos (como los muestra la cabecera).
  if (hero.trend && Math.abs(hero.trend) >= 0.5) {
    const pts = Math.abs(hero.trend).toLocaleString(locale, { maximumFractionDigits: 1 });
    good += hero.trend > 0 ? t.trendUp(pts) : t.trendDown(pts);
  }
  qa.push({ q: t.good(h), a: good });

  const top = view?.builds[0];
  if (top) {
    const items = [...top.items].sort((a, b) => b.edge - a.edge).slice(0, 3).map((i) => i.name);
    if (items.length > 0)
      qa.push({
        q: t.build(h),
        a: t.buildA(h, buildName(top.damage, top.trait), pct(top.winRate, locale), top.matches.toLocaleString(locale), lista(items, lang)),
      });
    const orden = upgradePriority(top.abilities, top.path).map((a) => a.name);
    if (orden.length >= 3) qa.push({ q: t.max(h), a: t.maxA(lista(orden.slice(0, 3), lang)) });
  }

  const counters = view?.counters.slice(0, 3) ?? [];
  if (counters.length > 0)
    qa.push({ q: t.counter(h), a: t.counterA(counters.map((c) => t.counterRow(c.name, lista(c.foes.slice(0, 3), lang))).join("; ")) });

  const gap = Math.abs(hero.skillGap ?? 0).toLocaleString(locale, { maximumFractionDigits: 1 });
  qa.push({ q: t.hard(h), a: hero.difficulty ? t.hardA[hero.difficulty](h, gap) : t.hardA.mid(h) });

  return (
    <section className="box dl-faq" aria-labelledby="dl-faq-title">
      <h2 className="box-title" id="dl-faq-title">
        {t.title} {h}
      </h2>
      <dl className="dl-faq-list">
        {qa.map((x) => (
          <div key={x.q} className="dl-faq-item">
            <dt>{x.q}</dt>
            <dd>{x.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
