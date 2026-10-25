/**
 * La pestaña Predictor de Stardew Valley 1.6.15 (tarea 7): lo que van a dar las próximas geodas, el clima de mañana y
 * la suerte de hoy, los pisos especiales de las Minas, el carro ambulante y las noches con evento. Cada predicción
 * está probada contra el juego en `predict/*.ts`; acá sólo se arma la entrada (`input.ts`) y se dibuja.
 *
 * De arriba abajo, una caja por parte: Tu partida (la granja del Lector con su granjero, o el formulario de semilla y
 * fecha), Hoy y mañana, Geodas, Minas, Carro ambulante y Noches. La entrada se lee después del primer dibujo (la
 * partida guardada del Lector y `?seed=…&day=…` de la dirección): el HTML prerenderizado es la caja con el formulario
 * vacío y la lista de lo que se predice. Los datos (`predict.json` y la lista de objetos del idioma) se piden recién con
 * una entrada, y el cálculo corre en el navegador cada vez que cambia.
 *
 * Ninguna lista pasa de ~60 casilleros (el carro: 4 visitas de 10 a 15 objetos): no hace falta `LazyRows`. Los sprites
 * van `lazy` y con tamaño fijo. Cada objeto enlaza a su ficha si la lista de Objetos lo tiene (lo mismo que `itemSlug`
 * de Minas: el slug de su fila); si no (muebles, sombreros, papeles), su nombre de `predict.json` sin enlace.
 */
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useLang } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useStardewCopy, type PredictCopy, type StardewCopy } from "../../stardewCopy";
import { useLoad } from "../../useLoad";
import { loadList, loadPredict, peekList, peekPredict, say, type Lang, type Row } from "../data";
import { normId, type Save } from "../save/parse";
import { readStoredSave } from "../save/store";
import { Box, Gold, Group, Pill, Slot, Sprite, type Nav } from "../ui";
import { STOCK_ILIMITADO, type CartItem, type Fecha } from "./cart";
import type { Drop, GeodeKind } from "./geodes";
import {
  cleanSeed,
  GEODE_KINDS,
  geodesFor,
  knowsFarmerId,
  predictAll,
  readManual,
  writeManual,
  type Manual,
  type ManualOpts,
  type PredictInput,
  type Prediction,
  type Season,
} from "./input";
import type { NightEvent, RoseFork } from "./night";
import type { PredictData } from "./query";
import type { DayWeather } from "./weather";
import "../../styles/stardew-items.css";
import "../../styles/stardew-predict.css";

/** Los datos de la pestaña: `predict.json` y la lista de objetos del idioma (nombre, sprite y ficha de cada id). */
export interface PredictBundle {
  predict: PredictData;
  rows: Row[];
}

const peekBundle = (lang: Lang): PredictBundle | undefined => {
  const predict = peekPredict();
  const rows = peekList(lang);
  return predict && rows ? { predict, rows } : undefined;
};
const loadBundle = (lang: Lang): Promise<unknown> => Promise.all([loadPredict(), loadList(lang)]);

type ManualRead = Manual | { error: "empty" | "bad" } | null;

