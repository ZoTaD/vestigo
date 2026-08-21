import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCopy, useLocale } from "./i18n";
import { ItemDetailPanel } from "./DeadlockItemCard";
import { soulIcon } from "./deadlockItemsData";
import {
  useHeroBuilds,
  asItem,
  badgesFor,
  byPhase,
  bySlot,
  MIN_CONVICCION,
  type BuildItemView,
  type BuyView,
  type BuildView,
  type ItemRef,
} from "./deadlockBuildsData";

/**
 * La tarjeta de build que se despliega al apretar un héroe en la tier list.
 *
 * Copia la forma que usa el juego y que usan los sitios de builds: tres pestañas
 * con builds distintas, el reparto de daño, el orden en que se suben las
 * habilidades y los cuadrados de ítems.
 *
 * **Los cuadrados llevan el ítem FINAL, ya mejorado.** Una build de doce ítems
 * son diecisiete compras porque se compra el T1 y se lo mejora; los escalones
 * intermedios viven en el hover, no ocupan cuadrado. El tope de doce está medido,
 * no leído: sobre 166.656 jugadores de Fantasma+ el máximo real es 12 exacto.
 */

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * El escalón, como lo numera la tienda del juego.
 *
 * Índice 0 vacío para que `ROMANOS[tier]` se lea directo: los escalones van del
 * 1 al 4 y no hay un cero.
 */
const ROMANOS = ["", "I", "II", "III", "IV"];

/** El tier como lo escribe el juego. Cuatro es IV, no IIII. */
const ROMANO = ["", "I", "II", "III", "IV"] as const;

/**
 * Dónde se dibuja la ficha: **el contenedor del tema, no `document.body`**.
 *
 * Todo el CSS del sitio cuelga de `[data-theme="codex"]`, que vive en un `div`
 * adentro del body. Portando al body, la ficha quedaba fuera de ese selector y
 * no le aplicaba ni una regla — salía sin ancho, ocupando la pantalla entera.
 * El contenedor del tema ya está por encima de `.dl-fold-inner`, así que
 * igual escapa del recorte, que es para lo que existía el portal.
 */
const destinoDelPortal = (): HTMLElement =>
  document.querySelector<HTMLElement>("[data-theme]") ?? document.body;

/**
 * Cualquier ítem de la tarjeta, con la ficha del juego al pasar el mouse.
 *
 * Vive acá y no dentro de los cuadrados porque **los tres lugares de la tarjeta
 * muestran ítems**: la build terminada, los escalones y los situacionales. Al
 * principio sólo la build tenía ficha, y era arbitrario — el jugador que no
 * conoce un ítem lo desconoce igual en los tres lados.
 *
 * `cabecera` es lo que cada lugar agrega arriba de la ficha: la build pone el
 * minuto y la cadena de mejora, los otros dos no ponen nada.
 */
function ConFicha({
  item,
  className,
  datos,
  cabecera,
  children,
}: {
  item: ItemRef;
  className: string;
  datos?: Record<string, string | number>;
  cabecera?: React.ReactNode;
  children: React.ReactNode;
}) {
  const locale = useLocale();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLLIElement>(null);
  const ficha = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  /**
   * La ficha se dibuja en `document.body`, no acá adentro.
   *
   * **Es la única forma de que no la recorte nada.** `.dl-fold-inner` —el
   * contenedor que anima el plegado de cada tier— lleva `overflow: hidden`, así
   * que cualquier cosa que se salga de la caja del tier desaparece: la ficha de
   * un objeto de la izquierda quedaba cortada por el borde. Un portal la saca del
   * árbol y la deja por encima de todo.
   *
   * La posición se calcula después de montarla, cuando ya se sabe cuánto mide, y
   * se recorta contra la pantalla para que no se salga por ningún lado.
   */
  useLayoutEffect(() => {
    if (!abierto) return;
    const ancla = caja.current?.getBoundingClientRect();
    const f = ficha.current?.getBoundingClientRect();
    if (!ancla || !f) return;

    const margen = 8;
    const left = Math.min(
      Math.max(margen, ancla.left + ancla.width / 2 - f.width / 2),
      window.innerWidth - f.width - margen
    );
    // Debajo del ítem, salvo que no entre: ahí va arriba.
    const abajo = ancla.bottom + 6;
    const top = abajo + f.height > window.innerHeight - margen
      ? Math.max(margen, ancla.top - f.height - 6)
      : abajo;
    setPos({ top, left });
  }, [abierto]);

  return (
    <li
      ref={caja}
      className={className}
      {...datos}
      onMouseEnter={() => setAbierto(true)}
      onMouseLeave={() => setAbierto(false)}
      onFocus={() => setAbierto(true)}
      onBlur={() => setAbierto(false)}
    >
      {children}

      {/* La ficha es la MISMA que la de la pestaña de objetos: un solo componente
          para las dos pantallas, así no se pueden separar. */}
      {abierto &&
        createPortal(
          <div
            ref={ficha}
            className="dl-slot-pop"
            role="tooltip"
            style={{ top: pos.top, left: pos.left }}
          >
            {cabecera}
            <ItemDetailPanel item={asItem(item)} cost={item.cost.toLocaleString(locale)} />
          </div>,
          destinoDelPortal()
        )}
    </li>
  );
}

