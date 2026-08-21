import { useCopy, useLocale } from "./i18n";
import { COSTS, SLOTS, type Item, type Scatter, type ShopCell, type Slot } from "./deadlockItemsData";

/**
 * Los dos gráficos de la tier list de ítems.
 *
 * SVG a mano y sin librería: el bundle ya pesa 1,2 MB y estos dos dibujos son
 * ~150 líneas de geometría. Sigue el patrón del gráfico de PL del perfil
 * (`ProfilePanel.tsx`): `viewBox`, clases del tema, `<title>` por marca para el
 * hover y `role="img"` con su descripción.
 *
 * ---
 *
 * **La escala de color es divergente y está validada, no elegida a ojo.** El dato
 * es la ventaja, que tiene signo y un cero que significa algo, así que van dos
 * tonos con un gris neutro al medio. Los polos son `#e8b44a` (oro) y `#c25a54`
 * (rojo): separan ΔE 21,4 en deuteranopía —el objetivo es 8— y los dos pasan 3:1
 * de contraste contra el fondo del tema. El oro del sitio (`--gold-lit`) daba
 * ΔE 42,8 pero el oxblood quedaba en 2,41:1, debajo del piso.
 */

/** Los polos de la escala divergente y el gris del medio. */
const POS = "#e8b44a";
const NEG = "#c25a54";
const MID = "#6b6455";

/**
 * De ventaja a color.
 *
 * `cap` acota la escala para que un solo ítem extremo (Metal Skin, −9,7) no
 * aplaste a todos los demás contra el gris. Más allá del tope el color satura,
 * que es lo correcto: "muy malo" y "muy muy malo" son la misma decisión.
 */
export function deltaColor(delta: number, cap = 3): string {
  const t = Math.max(-1, Math.min(1, delta / cap));
  const to = t >= 0 ? POS : NEG;
  return mix(MID, to, Math.abs(t));
}

