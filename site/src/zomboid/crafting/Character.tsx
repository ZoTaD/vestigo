/**
 * "Tu personaje" en el Planificador de fabricación (2026-10-02): la profesión y los rasgos que cambian lo que ya sabés
 * fabricar. Con herrero, los clavos se forjan sin aprender nada; sin profesión, la receta de forjar va a "Para aprender".
 * Es el mismo `?b=` que Personaje (profesión y rasgos separados por punto), así un personaje armado allá sirve acá.
 *
 * Chico y arriba de la hoja de ruta: una lista de profesiones en un `<select>` (son 14), los rasgos del link como chips
 * con "Sacar", y un link a Personaje para armarlo entero. Sólo se listan las profesiones y los rasgos que enseñan alguna
 * receta (los que trae `craft.json`): los demás no cambian nada acá, y si vienen en el link se conservan sin mostrarse.
 *
 * El link a Personaje no usa `planner/link.tsx`: ese módulo arrastra los datos de Rasgos al chunk. Usa lo mismo que
 * aquél, `QueryLink` (un `<a href>` de verdad con el `?b=`, que al clic normal navega sin recargar).
 */
import { useMemo } from "react";
import { useLang, useLocale } from "../../i18n";
import { routePath, type Route } from "../../route";
import QueryLink from "../QueryLink";
import { ItemIcon, Stamp } from "../ui";
import { useCraftCopy } from "./copy";
import { own, type CraftData } from "./data";
import { setB, type CraftState } from "./state";

/** La profesión "de entrada" de Personaje: sin profesión. Va adelante del `?b=` cuando hay rasgos y ninguna profesión. */
const NO_PROF = "custom-occupation";

export default function Character({
  data,
  st,
  set,
  route,
  navigate,
}: {
  data: CraftData;
  st: CraftState;
  set: (s: CraftState) => void;
  route: Route;
  navigate?: (r: Route) => void;
}) {
  const t = useCraftCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const profs = useMemo(() => {
    const collator = new Intl.Collator(locale);
    return Object.keys(data.profs).sort((a, b) => collator.compare(data.profs[a][lang], data.profs[b][lang]));
  }, [data, lang, locale]);
  const [prof = NO_PROF, ...traits] = (st.b ?? "").split(".").filter(Boolean);
  const shown = traits.filter((x) => !!own(data.traits, x));
  /** El `?b=` con esta profesión y estos rasgos; sin nada, ninguno. */
  const build = (p: string, ts: string[]): string | null => (ts.length ? [p, ...[...ts].sort()].join(".") : p === NO_PROF ? null : p);
  const to: Route = { ...route, view: "zomboid", pzSection: "planner", detail: undefined };
  const planner = routePath(to) + (st.b ? `?b=${st.b}` : "");

  return (
    <section className="pz-page pzc-sheet pzc-char" aria-labelledby="pzc-char-title">
      <h2 className="pzi-h2" id="pzc-char-title">
        <Stamp name="facehappy" />
        {t.charTitle}
      </h2>
      <div className="pzc-charrow">
        <label className="pzc-select">
          <span className="pzc-why">{t.profLabel}</span>
          <select
            value={own(data.profs, prof) ? prof : ""}
            onChange={(e) => set(setB(st, build(e.target.value || NO_PROF, traits)))}
          >
            <option value="">{t.noProf}</option>
            {profs.map((p) => (
              <option value={p} key={p}>
                {data.profs[p][lang]}
              </option>
            ))}
          </select>
        </label>
        <QueryLink className="pzc-wlink" to={to} href={planner} navigate={navigate}>
          {t.charLink}
        </QueryLink>
      </div>
      {shown.length > 0 && (
        <ul className="pzc-chips">
          {shown.map((x) => (
            <li key={x} className="pzc-chip">
              <ItemIcon icon={data.traits[x].icon} dir="traits" size={24} />
              <span>{data.traits[x][lang]}</span>
              <button
                type="button"
                className="pzc-act"
                aria-label={t.removeOne(data.traits[x][lang])}
                onClick={() => set(setB(st, build(prof, traits.filter((y) => y !== x))))}
              >
                {t.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="pzi-hand pzc-charnote">{t.charNote}</p>
    </section>
  );
}