/** Un cuadrado de la build core. */
function Slot({ item }: { item: BuildItemView }) {
  const copy = useCopy();
  const c = copy.deadlock.buildCard;

  return (
    <ConFicha
      item={item}
      className="dl-slot"
      // La marca va como atributo y no como clase suelta para que el CSS la
      // pueda usar sin que el resto del cuadrado cambie de estructura.
      datos={{ "data-tier": item.tier, ...(item.carries ? { "data-carries": "" } : {}) }}
      cabecera={
        <>
          <p className="dl-slot-when">
            {c.entersAt(String(item.minute))} · {c.carried(pct(item.prevalence))}
          </p>
          {/* El número que respalda la marca. Una etiqueta sin su dato es una
              opinión, que es la regla con la que se rechazaron otras. */}
          {item.carries && (
            <p className="dl-slot-carries">{c.carries(item.edge.toFixed(2))}</p>
          )}
          {item.steps.length > 0 && (
            <p className="dl-slot-chain">
              {c.upgradedFrom}{" "}
              {item.steps.map((s) => (
                <img key={s.itemId} src={s.img} alt={s.name} title={s.name} width={22} height={22} />
              ))}
            </p>
          )}
        </>
      }
    >
      <button
        className="dl-slot-btn"
        // La cinta es decorativa; para quien no la ve, el dato va en el nombre.
        aria-label={item.carries ? `${item.name} — ${c.keyItem}` : item.name}
      >
        <img src={item.img} alt="" width={48} height={48} loading="lazy" />
        <span className="dl-slot-tier" aria-hidden="true">
          {ROMANO[item.tier] ?? ""}
        </span>
        {item.carries && (
          <span className="dl-slot-key" aria-hidden="true">
            {c.keyItem}
          </span>
        )}
      </button>
    </ConFicha>
  );
}

