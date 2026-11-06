import { useMemo, useState } from "react";
import "./styles/deadlock-achievements.css";
import { useLang, type Lang } from "./i18n";
import { text } from "./localized";
import GameImg from "./GameImg";
import { heroCard, heroImg, heroName, rankLabel, rankOf } from "./deadlockReportData";
import { GROUPS, seasonOf, type Achievement, type Group } from "./deadlockAchievements";
import { currentSeason } from "./deadlockSeasons";
import { ACH_COPY, achievementText } from "./deadlockAchievementsCopy";

/**
 * Las medallas del perfil (estilo A, elegido por ZoTaD el 5/11): una moneda de
 * metal con cinta, la cara del héroe adentro y una chapa con la cifra.
 *
 * **La cara es el retrato de cabeza (`_sm`), no la carta**: la carta recortada
 * en círculo cortaba las cabezas, y el retrato entra entero en todos los héroes.
 */

function useNames() {
  const { lang } = useLang();
  return {
    hero: (id: number) => {
      const n = heroName(id);
      return n ? text(n, lang, "") : String(id);
    },
    rank: (badge: number) => {
      const r = rankOf(badge);
      return r ? rankLabel(r, lang) : "";
    },
  };
}

/**
 * Cada temporada tiene su estilo (ZoTaD, 5/11): la Season 1 y lo que no es de
 * una temporada van en medalla; la Season 2 en figurita holográfica (estilo
 * C): sticker troquelado con borde blanco y un brillo tornasolado que crece
 * con la rareza, mate en bronce y holo entero en la eterna.
 */
function Sticker({ a, title, detail }: { a: Achievement; title: string; detail: string }) {
  const { lang } = useLang();
  const f = a.face;
  const card = f.kind === "hero" ? heroCard(f.heroId) ?? heroImg(f.heroId) : null;
  const rango = f.kind === "rank" ? rankOf(f.badge) : null;
  return (
    <figure className="dl-sticker" data-tier={a.tier} data-locked={a.progress ? "" : undefined}>
      <div className="dl-sticker-card" aria-hidden="true">
        <div className="dl-sticker-face">
          {card && <GameImg className="dl-sticker-art" src={card} alt="" width={128} height={174} loading="lazy" decoding="async" />}
          {rango && <GameImg className="dl-sticker-rank" src={rango.img} alt="" width={96} height={96} loading="lazy" decoding="async" />}
          {f.kind === "icon" && <span className="dl-sticker-icon" style={{ ["--icon" as string]: `url(/deadlock/game/icons/${f.icon}.svg)` }} />}
          <span className="dl-sticker-foil" />
          <span className="dl-sticker-shade" />
          <b className="dl-sticker-num">{a.tag}</b>
          <span className="dl-sticker-season">S{seasonOf(a)}</span>
          <span className="dl-sticker-label">{title}</span>
        </div>
        <span className="dl-sticker-peel" />
      </div>
      <figcaption>
        <span>{detail}</span>
        {a.rarity != null && !a.progress && <span className="dl-medal-rarity">{rarityText(a, lang)}</span>}
        {a.progress ? (
          <span className="dl-medal-bar" role="progressbar" aria-valuenow={a.progress.have} aria-valuemax={a.progress.need}>
            <i style={{ width: `${Math.min(100, (a.progress.have / a.progress.need) * 100)}%` }} />
          </span>
        ) : (
          <em className="dl-medal-tier">{ACH_COPY[lang].tiers[a.tier]}</em>
        )}
      </figcaption>
    </figure>
  );
}

/** "0,5 % de los jugadores", o "de los que juegan Mina" en la maestría. */
function rarityText(a: Achievement, lang: Lang): string {
  const c = ACH_COPY[lang];
  if (a.kind.type === "mastery") {
    const n = heroName(a.kind.heroId);
    return c.rarityHero(a.rarity!, lang, n ? text(n, lang, "") : "");
  }
  return c.rarity(a.rarity!, lang);
}

export function Medal({ a, size = "lg" }: { a: Achievement; size?: "lg" | "sm" }) {
  const { lang } = useLang();
  const names = useNames();
  const { title, detail } = achievementText(a, lang, names.hero, names.rank);
  if (size === "lg" && (seasonOf(a) ?? 0) >= 2) return <Sticker a={a} title={title} detail={detail} />;
  const px = size === "lg" ? 84 : 26;
  const f = a.face;
  return (
    <figure className="dl-medal" data-tier={a.tier} data-size={size} data-locked={a.progress ? "" : undefined} title={size === "sm" ? `${title} · ${detail}` : undefined}>
      <div className="dl-medal-disc" aria-hidden="true">
        <span className="dl-medal-ribbon" />
        <span className="dl-medal-coin">
          {f.kind === "hero" && (
            <GameImg className="dl-medal-face" src={heroImg(f.heroId) ?? ""} alt="" width={px} height={px} loading="lazy" decoding="async" />
          )}
          {f.kind === "rank" && rankOf(f.badge) && (
            <GameImg className="dl-medal-rank" src={rankOf(f.badge)!.img} alt="" width={px} height={px} loading="lazy" decoding="async" />
          )}
          {f.kind === "icon" && (
            <span className="dl-medal-icon" style={{ ["--icon" as string]: `url(/deadlock/game/icons/${f.icon}.svg)` }} />
          )}
        </span>
        {size === "lg" && <b className="dl-medal-tag">{a.tag}</b>}
      </div>
      {size === "lg" && (
        <figcaption>
          <strong>{title}</strong>
          <span>{detail}</span>
          {a.rarity != null && !a.progress && <span className="dl-medal-rarity">{rarityText(a, lang)}</span>}
          {a.progress ? (
            <span className="dl-medal-bar" role="progressbar" aria-valuenow={a.progress.have} aria-valuemax={a.progress.need}>
              <i style={{ width: `${Math.min(100, (a.progress.have / a.progress.need) * 100)}%` }} />
            </span>
          ) : (
            <em className="dl-medal-tier">{ACH_COPY[lang].tiers[a.tier]}</em>
          )}
        </figcaption>
      )}
    </figure>
  );
}

