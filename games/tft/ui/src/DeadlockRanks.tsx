import { useState } from "react";
import { useCopy, useLang, useLocale, type Lang } from "./i18n";
import { text } from "./catalog";
import { catalog } from "./deadlockData";
import {
  dayRows,
  histogram,
  leansTo,
  showsCalibrationNotice,
  useRanks,
  type RankView,
} from "./deadlockRanksData";

/**
 * La escalera de rangos de Deadlock.
 *
 * **No recibe el selector de banda y eso es a propósito**: la escalera es el eje
 * sobre el que se definen las bandas, así que filtrarla por una no significaría
 * nada. Es la única pestaña de Deadlock sin ese control.
 *
 * **Los gráficos son HTML y CSS, no SVG.** La regla del proyecto —adentro de un
 * SVG no va ni una palabra— existe porque el texto ahí se pisa, no se selecciona
 * y no lo agranda el zoom del navegador. Con barras de CSS el problema no existe:
 * cada número es texto real, la barra es un `div` con un ancho, y el conjunto se
 * adapta solo al ancho de la pantalla.
 */

const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

/** El nombre de un rango suelto, para la tabla de lados. */
const rankName = (tier: number, lang: Lang): string =>
  text(catalog.ranks.find((r) => r.tier === tier)?.name, lang, String(tier));

/** El número grande de un lado, ya con su margen de error. */
function SideNumber({ label, value, se }: { label: string; value: number; se: number }) {
  return (
    <div className="dl-side-big">
      <span className="stat-label">{label}</span>
      <b className="dl-side-pct">{pct(value, 2)}</b>
      <span className="dl-side-err">± {(se * 100).toFixed(2)}</span>
    </div>
  );
}