/** Mezcla dos hex en sRGB. Suficiente para una rampa de doce pasos visibles. */
function mix(a: string, b: string, t: number): string {
  const c = [0, 1, 2].map((i) => Math.round(chan(a, i) + (chan(b, i) - chan(a, i)) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const chan = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);

/** Luminancia relativa de la WCAG. */
function luminance(hex: string): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(chan(hex, 0)) + 0.7152 * f(chan(hex, 1)) + 0.0722 * f(chan(hex, 2));
}

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** El fondo del panel, sobre el que se apoyan las celdas del mapa. */
const PANEL = "#0e1528";

/** La tinta de las celdas: una sola, porque ninguna celda llega a ser clara. */
export const CELL_INK = "#f2ece0";

/**
 * El color de una celda del mapa: la rampa, apoyada sobre el fondo del panel.
 *
 * **Existe porque el texto encima no llegaba al piso de contraste**, y el
 * problema era estructural, no de elegir mejor la tinta. Una rampa divergente
 * cruza la luminancia media en algún punto, y ahí no hay tinta que sirva: medido,
 * con tinta oscura fija las doce celdas quedaban debajo de 4,5:1 (la peor en
 * 3,4), y eligiendo la mejor tinta por celda cinco seguían debajo.
 *
 * Bajando la rampa contra el fondo del panel, **ninguna celda llega a ser clara**
 * y una sola tinta clara pasa en las doce. El tono sigue diciendo de qué lado
 * está y la intensidad cuánto — que es todo lo que la escala tiene que decir.
 * Las muestras de la leyenda sí van a fuerza completa, porque ahí no hay texto
 * encima.
 */
export const cellColor = (delta: number): string => mix(PANEL, deltaColor(delta, 1.5), 0.62);

export { contrast };

const pct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;
const signed = (n: number, d = 2) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}`;

/* --------------------------------------------------------------------------
   Dispersión: lo que rinde contra lo que se compra
   -------------------------------------------------------------------------- */

const W = 300;
const H = 240;
/**
 * El margen es chico porque **acá adentro no va ni una palabra**.
 *
 * Los rótulos de eje y de cuadrante vivían dentro del SVG y se pisaban con las
 * marcas —y entre ellos—, así que se mudaron abajo como texto normal. Un SVG que
 * no tiene que reservar lugar para letras puede usar toda su caja para los datos.
 */
const PAD = { t: 10, r: 10, b: 10, l: 10 };

/** El lado del ícono de cada ítem, en unidades del viewBox. */
const ICON = 13;

/**
 * El tope del eje de ventaja, en puntos, y por qué está acotado.
 *
 * La distribución tiene colas largas y un centro apretado: los cuartiles caen en
 * −1,08 y +0,76, pero el peor ítem está en −9,6. Con el eje libre, ese único
 * punto estira la escala y **los otros 155 se aplastan contra el borde de
 * arriba** — medido en pantalla antes de acotarlo.
 *
 * En ±5 quedan afuera **3 de 156**. Esos tres se dibujan pegados al borde con su
 * propia marca y su número de verdad en el tooltip, y además son justo los que
 * la lista de trampas nombra con el valor exacto. Acotar la escala es una
 * decisión de dibujo; esconder el dato sería otra cosa.
 */
const CAP = 5;

/**
 * El uso va en escala logarítmica y eso no es capricho.
 *
 * Medido: el uso va de 0,57% a 47,8%, ochenta y cuatro veces, y **59 de los 156
 * ítems están debajo del 5%**. En lineal ese tercio de la lista se apila contra
 * el borde izquierdo y el cuadrante que más importa —el de los que rinden y nadie
 * compra— queda ilegible.
 */
const logX = (v: number, lo: number, hi: number) => {
  const l = Math.log(Math.max(v, lo));
  return PAD.l + ((l - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (W - PAD.l - PAD.r);
};

export function UsageVsEdge({ scatter, band }: { scatter: Scatter; band: string }) {
  const copy = useCopy();
  const c = copy.deadlock.itemsPage.charts;
  const { points, medianUsage } = scatter;
  if (points.length === 0) return null;

  const usos = points.map((p) => p.pickRate);
  const lo = Math.max(0.004, Math.min(...usos));
  const hi = Math.max(...usos);

  const x = (p: (typeof points)[number]) => logX(p.pickRate, lo, hi);
  const y = (d: number) =>
    PAD.t + ((CAP - Math.max(-CAP, Math.min(CAP, d))) / (CAP * 2)) * (H - PAD.t - PAD.b);

  const cero = y(0);
  const medianaX = logX(medianUsage, lo, hi);

  /**
   * Acá no hay nombres sobre los puntos, y se llegó midiendo.
   *
   * Con cinco se pisaban entre sí; con dos, el del mejor sleeper chocaba contra
   * el rótulo del cuadrante, que es justo el texto que enseña a leer el gráfico.
   * Entre las dos cosas gana el rótulo: las dos listas de abajo ya nombran diez
   * ítems **en orden y con su número**, así que el dibujo sólo tiene que mostrar
   * la forma y dónde cae cada cuadrante.
   */

  return (
    <figure className="dl-chart">
      <figcaption className="dl-chart-head">
        <h3 className="dl-chart-title">{c.scatter.title}</h3>
        <p className="detail-note dl-chart-note">{c.scatter.note}</p>
      </figcaption>

      <svg
        className="dl-scatter"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={c.scatter.alt(scatter.sleepers.length, scatter.traps.length, band)}
      >
        {/* Los ejes de referencia: el cero de ventaja y la mediana de uso. Van
            recesivos porque son la regla contra la que se leen las marcas, no
            un dato. */}
        <line className="dl-axis" x1={0} y1={cero} x2={W} y2={cero} />
        <line className="dl-axis" x1={medianaX} y1={0} x2={medianaX} y2={H} />

        {/* Los ítems se dibujan de peor a mejor, así que **el que más rinde queda
            arriba de la pila**: con 156 íconos de 13px en una caja de 300 hay
            solapamiento inevitable, y si alguno tiene que tapar a otro, que sea
            el que la página existe para señalar. */}
        {[...points]
          .sort((a, b) => a.delta - b.delta)
          .map((p) => (
            <image
              key={p.itemId}
              className="dl-mark"
              data-quad={p.quadrant}
              data-clipped={Math.abs(p.delta) > CAP}
              href={p.img}
              x={x(p) - ICON / 2}
              y={y(p.delta) - ICON / 2}
              width={ICON}
              height={ICON}
              preserveAspectRatio="xMidYMid meet"
            >
              <title>{`${p.name} · ${c.tip(signed(p.delta), pct(p.pickRate))}`}</title>
            </image>
          ))}
      </svg>

      {/* Las palabras, abajo y como texto de verdad. Adentro del dibujo se
          pisaban con los íconos y entre ellas, y encima no se podían seleccionar
          ni las agrandaba el zoom de texto del navegador. */}
      <div className="dl-scatter-key">
        <p className="dl-scatter-axis">
          <span>{c.scatter.xLow}</span>
          <span className="dl-scatter-arrow" aria-hidden="true">
            ←
          </span>
          {c.scatter.xAxis}
          <span className="dl-scatter-arrow" aria-hidden="true">
            →
          </span>
          <span>{c.scatter.xHigh}</span>
        </p>
        <ul className="dl-scatter-quads">
          <li data-quad="sleeper">{c.scatter.quadrants.sleeper}</li>
          <li data-quad="trap">{c.scatter.quadrants.trap}</li>
        </ul>
      </div>
    </figure>
  );
}

/* --------------------------------------------------------------------------
   Mapa de la tienda: precio x categoria
   -------------------------------------------------------------------------- */

export function ShopHeatmap({ cells }: { cells: ShopCell[] }) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.deadlock.itemsPage.charts;
  if (cells.length === 0) return null;

  const at = (cost: number, slot: Slot) => cells.find((x) => x.cost === cost && x.slot === slot);

  return (
    <figure className="dl-chart">
      <figcaption className="dl-chart-head">
        <h3 className="dl-chart-title">{c.heatmap.title}</h3>
        <p className="detail-note dl-chart-note">{c.heatmap.note}</p>
      </figcaption>

      {/* Una tabla de verdad y no una grilla de divs: son doce números con dos
          encabezados, que es exactamente lo que una tabla describe. De paso el
          lector de pantalla la recorre sin ayuda. */}
      <table className="dl-heat">
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">{c.heatmap.priceHeader}</span>
            </th>
            {SLOTS.map((s) => (
              <th key={s} scope="col">
                {copy.deadlock.itemsPage.slots[s]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COSTS.map((cost) => (
            <tr key={cost}>
              <th scope="row">{cost.toLocaleString(locale)}</th>
              {SLOTS.map((slot) => {
                const cell = at(cost, slot);
                if (!cell) return <td key={slot} className="dl-heat-cell" />;
                return (
                  <td
                    key={slot}
                    className="dl-heat-cell"
                    style={{ background: cellColor(cell.delta), color: CELL_INK }}
                    title={c.heatmap.tip(
                      cost.toLocaleString(locale),
                      copy.deadlock.itemsPage.slots[slot],
                      signed(cell.delta),
                      cell.n
                    )}
                  >
                    {signed(cell.delta, 1)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="dl-legend">
        <span className="dl-legend-swatch" style={{ background: NEG }} aria-hidden="true" />
        {c.legend.worse}
        <span className="dl-legend-swatch" style={{ background: MID }} aria-hidden="true" />
        {c.legend.par}
        <span className="dl-legend-swatch" style={{ background: POS }} aria-hidden="true" />
        {c.legend.better}
      </p>
    </figure>
  );
}

/* --------------------------------------------------------------------------
   Las dos listas que la dispersión señala, en texto
   -------------------------------------------------------------------------- */

/**
 * Los sleepers y las trampas, escritos.
 *
 * La dispersión los muestra pero hay que buscarlos con el ojo; acá están
 * nombrados y ordenados. Es también la vista de tabla que el gráfico necesita
 * para no depender del color.
 */
export function Callouts({ scatter }: { scatter: Scatter }) {
  const copy = useCopy();
  const c = copy.deadlock.itemsPage.charts;

  const lista = (items: Scatter["sleepers"], kind: "sleeper" | "trap") => (
    <div className="dl-callout" data-kind={kind}>
      <h3 className="dl-callout-title">{c.callouts[kind].title}</h3>
      <p className="detail-note dl-chart-note">{c.callouts[kind].note}</p>
      <ol className="dl-callout-list">
        {items.slice(0, 5).map((p) => (
          <li key={p.itemId}>
            {p.img && <img src={p.img} alt="" width={22} height={22} loading="lazy" />}
            <span className="dl-callout-name">{p.name}</span>
            <span className="dl-callout-num" data-kind={kind}>
              {signed(p.delta)}
            </span>
            <span className="dl-callout-use">{pct(p.pickRate)}</span>
          </li>
        ))}
      </ol>
    </div>
  );

  return (
    <div className="dl-callouts">
      {scatter.sleepers.length > 0 && lista(scatter.sleepers, "sleeper")}
      {scatter.traps.length > 0 && lista(scatter.traps, "trap")}
    </div>
  );
}
