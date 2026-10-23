/**
 * La pestaña Cultivos de Stardew Valley (etapa 2, tarea 4): la calculadora de ganancias. Arriba, en una caja del menú,
 * lo que se elige (estación, día de siembra, nivel, fertilizante, profesiones, cómo se vende, de dónde salen las semillas
 * e invernadero); abajo, la tabla de cultivos ordenada por oro por día, y debajo los frutales.
 *
 * Las cuentas son las de `calc.ts`; `state.ts` arma las filas, las ordena y escribe el estado en la dirección
 * (`?season=1&fert=deluxe&sort=gross&dir=asc`), así se puede compartir. Se lee después del primer dibujo: el HTML
 * prerenderizado sale con los valores por defecto. Son 50 cultivos y 8 frutales: no hace falta `LazyRows`; los sprites
 * van `lazy` y con tamaño fijo.
 *
 * Con semillas compradas, los cultivos cuya semilla no se vende en ninguna tienda (ni de festival) salen del ranking y
 * van en una caja aparte, con las cuentas de semillas propias; con semillas propias compiten todos. La semilla que sólo
 * vende un festival (la Fresa) compite con ese precio, y el nombre del festival va debajo del costo. Las semillas
 * silvestres (una recolección al azar) nunca compiten: van en su propia caja.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useStardewCopy } from "../../stardewCopy";
import { useLoad } from "../../useLoad";
import { loadCrops, peekCrops, say } from "../data";
import { Box, Gold, SdLoading, Sprite, type Nav } from "../ui";
import type { Best, CropsData, Fert, Product } from "./calc";
import { cropTable, DEFAULT_STATE, FERTS, firstDir, noShopTable, readCropState, SORT_KEYS, TREE_DAYS, treeTable, wildTable, writeCropState, type CropRow, type CropState, type SortKey } from "./state";
import "../../styles/stardew-items.css";
import "../../styles/stardew-crops.css";

/** El sprite de cada fertilizante (su id de objeto). */
const FERT_ICON: Record<Exclude<Fert, "none">, string> = { basic: "368", quality: "369", deluxe: "919", speed: "465", deluxeSpeed: "466", hyper: "918" };
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);
const LEVELS = Array.from({ length: 11 }, (_, i) => i);

export default function StardewCrops({ route, navigate }: { route: Route; navigate: Nav }) {
  const data = useLoad("crops", () => peekCrops() ?? undefined, loadCrops);
  if (data.failed) return <SdLoading onRetry={data.retry} />;
  if (!data.value) return <SdLoading />;
  return <CropCalc data={data.value} route={route} navigate={navigate} />;
}

/** Oro con un decimal a lo sumo (el oro por día), o entero (lo demás). */
const round = (n: number, digits = 0): number => {
  const k = 10 ** digits;
  return Math.round(n * k) / k || 0;
};

/** Un grupo de botones con su rótulo arriba. */
function Group({ label, children, extra }: { label: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="sd-chips" role="group" aria-label={label}>
      <span className="sd-label">
        {label}
        {extra}
      </span>
      {children}
    </div>
  );
}

