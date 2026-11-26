import { useState } from "react";
import { useLang, type Lang } from "./i18n";
import { text } from "./localized";
import GameImg from "./GameImg";
import RankBadge from "./DeadlockRankBadge";
import { Medal, useNames } from "./DeadlockAchievementsTab";
import { achievementText } from "./deadlockAchievementsCopy";
import { heroCard, heroName, rankLabel, rankOf } from "./deadlockReportData";
import { shareOrDownload } from "./deadlockImpactCard";
import type { SeasonRecap } from "./deadlockSeasonRecapData";
import "./styles/deadlock-recap.css";

/**
 * "Tu temporada en resumen" (2026-11-25): la tarjeta de arriba del Resumen del
 * perfil, con lo que se comparte: héroe más jugado, mejor racha, mejor partida,
 * logro más raro y el recorrido de rango. Los números salen de
 * `deadlockSeasonRecapData.ts`; la imagen se dibuja en un `<canvas>` sin el avatar
 * de Steam (es de otro dominio y ensuciaría el lienzo).
 */

const RECAP_COPY = {
  en: {
    title: (s: number) => `Your Season ${s}`,
    accent: "recap",
    matches: "Matches",
    winRate: "Win rate",
    hours: "Hours played",
    heroes: (n: number) => (n === 1 ? "1 hero" : `${n} heroes`),
    topHero: "Most played",
    topHeroLine: (m: string, wr: string) => `${m} matches · ${wr} wins`,
    streak: "Best win streak",
    streakLine: (n: number) => (n === 1 ? "1 win in a row" : `${n} wins in a row`),
    bestGame: "Best match",
    bestGameLine: (hero: string, won: boolean) => `${hero} · ${won ? "won" : "lost"}`,
    rank: "Rank",
    rankFrom: (a: string) => `Started at ${a}`,
    rankPeak: (a: string) => `Peak: ${a}`,
    rarest: "Rarest achievement",
    share: "Share my season",
    shared: "Image ready",
    cardTitle: (s: number) => `My Deadlock Season ${s}`,
  },
  es: {
    title: (s: number) => `Tu Temporada ${s}`,
    accent: "en resumen",
    matches: "Partidas",
    winRate: "Victorias",
    hours: "Horas jugadas",
    heroes: (n: number) => (n === 1 ? "1 héroe" : `${n} héroes`),
    topHero: "El más jugado",
    topHeroLine: (m: string, wr: string) => `${m} partidas · ${wr} de victorias`,
    streak: "Mejor racha",
    streakLine: (n: number) => (n === 1 ? "1 victoria seguida" : `${n} victorias seguidas`),
    bestGame: "Mejor partida",
    bestGameLine: (hero: string, won: boolean) => `${hero} · ${won ? "ganada" : "perdida"}`,
    rank: "Rango",
    rankFrom: (a: string) => `Empezó en ${a}`,
    rankPeak: (a: string) => `Pico: ${a}`,
    rarest: "Logro más raro",
    share: "Compartir mi temporada",
    shared: "Imagen lista",
    cardTitle: (s: number) => `Mi Temporada ${s} de Deadlock`,
  },
} as const;

