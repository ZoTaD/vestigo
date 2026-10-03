/**
 * "Qué cambió" en cada ficha de Project Zomboid (2026-10-02): una hoja de la libreta, al final de la ficha, con lo que le
 * cambió a esa cosa en las últimas versiones que comparamos (site.py anota las últimas 5 comparaciones, `CHANGES_N`).
 * Un bloque por versión, de la más nueva a la más vieja: la versión y su fecha enlazadas a su página, y debajo
 * "Apareció en esta versión" o los renglones campo por campo, los mismos de la página del parche (`FieldRows`).
 *
 * En un objeto con varias variantes, cada cambio dice de cuál es (el nombre de la variante arriba de sus renglones). Sin
 * cambios no se dibuja nada: ni la hoja ni el título. Es lo que pasa hoy con todas, porque recién desde la 42.21
 * comparamos versión contra versión.
 *
 * Las fichas no lo importan: montan `ChangesSlot` (`changes.tsx`), que lo baja en su chunk sólo si hay cambios. Sus
 * estilos están en zomboid-items.css, que las fichas ya cargan, así sale con estilo desde el HTML prerenderizado.
 */
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import { PZ_PUBLISHED, type Route } from "../../route";
import type { Loc } from "../items/data";
import { Stamp } from "../ui";
import { usePatchesCopy } from "./copy";
import type { FichaChange, Kind } from "./data";
import { fmtDate } from "./fields";
import { FieldRows } from "./FieldRows";

const NO_NAMES: Record<string, Loc> = {};

export default function ChangesBox({
  kind,
  changes,
  route,
  navigate,
  variants,
}: {
  kind: Kind;
  changes: FichaChange[] | undefined;
  route: Route;
  navigate: (r: Route) => void;
  /** Objetos: para decir de qué variante es cada cambio. */
  variants?: { gameId: string; name: Loc }[];
}) {
  const t = usePatchesCopy();
  const { lang } = useLang();
  const locale = useLocale();
  // Sin la pestaña publicada no hay a dónde llevar los enlaces de cada versión.
  if (!changes?.length || !PZ_PUBLISHED.includes("patches")) return null;

  // Una versión puede traer varios cambios (uno por variante): van juntos, en el orden en que llegan (la más nueva arriba).
  const groups: FichaChange[][] = [];
  for (const c of changes) {
    const last = groups.at(-1);
    if (last && last[0].patch === c.patch) last.push(c);
    else groups.push([c]);
  }
  const toPatch = (slug?: string): Route => ({ ...route, view: "zomboid", pzSection: "patches", detail: slug });
  const variantName = (gameId?: string): string | null => {
    if (!gameId || !variants || variants.length < 2) return null;
    const v = variants.find((x) => x.gameId === gameId);
    return v ? v.name[lang] : gameId;
  };

  return (
    <section className="pz-page pzi-rel pzp-box">
      <h2 className="pzi-h2">
        <Stamp name="exclamation" />
        {t.box.title}
      </h2>
      {groups.map((group) => {
        const head = group[0];
        return (
          <div className="pzp-boxver" key={head.patch}>
            <h3 className="pzp-boxhead">
              <RouteLink className="pzp-link" to={toPatch(head.patch)} onNavigate={navigate}>
                {head.version} · <time dateTime={head.date}>{fmtDate(head.date, lang)}</time>
              </RouteLink>
            </h3>
            {group.map((c, i) => {
              const vname = variantName(c.gameId);
              return (
                <div className="pzp-boxchange" key={`${c.gameId ?? ""}-${i}`}>
                  {vname && <p className="pzp-ent">{vname}</p>}
                  {c.kind === "added" ? (
                    <p className="pzp-appeared">{t.box.appeared}</p>
                  ) : (
                    <FieldRows kind={kind} fields={c.fields ?? []} names={c.names ?? NO_NAMES} lang={lang} locale={locale} />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      <p className="pzp-boxall">
        <RouteLink className="pzp-link" to={toPatch()} onNavigate={navigate}>
          {t.box.all} <span aria-hidden="true">→</span>
        </RouteLink>
      </p>
    </section>
  );
}
