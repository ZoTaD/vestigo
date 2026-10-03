/**
 * Los renglones de un cambio de parche (2026-10-02): un renglón por campo, con la etiqueta (o la clave cruda) y el
 * antes → después, o lo que se sumó y lo que se sacó de una lista. Los usan la página de cada versión (`PatchDiff`) y el
 * "Qué cambió" de cada ficha (`ChangesBox`); van en su propio módulo para que las fichas no carguen la página entera.
 */
import { Fragment } from "react";
import type { Loc } from "../items/data";
import { usePatchesCopy } from "./copy";
import type { FieldChange, Kind } from "./data";
import { direction, fieldLabel, formatValue, rawKey, recipeLine } from "./fields";

/** Una clave cruda con un `<wbr>` después de cada punto: baja de renglón en un punto, nunca dentro de una palabra. */
function RawKey({ f }: { f: string }) {
  return (
    <code>
      {rawKey(f).map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </code>
  );
}

/**
 * Los cambios de campo de una entidad, un renglón por campo: la etiqueta (o la clave cruda) y el antes → después, o lo
 * que se sumó y lo que se sacó de una lista.
 */
export function FieldRows({
  kind,
  fields,
  names,
  lang,
  locale,
}: {
  kind: Kind;
  fields: FieldChange[];
  names: Record<string, Loc>;
  lang: "en" | "es";
  locale: string;
}) {
  const t = usePatchesCopy();
  return (
    <dl className="pzp-fields">
      {fields.map((c, i) => {
        const label = fieldLabel(kind, c.f, lang);
        const lines = c.f === "inputs" || c.f === "outputs";
        const show = (v: string) => (lines ? recipeLine(v, names, lang) : formatValue(v, names, lang, locale));
        const dir = direction(c.b, c.a);
        const isList = c.add !== undefined || c.rem !== undefined;
        return (
          <div className="pzp-field" key={`${c.f}-${i}`}>
            <dt>{label ?? <RawKey f={c.f} />}</dt>
            <dd>
              {isList ? (
                <span className="pzp-list">
                  {(c.add ?? []).map((v) => (
                    <span className="pzp-add" key={`+${v}`}>
                      {`+ ${show(v)}`}
                    </span>
                  ))}
                  {(c.rem ?? []).map((v) => (
                    <span className="pzp-rem" key={`-${v}`}>
                      {`− ${show(v)}`}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="pzp-ba">
                  <span className="pzp-b">{formatValue(c.b ?? null, names, lang, locale)}</span>
                  <span className="pzp-arrow" aria-hidden="true">
                    →
                  </span>
                  <span className="pzp-a">{formatValue(c.a ?? null, names, lang, locale)}</span>
                  {dir && <span className={`pzp-${dir}`}>{dir === "up" ? t.up : t.down}</span>}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
