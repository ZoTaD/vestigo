import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import RouteLink from "./RouteLink";
import SectionHead from "./SectionHead";
import type { Route } from "./route";
import { useCopy, useLocale } from "./i18n";
import { useHeroes, bandBadge, type BandId } from "./deadlockData";
import { heroes as heroSlugs } from "./deadlockSlugs";
import DeadlockHeroPage from "./DeadlockHeroPage";
import {
  firstDir,
  sortRows,
  useHeroKit,
  valueOf,
  type SortKey,
  type TableRow,
} from "./deadlockHeroKitData";

/**
 * La pestaña Héroes: los 38 en una tabla, con los números base del juego al lado
 * de sus victorias y su uso en la banda elegida.
 *
 * Es la que contesta "¿quién tiene más vida?", "¿qué arma pega más por
 * segundo?" o "¿quién gana más espíritu por nivel?" con un clic en el encabezado.
 * La tier list opina (S, A, B…); esta no: ordena lo que el visitante pida.
 *
 * **Todos los números son del juego o de nuestra medición publicada**, nunca
 * calculados acá: los atributos salen del cliente vía deadlock-api
 * (`hero-kit.json`), las victorias y el uso de la tier list de la banda. La
 * única cuenta de esta vista es el daño por disparo de las escopetas
 * (perdigones × daño), y la celda muestra los dos factores.
 */

type Group = "play" | "vitality" | "movement" | "weapon" | "boon" | "melee";

/**
 * Las columnas que se dejan de mostrar cuando la pantalla no alcanza, para que
 * la tabla **no pida scroll de costado** (pedido de ZoTaD, 2026-09-22).
 *
 * Medido: los 18 rótulos piden 1.196 px en español, y a 1440 de ventana hay
 * 1.225. Debajo de eso se van primero las que repiten algo que otra columna ya
 * dice (el DPS con recarga, la bala por bendición) y después las que menos
 * distinguen a un héroe de otro. En el teléfono no hay forma de que entren y
 * queda el scroll con la columna del héroe fija.
 */
const HIDE_AT: { query: string; keys: SortKey[] }[] = [
  { query: "(max-width: 1439px) and (min-width: 761px)", keys: ["sustainedDps", "bulletPerBoon"] },
  { query: "(max-width: 1279px) and (min-width: 761px)", keys: ["healthRegen", "sprintSpeed", "heavyMelee"] },
  { query: "(max-width: 1099px) and (min-width: 761px)", keys: ["stamina", "healthPerBoon"] },
];

function useHiddenColumns(): Set<SortKey> {
  const [hidden, setHidden] = useState<Set<SortKey>>(new Set());
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mqs = HIDE_AT.map((h) => ({ mq: window.matchMedia(h.query), keys: h.keys }));
    const update = () => setHidden(new Set(mqs.filter((m) => m.mq.matches).flatMap((m) => m.keys)));
    update();
    mqs.forEach((m) => m.mq.addEventListener("change", update));
    return () => mqs.forEach((m) => m.mq.removeEventListener("change", update));
  }, []);
  return hidden;
}

interface Column {
  key: SortKey;
  group: Group;
  /** El valor ya formateado, o nada si el héroe no lo tiene. */
  cell: (row: TableRow) => ReactNode;
}

