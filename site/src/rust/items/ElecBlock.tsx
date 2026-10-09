/**
 * El bloque "Electricidad" de la ficha de un componente (2026-10-09): enchufes, consumo o generación, y un enlace que
 * abre el simulador con el componente ya cableado. Sale de `electricity-items.json` (de `games/rust/tools/electricity.py`),
 * chico a propósito porque viaja con la pestaña Objetos.
 */
import elec from "@rust/electricity-items.json";
import { useLocale } from "../../i18n";
import { routePath, type Route } from "../../route";
import { useRustCopy } from "../../rustCopy";

type Row = { in: [string, number][]; out: [string, number][]; use: number; gen?: number; bat?: [number, number] };
const ROWS = elec as unknown as Record<string, Row>;

export default function ElecBlock({ itemId, route }: { itemId: string; route: Route }) {
  const t = useRustCopy().elecBlock;
  const locale = useLocale();
  const row = ROWS[itemId];
  if (!row) return null;
  const names = (s: [string, number][]) => s.map(([n]) => n || "—").join(" · ");
  const href = `${routePath({ ...route, view: "rust", rsSection: "electricity", detail: undefined })}#try=${encodeURIComponent(itemId)}`;
  return (
    <section className="rs-pnl rs-elec">
      {/* Lo que sólo tiene enchufes de agua (barril, aspersor, splitter de agua) es "Agua", no "Electricidad". */}
      <h2 className="rs-hd">{[...row.in, ...row.out].some(([, ty]) => ty === 0) ? t.title : t.waterTitle}</h2>
      <dl className="rs-elec-kv">
        {row.bat ? (
          <div>
            <dt>{t.makes}</dt>
            <dd>{t.battery(String(row.bat[0]), row.bat[1].toLocaleString(locale))}</dd>
          </div>
        ) : row.gen !== undefined ? (
          <div>
            <dt>{t.makes}</dt>
            <dd>{row.gen}</dd>
          </div>
        ) : (
          <div>
            <dt>{t.uses}</dt>
            <dd>{row.use === 0 ? t.noUse : row.use}</dd>
          </div>
        )}
        {row.in.length ? (
          <div>
            <dt>{t.inputs}</dt>
            <dd>{names(row.in)}</dd>
          </div>
        ) : null}
        {row.out.length ? (
          <div>
            <dt>{t.outputs}</dt>
            <dd>{names(row.out)}</dd>
          </div>
        ) : null}
      </dl>
      <a className="rs-btn" href={href}>
        {t.tryIt}
      </a>
    </section>
  );
}