export default function StardewPredict({ route, navigate }: { route: Route; navigate: Nav }) {
  const { lang } = useLang();
  const [stored, setStored] = useState<Save | null>(null);
  const [manual, setManual] = useState<ManualRead>(null);
  // La partida guardada y la dirección se leen después del primer dibujo: el prerender es el formulario vacío.
  useEffect(() => {
    setStored(readStoredSave());
    setManual(readManual(window.location.search));
  }, []);
  const onManual = (m: Manual) => {
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${writeManual(m, lang)}`);
    setManual(m);
  };
  return <PredictView route={route} navigate={navigate} stored={stored} manual={manual} onManual={onManual} />;
}

/** La pantalla con la entrada ya leída. `data` sólo lo pasan los tests (si no, se pide al haber una entrada). */
export function PredictView({
  route,
  navigate,
  stored,
  manual,
  onManual = () => undefined,
  data: given,
}: {
  route: Route;
  navigate: Nav;
  stored: Save | null;
  manual: ManualRead;
  onManual?: (m: Manual) => void;
  data?: PredictBundle;
}) {
  const t = useStardewCopy();
  const c = t.predict;
  const { lang } = useLang();
  const [prefer, setPrefer] = useState<"save" | "manual" | null>(null);
  const [farmer, setFarmer] = useState(0);
  const valid = manual && !("error" in manual) ? manual : null;
  const sp = stored?.predict ?? null;
  // Una semilla en la dirección (un enlace compartido) manda; si no, la partida del Lector.
  const mode = prefer ?? (valid ? "manual" : sp ? "save" : "manual");
  const input: PredictInput | null = useMemo(() => {
    if (mode === "save" && stored && sp) return { from: "save", save: sp, farmer: Math.min(farmer, sp.farmers.length - 1), season: stored.season, day: stored.day, year: stored.year };
    if (mode === "manual" && valid) return { from: "manual", ...valid };
    return null;
  }, [mode, stored, sp, farmer, valid]);

  const loaded = useLoad(input && !given ? `predict-${lang}` : null, () => peekBundle(lang), () => loadBundle(lang));
  const data = given ?? loaded.value ?? null;

  return (
    <main className="sd-main sd-predict">
      <Box className="sd-intro">
        {mode === "save" && stored && sp ? (
          <>
            <p className="sd-kicker">{c.fromSave}</p>
            <h1 className="sd-h1">{c.h1}</h1>
            <p className="sd-pr-farm">
              <b>{t.save.farm(stored.farm)}</b> · {t.save.date(stored.day, t.seasons[stored.season], stored.year)}
            </p>
            {sp.farmers.length > 1 && (
              <div className="sd-filters">
                <Group label={t.save.farmer}>
                  {sp.farmers.map((f, i) => (
                    <Pill on={i === (input?.from === "save" ? input.farmer : 0)} onClick={() => setFarmer(i)} key={i}>
                      {f.host ? `${f.name} (${t.save.host})` : f.name}
                    </Pill>
                  ))}
                </Group>
              </div>
            )}
            <div className="sd-sv-actions">
              <button type="button" className="sd-btn" onClick={() => setPrefer("manual")}>
                {c.otherSeed}
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="sd-h1">{c.h1}</h1>
            <p className="sd-lede">{c.lede}</p>
            {stored && !sp && (
              <p className="sd-note" role="status">
                {c.oldSave}{" "}
                <ReaderLink route={route} navigate={navigate} label={c.openReader} />
              </p>
            )}
            {!input && (
              <ul className="sd-pr-what">
                {c.what.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            {/* La clave lo rearma cuando llega la entrada leída después del primer dibujo (semilla, error o partida). */}
            <SeedForm
              key={valid ? writeManual(valid, "en") : manual && "error" in manual ? `error-${manual.error}` : stored ? "partida" : "vacío"}
              initial={valid ?? (stored ? { seed: { gameId: sp?.gameId ?? 0, legacy: sp?.legacy ?? false }, season: stored.season, day: stored.day, year: stored.year } : null)}
              error={manual && "error" in manual ? manual.error : null}
              prefill={!!valid || !!sp}
              onManual={(m) => {
                setPrefer("manual");
                onManual(m);
              }}
            />
            {sp && (
              <div className="sd-sv-actions">
                <button
                  type="button"
                  className="sd-btn"
                  onClick={() => {
                    // La semilla de la dirección ya no es lo que se muestra.
                    window.history.replaceState(window.history.state, "", window.location.pathname);
                    setPrefer("save");
                  }}
                >
                  {c.useSave}
                </button>
              </div>
            )}
            {!sp && !stored && <p className="sd-muted"><ReaderLink route={route} navigate={navigate} label={c.openReader} /></p>}
            {input && <p className="sd-muted">{c.manualLimits}</p>}
          </>
        )}
      </Box>
      {input &&
        (data ? (
          <Predictions input={input} data={data} route={route} navigate={navigate} />
        ) : (
          <Box>
            {loaded.failed ? (
              <p role="alert">
                {t.loadError}{" "}
                <button type="button" className="sd-btn" onClick={loaded.retry}>
                  {t.retry}
                </button>
              </p>
            ) : (
              <p aria-busy="true">{t.loading}</p>
            )}
          </Box>
        ))}
    </main>
  );
}

function ReaderLink({ route, navigate, label }: { route: Route; navigate: Nav; label: string }) {
  return (
    <RouteLink className="sd-sv-link" to={{ ...route, view: "stardew", sdSection: "save", detail: undefined }} onNavigate={navigate}>
      {label}
    </RouteLink>
  );
}

// --- El formulario ---------------------------------------------------------------------------------------------------

function SeedForm({ initial, error, prefill, onManual }: { initial: Manual | null; error: "empty" | "bad" | null; prefill: boolean; onManual: (m: Manual) => void }) {
  const t = useStardewCopy();
  const c = t.predict;
  const [seed, setSeed] = useState(prefill && initial ? String(initial.seed.gameId) : "");
  const [season, setSeason] = useState<Season>(initial?.season ?? 0);
  const [day, setDay] = useState(initial?.day ?? 1);
  const [year, setYear] = useState(String(initial?.year ?? 1));
  const [legacy, setLegacy] = useState(initial?.seed.legacy ?? false);
  const [err, setErr] = useState<"empty" | "bad" | null>(error);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = cleanSeed(seed);
    if (typeof id === "string") {
      setErr(id);
      return;
    }
    setErr(null);
    const y = Math.max(1, Math.min(9999, Math.trunc(Number(year)) || 1));
    onManual({ seed: { gameId: id, legacy }, season, day, year: y });
  };
  return (
    <form className="sd-pr-form" onSubmit={submit} noValidate>
      <h2 className="sd-h3">{c.formTitle}</h2>
      <div className="sd-pr-fields">
        <label className="sd-field sd-pr-seed">
          <span className="sd-label">{c.seed}</span>
          <input
            className="sd-select"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            value={seed}
            onChange={(e) => setSeed(e.currentTarget.value)}
            aria-invalid={err ? true : undefined}
            aria-describedby="sd-pr-seedwhere"
          />
        </label>
        <fieldset className="sd-pr-date">
          <legend className="sd-label">{c.todayIs}</legend>
          <label className="sd-field">
            <span className="sd-label">{c.season}</span>
            <select className="sd-select" value={season} onChange={(e) => setSeason(Number(e.currentTarget.value) as Season)}>
              {t.seasons.map((s, i) => (
                <option value={i} key={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="sd-field">
            <span className="sd-label">{c.day}</span>
            <select className="sd-select" value={day} onChange={(e) => setDay(Number(e.currentTarget.value))}>
              {Array.from({ length: 28 }, (_, i) => (
                <option value={i + 1} key={i}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label className="sd-field sd-pr-year">
            <span className="sd-label">{c.year}</span>
            <input className="sd-select" type="number" min={1} inputMode="numeric" value={year} onChange={(e) => setYear(e.currentTarget.value)} />
          </label>
        </fieldset>
      </div>
      <p className="sd-muted" id="sd-pr-seedwhere">
        {c.seedWhere}
      </p>
      {err && (
        <p className="sd-note" role="alert">
          {c.seedErrors[err]}
        </p>
      )}
      <label className="sd-pr-check">
        <input type="checkbox" checked={legacy} onChange={(e) => setLegacy(e.currentTarget.checked)} />
        <span>
          {c.legacy}
          <small>{c.legacyHint}</small>
        </span>
      </label>
      <button type="submit" className="sd-btn sd-pr-go">
        {c.go}
      </button>
    </form>
  );
}

// --- Las predicciones ------------------------------------------------------------------------------------------------

/** Lo que comparten las cajas. */
interface Ctx {
  t: StardewCopy;
  c: PredictCopy;
  lang: Lang;
  byId: Map<string, Row>;
  names: PredictData["names"];
  route: Route;
  navigate: Nav;
  long: (f: Fecha) => string;
  short: (f: Fecha) => string;
}

type Rose = "yes" | "no" | "unknown";

function Predictions({ input, data, route, navigate }: { input: PredictInput; data: PredictBundle; route: Route; navigate: Nav }) {
  const t = useStardewCopy();
  const { lang } = useLang();
  const [garlic, setGarlic] = useState(false);
  const [rose, setRose] = useState<Rose>("unknown");
  const [man, setMan] = useState<ManualOpts>({});
  const x: Ctx = useMemo(
    () => ({
      t,
      c: t.predict,
      lang,
      byId: new Map(data.rows.map((r) => [r.id, r])),
      names: data.predict.names,
      route,
      navigate,
      long: (f) => t.save.date(f.day, t.seasons[f.season], f.year),
      short: (f) => t.save.gifts.on(f.day, t.seasons[f.season]),
    }),
    [t, lang, data, route, navigate],
  );
  const p = useMemo(
    () => predictAll(input, data.predict, { garlicOil: garlic, fairyRose: rose === "unknown" ? undefined : rose === "yes", manual: man }),
    [input, data, garlic, rose, man],
  );
  const toggle = (k: keyof ManualOpts) => setMan((m) => ({ ...m, [k]: !m[k] }));
  const manual = input.from === "manual";
  return (
    <>
      <TodayBox p={p} x={x} fortune={data.predict.fortune} />
      <GeodesBox input={input} data={data.predict} x={x} />
      <MinesBox p={p} x={x} garlic={garlic} setGarlic={setGarlic} man={manual ? man : null} toggle={toggle} />
      <CartBox p={p} x={x} manual={manual} />
      <NightsBox p={p} x={x} rose={rose} setRose={setRose} man={manual ? man : null} toggle={toggle} />
    </>
  );
}

/** El nombre de un objeto: el de la lista de Objetos, o el de `predict.json` (muebles, sombreros…). */
const nameOf = (id: string, x: Ctx): string => x.byId.get(normId(id))?.name ?? (x.names[id] ? say(x.names[id], x.lang) : id);

/** Un objeto como casillero con su nombre, enlazado a su ficha si la tiene; `note` va debajo. */
function Thing({ id, x, note, size = 48 }: { id: string; x: Ctx; note?: ReactNode; size?: number }) {
  const r = x.byId.get(normId(id));
  const label = nameOf(id, x);
  const body = (
    <>
      <Slot>{r ? <Sprite id={r.id} w={r.w} h={r.h} size={r.h > r.w ? Math.round((size * 4) / 3) : size} /> : null}</Slot>
      <span>{label}</span>
      {note != null && <small>{note}</small>}
    </>
  );
  return r ? (
    <RouteLink className="sd-cell sd-pr-cell" to={{ ...x.route, view: "stardew", sdSection: "items", detail: r.slug }} onNavigate={x.navigate} prefetch="press" title={label}>
      {body}
    </RouteLink>
  ) : (
    <span className="sd-cell sd-pr-cell">{body}</span>
  );
}

/** El nombre de un objeto en una línea, enlazado a su ficha si la tiene. */
function ThingName({ id, x }: { id: string; x: Ctx }) {
  const r = x.byId.get(normId(id));
  const label = nameOf(id, x);
  return r ? (
    <RouteLink className="sd-pr-name" to={{ ...x.route, view: "stardew", sdSection: "items", detail: r.slug }} onNavigate={x.navigate} prefetch="press">
      {label}
    </RouteLink>
  ) : (
    <span className="sd-pr-name">{label}</span>
  );
}

// --- Hoy y mañana ---

const weatherText = (w: DayWeather, c: PredictCopy): string => (w.maybe ? c.today.or(c.today.weather[w.kind], c.today.weather[w.maybe]) : c.today.weather[w.kind]);
const weatherClass = (w: DayWeather): string => `is-${w.kind}${w.maybe ? ` or-${w.maybe}` : ""}`;

function TodayBox({ p, x, fortune }: { p: Prediction; x: Ctx; fortune: PredictData["fortune"] }) {
  const { c } = x;
  const hoy = p.today;
  const byDay = new Map(p.season.map((s) => [s.date.day, s.weather]));
  const kinds = [...new Set(p.season.map((s) => weatherClass(s.weather)))];
  return (
    <Box className="sd-pr-today">
      <h2 className="sd-h2">{c.today.title}</h2>
      <div className="sd-pr-now">
        {p.tomorrow && (
          <div className={`sd-pr-tomorrow ${weatherClass(p.tomorrow)}`}>
            <span className="sd-label">{c.today.tomorrow}</span>
            <b>{weatherText(p.tomorrow, c)}</b>
          </div>
        )}
        <div className="sd-pr-luck">
          <span className="sd-label">{c.today.luck}</span>
          {p.luck ? (
            <>
              <p>{c.today.luckTv}</p>
              {p.luck.keys.map((k) => (
                <q key={k}>{fortune[k] ? say(fortune[k], x.lang) : k}</q>
              ))}
              {p.luck.keys.length > 1 && <p className="sd-muted">{c.today.luckTwo}</p>}
              <p className="sd-muted">{signedLuck(p.luck.value, x.lang)}</p>
            </>
          ) : (
            <p className="sd-muted">{c.today.luckNone}</p>
          )}
        </div>
      </div>
      <h3 className="sd-h3">{c.today.season}</h3>
      {p.season.length === 0 ? (
        <p className="sd-muted">{c.today.seasonEnds}</p>
      ) : (
        <>
          <ol className="sd-pr-cal" aria-label={c.today.season}>
            {c.today.weekdays.map((w) => (
              <li className="sd-pr-wd" aria-hidden="true" key={w}>
                {w}
              </li>
            ))}
            {Array.from({ length: 28 }, (_, i) => {
              const d = i + 1;
              const w = byDay.get(d);
              if (d === hoy.day)
                return (
                  <li className="sd-pr-day is-today" key={d}>
                    <span className="sd-pr-n">{d}</span>
                    <span className="sd-pr-w">{c.today.todayCell}</span>
                  </li>
                );
              if (!w)
                return (
                  <li className="sd-pr-day is-past" key={d} aria-hidden="true">
                    <span className="sd-pr-n">{d}</span>
                  </li>
                );
              const label = weatherText(w, c);
              return (
                <li className={`sd-pr-day ${weatherClass(w)}`} key={d} title={label}>
                  <span className="sd-pr-n">{d}</span>
                  <span className="sd-pr-w">{label}</span>
                </li>
              );
            })}
          </ol>
          <ul className="sd-pr-key">
            {kinds.map((k) => {
              const w = p.season.find((s) => weatherClass(s.weather) === k)!.weather;
              return (
                <li className={k} key={k}>
                  {weatherText(w, c)}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="sd-muted sd-pr-foot">{c.today.note}</p>
    </Box>
  );
}

/** La suerte como cifra con signo y tres decimales ("+0,034"). */
const signedLuck = (n: number, lang: Lang): string => {
  const s = Math.abs(n).toLocaleString(lang === "es" ? "es-AR" : "en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
};

// --- Geodas ---

function GeodesBox({ input, data, x }: { input: PredictInput; data: PredictData; x: Ctx }) {
  const { c } = x;
  const [kind, setKind] = useState<GeodeKind>("535");
  const drops = useMemo(() => geodesFor(input, data, kind), [input, data, kind]);
  return (
    <Box className="sd-pr-geodes">
      <h2 className="sd-h2">{c.geodes.title}</h2>
      {drops ? (
        <>
          <div className="sd-filters">
            <Group label={c.geodes.kind}>
              {GEODE_KINDS.map((k) => (
                <Pill on={k === kind} onClick={() => setKind(k)} key={k} label={nameOf(k, x)}>
                  <Sprite id={x.byId.get(k)?.id ?? k} size={32} />
                </Pill>
              ))}
            </Group>
          </div>
          <p className="sd-pr-kind">{nameOf(kind, x)}</p>
          <ol className="sd-pr-drops">
            {drops.map((d, i) => (
              <DropRow d={d} n={i + 1} x={x} key={i} />
            ))}
          </ol>
          <p className="sd-muted sd-pr-foot">{c.geodes.note}</p>
        </>
      ) : input.from === "save" && !knowsFarmerId(input) ? (
        <p className="sd-note">{c.geodes.noId}</p>
      ) : (
        <p className="sd-note">
          {c.geodes.noSave} <ReaderLink route={x.route} navigate={x.navigate} label={c.openReader} />
        </p>
      )}
    </Box>
  );
}

function DropRow({ d, n, x }: { d: Drop; n: number; x: Ctx }) {
  const qty = d.qty > 1 ? <span className="sd-pr-qty">×{d.qty.toLocaleString(x.lang === "es" ? "es-AR" : "en-US")}</span> : null;
  if (d.oneOf)
    return (
      <li className="sd-pr-drop is-oneof">
        <span className="sd-pr-num">{n}</span>
        <span className="sd-pr-oneof">
          <span>{x.c.geodes.oneOf}</span>{" "}
          {d.oneOf.map((id, i) => (
            <span key={id}>
              {i > 0 && ", "}
              <ThingName id={id} x={x} />
            </span>
          ))}
        </span>
        {qty}
      </li>
    );
  const r = x.byId.get(normId(d.id));
  return (
    <li className="sd-pr-drop">
      <span className="sd-pr-num">{n}</span>
      <span className="sd-pr-pix">{r ? <Sprite id={r.id} w={r.w} h={r.h} size={32} /> : null}</span>
      <ThingName id={d.id} x={x} />
      {qty}
    </li>
  );
}

// --- Minas ---

function MinesBox({ p, x, garlic, setGarlic, man, toggle }: { p: Prediction; x: Ctx; garlic: boolean; setGarlic: (v: boolean) => void; man: ManualOpts | null; toggle: (k: keyof ManualOpts) => void }) {
  const { c } = x;
  const kinds = ["infested", "slime", "quarry", "mushroom"] as const;
  return (
    <Box className="sd-pr-mines">
      <h2 className="sd-h2">{c.mines.title}</h2>
      <div className="sd-filters">
        <Group label={x.t.save.today.title}>
          <Pill on={garlic} onClick={() => setGarlic(!garlic)}>
            {c.mines.garlic}
          </Pill>
        </Group>
        {man && (
          <Group label={c.inYourSave}>
            <Pill on={!!man.lowest120} onClick={() => toggle("lowest120")}>
              {c.mines.lowest120}
            </Pill>
            <Pill on={!!man.quarry} onClick={() => toggle("quarry")}>
              {c.mines.quarryOn}
            </Pill>
          </Group>
        )}
      </div>
      <ol className="sd-pr-mdays">
        {p.mines.map((d) => {
          const shown = kinds.filter((k) => d[k].length > 0);
          return (
            <li className="sd-pr-mday" key={d.daysPlayed}>
              <b className="sd-pr-mdate">{x.short(d.date)}</b>
              {shown.length ? (
                <dl>
                  {shown.map((k) => (
                    <div className={`is-${k}`} key={k}>
                      <dt>{c.mines.kinds[k]}</dt>
                      <dd>{d[k].join(", ")}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <span className="sd-muted">{c.mines.none}</span>
              )}
            </li>
          );
        })}
      </ol>
      <ul className="sd-pr-notes sd-muted">
        {!man && p.used.lowestMineLevel < 120 && <li>{c.mines.lowest(p.used.lowestMineLevel)}</li>}
        {!man && !p.used.quarry && <li>{c.mines.quarryOff}</li>}
        <li>{c.mines.garlicNote}</li>
        <li>{c.mines.skull}</li>
        <li>{c.mines.dangerous}</li>
      </ul>
    </Box>
  );
}

// --- Carro ambulante ---

function CartBox({ p, x, manual }: { p: Prediction; x: Ctx; manual: boolean }) {
  const { c } = x;
  const stock = (it: CartItem) => (it.stock === STOCK_ILIMITADO ? c.cart.unlimited : c.cart.stock(it.stock));
  return (
    <Box className="sd-pr-cart">
      <h2 className="sd-h2">{c.cart.title}</h2>
      {p.cart.map((v) => (
        <section className="sd-pr-visit" key={`${v.date.year}-${v.date.season}-${v.date.day}`}>
          <h3 className="sd-h3">
            {x.long(v.date)} <small>{c.cart.where[v.kind]}</small>
          </h3>
          {v.kind === "desertFestival" && manual && <p className="sd-muted">{c.cart.desertMaybe}</p>}
          {v.y1Unknown && <p className="sd-muted">{c.cart.y1}</p>}
          <ul className="sd-grid sd-pr-grid">
            {v.items.map((it) => (
              <li key={`${it.id}${it.recipe ? "#r" : ""}`}>
                <Thing
                  id={it.id}
                  x={x}
                  note={
                    <>
                      <Gold n={it.price} />
                      <span>{it.recipe ? c.cart.recipe : stock(it)}</span>
                      {it.recipe && it.id === "(O)801" && <span>{c.cart.ring}</span>}
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {manual && (
        <ul className="sd-pr-notes sd-muted">
          <li>{c.cart.manual}</li>
          <li>{c.cart.ringManual}</li>
        </ul>
      )}
    </Box>
  );
}

// --- Noches ---

const eventName = (e: NightEvent | null, c: PredictCopy): string => (e ? c.nights.events[e] : c.nights.nothing);

function NightsBox({ p, x, rose, setRose, man, toggle }: { p: Prediction; x: Ctx; rose: Rose; setRose: (r: Rose) => void; man: ManualOpts | null; toggle: (k: keyof ManualOpts) => void }) {
  const { c } = x;
  return (
    <Box className="sd-pr-nights">
      <h2 className="sd-h2">{c.nights.title}</h2>
      <div className="sd-filters">
        <Group label={c.nights.rose}>
          {(["yes", "no", "unknown"] as const).map((r) => (
            <Pill on={rose === r} onClick={() => setRose(r)} key={r}>
              {c.nights.roseOpts[r]}
            </Pill>
          ))}
        </Group>
        {man && (
          <Group label={c.inYourSave}>
            {(["sawQiPlane", "gotCapsule", "ccPantry", "raccoonTreeFallen"] as const).map((k) => (
              <Pill on={!!man[k]} onClick={() => toggle(k)} key={k}>
                {c.nights.happened[k]}
              </Pill>
            ))}
          </Group>
        )}
      </div>
      {p.nights.length === 0 ? (
        <p className="sd-note">{c.nights.none}</p>
      ) : (
        <ol className="sd-pr-nlist">
          {p.nights.map((n) => (
            <li className="sd-pr-night" key={`${n.date.year}-${n.date.season}-${n.date.day}`}>
              <span className="sd-pr-ndate">{c.nights.night(x.long(n.date))}</span>
              {typeof n.pick === "string" ? (
                <b>{eventName(n.pick, c)}</b>
              ) : (
                <ForkText f={n.pick} c={c} />
              )}
            </li>
          ))}
        </ol>
      )}
      <ul className="sd-pr-notes sd-muted">
        <li>{c.nights.roseNote}</li>
        {man && <li>{c.nights.manual}</li>}
        <li>{c.nights.outside}</li>
      </ul>
    </Box>
  );
}

function ForkText({ f, c }: { f: RoseFork; c: PredictCopy }) {
  return (
    <span className="sd-pr-fork">
      <span>
        {c.nights.ifRose} <b>{eventName(f.ifRose, c)}</b>
      </span>
      <span>
        {c.nights.otherwise} <b>{eventName(f.otherwise, c)}</b>
      </span>
    </span>
  );
}
