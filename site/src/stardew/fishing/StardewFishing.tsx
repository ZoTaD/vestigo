/**
 * La pestaña Pesca de Stardew Valley (etapa 2, tarea 5). Arriba, "¿qué puedo pescar ahora?": lugar, estación, clima y
 * una franja de dos horas (o cualquier hora), y la grilla de casilleros con lo que pica. Abajo, la tabla de los 74
 * peces, filtrable por tipo (caña, trampa, legendarios) y estación. Cada pez enlaza a su ficha de Objetos.
 *
 * Las reglas son las de `state.ts` (`canCatch`); lo elegido viaja en la dirección (`?place=Beach&season=1&time=1800`)
 * y se lee después del primer dibujo: el HTML prerenderizado sale con los valores por defecto. Son 74 peces: no hace
 * falta `LazyRows`; los sprites van `lazy` y con tamaño fijo. Legendario y trampa se marcan con una etiqueta de texto.
 */
import { useEffect, useMemo, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useStardewCopy, type FishingCopy } from "../../stardewCopy";
import { useLoad } from "../../useLoad";
import { loadFish, peekFish, say } from "../data";
import { Box, Gold, Group, Pill, SdLoading, Slot, Sprite, type Nav } from "../ui";
import {
  catchNow,
  DEFAULT_FISH_STATE,
  fishSeasons,
  fishTable,
  fmtRange,
  isQiFamily,
  KINDS,
  readFishState,
  SLOTS,
  slotLabel,
  writeFishState,
  type Fish,
  type FishData,
  type FishState,
} from "./state";
import "../../styles/stardew-items.css";
import "../../styles/stardew-crops.css";
import "../../styles/stardew-fishing.css";

export default function StardewFishing({ route, navigate }: { route: Route; navigate: Nav }) {
  const data = useLoad("fish", () => peekFish() ?? undefined, loadFish);
  if (data.failed) return <SdLoading onRetry={data.retry} />;
  if (!data.value) return <SdLoading />;
  return <FishFinder data={data.value} route={route} navigate={navigate} />;
}

/** Las etiquetas de texto del pez: legendario (con su nivel mínimo) y trampa. */
function Tags({ fish, f }: { fish: Fish; f: FishingCopy }) {
  if (!fish.legendary && !fish.crabPot) return null;
  return (
    <span className="sd-ftags">
      {fish.legendary && <span className="sd-ftag is-legend">{f.tags.legendary}</span>}
      {isQiFamily(fish) && <span className="sd-ftag is-qi">{f.tags.qi}</span>}
      {fish.crabPot && <span className="sd-ftag is-trap">{f.tags.crabPot}</span>}
    </span>
  );
}