export default function DeadlockRanks() {
  const copy = useCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const file = useRanks();
  const [view, setView] = useState<RankView>("players");

  const n = (v: number) => v.toLocaleString(locale);

  if (!file) return <main className="deadlock" aria-busy="true" />;

  const hist = histogram(file, view, lang);
  const dias = dayRows(file, view, lang);
  const t = copy.deadlock.ladder;

  return (
    <main className="deadlock">
      {/* Mismo reparto que el resto de las pestañas: lo que explica la página a
          la izquierda, lo que la controla a la derecha. */}
      <div className="tool-head">
        <header className="masthead">
          <p className="eyebrow">{copy.deadlock.eyebrow}</p>
          <h1 className="title">
            {t.title}
            <span className="title-break">{t.titleBreak}</span>
          </h1>
          <p className="standfirst">{t.lead}</p>
        </header>

        <div className="tool-controls">
          <div className="dl-view-toggle" role="group" aria-label={t.view.players}>
            {(["players", "matches"] as RankView[]).map((id) => (
              <button
                key={id}
                type="button"
                className="dl-view-btn"
                aria-pressed={view === id}
                onClick={() => setView(id)}
              >
                {t.view[id]}
              </button>
            ))}
          </div>
          <p className="detail-note dl-sample">
            {file.from} → {file.to}
          </p>
        </div>
      </div>

      {/* El cartel sólo aplica a la vista por jugador: las partidas traen el
          promedio de la sala, que cubre el 100% de la muestra. */}
      {view === "players" && showsCalibrationNotice(file.coverage) && (
        <p className="detail-note dl-calibrating">
          {t.calibrating(pct(file.coverage, 1), n(file.accounts.ranked), n(file.accounts.seen))}
        </p>
      )}

      <section className="dl-ladder-wrap">
        <p className="detail-note">{t.viewNote[view]}</p>
        {hist.columns.length === 0 ? (
          <p className="detail-note">{t.empty}</p>
        ) : (
          <figure className="dl-hist">
            {/* Las columnas y el eje son dos filas flex con el mismo peso total,
                así que cada insignia cae debajo de sus escalones sin que nada
                mida píxeles. */}
            <div className="dl-hist-plot" role="img" aria-label={t.viewNote[view]}>
              <span className="dl-hist-max">{n(hist.max)}</span>
              {hist.columns.map((c) => (
                <span key={c.badge} className="dl-hist-slot" title={`${c.label} — ${n(c.value)} ${t[view]}`}>
                  <span
                    className="dl-hist-col"
                    style={{ height: `${(c.share * 100).toFixed(2)}%`, background: c.color || undefined }}
                  >
                    {/* El numeral del subrango, montado en el borde de arriba de
                        la barra: sube y baja con ella en vez de flotar en una
                        fila suelta.

                        **Es texto, no una imagen.** Hasta hoy acá se dibujaba la
                        insignia compuesta del juego a 19 px: 61 imágenes de 45 KB
                        —2,7 MB— para marcas en las que no se distinguía nada. Ver
                        `HistColumn.mark`. */}
                    {c.mark && (
                      <b className="dl-hist-mark" aria-hidden="true">
                        {c.mark}
                      </b>
                    )}
                  </span>
                </span>
              ))}
            </div>

            <figcaption className="dl-hist-axis">
              {hist.groups.map((g) => (
                <span key={g.tier} className="dl-hist-group" style={{ flexGrow: g.span }}>
                  {g.img && <img className="dl-hist-badge" src={g.img} alt="" width={22} height={22} loading="lazy" />}
                  <span className="dl-hist-name">{g.name}</span>
                  <span className="dl-hist-n">{n(g.value)}</span>
                </span>
              ))}
            </figcaption>
          </figure>
        )}
      </section>

      {dias.length > 0 && (
        <section className="dl-days-wrap">
          <h2 className="dl-section-title">{t.day}</h2>
          <ol className="dl-days">
            {dias.map((d) => (
              <li key={d.day} className="dl-day">
                <span className="dl-day-label">{d.day.slice(5)}</span>
                <span className="dl-day-track">
                  <span className="dl-day-bar" style={{ width: `${(d.scale * 100).toFixed(2)}%` }}>
                    {d.segments.map((s) => (
                      <span
                        key={s.tier}
                        className="dl-day-seg"
                        style={{ width: `${(s.share * 100).toFixed(2)}%`, background: s.color || undefined }}
                        title={`${s.name}: ${n(s.value)}`}
                      />
                    ))}
                  </span>
                </span>
                <span className="dl-day-n">{n(d.total)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="dl-sides">
        <h2 className="dl-section-title">{t.sides.title}</h2>
        <p className="detail-note">{t.sides.lead}</p>

        <div className="dl-sides-overall">
          <SideNumber label={t.sides.team0} value={file.sidesOverall.team0} se={file.sidesOverall.se} />
          <SideNumber label={t.sides.team1} value={1 - file.sidesOverall.team0} se={file.sidesOverall.se} />
          <span className="detail-note dl-sides-n">
            {n(file.sidesOverall.matches)} {t.matches}
          </span>
        </div>

        {/* Un rango que no llega a la muestra mínima no se dibuja: la ausencia
            dice "no sé", y un punto sobre el 50% diría "acá no pasa nada". */}
        {file.sides.length === 0 ? (
          <p className="detail-note">{t.sides.thin(n(20000))}</p>
        ) : (
          <ol className="dl-sides-list">
            {[...file.sides].reverse().map((s) => {
              const lado = leansTo(s);
              const nombre = rankName(s.tier, lang);
              return (
                <li key={s.tier} className="dl-side-row">
                  <span className="dl-rung-name">{nombre}</span>
                  <span className="dl-side-val" data-leans={lado ?? "even"}>
                    {pct(s.team0, 2)} <span className="dl-side-err">± {(s.se * 100).toFixed(2)}</span>
                  </span>
                  <span className="detail-note">{n(s.matches)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* La misma nota que cierra las otras pestañas de Deadlock. Esta página
          nació después y se quedó sin ella, que es justo donde el pie de página
          atribuía todo a Riot. */}
      <p className="detail-note dl-footnote" lang={lang}>
        {copy.deadlock.footnote}
      </p>
    </main>
  );
}
