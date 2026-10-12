import { useLang, useLocale } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { text } from "./localized";
import { heroName } from "./deadlockReportData";
import type { Trait } from "./deadlockTraits";

/**
 * Los rasgos como una lista de etiquetas: el nombre teñido de bueno o malo y,
 * al lado, el número que lo disparó.
 *
 * La explicación va escrita y no en un `title`: en el teléfono no hay hover, y
 * una etiqueta sin su porqué es una opinión. El tono va en el fondo y en el
 * texto, sin filo de color (regla del sitio para las tarjetas).
 */
export default function DeadlockTraits({ traits }: { traits: Trait[] }) {
  const copy = useCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const list = copy.deadlock.report.traits.list;

  const shown = traits.filter((t) => list[t.id]);
  if (shown.length === 0) return null;

  const value = (t: Trait) =>
    t.unit === "share"
      ? `${Math.round(t.value * 100)}%`
      : Math.round(t.value).toLocaleString(locale);

  return (
    <ul className="dl-traits">
      {shown.map((t) => {
        const [label, why] = list[t.id];
        const hero = t.heroId === undefined ? "" : text(heroName(t.heroId) ?? undefined, lang, String(t.heroId));
        return (
          <li key={t.id} className="dl-trait" data-tone={t.tone}>
            <b className="dl-trait-name">{label}</b>
            <span className="dl-trait-why">{why(value(t), hero)}</span>
          </li>
        );
      })}
    </ul>
  );
}
