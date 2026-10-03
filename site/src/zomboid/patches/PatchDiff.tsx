/**
 * Lo que cambió en una versión de Project Zomboid, campo por campo (2026-10-02): una hoja por tipo (objetos, recetas,
 * rasgos, profesiones, habilidades, moodles y opciones de sandbox), cada una con los nuevos, los quitados y los
 * cambiados. Lo largo va con `Collapse`, que deja todo en el HTML (Google ve cada enlace a una ficha).
 *
 * Cada cambio es un renglón de grilla, no una tabla: la etiqueta a la izquierda y el antes → después a la derecha, que
 * en el celular pasan a una columna. Si un número sube o baja lo dice la palabra, con un tinte suave detrás (nunca un
 * filo de color). Los renglones (`FieldRows`) viven en su módulo: los usa también el "Qué cambió" de cada ficha, que
 * así no arrastra esta hoja entera.
 */
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import type { Loc } from "../items/data";
import { Collapse, Stamp } from "../ui";
import { usePatchesCopy } from "./copy";
import { KINDS, kindTab, type Ent, type Kind, type KindDiff, type PatchPage } from "./data";
import { FieldRows } from "./FieldRows";

export { FieldRows };

type Nav = (r: Route) => void;

/** El sello de la hoja de cada tipo. */
const KIND_STAMP: Record<Kind, string> = {
  items: "axe",
  recipes: "hammer",
  traits: "heart",
  professions: "wrench",
  skills: "book",
  moodles: "medcross",
  sandbox: "satellite",
};

/** Cuántos cambiados se ven de entrada en una hoja (cada uno ocupa varios renglones); el resto, en el desplegable. */
const CHANGED_SHOWN = 12;

export default function PatchDiff({ page, route, navigate }: { page: PatchPage; route: Route; navigate: Nav }) {
  const t = usePatchesCopy();
  const kinds = page.diff?.kinds ?? {};
  return (
    <>
      {KINDS.map((kind) => {
        const d = kinds[kind];
        if (!d || !(d.added.length || d.removed.length || d.changed.length)) return null;
        return (
          <section className="pz-page pzi-rel pzp-kind" key={kind}>
            <h2 className="pzi-h2">
              <Stamp name={KIND_STAMP[kind]} />
              {t.kinds[kind]}
            </h2>
            <KindBlocks kind={kind} d={d} names={page.names} route={route} navigate={navigate} />
          </section>
        );
      })}
    </>
  );
}

function KindBlocks({ kind, d, names, route, navigate }: { kind: Kind; d: KindDiff; names: Record<string, Loc>; route: Route; navigate: Nav }) {
  const t = usePatchesCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const name = (e: Ent) => <EntName kind={kind} ent={e} route={route} navigate={navigate} />;
  return (
    <>
      {d.added.length > 0 && (
        <>
          <h3 className="pzi-h3">{t.added(num(d.added.length))}</h3>
          <Collapse items={d.added} more={t.more} render={(e) => <li key={e.id}>{name(e)}</li>} />
        </>
      )}
      {d.removed.length > 0 && (
        <>
          <h3 className="pzi-h3">{t.removed(num(d.removed.length))}</h3>
          <Collapse items={d.removed} more={t.more} render={(e) => <li key={e.id}>{name(e)}</li>} />
        </>
      )}
      {d.changed.length > 0 && (
        <>
          <h3 className="pzi-h3">{t.changed(num(d.changed.length))}</h3>
          <Collapse
            items={d.changed}
            more={t.more}
            shown={CHANGED_SHOWN}
            className="pzp-changed"
            render={(e) => (
              <li key={e.id}>
                <span className="pzp-ent">{name(e)}</span>
                <FieldRows kind={kind} fields={e.fields} names={names} lang={lang} locale={locale} />
              </li>
            )}
          />
        </>
      )}
    </>
  );
}

/** El nombre de una entidad: enlace a su ficha si tiene una (y su pestaña está publicada); si no, texto. */
function EntName({ kind, ent, route, navigate }: { kind: Kind; ent: Ent; route: Route; navigate: Nav }) {
  const { lang } = useLang();
  const tab = kindTab(kind);
  const label = ent.n[lang] || ent.id;
  if (!tab || !ent.slug) return <span className="pzp-name">{label}</span>;
  return (
    <RouteLink className="pzp-name" to={{ ...route, view: "zomboid", pzSection: tab, detail: ent.slug }} onNavigate={navigate}>
      {label}
    </RouteLink>
  );
}
