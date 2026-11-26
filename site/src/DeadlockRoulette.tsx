import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "./i18n";
import SectionHead from "./SectionHead";
import RouteLink from "./RouteLink";
import GameImg from "./GameImg";
import { ItemIcon } from "./DeadlockItemTip";
import { PUBLISHED_BAND, useHeroes } from "./deadlockData";
import { useItems } from "./deadlockItemsData";
import { componentsOf, upgradesOf, type BuilderItem } from "./deadlockBuilder";
import { copyText, editorSearch } from "./deadlockBuildLinks";
import { BUILDS_COPY, fmtN } from "./deadlockBuildsCopy";
import { dailySeed, parseSeed, randomSeed, seedDate, spin, STAGE_COSTS, type RouletteItem } from "./deadlockRouletteSpin";
import { drawRouletteCard } from "./deadlockRouletteCard";
import { shareOrDownload } from "./deadlockImpactCard";
import { routePath, type Route } from "./route";
import "./styles/deadlock-roulette.css";

/**
 * La ruleta de builds (`/deadlock/builds/roulette`), 2026-11-25. La lógica
 * está en `deadlockRouletteSpin.ts`; acá, la página: el héroe, las cuatro etapas,
 * girar, compartir la imagen y abrirla en el editor.
 *
 * La semilla se decide al montar (la del día o la del link): el prerender no
 * sabe qué día lo van a abrir, así que sale sin tirada y no hay desfase.
 */

