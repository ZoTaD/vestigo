import { useMemo } from "react";
import { useCopy, useLang } from "./i18n";
import type { HistoryRow } from "./deadlockMatch";

/**
 * El calendario de actividad del perfil: doce semanas de puntos, uno por día.
 *
 * **No cuesta un pedido más.** Sale del mismo historial que ya dibuja la lista
 * de partidas, igual que el resumen de arriba — es agrupar por día lo que ya
 * está en memoria. Es el módulo que Dotabuff pone en su columna lateral y
 * Statlocker en su pestaña de rendimiento, y de los dos se copió sólo la idea:
 * ellos pintan intensidad por volumen, nosotros pintamos **resultado**, porque
 * "jugaste mucho" no es información accionable y "esos días perdiste" sí.
 *
 * Puro y sin fetch: las filas entran por prop. La copia vive en `i18n.ts`.
 */

/** Cuántas semanas se dibujan. Doce entran en la columna de 22rem sin apretarse. */
const WEEKS = 12;

const DAY_MS = 86_400_000;

export interface Day {
  /** Medianoche local de ese día, en milisegundos. */
  t: number;
  wins: number;
  losses: number;
}

/**
 * Agrupa el historial por día y devuelve la grilla completa, incluidos los días
 * sin jugar.
 *
 * **La grilla arranca un domingo y termina hoy**, que es lo que hace que las
 * columnas sean semanas alineadas en vez de bloques de siete días corridos: sin
 * eso, una racha de fines de semana se dibuja en diagonal y no se ve.
 *
 * `startTime` viene en SEGUNDOS (ver `HistoryRow`): multiplicarlo mal manda todo
 * a 1970 y el calendario sale vacío sin que nada falle.
 */
export function activityDays(rows: HistoryRow[], now: number): Day[] {
  const hoy = new Date(now);
  hoy.setHours(0, 0, 0, 0);
  // Se retrocede hasta el domingo de la semana en curso y desde ahí 11 semanas
  // más: así la última columna es la semana de hoy, siempre completa hasta el
  // día que se está mirando.
  const finDeSemana = hoy.getTime() - hoy.getDay() * DAY_MS;
  const desde = finDeSemana - (WEEKS - 1) * 7 * DAY_MS;

  const porDia = new Map<number, Day>();
  for (let i = 0; i < WEEKS * 7; i++) {
    const t = desde + i * DAY_MS;
    porDia.set(t, { t, wins: 0, losses: 0 });
  }

  for (const r of rows) {
    const d = new Date(r.startTime * 1000);
    d.setHours(0, 0, 0, 0);
    const dia = porDia.get(d.getTime());
    // Las partidas más viejas que la ventana simplemente no entran: el historial
    // trae hasta 475 filas de años atrás y acá se miran doce semanas.
    if (!dia) continue;
    if (r.won) dia.wins++;
    else dia.losses++;
  }

  return [...porDia.values()].sort((a, b) => a.t - b.t);
}

/** Qué color lleva un día. `null` es no haber jugado, que no es un empate. */
export function resultOf(d: Day): "win" | "loss" | "even" | null {
  if (d.wins === 0 && d.losses === 0) return null;
  if (d.wins > d.losses) return "win";
  if (d.losses > d.wins) return "loss";
  return "even";
}

export default function DeadlockActivity({
  rows,
  /** Inyectable para que el test no dependa del día en que corra. */
  now = Date.now(),
}: {
  rows: HistoryRow[];
  now?: number;
}) {
  const copy = useCopy();
  const { lang } = useLang();
  const c = copy.deadlock.report.activity;

  const days = useMemo(() => activityDays(rows, now), [rows, now]);

  return (
    <div>
      {/* El orden del DOM es día a día; el CSS los acomoda en columnas de siete
          con `grid-auto-flow: column`. Cambiar ese flujo da un calendario
          transpuesto sin tocar el TSX. */}
      <div className="dl-activity" role="img" aria-label={c.weeks(WEEKS)}>
        {days.map((d) => {
          const res = resultOf(d);
          const fecha = new Date(d.t).toLocaleDateString(lang, {
            day: "numeric",
            month: "short",
          });
          return (
            <span
              key={d.t}
              className="dl-activity-day"
              data-result={res ?? undefined}
              // El título es lo que hace que el punto sea un dato y no un
              // adorno: sin él, un cuadrito verde no dice cuántas partidas fueron.
              title={res ? c.day(fecha, d.wins, d.losses) : `${fecha} · ${c.none}`}
            />
          );
        })}
      </div>
      <p className="dl-activity-legend">
        <i data-legend="win" style={{ background: "var(--chart-good)" }} />
        {c.won}
        <i data-legend="loss" style={{ background: "var(--chart-bad)" }} />
        {c.lost}
      </p>
    </div>
  );
}