export function FishFinder({ data, route, navigate, initial = DEFAULT_FISH_STATE }: { data: FishData; route: Route; navigate: Nav; initial?: FishState }) {
  const t = useStardewCopy();
  const f = t.fishing;
  const { lang } = useLang();
  const locale = useLocale();
  const [state, setState] = useState<FishState>(initial);
  const placeKeys = useMemo(() => data.places.map((p) => p.key), [data]);
  useEffect(() => {
    if (window.location.search) setState(readFishState(window.location.search, placeKeys));
  }, [placeKeys]);
  // Sobre el estado de ese momento (no el del último dibujo), y la dirección al día con lo elegido.
  const pick = (patch: Partial<FishState>) =>
    setState((prev) => {
      const next = { ...prev, ...patch };
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${writeFishState(next)}`);
      return next;
    });

  const now = useMemo(() => catchNow(data, state, lang), [data, state, lang]);
  const rows = useMemo(() => fishTable(data, state, lang), [data, state, lang]);
  // Los lugares por nombre: el agua primero y las dos trampas aparte.
  const places = useMemo(() => [...data.places].sort((a, b) => say(a.name, lang).localeCompare(say(b.name, lang), lang)), [data, lang]);
  const item = (fish: Fish): Route => ({ ...route, view: "stardew", sdSection: "items", detail: fish.slug });
  // Los del Sr. Qi ignoran las horas del pez: pican a cualquiera mientras dure el encargo.
  // Cada franja entera en su renglón si no entra: "6:00 am a 11:00 am, 6:00 pm a 2:00 am" no se corta en el medio.
  const hours = (fish: Fish) =>
    fish.times.length && !isQiFamily(fish)
      ? fish.times.map((r, i) => (
          <span className="sd-hours" key={r[0]}>
            {fmtRange(r, lang)}
            {i < fish.times.length - 1 && ", "}
          </span>
        ))
      : f.anyHour;
  const seasons = (fish: Fish) => {
    const s = fishSeasons(fish);
    return s.length === 4 ? f.allYear : s.map((i) => t.seasons[i]).join(", ");
  };

  return (
    <main className="sd-main sd-fishing">
      <Box className="sd-intro">
        <h1 className="sd-h1">{f.h1}</h1>
        <p className="sd-lede">{f.lede}</p>
      </Box>

      <Box className="sd-now">
        <h2 className="sd-h2">{f.now.h2}</h2>
        <div className="sd-calc sd-fpick">
          <label className="sd-field">
            <span className="sd-label">{f.now.place}</span>
            <select className="sd-select sd-fplace" value={state.place} onChange={(e) => pick({ place: e.target.value })}>
              <option value="any">{f.now.anyPlace}</option>
              <optgroup label={f.now.water}>
                {places
                  .filter((p) => !p.key.startsWith("CrabPot:"))
                  .map((p) => (
                    <option value={p.key} key={p.key}>
                      {say(p.name, lang)}
                    </option>
                  ))}
              </optgroup>
              <optgroup label={f.now.traps}>
                {places
                  .filter((p) => p.key.startsWith("CrabPot:"))
                  .map((p) => (
                    <option value={p.key} key={p.key}>
                      {say(p.name, lang)}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>
          <Group label={f.now.season}>
            {t.seasons.map((name, i) => (
              <Pill on={state.season === i} onClick={() => pick({ season: i })} key={name}>
                {name}
              </Pill>
            ))}
          </Group>
          <Group label={f.now.weather}>
            {(["sunny", "rainy"] as const).map((w) => (
              <Pill on={state.weather === w} onClick={() => pick({ weather: w })} key={w}>
                {f.weathers[w]}
              </Pill>
            ))}
          </Group>
          <Group label={f.now.time}>
            <Pill on={state.time == null} onClick={() => pick({ time: null })}>
              {f.now.anyTime}
            </Pill>
            {SLOTS.map((s) => (
              <Pill on={state.time === s} onClick={() => pick({ time: s })} key={s}>
                {slotLabel(s)}
              </Pill>
            ))}
          </Group>
        </div>
        <p className="sd-count sd-fcount" aria-live="polite">
          {f.count(now.length.toLocaleString(locale))}
        </p>
        {now.length === 0 ? (
          <p className="sd-note">{f.none}</p>
        ) : (
          <ul className="sd-fgrid">
            {now.map((fish) => (
              <li data-now={fish.slug} key={fish.slug}>
                <RouteLink className="sd-fcard" to={item(fish)} onNavigate={navigate} prefetch="press">
                  <Slot>
                    <Sprite id={fish.id} size={48} />
                  </Slot>
                  <span className="sd-fcard-txt">
                    <b>{say(fish.name, lang)}</b>
                    <span>{hours(fish)}</span>
                    {!fish.crabPot && (
                      <span>
                        {f.difficulty(fish.difficulty)}
                        {fish.minLevel > 0 && ` · ${f.level(fish.minLevel)}`}
                      </span>
                    )}
                    <Tags fish={fish} f={f} />
                  </span>
                </RouteLink>
              </li>
            ))}
          </ul>
        )}
      </Box>

      <Box className="sd-ftable-box">
        <h2 className="sd-h2">{f.all.h2}</h2>
        <p className="sd-muted">{f.all.hint}</p>
        <div className="sd-calc sd-fpick">
          <Group label={f.all.kind}>
            {KINDS.map((k) => (
              <Pill on={state.kind === k} onClick={() => pick({ kind: k })} key={k}>
                {f.all.kinds[k]}
              </Pill>
            ))}
          </Group>
          <Group label={f.all.season}>
            <Pill on={state.tseason == null} onClick={() => pick({ tseason: null })}>
              {f.all.anySeason}
            </Pill>
            {t.seasons.map((name, i) => (
              <Pill on={state.tseason === i} onClick={() => pick({ tseason: i })} key={name}>
                {name}
              </Pill>
            ))}
          </Group>
        </div>
        <p className="sd-count sd-fcount" aria-live="polite">
          {f.all.count(rows.length.toLocaleString(locale))}
        </p>
        <table className="sd-ftable">
          <thead>
            <tr>
              <th scope="col" className="c-name">{f.all.cols.fish}</th>
              <th scope="col" className="c-place">{f.all.cols.place}</th>
              <th scope="col">{f.all.cols.seasons}</th>
              <th scope="col">{f.all.cols.weather}</th>
              <th scope="col">{f.all.cols.hours}</th>
              <th scope="col" className="c-num">{f.all.cols.difficulty}</th>
              <th scope="col" className="c-num">{f.all.cols.price}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((fish) => (
              <tr data-fish={fish.slug} key={fish.slug}>
                <th scope="row" className="c-name">
                  <RouteLink className="sd-cname" to={item(fish)} onNavigate={navigate} prefetch="press">
                    <Sprite id={fish.id} size={32} />
                    <span>{say(fish.name, lang)}</span>
                  </RouteLink>
                  <Tags fish={fish} f={f} />
                </th>
                <td data-label={f.all.cols.place} className="c-place">
                  {fish.places.map((p) => say(p.name, lang)).join(", ")}
                </td>
                <td data-label={f.all.cols.seasons}>{seasons(fish)}</td>
                <td data-label={f.all.cols.weather}>{f.weathers[isQiFamily(fish) ? "both" : fish.weather]}</td>
                <td data-label={f.all.cols.hours}>{hours(fish)}</td>
                <td data-label={f.all.cols.difficulty} className="c-num">
                  {fish.crabPot ? "—" : fish.difficulty}
                  {fish.minLevel > 0 && <small className="sd-regrow">{f.level(fish.minLevel)}</small>}
                </td>
                <td data-label={f.all.cols.price} className="c-num c-price">
                  {data.prices[fish.id] == null ? "—" : <Gold n={data.prices[fish.id]} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </main>
  );
}