export default function DeadlockHeroes({
  route,
  navigate,
  band,
  picker,
  open,
}: {
  route: Route;
  navigate: (route: Route) => void;
  band: BandId;
  picker: ReactNode;
  /** El slug del héroe abierto (`/deadlock/heroes/<héroe>`), si hay uno. */
  open?: string;
}) {
  const copy = useCopy();
  const t = copy.deadlock.heroes;
  const locale = useLocale();
  const meta = useHeroes(band);
  const kit = useHeroKit();
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "winRate", dir: "desc" });
  const hidden = useHiddenColumns();

  const n = (x: number | undefined, digits = 0) =>
    x === undefined ? "—" : x.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const pct = (x: number | undefined) => (x === undefined ? "—" : `${n(x * 100, 1)}%`);
  /** Con decimales sólo cuando los tiene: 880 y no 880,0; 1,75 y no 1,8. */
  const exact = (x: number | undefined, max = 2) =>
    x === undefined ? "—" : x.toLocaleString(locale, { maximumFractionDigits: max });

  const rows: TableRow[] = useMemo(() => {
    if (!meta) return [];
    return meta.heroes.map((h) => ({
      heroId: h.heroId,
      name: h.name,
      img: h.img,
      tier: h.tier,
      winRate: h.winRate,
      pickRate: h.pickRate,
      stats: kit?.heroes[String(h.heroId)]?.stats,
    }));
  }, [meta, kit]);

  const allColumns: Column[] = [
    {
      key: "winRate",
      group: "play",
      cell: (r) => (
        <>
          {r.tier && <span className="dl-ht-tier" data-tier={r.tier}>{r.tier}</span>}
          {pct(r.winRate)}
        </>
      ),
    },
    { key: "pickRate", group: "play", cell: (r) => pct(r.pickRate) },
    { key: "health", group: "vitality", cell: (r) => exact(r.stats?.health) },
    { key: "healthRegen", group: "vitality", cell: (r) => exact(r.stats?.healthRegen) },
    { key: "moveSpeed", group: "movement", cell: (r) => exact(r.stats?.moveSpeed) },
    { key: "sprintSpeed", group: "movement", cell: (r) => exact(r.stats?.sprintSpeed) },
    { key: "stamina", group: "movement", cell: (r) => exact(r.stats?.stamina) },
    { key: "dps", group: "weapon", cell: (r) => exact(r.stats?.weapon?.dps, 1) },
    { key: "sustainedDps", group: "weapon", cell: (r) => exact(r.stats?.weapon?.sustainedDps, 1) },
    {
      key: "bulletDamage",
      group: "weapon",
      cell: (r) => {
        const w = r.stats?.weapon;
        if (!w) return "—";
        if (w.pellets <= 1) return exact(w.bulletDamage);
        return (
          <span title={t.pelletsTip(w.pellets, exact(w.bulletDamage))}>
            {exact(w.bulletDamage * w.pellets, 1)}
            <span className="dl-ht-sub"> {t.pellets(w.pellets)}</span>
          </span>
        );
      },
    },
    { key: "fireRate", group: "weapon", cell: (r) => exact(r.stats?.weapon?.fireRate) },
    { key: "clip", group: "weapon", cell: (r) => exact(r.stats?.weapon?.clip) },
    { key: "reload", group: "weapon", cell: (r) => (r.stats?.weapon ? `${exact(r.stats.weapon.reload)} s` : "—") },
    { key: "healthPerBoon", group: "boon", cell: (r) => exact(r.stats?.perBoon.health) },
    { key: "bulletPerBoon", group: "boon", cell: (r) => exact(r.stats?.perBoon.bulletDamage, 3) },
    { key: "spiritPerBoon", group: "boon", cell: (r) => exact(r.stats?.perBoon.spiritPower) },
    { key: "heavyMelee", group: "melee", cell: (r) => exact(r.stats?.heavyMelee) },
  ];

  // La columna ordenada nunca se esconde: sería ordenar por algo que no se ve.
  const columns = allColumns.filter((c) => !hidden.has(c.key) || c.key === sort.key);

  const sorted = sortRows(rows, sort.key, sort.dir, locale);

  /**
   * La barra de la columna ordenada: dónde cae cada héroe entre el mínimo y el
   * máximo de esa columna. Sólo en la ordenada, para que la tabla no sea un
   * gráfico de barras de 17 columnas.
   */
  const range = useMemo(() => {
    const vals = rows.map((r) => valueOf(r, sort.key)).filter((v): v is number => typeof v === "number");
    return vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : null;
  }, [rows, sort.key]);
  const barOf = (r: TableRow): CSSProperties | undefined => {
    const v = valueOf(r, sort.key);
    if (typeof v !== "number" || !range || range.max === range.min) return undefined;
    // Un piso del 6 % para que el mínimo se vea como barra y no como vacío.
    const w = 6 + ((v - range.min) / (range.max - range.min)) * 94;
    return { "--bar": `${w.toFixed(1)}%` } as CSSProperties;
  };

  const clickSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: firstDir(key) }));

  const groups: { group: Group; span: number }[] = [];
  for (const c of columns) {
    const last = groups[groups.length - 1];
    if (last && last.group === c.group) last.span++;
    else groups.push({ group: c.group, span: 1 });
  }

  const insignia = bandBadge(band);
  const bandName = copy.deadlock.bands[band];
  const toHero = (heroId: number): Route => ({
    ...route,
    view: "deadlock",
    dlSection: "heroes",
    detail: heroSlugs.toSlug.get(String(heroId)),
  });

  const header = (key: SortKey, label: string, tip?: string, className = "", group?: Group) => {
    const on = sort.key === key;
    return (
      <th
        key={key}
        scope="col"
        className={`dl-ht-th ${className}`}
        data-sorted={on || undefined}
        aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      >
        <button type="button" className="dl-ht-sort" onClick={() => clickSort(key)} title={tip} aria-label={group ? `${t.sortBy(label)} · ${t.groups[group]}` : t.sortBy(label)}>
          <span>{label}</span>
          <svg className="dl-ht-arrow" width="8" height="10" viewBox="0 0 8 10" aria-hidden="true">
            <path d="M4 1 7 4.5H1Z" data-on={on && sort.dir === "asc" ? "" : undefined} />
            <path d="M4 9 1 5.5h6Z" data-on={on && sort.dir === "desc" ? "" : undefined} />
          </svg>
        </button>
      </th>
    );
  };

  // La ficha entera del héroe. Se decide después de los hooks, que corren
  // siempre en el mismo orden.
  const abierto = open && meta ? meta.heroes.find((h) => heroSlugs.toSlug.get(String(h.heroId)) === open) : undefined;
  if (meta && abierto) {
    return (
      <DeadlockHeroPage hero={abierto} heroes={meta.heroes} route={route} navigate={navigate} picker={picker} band={band} />
    );
  }

  return (
    <main className="deadlock deadlock-heroes">
      <SectionHead
        eyebrow={copy.deadlock.eyebrow}
        title={t.title}
        accent={t.accent}
        lead={[t.lead, t.source]}
        controls={picker}
        meta={
          meta && (
            <span className="dl-meta-line">
              {insignia.img && <img src={insignia.img} alt="" width={18} height={18} />}
              {t.meta(meta.heroes.length, bandName)}
            </span>
          )
        }
      />

      {!meta ? (
        <p className="detail-note dl-loading">{t.loading}</p>
      ) : (
        <div className="page">
          <div className="dl-ht-wrap" tabIndex={0} role="region" aria-label={t.title}>
            <table className="dl-ht">
              <thead>
                <tr className="dl-ht-groups">
                  <th scope="col" className="dl-ht-sticky" aria-hidden="true" />
                  {groups.map((g, i) => (
                    <th key={`${g.group}-${i}`} scope="colgroup" colSpan={g.span}>
                      {t.groups[g.group]}
                    </th>
                  ))}
                </tr>
                <tr>
                  {header("name", t.cols.name, undefined, "dl-ht-sticky dl-ht-name")}
                  {columns.map((c) =>
                    header(c.key, t.cols[c.key as keyof typeof t.cols], t.tips[c.key as keyof typeof t.tips], "", c.group)
                  )}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.heroId}>
                    <th scope="row" className="dl-ht-sticky dl-ht-name">
                      <RouteLink className="dl-ht-hero" to={toHero(r.heroId)} onNavigate={navigate}>
                        {r.img && <img src={r.img} alt="" width={32} height={32} loading="lazy" />}
                        <span>{r.name}</span>
                      </RouteLink>
                    </th>
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        data-sorted={sort.key === c.key || undefined}
                        style={sort.key === c.key ? barOf(r) : undefined}
                      >
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