/** El botón de un grupo: prendido o apagado. */
function Pill({ on, onClick, children, label, disabled }: { on: boolean; onClick: () => void; children: ReactNode; label?: string; disabled?: boolean }) {
  return (
    <button type="button" className={`sd-pill${on ? " is-on" : ""}`} aria-pressed={on} aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/** Cómo conviene venderlo: "Crudo", o el sprite de la máquina con su nombre (y el producto al pasar el mouse). */
function SellAs({ best, products, raw, lang }: { best: Best; products: Product[]; raw: string; lang: "en" | "es" }) {
  const pr = best === "raw" ? undefined : products.find((p) => p.machine === best);
  if (!pr) return <span className="sd-sell">{raw}</span>;
  return (
    <span className="sd-sell" title={say(pr.name, lang)}>
      <Sprite id={pr.machine} w={16} h={32} size={32} />
      <span>{say(pr.machineName, lang)}</span>
    </span>
  );
}

export function CropCalc({ data, route, navigate, initial = DEFAULT_STATE }: { data: CropsData; route: Route; navigate: Nav; initial?: CropState }) {
  const t = useStardewCopy();
  const c = t.crops;
  const { lang } = useLang();
  const locale = useLocale();
  const [state, setState] = useState<CropState>(initial);
  useEffect(() => {
    if (window.location.search) setState(readCropState(window.location.search));
  }, []);
  // Sobre el estado de ese momento (no el del último dibujo), y la dirección al día con lo elegido.
  const pick = (patch: Partial<CropState>) =>
    setState((prev) => {
      const next = { ...prev, ...patch };
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${writeCropState(next)}`);
      return next;
    });
  const sortBy = (key: SortKey) => pick({ sort: { key, dir: state.sort.key === key ? (state.sort.dir === "asc" ? "desc" : "asc") : firstDir(key) } });

  const rows = useMemo(() => cropTable(data.crops, state, lang), [data, state, lang]);
  const apart = useMemo(() => noShopTable(data.crops, state, lang), [data, state, lang]);
  const wild = useMemo(() => wildTable(data.crops, state, lang), [data, state, lang]);
  const trees = useMemo(() => treeTable(data.fruitTrees, state, lang), [data, state, lang]);
  // El tinte va al que más oro por día da (con cosechas), se ordene por la columna que se ordene.
  const top = rows.reduce<CropRow | undefined>((best, r) => (r.p.harvests > 0 && (!best || r.p.perDay > best.p.perDay) ? r : best), undefined);
  const showStrawberry = rows.some((r) => r.crop.seedFestival);
  const item = (slug: string): Route => ({ ...route, view: "stardew", sdSection: "items", detail: slug });

  const head = (key: SortKey, cls = "") => {
    const on = state.sort.key === key;
    return (
      <th scope="col" className={cls} aria-sort={on ? (state.sort.dir === "asc" ? "ascending" : "descending") : undefined} key={key}>
        <button type="button" className={`sd-sort${on ? " is-on" : ""}`} onClick={() => sortBy(key)}>
          {c.cols[key]}
          <span aria-hidden="true">{on ? (state.sort.dir === "asc" ? "▲" : "▼") : ""}</span>
        </button>
      </th>
    );
  };

  /**
   * Una tabla de cultivos: el ranking (`data-crop`), o uno de los grupos aparte, con las cuentas de semillas propias:
   * los que no tienen semilla en tienda (`data-noshop`) y las semillas silvestres (`data-wild`).
   */
  const table = (list: CropRow[], group: "rank" | "noshop" | "wild") => (
    <table className="sd-ctable">
      <thead>
        <tr>
          {head("name", "c-name")}
          {head("harvests")}
          {head("days")}
          {head("gross")}
          {head("seeds")}
          {head("net")}
          {head("perDay", "c-perday")}
          {head("sell", "c-sell")}
        </tr>
      </thead>
      <tbody>
        {list.map((r) => {
          const late = r.p.harvests === 0;
          const rank = group === "rank";
          const festival = rank && state.seeds === "buy" && r.crop.seedFestival && r.crop.seedShop;
          return (
            <tr
              className={late ? "is-late" : rank && r === top ? "is-top" : undefined}
              data-crop={rank ? r.crop.slug : undefined}
              data-noshop={group === "noshop" ? r.crop.slug : undefined}
              data-wild={group === "wild" ? r.crop.slug : undefined}
              key={r.crop.slug}
            >
              <th scope="row" className="c-name">
                <RouteLink className="sd-cname" to={item(r.crop.slug)} onNavigate={navigate} prefetch="press">
                  <Sprite id={r.crop.harvest} size={32} />
                  <span>{r.name}</span>
                </RouteLink>
              </th>
              <td data-label={c.cols.harvests}>{late ? <span className="sd-late">{c.late}</span> : r.p.harvests}</td>
              <td data-label={c.cols.days}>
                {r.days}
                {r.crop.regrow > 0 && <small className="sd-regrow">{c.regrow(r.crop.regrow)}</small>}
              </td>
              <td data-label={c.cols.gross}>
                <Gold n={round(r.p.gross)} />
              </td>
              <td data-label={c.cols.seeds}>
                {!rank || state.seeds === "own" ? "—" : <Gold n={round(r.p.seedCost)} />}
                {festival && <small className="sd-regrow">{say(festival, lang)}</small>}
              </td>
              <td data-label={c.cols.net} className={r.p.net < 0 ? "is-neg" : undefined}>
                <Gold n={round(r.p.net)} />
              </td>
              <td data-label={c.cols.perDay} className={`c-perday${r.p.perDay < 0 ? " is-neg" : ""}`}>
                <Gold n={round(r.p.perDay, 1)} />
              </td>
              <td data-label={c.cols.sell} className="c-sell">
                {late ? "—" : <SellAs best={r.p.best} products={r.crop.products} raw={c.raw} lang={lang} />}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <main className="sd-main sd-crops">
      <Box className="sd-intro">
        <h1 className="sd-h1">{c.h1}</h1>
        <p className="sd-lede">{c.lede}</p>
        <div className="sd-calc">
          <Group label={c.season}>
            {t.seasons.map((name, i) => (
              <Pill on={!state.greenhouse && state.season === i} onClick={() => pick({ season: i as CropState["season"] })} disabled={state.greenhouse} key={name}>
                {name}
              </Pill>
            ))}
            <Pill on={state.greenhouse} onClick={() => pick({ greenhouse: !state.greenhouse })}>
              {c.greenhouse}
            </Pill>
          </Group>
          <div className="sd-calc-pair">
            <label className="sd-field">
              <span className="sd-label">{c.day}</span>
              <select className="sd-select" value={state.day} onChange={(e) => pick({ day: Number(e.target.value) })}>
                {DAYS.map((d) => (
                  <option value={d} key={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="sd-field">
              <span className="sd-label">{c.level}</span>
              <select className="sd-select" value={state.level} onChange={(e) => pick({ level: Number(e.target.value) })}>
                {LEVELS.map((n) => (
                  <option value={n} key={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Group label={c.fert} extra={<b className="sd-fertname">{c.ferts[state.fert]}</b>}>
            {FERTS.map((f) => (
              <Pill on={state.fert === f} onClick={() => pick({ fert: f })} label={f === "none" ? undefined : c.ferts[f]} key={f}>
                {f === "none" ? c.ferts.none : <Sprite id={FERT_ICON[f]} size={24} />}
              </Pill>
            ))}
          </Group>
          <Group label={c.professions}>
            {(["tiller", "agriculturist", "artisan"] as const).map((p) => (
              <Pill on={state[p]} onClick={() => pick({ [p]: !state[p] })} key={p}>
                {t.professions[p]}
              </Pill>
            ))}
          </Group>
          <Group label={c.sell}>
            <Pill on={state.sell === "best"} onClick={() => pick({ sell: "best" })}>
              {c.sellBest}
            </Pill>
            <Pill on={state.sell === "raw"} onClick={() => pick({ sell: "raw" })}>
              {c.sellRaw}
            </Pill>
          </Group>
          <Group label={c.seeds}>
            <Pill on={state.seeds === "buy"} onClick={() => pick({ seeds: "buy" })}>
              {c.seedsBuy}
            </Pill>
            <Pill on={state.seeds === "own"} onClick={() => pick({ seeds: "own" })}>
              {c.seedsOwn}
            </Pill>
          </Group>
        </div>
        <p className="sd-muted sd-calc-hint">{c.hint(state.greenhouse)}</p>
      </Box>

      <Box className="sd-ctable-box">
        <div className="sd-ctable-top">
          <p className="sd-count" aria-live="polite">
            {c.count(rows.length.toLocaleString(locale))}
          </p>
          {/* En angosto la tabla pasa a tarjetas y pierde los títulos: el orden se elige acá. */}
          <label className="sd-field sd-sortpick">
            <span className="sd-label">{c.sortBy}</span>
            <select className="sd-select" value={`${state.sort.key}:${state.sort.dir}`} onChange={(e) => {
              const [key, dir] = e.target.value.split(":") as [SortKey, "asc" | "desc"];
              pick({ sort: { key, dir } });
            }}>
              {SORT_KEYS.flatMap((k) =>
                (["desc", "asc"] as const).map((d) => (
                  <option value={`${k}:${d}`} key={`${k}:${d}`}>
                    {c.cols[k]} {d === "asc" ? "▲" : "▼"}
                  </option>
                )),
              )}
            </select>
          </label>
        </div>
        {rows.length === 0 ? <p className="sd-note">{c.none}</p> : table(rows, "rank")}
        {showStrawberry && state.seeds === "buy" && <p className="sd-muted sd-foot">{c.notes.strawberry}</p>}
      </Box>

      {apart.length > 0 && (
        <Box className="sd-ctable-box sd-noshop">
          <h2 className="sd-h2">{c.noShop.h2}</h2>
          <p className="sd-muted">{c.noShop.hint}</p>
          {table(apart, "noshop")}
        </Box>
      )}

      {wild.length > 0 && (
        <Box className="sd-ctable-box sd-wild">
          <h2 className="sd-h2">{c.wild.h2}</h2>
          <p className="sd-muted">{c.wild.hint}</p>
          {table(wild, "wild")}
        </Box>
      )}

      <Box className="sd-ctable-box">
        <h2 className="sd-h2">{c.trees.h2}</h2>
        <p className="sd-muted">{c.trees.hint}</p>
        <table className="sd-ctable sd-ttable">
          <thead>
            <tr>
              <th scope="col" className="c-name">{c.trees.cols.tree}</th>
              <th scope="col">{c.trees.cols.season}</th>
              <th scope="col">{c.trees.cols.days}</th>
              <th scope="col">{c.trees.cols.sapling}</th>
              <th scope="col" className="c-perday">{c.trees.cols.perSeason}</th>
              <th scope="col" className="c-sell">{c.trees.cols.sell}</th>
              <th scope="col">{c.trees.cols.payback}</th>
            </tr>
          </thead>
          <tbody>
            {trees.map((r) => (
              <tr data-tree={r.tree.slug} key={r.tree.slug}>
                <th scope="row" className="c-name">
                  <RouteLink className="sd-cname" to={item(r.tree.slug)} onNavigate={navigate} prefetch="press">
                    <Sprite id={r.tree.harvest} size={32} />
                    <span>{r.name}</span>
                  </RouteLink>
                </th>
                <td data-label={c.trees.cols.season}>{r.tree.seasons.map((s) => t.seasons[s]).join(", ")}</td>
                <td data-label={c.trees.cols.days}>{c.trees.days(TREE_DAYS)}</td>
                <td data-label={c.trees.cols.sapling}>
                  {r.tree.saplingPrice == null ? <span className="sd-seedmark">{c.trees.noSapling}</span> : <Gold n={r.tree.saplingPrice} />}
                </td>
                <td data-label={c.trees.cols.perSeason} className="c-perday">
                  <Gold n={round(r.p.gross)} />
                </td>
                <td data-label={c.trees.cols.sell} className="c-sell">
                  <SellAs best={r.p.best} products={r.tree.products} raw={c.raw} lang={lang} />
                </td>
                <td data-label={c.trees.cols.payback}>{r.payback == null ? "—" : c.trees.payback(r.payback)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="sd-muted sd-foot">{c.notes.island}</p>
      </Box>
    </main>
  );
}
