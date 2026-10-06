/**
 * La pestaña Cajas de Rust (2026-10-06): la lista de las fuentes de botín (`/rust/crates`) o la tabla de una
 * (`/rust/crates/elite-crate`, `/es/rust/cajas/caja-de-elite`). Diseño: docs/design/2026-10-05-rust.md.
 *
 * Los datos no viajan en este chunk (`data.ts`): bajan `loot.json` y la lista de Objetos, una vez para la lista y las
 * fichas. Si la ficha no existe se muestra la lista con una nota, como en Objetos.
 */
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { useLoad } from "../../useLoad";
import RsLoading from "../RsLoading";
import CrateFicha from "./CrateFicha";
import { loadCrates, peekCrates, type Crates } from "./data";
import { KIND_ORDER } from "./model";
import "../../styles/rust-items.css";
import "../../styles/rust-crates.css";

type Nav = (r: Route) => void;

export default function RustCrates({ route, navigate }: { route: Route; navigate: Nav }) {
  const crates = useLoad("crates", () => peekCrates() ?? undefined, loadCrates);
  if (crates.failed) return <RsLoading onRetry={crates.retry} />;
  if (!crates.value) return <RsLoading />;
  const entry = route.detail ? crates.value.bySlug.get(route.detail) : undefined;
  if (entry) return <CrateFicha entry={entry} rows={crates.value.rows.get(entry.key) ?? []} route={route} navigate={navigate} key={entry.key} />;
  return <CrateList crates={crates.value} route={route} navigate={navigate} missing={!!route.detail} />;
}

/**
 * Las 82 fuentes por grupo (cajas, NPC, recolectables, objetos que se abren), cada una con cuántos objetos da y su
 * evento (la mena de metal de Halloween se distingue de la de siempre por la etiqueta). Son pocas: van todas de una,
 * sin `LazyRows`. Adentro de cada grupo, por nombre en el idioma de la página.
 */
function CrateList({ crates, route, navigate, missing }: { crates: Crates; route: Route; navigate: Nav; missing: boolean }) {
  const r = useRustCopy();
  const t = r.crates;
  const { lang } = useLang();
  const locale = useLocale();
  return (
    <main className="rs-main rs-crates">
      <section className="rs-pnl">
        <div className="rs-title">
          <h1 className="rs-h1">{t.h1}</h1>
        </div>
        <p className="rs-lede">{t.lede(crates.index.length.toLocaleString(locale))}</p>
        {missing && <p className="rs-missing" role="status">{t.missing}</p>}
      </section>
      {KIND_ORDER.map((kind) => {
        const group = crates.index
          .filter((e) => e.kind === kind)
          .map((e) => ({ e, name: (lang === "es" && e.es) || e.en }))
          .sort((a, b) => a.name.localeCompare(b.name, locale) || a.e.key.localeCompare(b.e.key));
        if (!group.length) return null;
        return (
          <section className="rs-pnl" key={kind}>
            <h2 className="rs-hd">{t.groups[kind]}</h2>
            <ul className="rs-crate-list">
              {group.map(({ e, name }) => (
                <li key={e.key}>
                  <RouteLink className="rs-crate" to={{ ...route, view: "rust", rsSection: "crates", detail: e.slug }} onNavigate={navigate}>
                    <span className="rs-crate-name">
                      {name}
                      {e.event && <em className="rs-tag">{r.items.events[e.event]}</em>}
                    </span>
                    <span className="rs-crate-n">{t.count(e.n, e.n.toLocaleString(locale))}</span>
                  </RouteLink>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
