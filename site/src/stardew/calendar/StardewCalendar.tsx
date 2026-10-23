/**
 * La pestaña Calendario de Stardew Valley (etapa 2, tarea 7): el tablón del pueblo. Arriba, la estación (botones);
 * abajo, la grilla de 28 días en 4 semanas de 7, con el retrato del cumpleañero y el festival de cada día. Un festival
 * es un tinte de fondo con su nombre; el de varios días (Mercado nocturno, 15–17 de invierno) tiñe cada celda de su
 * rango y el tinte cruza el hueco entre celdas de la misma semana, así se lee como un solo bloque (sin filos).
 *
 * Al tocar un día se abre su detalle debajo del tablón: el cumpleañero con su retrato grande, enlace a su ficha y los
 * regalos que le encantan como casilleros enlazados a la ficha de cada objeto; y los festivales con su rango. La
 * estación y el día viajan en la dirección (`?season=fall&day=13`) y se leen después del primer dibujo: el HTML
 * prerenderizado sale con primavera y sin día. A 375 px la celda muestra el número, el retrato chico y el tinte.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useStardewCopy } from "../../stardewCopy";
import { useLoad } from "../../useLoad";
import { loadCalendar, peekCalendar, say, tasteRows, type CalendarBundle, type Villager } from "../data";
import { Box, Group, Pill, SdLoading, Slot, Sprite, type Nav } from "../ui";
import { DEFAULT_CALENDAR_STATE, festivalRange, readCalendarState, seasonCells, writeCalendarState, type CalendarState, type Cell, type Festival } from "./state";
import "../../styles/stardew-items.css";
import "../../styles/stardew-calendar.css";

export default function StardewCalendar({ route, navigate }: { route: Route; navigate: Nav }) {
  const { lang } = useLang();
  const data = useLoad(`calendar-${lang}`, () => peekCalendar(lang) ?? undefined, () => loadCalendar(lang));
  if (data.failed) return <SdLoading onRetry={data.retry} />;
  if (!data.value) return <SdLoading />;
  return <CalendarBoard data={data.value} route={route} navigate={navigate} />;
}

const portrait = (key: string) => `/stardew/portraits/${key.toLowerCase()}.png`;

export function CalendarBoard({ data, route, navigate, initial = DEFAULT_CALENDAR_STATE }: { data: CalendarBundle; route: Route; navigate: Nav; initial?: CalendarState }) {
  const t = useStardewCopy();
  const c = t.calendar;
  const { lang } = useLang();
  const [state, setState] = useState<CalendarState>(initial);
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.location.search) setState(readCalendarState(window.location.search));
  }, []);
  // Sobre el estado de ese momento, y la dirección al día con lo elegido.
  const pick = (patch: Partial<CalendarState>) =>
    setState((prev) => {
      const next = { ...prev, ...patch };
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${writeCalendarState(next)}`);
      return next;
    });
  // Al elegir un día, el detalle a la vista (en el celular queda debajo del tablón).
  useEffect(() => {
    if (state.day != null) detailRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [state.day]);

  const people = useMemo(() => new Map(data.villagers.map((v) => [v.key, v])), [data.villagers]);
  const cells = useMemo(() => seasonCells(data.cal, state.season), [data.cal, state.season]);
  const seasonName = t.seasons[state.season];
  const chosen = state.day != null ? cells[state.day - 1] : null;
  const nameOf = (key: string) => {
    const v = people.get(key);
    return v ? say(v.name, lang) : key;
  };

  /** Lo que dice un día para quien no ve los retratos: "13 de otoño: Cumpleaños de Abigail". */
  const cellLabel = (cell: Cell) =>
    [c.dayTitle(cell.day, seasonName), ...cell.birthdays.map((k) => c.birthday(nameOf(k))), ...cell.festivals.map((f) => say(f.name, lang))].join(" · ");

  return (
    <main className="sd-main sd-calendar">
      <Box className="sd-intro">
        <h1 className="sd-h1">{c.h1}</h1>
        <p className="sd-lede">{c.lede}</p>
        <div className="sd-cal-pick">
          <Group label={c.season}>
            {t.seasons.map((name, i) => (
              <Pill on={state.season === i} onClick={() => pick({ season: i, day: null })} key={name}>
                {name}
              </Pill>
            ))}
          </Group>
        </div>
      </Box>

      <Box className="sd-cal-box" aria-labelledby="sd-cal-h">
        <h2 className="sd-h2" id="sd-cal-h">
          {seasonName}
        </h2>
        <div className="sd-cal" data-season={state.season}>
          {c.weekdays.map((w) => (
            <span className="sd-cal-wd" aria-hidden="true" key={w}>
              {w}
            </span>
          ))}
          {cells.map((cell) => {
            const on = state.day === cell.day;
            const fest = cell.festivals[0];
            const cls = ["sd-cal-day", fest ? (fest.passive ? "is-passive" : "is-fest") : "", fest?.joinsNext ? "joins-next" : "", fest?.joinsPrev ? "joins-prev" : "", on ? "is-on" : ""].filter(Boolean).join(" ");
            return (
              <button
                type="button"
                className={cls}
                aria-pressed={on}
                aria-label={cellLabel(cell)}
                data-day={cell.day}
                data-fest={cell.festivals.map((f) => f.id).join(" ") || undefined}
                onClick={() => pick({ day: on ? null : cell.day })}
                key={cell.day}
              >
                <span className="sd-cal-n">{cell.day}</span>
                {cell.birthdays.map((k) => (
                  <img className="sd-cal-face" src={portrait(k)} alt="" width={48} height={48} loading="lazy" decoding="async" key={k} />
                ))}
                <span className="sd-cal-txt">
                  {cell.birthdays.map((k) => (
                    <b key={k}>{nameOf(k)}</b>
                  ))}
                  {cell.festivals.map((f) => (
                    <i key={f.id}>{say(f.name, lang)}</i>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <ul className="sd-cal-key">
          <li className="is-fest">{c.festival}</li>
          <li className="is-passive">{c.passive}</li>
        </ul>
      </Box>

      <Box className="sd-cal-detail">
        <div aria-live="polite" ref={detailRef}>
          {chosen ? (
            <DayDetail cell={chosen} data={data} people={people} seasonName={seasonName} route={route} navigate={navigate} onClose={() => pick({ day: null })} />
          ) : (
            <p className="sd-muted">{c.hint}</p>
          )}
        </div>
      </Box>
    </main>
  );
}

/** El detalle de un día: el cumpleañero con lo que le encanta, y los festivales con su rango. */
function DayDetail({
  cell,
  data,
  people,
  seasonName,
  route,
  navigate,
  onClose,
}: {
  cell: Cell;
  data: CalendarBundle;
  people: Map<string, Villager>;
  seasonName: string;
  route: Route;
  navigate: Nav;
  onClose: () => void;
}) {
  const t = useStardewCopy();
  const c = t.calendar;
  const { lang } = useLang();
  const empty = cell.birthdays.length === 0 && cell.festivals.length === 0;
  return (
    <div className="sd-cal-dd" data-detail={cell.day}>
      <header className="sd-cal-dhead">
        <h2 className="sd-h2">{c.dayTitle(cell.day, seasonName)}</h2>
        <button type="button" className="sd-pill" onClick={onClose}>
          {c.close}
        </button>
      </header>
      {empty && <p className="sd-muted">{c.empty}</p>}
      {cell.festivals.map((f) => (
        <FestivalRow f={f} seasonName={seasonName} key={f.id} />
      ))}
      {cell.birthdays.map((key) => {
        const v = people.get(key);
        if (!v) return null;
        const name = say(v.name, lang);
        const loves = tasteRows(v, "love", data.rows);
        return (
          <article className="sd-cal-bday" data-villager={v.slug} key={key}>
            <RouteLink className="sd-cal-who" to={{ ...route, view: "stardew", sdSection: "villagers", detail: v.slug }} onNavigate={navigate} prefetch="press">
              <img className="sd-cal-big" src={portrait(key)} alt="" width={96} height={96} decoding="async" />
              <span>
                <b>{c.birthday(name)}</b>
                <small>{c.profile} →</small>
              </span>
            </RouteLink>
            {loves.length > 0 && (
              <>
                <h3 className="sd-h3">{t.tastes.love}</h3>
                <ul className="sd-grid sd-cal-gifts">
                  {loves.map((r) => (
                    <li key={r.id}>
                      <RouteLink className="sd-cell" to={{ ...route, view: "stardew", sdSection: "items", detail: r.slug }} onNavigate={navigate} prefetch="press" title={r.name}>
                        <Slot>
                          <Sprite id={r.id} w={r.w} h={r.h} size={48} />
                        </Slot>
                        <span>{r.name}</span>
                      </RouteLink>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}

/** Un festival del día: nombre, rango ("15–17 de invierno") y si ocupa el día o es pasivo. */
function FestivalRow({ f, seasonName }: { f: Festival; seasonName: string }) {
  const c = useStardewCopy().calendar;
  const { lang } = useLang();
  return (
    <div className={`sd-cal-fest ${f.passive ? "is-passive" : "is-fest"}`} data-festival={f.id}>
      <b>{say(f.name, lang)}</b>
      <span className="sd-cal-range">{c.range(festivalRange(f.from, f.to), seasonName)}</span>
      <span className="sd-cal-tag">{f.passive ? c.passive : c.festival}</span>
      <small>{f.passive ? c.passiveNote : c.festivalNote}</small>
    </div>
  );
}