/** La fila chiquita de la cabecera: las mejores cuatro y cuántas hay. */
export function MedalStrip({ earned, onOpen }: { earned: Achievement[]; onOpen: () => void }) {
  const { lang } = useLang();
  if (earned.length === 0) return null;
  return (
    <button type="button" className="dl-medal-strip" onClick={onOpen}>
      {earned.slice(0, 4).map((a) => (
        <Medal key={a.id} a={a} size="sm" />
      ))}
      <span>{ACH_COPY[lang].earned(earned.length)}</span>
    </button>
  );
}

/** La pestaña Logros entera. */
export default function DeadlockAchievements({
  seasons,
  bySeason,
}: {
  /** Las temporadas con partidas, de la más nueva a la más vieja. */
  seasons: number[];
  bySeason: Map<number, { earned: Achievement[]; next: Achievement[] }>;
}) {
  const { lang } = useLang();
  const c = ACH_COPY[lang];
  const [grupo, setGrupo] = useState<Group | "all">("all");
  const [elegida, setElegida] = useState<number | null>(null);
  const temporada = elegida != null && seasons.includes(elegida) ? elegida : seasons[0];
  const { earned, next } = bySeason.get(temporada) ?? { earned: [], next: [] };
  const conteo = useMemo(() => {
    const m = new Map<Group, number>();
    for (const a of earned) m.set(a.group, (m.get(a.group) ?? 0) + 1);
    return m;
  }, [earned]);
  const visibles = grupo === "all" ? earned : earned.filter((a) => a.group === grupo);

  return (
    <div className="dl-ach">
      <section className="box dl-pcard">
        <div className="box-head">
          <h2 className="box-title">{c.tabs.achievements}</h2>
          <span className="box-aside">{c.earned(earned.length)}</span>
        </div>
        {/* Cada temporada tiene sus logros: la que terminó queda congelada. */}
        {seasons.length > 0 && (
          <label className="dl-ach-season">
            <span>{c.season}</span>
            <select
              value={temporada}
              onChange={(e) => {
                setElegida(Number(e.target.value));
                setGrupo("all");
              }}
            >
              {seasons.map((s, i) => (
                <option key={s} value={s}>
                  {c.seasonName(s, i === 0 && s === currentSeason().id)}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="detail-note">{c.lead}</p>
        {earned.length === 0 ? (
          <p className="dl-notice">{c.none}</p>
        ) : (
          <>
            <div className="seg is-wrap dl-scope dl-ach-filter" role="group">
              <button type="button" data-active={grupo === "all"} aria-pressed={grupo === "all"} onClick={() => setGrupo("all")}>
                {c.all}
                <em className="dl-scope-count">{earned.length}</em>
              </button>
              {GROUPS.filter((g) => conteo.get(g)).map((g) => (
                <button type="button" key={g} data-active={grupo === g} aria-pressed={grupo === g} onClick={() => setGrupo(g)}>
                  {c.groups[g]}
                  <em className="dl-scope-count">{conteo.get(g)}</em>
                </button>
              ))}
            </div>
            <div className="dl-medal-grid">
              {visibles.map((a) => (
                <Medal key={a.id} a={a} />
              ))}
            </div>
          </>
        )}
        <p className="detail-note dl-ach-foot">{c.howTiers}</p>
      </section>

      {next.length > 0 && (
        <section className="box dl-pcard">
          <div className="box-head">
            <h2 className="box-title">{c.next}</h2>
          </div>
          <p className="detail-note">{c.nextLead}</p>
          <div className="dl-medal-grid">
            {next.map((a) => (
              <Medal key={a.id} a={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Las mejores, para el Resumen. */
export function BestAchievements({ earned, onOpen }: { earned: Achievement[]; onOpen: () => void }) {
  const { lang } = useLang();
  const c = ACH_COPY[lang];
  if (earned.length === 0) return null;
  // Variadas: la mejor de cada tipo primero, así no son tres "#1 con X" iguales.
  const tipos = new Set<string>();
  const primeras = earned.filter((a) => !tipos.has(a.kind.type) && tipos.add(a.kind.type));
  const elegidas = [...primeras, ...earned.filter((a) => !primeras.includes(a))].slice(0, 3);
  return (
    <div className="box dl-pcard">
      <h2 className="box-title dl-pcard-title">{c.best}</h2>
      <div className="dl-medal-grid dl-medal-grid-mini">
        {elegidas.map((a) => (
          <Medal key={a.id} a={a} />
        ))}
      </div>
      {earned.length > 3 && (
        <button type="button" className="dl-more" onClick={onOpen}>
          {c.seeAll(earned.length)}
        </button>
      )}
    </div>
  );
}