const SLOTS = new Set(["weapon", "vitality", "spirit"]);
const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function DeadlockRoulette({ route, navigate }: { route: Route; navigate: (r: Route) => void }) {
  const { lang } = useLang();
  const c = BUILDS_COPY[lang];
  const r = c.roulette;
  const heroesMeta = useHeroes(PUBLISHED_BAND);
  const itemsMeta = useItems(PUBLISHED_BAND);
  const [seed, setSeed] = useState<number | null>(null);
  const [face, setFace] = useState<number | null>(null);
  const [aviso, setAviso] = useState("");
  const avisoT = useRef<number>();
  const decir = (m: string) => {
    setAviso(m);
    window.clearTimeout(avisoT.current);
    avisoT.current = window.setTimeout(() => setAviso(""), 2600);
  };
  useEffect(() => () => window.clearTimeout(avisoT.current), []);

  useEffect(() => {
    setSeed(parseSeed(new URLSearchParams(window.location.search).get("s")) ?? dailySeed());
  }, []);

  const heroes = heroesMeta?.heroes ?? [];
  const porItem = useMemo(() => new Map((itemsMeta?.items ?? []).map((i) => [i.itemId, i])), [itemsMeta]);
  const catalogo: RouletteItem[] = useMemo(() => {
    const lookup = (id: number): BuilderItem | undefined => {
      const i = porItem.get(id);
      return i ? { itemId: i.itemId, cost: i.cost, slot: i.slot, upgradesFrom: i.upgradesFrom.map((u) => u.itemId), upgradesTo: i.upgradesTo.map((u) => u.itemId) } : undefined;
    };
    return [...porItem.values()]
      .filter((i) => SLOTS.has(i.slot) && (STAGE_COSTS as readonly number[]).includes(i.cost))
      .map((i) => ({ itemId: i.itemId, cost: i.cost, slot: i.slot as RouletteItem["slot"], related: [...componentsOf(i.itemId, lookup), ...upgradesOf(i.itemId, lookup)] }));
  }, [porItem]);

  const tirada = useMemo(() => (seed === null || heroes.length === 0 || catalogo.length === 0 ? null : spin(seed, heroes.map((h) => h.heroId), catalogo)), [seed, heroes, catalogo]);
  const hero = heroes.find((h) => h.heroId === (face ?? tirada?.heroId)) ?? null;
  const fecha = seed === null ? null : seedDate(seed);
  const delDia = fecha !== null && seed === dailySeed();
  const fechaTxt = (d: Date) => d.toLocaleDateString(lang === "es" ? "es-AR" : "en-US", { day: "numeric", month: "long", timeZone: "UTC" });

  const ponerSemilla = (s: number) => {
    setSeed(s);
    const url = new URL(window.location.href);
    if (s === dailySeed()) url.searchParams.delete("s");
    else url.searchParams.set("s", String(s));
    window.history.replaceState(window.history.state, "", url);
  };

  const girando = face !== null;
  const girar = () => {
    if (girando) return;
    const nueva = randomSeed();
    if (reduceMotion() || heroes.length === 0) return ponerSemilla(nueva);
    // Unas caras pasando antes de la nueva tirada: medio segundo.
    let k = 0;
    const t = window.setInterval(() => {
      setFace(heroes[Math.floor(Math.random() * heroes.length)].heroId);
      if (++k >= 9) {
        window.clearInterval(t);
        setFace(null);
        ponerSemilla(nueva);
      }
    }, 60);
  };

  const link = () => `${window.location.origin}${routePath(route)}${seed !== null && !delDia ? `?s=${seed}` : ""}`;

  const compartir = async () => {
    if (!tirada || !hero) return;
    const cv = await drawRouletteCard({
      title: r.cardTitle,
      subtitle: delDia && fecha ? r.cardDaily(fechaTxt(fecha)) : r.cardRandom,
      hero: hero.name,
      heroImg: hero.card || hero.img,
      heroColor: hero.color ?? null,
      stages: tirada.stages.map((ids, k) => ({
        name: r.stageNames[k],
        items: ids.map((id) => ({ img: porItem.get(id)?.img ?? "", slot: (porItem.get(id)?.slot ?? "weapon") as "weapon" | "vitality" | "spirit" })),
      })),
      cta: r.cardCta,
      footer: "vestigo.gg",
    });
    await shareOrDownload(cv, `vestigo-roulette-${seed}.png`, `${r.cardCta} · ${link()} #VestigoRoulette`);
    decir(r.shared);
  };

  const editor =
    tirada && hero
      ? editorSearch(
          tirada.heroId,
          { cats: tirada.stages.map((items, k) => ({ name: r.stageNames[k], desc: "", items })), path: [] },
          (n) => n,
          () => undefined,
          `${r.title} · ${hero.name}`,
        )
      : "";

  return (
    <section className="deadlock dl-builds dl-rl">
      <RouteLink className="dl-bl-back" to={{ ...route, detail: undefined }} onNavigate={navigate}>
        ← {c.back}
      </RouteLink>
      <SectionHead eyebrow={c.eyebrow} title={r.title} accent={seed === null || delDia ? r.accentDaily : r.accentRandom} />
      <p className="dl-bl-lead">{r.lead}</p>
      <ul className="dl-rl-rules">
        {r.rules.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>

      {!tirada || !hero ? (
        <p className="detail-note">{r.loading}</p>
      ) : (
        <div className="dl-rl-board" aria-busy={girando || undefined}>
          <figure className="dl-rl-hero" style={hero.color ? { ["--hero" as string]: hero.color } : undefined}>
            <GameImg src={hero.card || hero.img} alt="" width={220} height={300} decoding="async" />
            <figcaption>{hero.name}</figcaption>
          </figure>
          <div className="dl-rl-side">
            <p className="dl-rl-when">{delDia && fecha ? r.daily(fechaTxt(fecha)) : r.random}</p>
            <ol className="dl-rl-stages" aria-live="polite">
              {tirada.stages.map((ids, k) => (
                <li key={k} className="dl-rl-stage">
                  <span className="dl-rl-stage-name">
                    {r.stageNames[k]}
                    <small>{r.stage(fmtN(STAGE_COSTS[k], lang))}</small>
                  </span>
                  <ul className="dl-rl-items">
                    {ids.map((id) => (
                      <li key={id} className="dl-rl-item">
                        <ItemIcon itemId={id} size={52} img={porItem.get(id)?.img} />
                        <span>{porItem.get(id)?.name ?? `#${id}`}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
            <div className="dl-rl-actions">
              <button type="button" className="dl-bl-btn is-primary" onClick={girar} disabled={girando}>
                {girando ? r.spinning : r.spin}
              </button>
              {!delDia && (
                <button type="button" className="dl-bl-btn" onClick={() => ponerSemilla(dailySeed())}>
                  {r.backDaily}
                </button>
              )}
              <button type="button" className="dl-bl-btn" onClick={compartir} disabled={girando}>
                {r.share}
              </button>
              <button type="button" className="dl-bl-btn" onClick={async () => decir((await copyText(link())) ? r.copied : link())}>
                {r.copyLink}
              </button>
              <RouteLink className="dl-bl-btn" to={{ ...route, dlSection: "builder", detail: undefined }} onNavigate={navigate} search={editor} title={r.editorTip}>
                {r.editor}
              </RouteLink>
            </div>
            <p className="dl-rl-challenge">{r.challenge}</p>
          </div>
        </div>
      )}
      <p className="dl-bl-toast" role="status" aria-live="polite" data-show={aviso ? true : undefined}>
        {aviso}
      </p>
    </section>
  );
}
