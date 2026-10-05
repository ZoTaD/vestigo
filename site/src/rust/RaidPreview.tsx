/**
 * El adelanto de la calculadora en la portada de Rust (2026-10-05): cuatro objetivos de siempre con lo que cuestan en C4
 * y en azufre, y los botones a la calculadora y a la tabla completa.
 */
import { useLang, useLocale } from "../i18n";
import { routePath, type Route } from "../route";
import { useRustCopy } from "../rustCopy";
import { say } from "./items/data";
import { explosiveById, hitsFor, TARGETS } from "./raid/model";

const SHOWN = ["building.stone", "building.metal", "door.hinged.metal", "wall.frame.garagedoor"];

export default function RaidPreview({ route }: { route: Route }) {
  const c = useRustCopy();
  const p = c.home.raidPreview;
  const { lang } = useLang();
  const locale = useLocale();
  const c4 = explosiveById("explosive.timed")!;
  const raid = routePath({ ...route, view: "rust", rsSection: "raid", detail: undefined });
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{p.title}</h2>
      <ul className="rs-raid-preview">
        {SHOWN.map((id) => {
          const t = TARGETS.find((x) => x.id === id)!;
          const n = hitsFor(t, c4.id)!;
          return (
            <li key={id}>
              <span>{say(t.name, lang)}</span>
              <b data-cell={id}>
                {n} {p.c4} · {(n * c4.cost!.sulfur).toLocaleString(locale)}
              </b>
            </li>
          );
        })}
      </ul>
      <p className="rs-raid-actions">
        <a className="rs-btn" href={raid}>
          {p.calc}
        </a>
        <a className="rs-btn" href={`${raid}#tabla`}>
          {p.table}
        </a>
      </p>
    </section>
  );
}