const num = (x: number, lang: Lang, d = 0) => x.toLocaleString(lang === "es" ? "es-AR" : "en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (x: number, lang: Lang) => `${num(x * 100, lang, 0)}%`;

export default function DeadlockSeasonRecap({ recap, player }: { recap: SeasonRecap; player: string }) {
  const { lang } = useLang();
  const names = useNames();
  const c = RECAP_COPY[lang];
  const [aviso, setAviso] = useState("");
  const hero = (id: number) => text(heroName(id) ?? undefined, lang, `#${id}`);
  const rank = (b: number) => {
    const r = rankOf(b);
    return r ? rankLabel(r, lang) : "";
  };
  const top = recap.topHero;
  const g = recap.bestGame;
  const rara = recap.rarest ? achievementText(recap.rarest, lang, names.hero, names.rank) : null;

  const compartir = async () => {
    const cv = await drawRecapCard({
      title: c.cardTitle(recap.season),
      player,
      heroImg: top ? heroCard(top.heroId) : null,
      tiles: [
        [c.matches, num(recap.matches, lang), `${pct(recap.wins / recap.matches, lang)} · ${c.heroes(recap.heroesPlayed)}`],
        [c.topHero, top ? hero(top.heroId) : "—", top ? c.topHeroLine(num(top.matches, lang), pct(top.wins / top.matches, lang)) : ""],
        [c.streak, String(recap.bestStreak), c.streakLine(recap.bestStreak)],
        [c.bestGame, g ? `${g.kills}/${g.deaths}/${g.assists}` : "—", g ? c.bestGameLine(hero(g.heroId), g.won) : ""],
        [c.rank, recap.rank ? rank(recap.rank.to) : "—", recap.rank ? c.rankPeak(rank(recap.rank.peak)) : ""],
        [c.rarest, rara?.title ?? "—", rara?.detail ?? ""],
      ],
      footer: "vestigo.gg",
    });
    await shareOrDownload(cv, `vestigo-season-${recap.season}.png`, `${c.cardTitle(recap.season)} · vestigo.gg`);
    setAviso(c.shared);
    window.setTimeout(() => setAviso(""), 2600);
  };

  return (
    <div className="box dl-pcard dl-recap">
      <div className="dl-recap-head">
        <h2 className="box-title dl-pcard-title">
          {c.title(recap.season)} <em>{c.accent}</em>
        </h2>
        <button type="button" className="dl-recap-share" onClick={compartir}>
          {c.share}
        </button>
      </div>
      <div className="dl-recap-grid">
        <div className="dl-recap-tile">
          <span className="dl-recap-k">{c.matches}</span>
          <b>{num(recap.matches, lang)}</b>
          <span className="dl-recap-v">
            {pct(recap.wins / recap.matches, lang)} · {num(recap.hours, lang, 0)} h · {c.heroes(recap.heroesPlayed)}
          </span>
        </div>
        {top && (
          <div className="dl-recap-tile is-hero">
            {heroCard(top.heroId) && <GameImg src={heroCard(top.heroId)!} alt="" width={56} height={76} loading="lazy" decoding="async" />}
            <span>
              <span className="dl-recap-k">{c.topHero}</span>
              <b>{hero(top.heroId)}</b>
              <span className="dl-recap-v">{c.topHeroLine(num(top.matches, lang), pct(top.wins / top.matches, lang))}</span>
            </span>
          </div>
        )}
        <div className="dl-recap-tile">
          <span className="dl-recap-k">{c.streak}</span>
          <b>{recap.bestStreak}</b>
          <span className="dl-recap-v">{c.streakLine(recap.bestStreak)}</span>
        </div>
        {g && (
          <div className="dl-recap-tile">
            <span className="dl-recap-k">{c.bestGame}</span>
            <b>
              {g.kills}/{g.deaths}/{g.assists}
            </b>
            <span className="dl-recap-v">{c.bestGameLine(hero(g.heroId), g.won)}</span>
          </div>
        )}
        {recap.rank && (
          <div className="dl-recap-tile is-rank">
            <RankBadge badge={recap.rank.to} height={44} />
            <span>
              <span className="dl-recap-k">{c.rank}</span>
              <b>{rank(recap.rank.to)}</b>
              <span className="dl-recap-v">
                {c.rankFrom(rank(recap.rank.from))} · {c.rankPeak(rank(recap.rank.peak))}
              </span>
            </span>
          </div>
        )}
        {recap.rarest && rara && (
          <div className="dl-recap-tile is-medal">
            <Medal a={recap.rarest} size="sm" />
            <span>
              <span className="dl-recap-k">{c.rarest}</span>
              <b>{rara.title}</b>
              <span className="dl-recap-v">{rara.detail}</span>
            </span>
          </div>
        )}
      </div>
      <p className="dl-bl-toast" role="status" aria-live="polite" data-show={aviso ? true : undefined}>
        {aviso}
      </p>
    </div>
  );
}

/* ── La imagen ─────────────────────────────────────────────────────── */

const W = 1200;
const H = 630;

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => ok(im);
    im.onerror = () => ok(null);
    im.src = src;
  });
}

function fit(g: CanvasRenderingContext2D, s: string, max: number): string {
  if (g.measureText(s).width <= max) return s;
  let t = s;
  while (t.length > 1 && g.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

async function drawRecapCard(d: { title: string; player: string; heroImg: string | null; tiles: [string, string, string][]; footer: string }): Promise<HTMLCanvasElement> {
  if (document.fonts?.ready) await document.fonts.ready;
  const css = getComputedStyle(document.documentElement);
  const display = css.getPropertyValue("--font-display").trim() || "Impact, sans-serif";
  const body = css.getPropertyValue("--font-text").trim() || "sans-serif";
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#14110d";
  g.fillRect(0, 0, W, H);

  // La carta del héroe más jugado, a sangre a la izquierda y fundida al fondo.
  const im = d.heroImg ? await load(d.heroImg) : null;
  if (im) {
    const h = H;
    const w = (im.width / im.height) * h;
    g.globalAlpha = 0.9;
    g.drawImage(im, -40, 0, w, h);
    g.globalAlpha = 1;
    const fade = g.createLinearGradient(0, 0, 460, 0);
    fade.addColorStop(0, "rgba(20,17,13,0)");
    fade.addColorStop(0.75, "rgba(20,17,13,0.85)");
    fade.addColorStop(1, "#14110d");
    g.fillStyle = fade;
    g.fillRect(0, 0, 460, H);
  }

  const x0 = 420;
  g.fillStyle = "#f59a6c";
  g.font = `600 24px ${body}`;
  g.fillText(fit(g, d.player, W - x0 - 60), x0, 70);
  g.fillStyle = "#f7e9d5";
  g.font = `700 50px ${display}`;
  g.fillText(fit(g, d.title.toUpperCase(), W - x0 - 50), x0, 122);

  // Seis casillas en dos columnas.
  const cw = (W - x0 - 60 - 24) / 2;
  const ch = 132;
  d.tiles.forEach(([k, v, sub], i) => {
    const x = x0 + (i % 2) * (cw + 24);
    const y = 150 + Math.floor(i / 2) * (ch + 12);
    g.fillStyle = "rgba(247,233,213,0.07)";
    g.fillRect(x, y, cw, ch);
    g.fillStyle = "#b9a88f";
    g.font = `700 18px ${display}`;
    g.fillText(k.toUpperCase(), x + 18, y + 32);
    g.fillStyle = "#f7e9d5";
    // Un valor largo (el nombre de un logro) baja de tamaño antes de cortarse.
    g.font = `700 40px ${display}`;
    if (g.measureText(v).width > cw - 36) g.font = `700 26px ${display}`;
    g.fillText(fit(g, v, cw - 36), x + 18, y + 74);
    g.fillStyle = "#d8c7ad";
    g.font = `500 18px ${body}`;
    g.fillText(fit(g, sub, cw - 36), x + 18, y + 110);
  });

  g.fillStyle = "#f59a6c";
  g.font = `700 22px ${display}`;
  const fw = g.measureText(d.footer).width;
  g.fillText(d.footer, W - 56 - fw, H - 26);
  return cv;
}
