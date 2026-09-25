import type { ReactNode } from "react";
import { useLang } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { useItemDetail, iconUrl, cardArt, soulIcon, catalogUpgrades, type Item } from "./deadlockItemsData";
import { ItemIcon } from "./DeadlockItemTip";
import GameImg from "./GameImg";

/**
 * La tarjeta de un ítem, tal como la dibuja el juego.
 *
 * Vive en su propio módulo desde que la tarjeta de build la necesita para el
 * hover de cada cuadrado: la tier list de objetos y la build muestran **la misma
 * ficha**, y tenerla dos veces sería garantizar que se separen.
 */

/**
 * La ficha del ítem: qué hace y qué stats da, como lo dice el juego.
 *
 * El texto llega **ya parseado** desde el build, en pedazos con una bandera de
 * resaltado. Acá se dibuja con elementos de React y nunca con
 * `dangerouslySetInnerHTML`: las descripciones del juego traen `<svg>` e `<img>`
 * incrustados, y eso no vuelve a ser markup en nuestra página.
 */
export function ItemDetailPanel({ item, cost, footer }: { item: Item; cost: string; footer?: ReactNode }) {
  const copy = useCopy();
  const { lang } = useLang();
  const c = copy.deadlock.itemsPage;
  const ficha = useItemDetail(item.itemId);
  // Las fichas que llegan con sólo el id (al pasar el mouse) no traen sus
  // mejoras: se completan del catálogo, porque el juego las pone al pie.
  const cat = catalogUpgrades(item.itemId, lang);
  const upgradesFrom = item.upgradesFrom.length ? item.upgradesFrom : cat.from;
  const upgradesTo = item.upgradesTo.length ? item.upgradesTo : cat.to;

  if (!ficha) return <p className="detail-note dl-detail-loading">{c.detail.loading}</p>;

  const art = cardArt(item.slot);

  return (
    <div
      className="dl-card"
      data-slot={item.slot}
      style={
        {
          "--card-head": art.head ? `url(${art.head})` : "none",
          "--card-body": art.body ? `url(${art.body})` : "none",
        } as React.CSSProperties
      }
    >
      {/* El encabezado de la tarjeta del juego: nombre y precio con el símbolo de
          alma. El color sale de la categoría, que es como el juego las pinta. */}
      <header className="dl-card-head">
        <h4 className="dl-card-name">{item.name}</h4>
        <p className="dl-card-cost">
          {soulIcon() && <GameImg src={soulIcon()} alt="" width={17} height={17} />}
          {cost}
          <span className="visually-hidden"> {c.detail.souls}</span>
        </p>
      </header>

      <div className="dl-card-body">
        {ficha.sections.length === 0 && <p className="detail-note">{c.detail.none}</p>}

        {ficha.sections.map((sec, i) => (
          <section className="dl-detail-sec" key={`${sec.kind}-${i}`} data-kind={sec.kind}>
            {sec.blocks.map((b, j) => (
              <div className="dl-detail-block" key={j}>
                {/* El encabezado de la sección y, a su derecha, la pastilla del
                    tiempo de recarga: así lo reparte la tarjeta del juego. */}
                {(c.detail.kinds[sec.kind as keyof typeof c.detail.kinds] || sec.kind === "" || b.cooldown) && (
                  <div className="dl-card-secline">
                    <h5 className="dl-detail-kind">
                      {/* Una sección sin tipo que no es la innata el juego la
                          rotula "Pasivo" (Disparo Reparador, entre 16). */}
                      {c.detail.kinds[sec.kind as keyof typeof c.detail.kinds] ??
                        (sec.kind === "" ? c.detail.kinds.passive : "")}
                    </h5>
                    {b.cooldown && (
                      <span className="dl-card-pill">
                        {b.cooldown.icon && iconUrl(b.cooldown.icon) && (
                          <GameImg src={iconUrl(b.cooldown.icon)} alt="" width={14} height={14} />
                        )}
                        {b.cooldown.value}
                        {b.cooldown.unit}
                      </span>
                    )}
                  </div>
                )}

                {b.text.length > 0 && (
                  <p className="dl-detail-text">
                    {b.text.map((sp, k) => (
                      <span
                        key={k}
                        className={sp.hi ? "dl-hi" : sp.dim ? "dl-dim" : sp.attr ? "dl-attr" : undefined}
                        data-attr={sp.attr}
                      >
                        {/* El ícono que el juego incrusta en la frase. Viene por
                            clave, no como markup: el SVG original se descartó en
                            el build.

                            **El ícono va pegado a su primera palabra.** Suelto,
                            el renglón se cortaba justo después de él y quedaba
                            una línea con un ícono solo, que es lo que hacía ver
                            "rotas" las descripciones. Sólo se ata la primera
                            palabra y no la frase entera: hay pedazos de hasta 37
                            caracteres y prohibirles el corte los haría desbordar. */}
                        {sp.icon && iconUrl(sp.icon) ? (
                          (() => {
                            const corte = sp.t.indexOf(" ");
                            const primera = corte === -1 ? sp.t : sp.t.slice(0, corte);
                            const resto = corte === -1 ? "" : sp.t.slice(corte);
                            return (
                              <>
                                <span className="dl-icon-word">
                                  <GameImg
                                    className="dl-inline-icon"
                                    src={iconUrl(sp.icon)}
                                    alt=""
                                    width={14}
                                    height={14}
                                  />
                                  {primera}
                                </span>
                                {resto}
                              </>
                            );
                          })()
                        ) : (
                          sp.t
                        )}
                      </span>
                    ))}
                  </p>
                )}

                {/* En la sección innata las stats son líneas corridas; en una
                    activa o pasiva el juego las mete juntas en una caja ancha
                    abajo de todo. Verificado sobre cinco tarjetas reales. */}
                {b.stats.length > 0 && (
                  <ul className="dl-card-stats" data-boxed={sec.kind !== "innate"}>
                    {/* La clave es el índice y no la etiqueta: Boundless Spirit
                        da "Spirit Power" dos veces —30 plano y 15% destacado— y
                        en español dos etiquetas distintas de Lifestrike caen en
                        el mismo texto. */}
                    {b.stats.map((st, k) => (
                      <li key={k} data-big={st.big === true}>
                        <span className="dl-card-stat-value">
                          {st.value}
                          {st.unit}
                        </span>
                        <span className="dl-card-stat-label">{st.label}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {b.boxed.length > 0 && (
                  <ul className="dl-card-boxes">
                    {b.boxed.map((st, k) => (
                      <li key={k} data-tone={toneOf(st.icon)}>
                        {st.icon && iconUrl(st.icon) && (
                          <GameImg className="dl-stat-icon" src={iconUrl(st.icon)} alt="" width={16} height={16} loading="lazy" />
                        )}
                        <span className="dl-card-stat-value">
                          {st.value}
                          {st.unit}
                        </span>
                        <span className="dl-card-stat-label">{st.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        ))}

        {/* De qué ítems sale éste. El juego lo pone al pie de la tarjeta. */}
        {upgradesFrom.length > 0 && (
          <section className="dl-card-up">
            <h5 className="dl-detail-kind">{c.detail.upgradesFrom}</h5>
            <ul className="dl-card-up-list">
              {upgradesFrom.map((u) => (
                <li key={u.itemId} data-slot={u.slot}>
                  <ItemIcon itemId={u.itemId} img={u.img} size={30} tip={false} />
                  <span>{u.name}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Y qué se construye a partir de él, que es la relación al revés. */}
        {upgradesTo.length > 0 && (
          <section className="dl-card-up">
            <h5 className="dl-detail-kind">{c.detail.upgradesTo}</h5>
            <ul className="dl-card-up-list">
              {upgradesTo.map((u) => (
                <li key={u.itemId} data-slot={u.slot}>
                  <ItemIcon itemId={u.itemId} img={u.img} size={30} tip={false} />
                  <span>{u.name}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Lo que cada lugar del sitio agrega (minuto de compra, ventaja…),
            al pie y adentro de la ficha: el juego no la envuelve en ningún marco. */}
        {footer && <div className="dl-card-foot">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * El color de la etiqueta de un recuadro, como en la ficha del juego: verde para
 * lo que cura, violeta para lo espiritual, naranja para el arma. Sale de la
 * clave del ícono de la stat, que es lo único que dice de qué familia es.
 */
function toneOf(icon: string | undefined): string | undefined {
  if (!icon) return undefined;
  if (/heal|regen|life|health/i.test(icon)) return "heal";
  if (/tech|spirit|magic/i.test(icon)) return "spirit";
  if (/bullet|weapon|fire_rate|ammo|clip|reload|melee/i.test(icon)) return "weapon";
  return undefined;
}

