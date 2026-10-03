/**
 * La hoja de las capas del Mapa de Project Zomboid (2026-09-30, Task 3): la leyenda y los interruptores a la vez. Cada
 * renglón es una capa con su sello (el mismo que usa en el mapa) teñido de su color, su nombre y cuántas hay en todo
 * Knox County; al tocarlo se prende o se apaga. Prendida, dice qué muestra, y la recolección suma su clave de tintes y
 * los puntos de aparición el filtro por profesión.
 *
 * Las cifras salen de `map/meta.json` (las escribe `map.py`), así la hoja entra entera al prerender, con números que
 * Google lee, sin esperar a los datos del visor.
 *
 * Una capa de zonas prendida que a este zoom todavía no se dibuja (ver `ZONE_MIN_ZOOM`) lo dice: "Acercá para ver las
 * zonas". Si no, la leyenda la mostraba prendida y el mapa no pintaba nada.
 */
import mapMeta from "@zomboid/map/meta.json";
import profNames from "virtual:pz-names/professions";
import type { CSSProperties } from "react";
import { useLang, useLocale } from "../../i18n";
import { Stamp } from "../ui";
import { useMapCopy } from "./copy";
import { FORAGE_KINDS, HEAT_KEY, LAYER_COLOR, LAYER_STAMP, layerCount, ZONE_COLOR, zonesTooFar } from "./layerMeta";
import { LAYERS, type LayerId } from "./url";

const tint = (color: string) => ({ "--pzm-tint": color }) as CSSProperties;

export default function Legend({
  layers,
  onToggle,
  prof,
  onProf,
  zoom,
}: {
  layers: readonly LayerId[];
  onToggle: (id: LayerId) => void;
  prof: string | null;
  onProf: (prof: string | null) => void;
  /** El zoom del visor (redondeado como las teselas): para avisar qué capas prendidas todavía no se dibujan. */
  zoom: number;
}) {
  const t = useMapCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const counts = mapMeta.counts;
  const profs = Object.entries(profNames)
    .map(([id, [en, es]]) => ({ id, name: lang === "es" ? es : en }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  return (
    <section className="pz-page pzm-card pzm-legend" aria-labelledby="pzm-layers-h">
      <h2 className="pzm-h2" id="pzm-layers-h">
        {t.layers.title}
      </h2>
      <ul className="pzm-layers">
        {LAYERS.map((id) => {
          const on = layers.includes(id);
          // La densidad no tiene cifra (ver `layerCount`): el renglón va sin número.
          const n = layerCount(id, counts);
          return (
            <li key={id} className={`pzm-layer${on ? " is-on" : ""}`}>
              <label className="pzm-layer-row">
                <input type="checkbox" checked={on} onChange={() => onToggle(id)} />
                <span className="pzm-layer-mark" style={tint(LAYER_COLOR[id])} aria-hidden="true">
                  <Stamp name={LAYER_STAMP[id]} />
                </span>
                <span className="pzm-layer-name">{t.layers.names[id]}</span>
                {n !== null && <span className="pzm-layer-n">{num(n)}</span>}
              </label>
              {on && <p className="pzm-layer-about">{t.layers.about[id]}</p>}
              {on && zonesTooFar(id, zoom) && <p className="pzm-layer-about is-far">{t.layers.zoomIn}</p>}
              {on && id === "densidad" && (
                <>
                  <div className="pzm-heat-key">
                    <span className="pzm-heat-end">{t.layers.heat.less}</span>
                    <span className="pzm-heat-bar" aria-hidden="true">
                      {HEAT_KEY.map((c) => (
                        <span key={c} style={{ background: c }} />
                      ))}
                    </span>
                    <span className="pzm-heat-end">{t.layers.heat.more}</span>
                  </div>
                  <p className="pzm-layer-about">{t.layers.heat.uniform}</p>
                </>
              )}
              {on && id === "recoleccion" && (
                <ul className="pzm-key pzm-forage">
                  {FORAGE_KINDS.map((k) => (
                    <li key={k}>
                      <span className="pzm-key-swatch" style={{ "--pzm-swatch": ZONE_COLOR[k] } as CSSProperties} aria-hidden="true" />
                      <span className="pzm-forage-name">{t.layers.forage[k]}</span>
                      <span className="pzm-layer-n">{num(counts.zones[k] ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {on && id === "apariciones" && (
                <label className="pzm-prof">
                  <span className="pzm-prof-label">{t.layers.profession}</span>
                  <select value={prof ?? ""} onChange={(e) => onProf(e.target.value || null)}>
                    <option value="">{t.layers.allProfessions}</option>
                    {profs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </li>
          );
        })}
      </ul>
      <p className="pzm-hint">{t.layers.hint}</p>
    </section>
  );
}
