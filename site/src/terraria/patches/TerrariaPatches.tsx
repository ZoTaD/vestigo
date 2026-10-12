/**
 * La pestaña Parches de Terraria (2026-10-12): la lista de versiones y, con un slug en la dirección, las notas de una.
 * Las notas son las del propio juego y están en inglés; en español se avisa arriba.
 */
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useTerrariaCopy } from "../../terrariaCopy";
import { useLoad } from "../../useLoad";
import { TrLoading, type Nav } from "../ui";
import { loadIndex, loadPatch, peekIndex, peekPatch, type IndexRow, type Patch } from "./data";
import "../../styles/terraria-world.css";

export default function TerrariaPatches({ route, navigate }: { route: Route; navigate: Nav }) {
  const slug = route.detail ?? null;
  const patch = useLoad(slug, () => peekPatch(slug!), () => loadPatch(slug!));
  const needIndex = slug === null || patch.value === null;
  const index = useLoad(needIndex ? "index" : null, () => peekIndex() ?? undefined, loadIndex);

  if (patch.failed) return <TrLoading onRetry={patch.retry} />;
  if (patch.value) return <PatchPage patch={patch.value} route={route} navigate={navigate} />;
  if (slug !== null && patch.value === undefined) return <TrLoading />;
  if (index.failed) return <TrLoading onRetry={index.retry} />;
  if (!index.value) return <TrLoading />;
  return <PatchList rows={index.value} route={route} navigate={navigate} />;
}

const patchRoute = (route: Route, slug?: string): Route => ({ ...route, view: "terraria", trSection: "patches", detail: slug });

function PatchList({ rows, route, navigate }: { rows: IndexRow[]; route: Route; navigate: Nav }) {
  const t = useTerrariaCopy();
  const { lang } = useLang();
  const locale = useLocale();
  return (
    <main className="tr-main tr-patches">
      <div className="tr-wrap">
        <header className="tr-head">
          <h1 className="tr-h1 tr-andy">{t.patches.h1}</h1>
          <p className="tr-lede">{t.patches.lede(rows.length)}</p>
          {lang === "es" && <p className="tr-hint">{t.patches.english}</p>}
        </header>
        <ul className="tr-patch-list">
          {rows.map((r) => (
            <li key={r.slug}>
              <RouteLink className="tr-dug tr-patch-row" to={patchRoute(route, r.slug)} onNavigate={navigate} prefetch="press">
                <b className="tr-andy">{r.v}</b>
                <span>{r.titles.join(" · ")}</span>
                <small>{t.patches.changes(r.n.toLocaleString(locale))}</small>
              </RouteLink>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

function PatchPage({ patch, route, navigate }: { patch: Patch; route: Route; navigate: Nav }) {
  const t = useTerrariaCopy();
  const { lang } = useLang();
  return (
    <main className="tr-main tr-patches">
      <div className="tr-wrap">
        <RouteLink className="tr-back" to={patchRoute(route)} onNavigate={navigate}>
          ← {t.patches.back}
        </RouteLink>
        <header className="tr-head">
          <h1 className="tr-h1 tr-andy">{t.patches.title(patch.v)}</h1>
          {lang === "es" && <p className="tr-hint">{t.patches.english}</p>}
        </header>
        {patch.sections.map((s, i) => (
          <section className="tr-dug tr-notes" key={i}>
            {s.t && <h2 className="tr-h2 tr-andy">{s.t}</h2>}
            <ul>
              {s.lines.map(([depth, text], j) => (
                <li data-depth={depth} key={j}>
                  {text}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
