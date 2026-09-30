/**
 * El directorio de jefes y superúnicos al pie de la calculadora (2026-09-29): un enlace a la ficha de cada uno
 * (`/d2r/drops/mephisto`), por acto. Existe para el buscador: las 128 fichas están en el sitemap, pero una página a la que
 * no enlaza ninguna otra se encuentra y no se indexa. Son enlaces de verdad (`<a href>`) y salen en el HTML prerenderizado.
 *
 * Los jefes van antes que los superúnicos dentro de cada acto, cada grupo en el orden de los datos; el Clon de Diablo,
 * que no tiene área, va en un último grupo aparte.
 */
import { useMemo } from "react";
import RouteLink from "../../RouteLink";
import { useLang } from "../../i18n";
import type { Route } from "../../route";
import { useD2rCopy } from "../../d2rCopy";
import { tr } from "../wiki";
import { dropData, type Indexed } from "./data";
import type { DropSource } from "./types";

/** Los jefes y superúnicos por acto (el de su área): los actos en orden y, al final, los que no tienen área. */
function byAct(D: Indexed): { act: number | null; sources: DropSource[] }[] {
  const acts = new Map<number | null, DropSource[]>();
  for (const s of D.sources) {
    const act = s.area === null ? null : (D.areaById.get(s.area)?.act ?? null);
    acts.set(act, [...(acts.get(act) ?? []), s]);
  }
  return [...acts.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a - b))
    .map(([act, sources]) => ({ act, sources: [...sources.filter((s) => s.kind === "boss"), ...sources.filter((s) => s.kind === "super")] }));
}

export default function SourceLinks({ route, navigate }: { route: Route; navigate: (r: Route) => void }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const groups = useMemo(() => byAct(dropData()), []);
  return (
    <section className="d2-dr-sources">
      <h2 className="d2-h3">{td.sourcesTitle}</h2>
      {groups.map((g) => (
        <div className="d2-dr-src-act" key={g.act ?? "events"}>
          <h3>{g.act === null ? td.sourcesEvents : td.act(g.act)}</h3>
          <ul className="d2-dr-src-list">
            {g.sources.map((s) => (
              <li key={s.id}>
                <RouteLink to={{ ...route, d2Section: "drops", detail: s.id }} onNavigate={navigate}>
                  {tr(s.n, lang)}
                </RouteLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
