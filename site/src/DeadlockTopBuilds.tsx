import GameImg from "./GameImg";
import { useLang, useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { routePath, type Route } from "./route";
import { useItems } from "./deadlockItemsData";
import type { BandId } from "./deadlockData";
import { builderLink, categoryName, useSteamNames, useTopPlayers } from "./deadlockTopPlayers";
import "./styles/deadlock-draft.css";

/**
 * "Las builds que usan los mejores" (2026-10-30), en la ficha del héroe: las
 * tres builds más elegidas por el top 20 de ese héroe en la escalera, con las
 * primeras dos categorías a la vista y un enlace que la abre entera en el
 * Armador de builds.
 */
export default function DeadlockTopBuilds({ heroId, band, route }: { heroId: number; band: BandId; route: Route }) {
  const copy = useCopy();
  const locale = useLocale();
  const { lang } = useLang();
  const t = copy.deadlock.hero.topBuilds;
  const top = useTopPlayers();
  const items = useItems(band);
  const builds = top?.heroes[String(heroId)]?.builds ?? [];
  const autores = useSteamNames([...new Set(builds.map((b) => b.author))]);
  if (!top || builds.length === 0) return null;

  const porId = new Map((items?.items ?? []).map((i) => [i.itemId, i]));
  const base = routePath({ ...route, view: "deadlock", dlSection: "builder", detail: undefined });

  return (
    <section className="box dl-tb">
      <div className="box-head">
        <h3 className="box-title">{t.title}</h3>
        <p className="box-lead">{t.lead(top.buildsFrom)}</p>
      </div>
      <ol className="dl-tb-list">
        {builds.map((b) => (
          <li key={b.id} className="dl-tb-card">
            <div className="dl-tb-head">
              <strong className="dl-tb-name">{b.name || t.untitled}</strong>
              <span className="dl-tb-by">{t.by(autores.get(b.author) ?? `#${b.author}`)}</span>
            </div>
            <p className="dl-tb-stats">
              {t.stats(b.players, top.buildsFrom, b.matches.toLocaleString(locale), `${Math.round((b.wins / b.matches) * 100)} %`)}
            </p>
            {b.categories.slice(0, 2).map((c, i) => (
              <div className="dl-tb-cat" key={i}>
                <span className="dl-tb-cat-name">{categoryName(c.name, lang)}</span>
                <span className="dl-tb-items">
                  {c.items.slice(0, 8).map((id) => {
                    const it = porId.get(id);
                    return it ? (
                      <GameImg key={id} src={it.img} alt={it.name} title={it.name} width={30} height={30} loading="lazy" decoding="async" />
                    ) : null;
                  })}
                </span>
              </div>
            ))}
            <a className="dl-tb-open" href={builderLink(base, heroId, b, (n) => categoryName(n, lang))}>
              {t.open}
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