/** Las tres barras: cuántas almas invierte la build y qué le da el juego. */
function DamageSplit({ build }: { build: BuildView }) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.deadlock.buildCard;
  const filas = [
    { k: "weapon" as const, v: build.damageSplit.weapon },
    { k: "vitality" as const, v: build.damageSplit.vitality },
    { k: "spirit" as const, v: build.damageSplit.spirit },
  ];
  /**
   * La barra se llena contra las **28.800 almas**, que es donde el juego deja de
   * escalar la inversión en una categoría. No es un porcentaje del total de la
   * build: eso decía en qué gastó, no qué le da. Y se topea, porque el 10,5% de
   * las categorías de una build ya pasa ese número —la más cargada llega al
   * 144%— y una barra más larga que su caja sería un dibujo, no un dato.
   */
  const CAP = 28_800;
  return (
    <section className="dl-panel dl-dmg">
      <h4 className="dl-panel-head">{c.damageSplit}</h4>
      <ul>
        {filas.map((f) => (
          <li key={f.k} data-kind={f.k}>
            <span className="dl-dmg-label">{c.damage[f.k]}</span>
            <span className="dl-dmg-bar">
              <span className="dl-dmg-fill" style={{ width: pct(Math.min(1, f.v.souls / CAP)) }} />
            </span>
            <span className="dl-dmg-num">
              {/* El número que el jugador ve en la tienda. El espíritu es plano,
                  los otros dos son porcentaje — igual que en el juego. */}
              {f.v.bonus > 0 ? `+${f.v.bonus}${f.k === "spirit" ? "" : "%"}` : "—"}
            </span>
            <span className="dl-dmg-souls">{c.investment(f.v.souls.toLocaleString(locale))}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * La grilla de subida: qué habilidad se sube en cada paso.
 *
 * **Antes esto eran cuatro cuadrados con el orden de desbloqueo**, que contesta
 * "cuál sale primero" pero no "qué hago en el nivel 7". La secuencia completa
 * —15 o 16 pasos, con repeticiones— venía en la misma respuesta de la API desde
 * el principio y se descartaba después de leerle las cuatro primeras.
 *
 * **No se rotula el costo en puntos de cada mejora, a propósito.** La wiki dice
 * que las tres mejoras cuestan 1, 2 y 5 puntos; la captura del sitio competidor
 * que motivó esta grilla muestra 1, 3 y 5. No pude resolver cuál es, y el número
 * no hace falta para leer la grilla: lo que se lee es el orden. Publicar un
 * costo que no puedo verificar sería inventar precisión.
 */
function SkillPath({ build }: { build: BuildView }) {
  const copy = useCopy();
  const c = copy.deadlock.buildCard;
  // Ausente cuando la API de orden falló. El panel no está, en vez de dibujar
  // una grilla vacía.
  if (build.abilities.length === 0) return null;

  // Sin la senda se cae al panel viejo: cuatro cuadrados en orden de desbloqueo.
  // Pasa con datos publicados antes de que existiera `abilityPath`.
  if (build.path.length === 0) {
    return (
      <section className="dl-panel dl-unlock">
        <h4 className="dl-panel-head">{c.unlockOrder}</h4>
        <ol className="dl-unlock-list">
          {build.abilities.map((a, i) => (
            <li key={a.id} title={a.name}>
              <img src={a.img} alt={a.name} width={40} height={40} loading="lazy" />
              <span className="dl-unlock-n" aria-hidden="true">{i + 1}</span>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <section className="dl-panel dl-path">
      <h4 className="dl-panel-head">{c.skillPath}</h4>
      <div className="dl-path-scroll">
        <table className="dl-path-grid">
        <caption className="visually-hidden">{c.skillPathNote}</caption>
        {/* El ancho de la primera columna se declara acá y no en el `<th>`: con
            `table-layout: fixed`, un ancho puesto en la celda compite con el
            reparto automático y el nombre terminaba montándose sobre los pasos.
            Un `<col>` lo fija sin ambigüedad. */}
        <colgroup>
          <col className="dl-path-col-name" />
        </colgroup>
        <tbody>
          {/* Por casilla del juego (1 a 4) y no por orden de subida: el orden de
              subida sigue estando, en qué columna cae la primera marca de cada
              fila. Con las filas en orden de subida, Ivy salía 1, 3, 2, 4 y se
              leía como un error de la página. */}
          {bySlot(build.abilities).map((a) => {
            // Cuántas veces se subió ANTES de cada paso: da el número de mejora
            // que corresponde a esa celda.
            let subidas = 0;
            return (
              <tr key={a.id}>
                <th scope="row" className="dl-path-name">
                  {/* El flex va adentro de la celda y no en el `<th>`:
                      `display:flex` en una celda la saca del layout de tabla. */}
                  <span className="dl-path-label">
                    <img src={a.img} alt="" width={26} height={26} loading="lazy" />
                    <span>{a.name}</span>
                  </span>
                </th>
                {build.path.map((id, n) => {
                  const suya = id === a.id;
                  if (suya) subidas++;
                  return (
                    <td key={n} className="dl-path-cell" data-on={suya || undefined}>
                      {suya && (
                        <span title={`${a.name} · ${c.skillStep(n + 1)}`}>
                          {/* El rombo es el desbloqueo; después van las mejoras. */}
                          {subidas === 1 ? "◆" : subidas - 1}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * El orden REAL de compra, **con los componentes**.
 *
 * Dos correcciones sobre lo que había. La primera: agrupar por escalón de precio
 * es cómo está la tienda, no cómo compra la gente — medido, 50 de 57 builds no
 * respetan ese orden. La segunda, y la que importa: los doce cuadrados son los
 * ítems FINALES, y nadie compra un tier 4 de una. Se compra el T1 y se lo mejora,
 * así que la secuencia real tiene diecisiete o dieciocho pasos, no doce.
 *
 * Las mejoras se marcan aparte: ahí el jugador no paga el precio entero, y
 * confundirlas con una compra desde cero da una cuenta de almas que no cierra.
 *
 * **Es un componente y no JSX suelto porque la build recomendada usa el mismo.**
 * Con dos copias, el día que una cambie la otra queda distinta sin que avise.
 */
function BuyOrder({ buys }: { buys: BuyView[] }) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.deadlock.buildCard;
  const soul = soulIcon();
  if (buys.length === 0) return null;

  return (
    <section className="dl-panel dl-buyorder">
      <h4 className="dl-panel-head">{c.buyOrder}</h4>

      {/* Partido en los tres tramos de la partida en vez de una fila corrida de
          veinte íconos. Con veinte seguidos hay que contar para saber dónde
          estás; con los tramos, la pregunta "¿qué compro ahora?" se contesta
          mirando una sección sola. */}
      {byPhase(buys).map(({ phase, buys: delTramo }) => (
        <div key={phase} className="dl-phase">
          <h5 className="dl-phase-head">
            {c.phase[phase]}
            <span className="dl-phase-range">{c.phaseRange[phase]}</span>
          </h5>
          <ol className="dl-buy-list">
            {delTramo.map((i) => (
              <ConFicha
                key={i.itemId}
                item={i}
                className="dl-buy"
                datos={i.upgrade ? { "data-up": "1" } : {}}
              >
                {/* El precio arriba, como en la tienda del juego, con su propio
                    símbolo de alma en vez de una palabra. */}
                <span className="dl-buy-cost">
                  {soul && <img src={soul} alt="" width={11} height={11} />}
                  {i.cost.toLocaleString(locale)}
                </span>

                {/* El color sale de `data-slot` y `data-tier` en CSS, no de un
                    estilo en línea: son doce combinaciones fijas y tenerlas en la
                    hoja las deja leerse juntas. */}
                <span
                  className="dl-buy-art"
                  data-slot={i.slot}
                  data-tier={i.tier}
                  {...(i.edge !== undefined ? { "data-key": "" } : {})}
                >
                  <span className="dl-buy-tier" aria-hidden="true">
                    {ROMANOS[i.tier ?? 0] ?? ""}
                  </span>
                  <img
                    className="dl-buy-icon"
                    src={i.img}
                    alt={i.name}
                    width={44}
                    height={44}
                    loading="lazy"
                  />
                  {i.upgrade && (
                    <span className="dl-buy-up" title={c.upgradeStep} aria-label={c.upgradeStep}>
                      ↑
                    </span>
                  )}
                  {/* La banda va ADENTRO de la carátula, que tiene `aspect-ratio`
                      fijo: el alto de la tarjeta no cambia, así que ninguna
                      compra se mueve de lugar. El espacio se lo cede la franja
                      del nombre, que es `flex: 1`.

                      Dice la palabra y no el número: "+1.8" obliga a saber qué
                      escala es y para qué lado es bueno. El número sigue en el
                      hover — una etiqueta sin su dato es una opinión. */}
                  {i.edge !== undefined && (
                    <span className="dl-buy-key" title={c.carries(i.edge.toFixed(2))}>
                      {c.keyItem}
                    </span>
                  )}
                  <span className="dl-buy-name">
                    {/* El texto va en su propio span: la franja centra con flex y
                        el recorte a dos renglones necesita `-webkit-box`, y las
                        dos cosas no conviven en el mismo elemento. */}
                    <span className="dl-buy-name-txt">{i.name}</span>
                  </span>
                </span>
              </ConFicha>
            ))}
          </ol>
        </div>
      ))}

      <p className="detail-note dl-buy-note">{c.buyOrderNote}</p>
    </section>
  );
}

export default function DeadlockBuildCard({
  heroId,
  heroWinRate,
}: {
  heroId: number;
  /** El winrate del héroe, de referencia: 56% no se sabe si es bueno hasta
   *  saber cuánto promedia el héroe. */
  heroWinRate?: number;
}) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.deadlock.buildCard;
  const datos = useHeroBuilds(heroId);
  const [activa, setActiva] = useState(0);

  if (!datos) return <p className="detail-note dl-build-loading">{copy.deadlock.loading}</p>;
  if (datos.builds.length === 0) return <p className="detail-note">{c.none}</p>;

  const build = datos.builds[Math.min(activa, datos.builds.length - 1)];

  /**
   * El numeral de las pestañas que comparten nombre.
   *
   * Un héroe puede tener dos builds del mismo tipo que se diferencian en otra
   * cosa —Seven tiene dos de espíritu vampírico— y dos pestañas con el mismo
   * rótulo no se pueden elegir. El numeral sale de contar acá y no de leer un
   * sufijo del id: así no depende de cómo el pipeline arme esa clave.
   */
  const numeral = (() => {
    const vistos = new Map<string, number>();
    return datos.builds.map((b) => {
      const clave = `${b.damage}|${b.trait}`;
      const n = (vistos.get(clave) ?? 0) + 1;
      vistos.set(clave, n);
      const repetido = datos.builds.filter((x) => `${x.damage}|${x.trait}` === clave).length > 1;
      return repetido ? ` ${"I".repeat(n)}` : "";
    });
  })();

  const etiquetas = badgesFor(datos.builds);
  const soul = soulIcon();
  const reco = datos.recommended;
  /** La pestaña nuestra va después de todas las medidas. */
  const iReco = datos.builds.length;
  const esReco = activa === iReco && !!reco;

  return (
    <div className="dl-build">
      {/* Las pestañas. Son las formas de jugarlo que de verdad se distinguen — a
          un héroe que se juega de una sola forma le sale una sola, y eso es
          correcto: tres nombres para lo mismo sería inventar variedad.

          Las etiquetas dicen QUÉ es cada una en vez de cuál conviene. La primera
          es la más jugada, que es como se eligen; la de mejor winrate se marca
          sólo si le gana a todas las demás por dos errores estándar, y hoy eso
          pasa en 5 de 34 héroes. Donde no se sostiene no hay etiqueta, y va
          apareciendo sola a medida que entran partidas. */}
      <div className="dl-build-tabs" role="tablist">
        {datos.builds.map((b, i) => (
          <button
            key={b.id}
            role="tab"
            aria-selected={i === activa}
            data-active={i === activa}
            className="dl-build-tab"
            onClick={() => setActiva(i)}
          >
            {etiquetas[i].length > 0 && (
              <span className="dl-build-badges">
                {etiquetas[i].map((e) => (
                  <span key={e} className="dl-build-reco" data-badge={e}>
                    {e === "played" ? c.mostPlayed : c.bestWinRate}
                  </span>
                ))}
              </span>
            )}
            {c.name(c.damage[b.damage], c.trait[b.trait]) + numeral[i]}
          </button>
        ))}

        {/* La nuestra va última y se ve distinta. Si se viera igual que las
            medidas, el lector no distinguiría "esto lo hace la gente" de "esto
            opinamos nosotros" — y ahí el que pierde credibilidad es el resto de
            la tarjeta. */}
        {reco && (
          <button
            role="tab"
            aria-selected={esReco}
            data-active={esReco}
            className="dl-build-tab is-reco"
            onClick={() => setActiva(iReco)}
          >
            <span className="dl-build-badges">
              <span className="dl-build-reco" data-badge="beta">
                {c.beta}
              </span>
            </span>
            {c.ourPick}
          </button>
        )}
      </div>

      {esReco && reco && (
        <section className="dl-panel dl-reco">
          <h4 className="dl-panel-head">{c.ourPick}</h4>

          {reco.swaps.length === 0 ? (
            /* Este resultado tiene que poder mostrarse, o el algoritmo estaría
               obligado a inventar mejoras para justificar su propia pestaña. */
            <p className="detail-note">{c.recoNone}</p>
          ) : (
            <>
              <p className="detail-note">{c.recoLead(String(reco.swaps.length))}</p>
              <ul className="dl-reco-swaps">
                {reco.swaps.map((s) => (
                  <li key={s.in.itemId} className="dl-reco-swap">
                    <img src={s.out.img} alt="" width={26} height={26} loading="lazy" />
                    <span className="dl-reco-out">{s.out.name}</span>
                    <span className="dl-reco-arrow" aria-hidden="true">→</span>
                    <img src={s.in.img} alt="" width={26} height={26} loading="lazy" />
                    <span className="dl-reco-in">{s.in.name}</span>
                    {/* El número que respalda cada cambio, al lado del cambio.
                        Una recomendación sin su evidencia es una opinión. */}
                    <span className="detail-note dl-reco-why">
                      {c.recoWhy(
                        (s.edgeIn - s.edgeOut).toFixed(2),
                        s.support.toLocaleString(locale)
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <ol className="dl-slots">
            {reco.items.map((i) => (
              <Slot key={i.itemId} item={i} />
            ))}
          </ol>
        </section>
      )}

      {/* El mismo panel que las medidas, con la secuencia de la recomendada: los
          doce cuadrados dicen QUÉ comprar y esto dice CUÁNDO, que es lo único
          que hace que se pueda seguir. */}
      {esReco && reco && <BuyOrder buys={reco.buys} />}

      <div className="dl-build-body" hidden={esReco}>
        <div className="dl-build-panels">
          <DamageSplit build={build} />
        </div>

        <section className="dl-panel dl-slots-panel">
          <h4 className="dl-panel-head">
            {c.items(String(build.items.length))}
            <span className="dl-build-sample">
              {c.sample(build.matches.toLocaleString(locale), (build.winRate * 100).toFixed(1))}
              {/* La referencia del héroe: sin ella, 56,0% no se sabe si es bueno.
                  Con ella, la build se lee como +1,7 sobre su propio héroe. */}
              {heroWinRate !== undefined && (
                <span className="dl-build-vs">
                  {c.vsHero(
                    ((build.winRate - heroWinRate) * 100 >= 0 ? "+" : "−") +
                      Math.abs((build.winRate - heroWinRate) * 100).toFixed(1),
                    (heroWinRate * 100).toFixed(1)
                  )}
                </span>
              )}
            </span>
            {/* Sólo cuando hay algo que decir. La mayoría de las builds describen
                bien a su gente, y avisar en todas haría que el aviso no se lea. */}
            {build.commitment !== undefined && build.commitment < MIN_CONVICCION && (
              <span
                className="dl-build-blend"
                title={c.blendedWhy((build.commitment * 100).toFixed(0))}
              >
                {c.blended}
              </span>
            )}
          </h4>
          <ol className="dl-slots">
            {build.items.map((i) => (
              <Slot key={i.itemId} item={i} />
            ))}
          </ol>
        </section>

        {/* La grilla va a lo ancho y no en la columna de la izquierda: son
            quince o dieciséis columnas más el nombre de cada habilidad, y en
            220px los nombres se montaban encima de las celdas. */}
        <SkillPath build={build} />

        <BuyOrder buys={build.buys} />

        {/* Los counter NO están en los cuadrados y eso es el punto: dependen de
            quién esté enfrente, así que no son parte de la build. Se miden por
            cuánto se dispara su compra contra alguien, en vez de mantenerse
            pareja contra cualquiera. */}
        {datos.counters.length > 0 && (
          <section className="dl-panel dl-counters">
            <h4 className="dl-panel-head">{c.counters}</h4>
            <ul className="dl-counter-list">
              {datos.counters.map((x) => (
                <ConFicha key={x.itemId} item={x} className="dl-counter-item">
                  <img src={x.img} alt="" width={30} height={30} loading="lazy" />
                  <span className="dl-counter-name">{x.name}</span>
                  <span className="dl-counter-vs">{c.against(x.foes.join(", "))}</span>
                </ConFicha>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* La tier list de arriba SIEMPRE corta por parche. Cuando la tarjeta no
          puede —porque el parche todavía no junta muestra— la fila y su tarjeta
          describen dos juegos distintos, y eso hay que decirlo en vez de dejar
          que se lea como si midieran lo mismo. */}
      {datos.crossesPatch && <p className="dl-provisional">{c.crossesPatch}</p>}

      <p className="detail-note dl-build-foot">{c.foot(copy.deadlock.bands[datos.band] ?? datos.band, datos.from, datos.to)}</p>
    </div>
  );
}
