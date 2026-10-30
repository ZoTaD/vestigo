import { useEffect, useState } from "react";
import GameImg from "./GameImg";
import { useLang, useLocale } from "./i18n";
import { text } from "./localized";
import { catalog } from "./deadlockData";
import { useItems } from "./deadlockItemsData";
import { NEWS_COPY } from "./newsCopy";

/**
 * "Quién se movió" (2026-10-30), dentro de la edición de un parche: el winrate
 * de héroes y objetos la semana antes contra la semana después, en Fantasma+.
 * Lo calcula `games/deadlock/pipeline/src/patchMovers.ts`. Las notas dicen qué
 * cambió; esto dice qué pasó en las partidas.
 */

/** [id, winrate antes, winrate después, partidas antes, partidas después] */
type Mover = [number, number, number, number, number];

interface EditionMovers {
  date: string;
  band: string;
  until: string;
  complete: boolean;
  heroes: { up: Mover[]; down: Mover[] };
  items: { up: Mover[]; down: Mover[] };
}

interface PatchMoversFile {
  days: number;
  editions: Record<string, EditionMovers>;
}

let archivo: PatchMoversFile | null | undefined;
let pidiendo: Promise<void> | null = null;

function usePatchMovers(): PatchMoversFile | null | undefined {
  const [, set] = useState(0);
  useEffect(() => {
    if (archivo !== undefined) return;
    let vivo = true;
    pidiendo ??= import("@deadlock/patch-movers.json")
      .then((m) => {
        archivo = m.default as unknown as PatchMoversFile;
      })
      .catch(() => {
        archivo = null;
      });
    pidiendo.then(() => vivo && set((n) => n + 1));
    return () => {
      vivo = false;
    };
  }, []);
  return archivo;
}

export default function DeadlockPatchMovers({ slug }: { slug: string }) {
  const { lang } = useLang();
  const locale = useLocale();
  const copy = NEWS_COPY[lang].movers;
  const datos = usePatchMovers();
  const items = useItems("phantom-above");
  const ed = datos?.editions[slug];
  if (!datos || !ed) return null;
  const hay = ed.heroes.up.length + ed.heroes.down.length + ed.items.up.length + ed.items.down.length > 0;
  if (!hay) return null;

  const porItem = new Map((items?.items ?? []).map((i) => [i.itemId, i]));
  const pct = (x: number) => `${(x * 100).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
  const pp = (m: Mover) => {
    const d = (m[2] - m[1]) * 100;
    return `${d > 0 ? "+" : "−"}${Math.abs(d).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}`;
  };

  const lista = (ms: Mover[], kind: "hero" | "item", dir: "up" | "down") =>
    ms.length > 0 && (
      <ol className="vn-mv-list">
        {ms.map((m) => {
          const hero = kind === "hero" ? catalog.heroes[String(m[0])] : undefined;
          const item = kind === "item" ? porItem.get(m[0]) : undefined;
          const nombre = hero ? text(hero.name, lang, "?") : item?.name;
          const img = hero?.img ?? item?.img;
          if (!nombre) return null;
          return (
            <li key={m[0]}>
              {img && <GameImg src={img} alt="" width={36} height={36} loading="lazy" decoding="async" />}
              <span className="vn-mv-name">{nombre}</span>
              <span className="vn-mv-wr">
                {pct(m[1])} → {pct(m[2])}
              </span>
              <b data-dir={dir}>{pp(m)}</b>
            </li>
          );
        })}
      </ol>
    );

  return (
    <section className="vn-movers">
      <div className="vn-sec">
        <h2>{copy.title}</h2>
        <small className="vn-lbl">{ed.complete ? copy.sub(datos.days) : copy.open(datos.days)}</small>
      </div>
      <div className="vn-mv-grid">
        {(["heroes", "items"] as const).map((k) =>
          (["up", "down"] as const).map((dir) =>
            ed[k][dir].length > 0 ? (
              <div key={`${k}-${dir}`} className="vn-mv-col">
                <h3 className="vn-lbl" data-dir={dir}>
                  {dir === "up" ? "▲" : "▼"} {copy[k][dir]}
                </h3>
                {lista(ed[k][dir], k === "heroes" ? "hero" : "item", dir)}
              </div>
            ) : null
          )
        )}
      </div>
    </section>
  );
}
