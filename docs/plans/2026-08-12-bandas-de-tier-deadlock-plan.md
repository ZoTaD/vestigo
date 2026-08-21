# Bandas de tier en la tier list de Deadlock — plan de implementación

> **Para quien lo ejecute:** usar `superpowers:subagent-driven-development` o
> `superpowers:executing-plans` para ir tarea por tarea. Los pasos llevan
> checkbox (`- [ ]`) para marcarlos.

**Objetivo:** que la tier list de héroes de Deadlock se lea de un vistazo en un
monitor de 1080p, pasando de 2,6 a 22 héroes sobre el pliegue, y bajar los
íconos del orden de compra de 75 a ~57px.

**Arquitectura:** es 100% presentación. `Deadlock.tsx` cambia su lista de filas
por cinco bandas horizontales de tiles; el panel de build que hoy se despliega
dentro de la fila pasa a desplegarse debajo de la banda, a ancho completo, y
sigue montando `DeadlockBuildCard` y `DeadlockMastery` tal cual están. Nada del
pipeline, de los datos ni de las rutas se toca.

**Stack:** React 18 + TypeScript, Vite, vitest. CSS a mano en
`src/styles/codex.css` bajo `[data-theme="codex"]`.

**Diseño que lo manda:** `docs/design/2026-08-12-bandas-de-tier-deadlock-design.md`.
Leerlo antes de empezar.

## Restricciones globales

- **La raíz del tema son 19px, no 16.** `3rem` son 57px. Toda cuenta de tamaño
  sale de ahí (`src/styles/base.css`).
- **Toda la prosa vive en `src/i18n.ts` y sólo ahí**, en inglés y español. Nada
  de texto suelto en un componente.
- **El español es neutro latinoamericano, sin voseo.** "Abre", no "Abrí".
- **`.dl-fold`, `.dl-fold-inner` y `.dl-chevron` están COMPARTIDOS con
  `.dl-cost`**, los grupos de precio de `DeadlockItems.tsx:199-200`. Se quitan
  sólo las mitades `.dl-tier[data-open="false"]` de esos selectores. **Borrar la
  regla entera rompe la pestaña de ítems.**
- **No se toca el portal de `ConFicha`** (`DeadlockBuildCard.tsx:99-144`). Sigue
  haciendo falta porque `.dl-fold-inner` sigue existiendo en la pestaña de ítems.
- **No se toca `.topbar` ni `.switcher`**, que son de todas las páginas del sitio.
- Comandos: `npm --prefix games/tft/ui run test` (vitest) y
  `npm --prefix games/tft/ui run build` (chequea tipos con `tsc -b`).

---

### Tarea 1: Los íconos del orden de compra

Aislada del resto a propósito: es un cambio de una línea que se puede ver y
publicar sin esperar al rediseño.

**Archivos:**
- Modificar: `games/tft/ui/src/styles/codex.css:4456-4496`

**Interfaces:**
- Consume: nada.
- Produce: nada que otra tarea use.

- [ ] **Paso 1: Medir el tamaño actual, para tener contra qué comparar**

Con el servidor de desarrollo corriendo, abrir `/en/deadlock`, apretar el primer
héroe y evaluar en la consola del navegador:

```js
const r = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().width) : null; };
JSON.stringify({ buy: r('.dl-buy'), icon: r('.dl-buy-icon'), art: r('.dl-buy-art') });
```

Esperado: `{"buy":80,"icon":75,"art":80}`.

- [ ] **Paso 2: Bajar el ancho de la compra**

En `codex.css`, dentro de `[data-theme="codex"] .dl-buy`, reemplazar la última
declaración:

```css
  flex: 0 0 4.2rem;
```

por:

```css
  flex: 0 0 3.2rem;
```

- [ ] **Paso 3: Corregir el comentario, que documenta el número viejo**

El bloque de comentario que está justo arriba de `.dl-buy` explica por qué era
`4.2rem`. Reemplazar sus dos últimos párrafos (los que empiezan con "**El tope de
4rem existe" y "**Y está puesto justo arriba del caso más chico**") por:

```css
/**
 * **3,2rem son 60,8px, y el ícono queda en ~57px** — el mismo tamaño que el
 * retrato del tile de la tier list, así que las tres superficies que muestran
 * objetos dejan de contradecirse.
 *
 * **Bajó de 4,2rem el 2026-08-12**: a 79,8px el ícono daba 75px, que es el más
 * grande del sitio, y en un 24" a 1080p se leía como un cartel. Ojo: el sitio
 * dibuja los mismos píxeles en 1080p y en 1440p —`.deadlock` topea en 1400px—
 * así que lo que cambia es el tamaño FÍSICO: 91,8 PPI contra 108,8.
 *
 * **Lo que el número protege sigue valiendo**: el tramo de compras más cargado
 * que medimos tiene 11 tarjetas, y con 60,8px más 7,6 de hueco entran 19 por
 * renglón en el panel de 1.335px, así que ningún tramo se parte en dos. Ojo con
 * la cuenta: la raíz del tema son 19px, no 16.
 */
```

- [ ] **Paso 4: Verificar en pantalla, no en el DOM**

Recargar `/en/deadlock`, abrir un héroe y **mirar la captura** del panel "Orden
de compra". Después medir:

```js
const r = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().width) : null; };
const filas = new Set([...document.querySelectorAll('.dl-buy')].map(e => Math.round(e.getBoundingClientRect().top))).size;
JSON.stringify({ buy: r('.dl-buy'), icon: r('.dl-buy-icon'), renglones: filas });
```

Esperado: `buy` 61, `icon` ~57. **`renglones` tiene que dar 3** (uno por tramo);
si da más, algún tramo se partió y hay que subir el número.

- [ ] **Paso 5: Verificar el caso más cargado**

Abrir un héroe con muchas compras y confirmar que ningún tramo se parte:

```js
JSON.stringify([...document.querySelectorAll('.dl-phase')].map(p => ({
  compras: p.querySelectorAll('.dl-buy').length,
  renglones: new Set([...p.querySelectorAll('.dl-buy')].map(e => Math.round(e.getBoundingClientRect().top))).size
})));
```

Esperado: `renglones: 1` en los tres tramos.

- [ ] **Paso 6: Que no se haya roto nada**

```bash
npm --prefix games/tft/ui run test
```

Esperado: todos los tests en verde.

- [ ] **Paso 7: Commit**

```bash
git add games/tft/ui/src/styles/codex.css
git commit -m "fix(deadlock): los iconos del orden de compra bajan de 75 a 57px"
```

---

### Tarea 2: La banda de tier y el tile

Reemplaza la lista de filas por cinco bandas horizontales. El plegado se va con
ella: la banda ES el contenedor, y ya no hay nada que plegar.

**Archivos:**
- Modificar: `games/tft/ui/src/Deadlock.tsx` (borra `HeroRow` y `TierGroup`,
  agrega `HeroTile` y `TierBand`)
- Modificar: `games/tft/ui/src/styles/codex.css:1548-1620` y `:1944-1961`
- Test: `games/tft/ui/test/deadlock.test.ts`

**Interfaces:**
- Consume: `Hero`, `bandCrest`, `heroSlugs` de `deadlockData.ts` y
  `deadlockSlugs.ts`, sin cambios.
- Produce: `TierBand`, que recibe
  `{ tier: string; heroes: Hero[]; allHeroes: Hero[]; crest: ReturnType<typeof bandCrest>; abiertoSlug?: string; onHero: (slug?: string) => void }`.
  La Tarea 3 le agrega el panel adentro.

- [ ] **Paso 1: Escribir el test que falla**

Agregar en `games/tft/ui/test/deadlock.test.ts`, dentro del `describe("tierOf")`
que ya existe:

```ts
  /**
   * Las cinco bandas de la página salen de las cinco letras. Si algún día una
   * letra quedara vacía, la banda no se debe dibujar — y este test avisa antes
   * de que aparezca un riel con cero tiles.
   */
  it("reparte los 38 héroes en las cinco letras", () => {
    const heroes = buildHeroes(PUBLISHED_BAND, "en");
    const letras = [...new Set(heroes.map((h) => h.tier))].sort();
    expect(letras).toEqual(["A", "B", "C", "D", "S"]);
  });
```

- [ ] **Paso 2: Correrlo y ver que pasa (no que falla)**

```bash
npm --prefix games/tft/ui run test -- deadlock
```

Esperado: **PASA**. Es un test de regresión sobre datos que ya cumplen la
propiedad — fija el supuesto del que depende el layout, no describe código nuevo.
Si falla, **parar**: significa que los datos publicados ya no tienen cinco tiers
y el diseño de cinco bandas no aplica.

- [ ] **Paso 3: Reemplazar `HeroRow` por `HeroTile`**

En `Deadlock.tsx`, borrar la función `HeroRow` entera (líneas 66-165) y poner en
su lugar:

```tsx
/**
 * Un héroe dentro de su banda.
 *
 * **Sólo el retrato, el nombre y los dos números.** Todo lo demás —el puesto,
 * las etiquetas con su texto, la build— vive en el panel que se abre debajo de
 * la banda: en 66px de ancho no entra una palabra como "Subiendo".
 *
 * Las etiquetas se conservan como glifo en la esquina, con el mismo `title` y
 * el mismo número atrás que tenían de fila, que es la regla del proyecto — una
 * etiqueta sin el dato que la respalda es una opinión.
 */
function HeroTile({
  hero,
  open,
  onToggle,
}: {
  hero: Hero;
  open: boolean;
  onToggle: () => void;
}) {
  const copy = useCopy();

  return (
    <li className="dl-tile" data-open={open} data-thin={hero.thinData === true}>
      <button
        className="dl-tile-btn"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={copy.deadlock.buildCard.toggle(hero.name)}
      >
        <span className="dl-tile-face">
          {hero.img ? (
            <img src={hero.img} alt="" loading="lazy" width={57} height={57} />
          ) : (
            <span className="dl-portrait-fallback">{hero.name.slice(0, 2)}</span>
          )}

          {hero.difficulty && (
            <span
              className="dl-tile-mark"
              data-kind={hero.difficulty}
              title={`${copy.deadlock.difficulty[hero.difficulty]} — ${copy.deadlock.why.skillGap(
                signed(hero.skillGap)
              )}`}
            >
              <span aria-hidden="true">{hero.difficulty === "hard" ? "◆" : "◇"}</span>
            </span>
          )}

          {hero.momentum && (
            <span
              className="dl-tile-trend"
              data-kind={hero.momentum}
              title={`${copy.deadlock.momentum[hero.momentum]} — ${copy.deadlock.why.trend(
                signed(hero.trend)
              )}`}
            >
              <span aria-hidden="true">{hero.momentum === "up" ? "▲" : "▼"}</span>
            </span>
          )}
        </span>

        <span className="dl-tile-name">{hero.name}</span>
        <span className="dl-tile-wr">{pct(hero.winRate)}</span>
        <span className="dl-tile-pr">{pct(hero.pickRate)}</span>
      </button>
    </li>
  );
}
```

- [ ] **Paso 4: Reemplazar `TierGroup` por `TierBand`**

Borrar la función `TierGroup` entera y poner:

```tsx
/**
 * Una banda de tier: la letra en un riel a la izquierda y los héroes fluyendo a
 * la derecha.
 *
 * **Ya no se pliega.** Plegar existía porque la página medía cinco pantallas de
 * scroll; con las cinco bandas en 621px no hay nada que esconder, y de paso el
 * motivo por el que el contenido se montaba plegado —que Ctrl+F y Google lo
 * encontraran— se cumple solo.
 *
 * **Medido: a 1400px cada banda entra en un solo renglón de tiles** (la más
 * grande es D, con 16 de los 38 héroes). Eso es lo que deja que el panel se
 * abra "debajo de la banda" y quede pegado al tile que se apretó, sin que
 * ningún JavaScript mida dónde cayó.
 */
function TierBand({
  tier,
  heroes,
  allHeroes,
  crest,
  abiertoSlug,
  onHero,
}: {
  tier: string;
  heroes: Hero[];
  allHeroes: Hero[];
  crest: ReturnType<typeof bandCrest>;
  abiertoSlug?: string;
  onHero: (slug?: string) => void;
}) {
  const { lang } = useLang();

  return (
    <section className="tier-group dl-band" data-tier={tier}>
      <div className="dl-rail">
        <span className="tier-mark">{tier}</span>
        <span className="dl-crest">
          {crest.badges.map((b) => (
            <img key={b.img} src={b.img} alt={text(b.name, lang)} width={22} height={22} loading="lazy" />
          ))}
          {crest.suffix && <span className="dl-crest-sign">{crest.suffix}</span>}
        </span>
        <span className="tier-count">{heroes.length}</span>
      </div>

      <ol className="dl-tiles">
        {heroes.map((h) => {
          const slug = heroSlugs.toSlug.get(String(h.heroId));
          return (
            <HeroTile
              key={h.heroId}
              hero={h}
              open={!!slug && slug === abiertoSlug}
              onToggle={() => onHero(slug === abiertoSlug ? undefined : slug)}
            />
          );
        })}
      </ol>
    </section>
  );
}
```

`allHeroes` queda en las props sin usarse todavía: la Tarea 3 lo necesita para
el puesto del héroe en el panel. Dejarlo declarado ahora evita cambiar la firma
dos veces.

- [ ] **Paso 5: Cambiar el render para usar `TierBand`**

En el `export default function Deadlock`, reemplazar el bloque
`{!enParches && TIER_ORDER.map(...)}` por:

```tsx
          {!enParches &&
            TIER_ORDER.map((tier) => {
              const heroes = meta.heroes.filter((h) => h.tier === tier);
              if (heroes.length === 0) return null;
              return (
                <TierBand
                  key={tier}
                  tier={tier}
                  heroes={heroes}
                  allHeroes={meta.heroes}
                  crest={crest}
                  abiertoSlug={open}
                  onHero={onOpen}
                />
              );
            })}
```

- [ ] **Paso 6: Borrar el estado del plegado**

Borrar de `Deadlock.tsx`:

- la constante `OPEN_BY_DEFAULT` y su comentario
- `const [abiertos, setAbiertos] = useState<Set<string>>(...)` y `alternarTier`
- `const heroTier = ...` y `const abiertosEfectivo = ...` con su comentario
- el import de `useState` si ya no queda ningún uso (lo verifica `tsc`)

- [ ] **Paso 7: CSS de la banda y el tile**

En `codex.css`, reemplazar el bloque que va desde el comentario
`/* Deadlock: la tier list de héroes ---` (línea 1548) hasta el cierre de
`.dl-stats` (línea 1619) por:

```css
/* Deadlock: la tier list de héroes -----------------------------------------
   Cinco bandas horizontales: la letra en un riel a la izquierda y los héroes
   fluyendo a la derecha. Reemplazó a la lista de filas el 2026-08-12, porque en
   un 1080p la lista mostraba 2,6 héroes en la primera pantalla contra 7,1 en un
   1440p — el sitio dibuja los mismos píxeles en los dos, así que lo que faltaba
   era presupuesto vertical, no ancho.

   `.dl-rank`, `.dl-identity`, `.dl-name`, `.dl-chips` y `.dl-stats` NO se
   borraron: eran de la fila y ahora son la cabecera del panel que se abre.
--------------------------------------------------------------------------- */

[data-theme="codex"] .dl-band {
  display: grid;
  grid-template-columns: 4rem 1fr;
  align-items: stretch;
  border: 1px solid rgba(201, 162, 74, 0.18);
  border-radius: 3px;
  margin-bottom: 0.5rem;
  background: linear-gradient(90deg, rgba(201, 162, 74, 0.05), transparent 30%);
}

[data-theme="codex"] .dl-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  padding: 0.4rem 0;
  border-right: 1px solid rgba(201, 162, 74, 0.2);
}

[data-theme="codex"] .dl-tiles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  list-style: none;
  margin: 0;
  padding: 0.55rem 0.7rem;
}

/* Ancho FIJO, no elástico. Con `1fr` cada tile crecería con la banda y la D de
   16 héroes dibujaría tiles de la mitad del tamaño que la C de 2 — las cinco
   bandas tienen que leerse como la misma cosa. Es el mismo error que ya se pagó
   con los íconos de la build creciendo a 160px en pantalla ancha. */
[data-theme="codex"] .dl-tile {
  width: 3.5rem;
}

[data-theme="codex"] .dl-tile-btn {
  display: grid;
  justify-items: center;
  gap: 0.1rem;
  width: 100%;
  padding: 0;
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: center;
}

/* Una muestra fina no se esconde, se apaga: sigue siendo un dato, con menos voz. */
[data-theme="codex"] .dl-tile[data-thin="true"] {
  opacity: 0.62;
}

[data-theme="codex"] .dl-tile-face {
  position: relative;
  display: block;
}

[data-theme="codex"] .dl-tile-face img,
[data-theme="codex"] .dl-tile-face .dl-portrait-fallback {
  display: block;
  width: 3rem;
  height: 3rem;
  border-radius: 4px;
  object-fit: cover;
  border: 1px solid rgba(201, 162, 74, 0.4);
  background: rgba(8, 13, 26, 0.6);
}

[data-theme="codex"] .dl-tile[data-open="true"] .dl-tile-face img,
[data-theme="codex"] .dl-tile[data-open="true"] .dl-tile-face .dl-portrait-fallback {
  border-color: var(--gold-lit);
  box-shadow: 0 0 0 1px rgba(201, 162, 74, 0.5);
}

/* Los glifos van en las esquinas del retrato y no debajo: el alto del tile es
   lo que decide cuántos héroes entran en la pantalla, y una etiqueta no vale
   una banda entera de scroll. */
[data-theme="codex"] .dl-tile-mark,
[data-theme="codex"] .dl-tile-trend {
  position: absolute;
  top: -2px;
  font-size: 0.5rem;
  line-height: 1;
  padding: 2px;
  border-radius: 3px;
  background: rgba(8, 13, 26, 0.85);
}

[data-theme="codex"] .dl-tile-mark { left: -2px; color: var(--gold-lit); }
[data-theme="codex"] .dl-tile-trend { right: -2px; }
[data-theme="codex"] .dl-tile-trend[data-kind="up"] { color: #7bba1d; }
[data-theme="codex"] .dl-tile-trend[data-kind="down"] { color: #e0483c; }

[data-theme="codex"] .dl-tile-name {
  width: 100%;
  font-family: "Cinzel", serif;
  font-size: 0.52rem;
  letter-spacing: 0.02em;
  color: var(--vellum);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

[data-theme="codex"] .dl-tile-wr {
  font-family: "Barlow Condensed", system-ui, sans-serif;
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1;
  color: var(--gold-lit);
  font-variant-numeric: tabular-nums;
}

[data-theme="codex"] .dl-tile-pr {
  font-size: 0.55rem;
  line-height: 1;
  color: var(--vellum-dim);
  font-variant-numeric: tabular-nums;
}

[data-theme="codex"] .dl-stats {
  display: flex;
  gap: 1.5rem;
  align-items: baseline;
}
```

- [ ] **Paso 8: Quitar sólo la mitad `.dl-tier` de los selectores compartidos**

En `codex.css`, en las tres reglas que nombran a `.dl-tier` y a `.dl-cost`
juntos (líneas ~1947, ~1958), borrar **únicamente** la línea del `.dl-tier`.
Quedan así:

```css
[data-theme="codex"] .dl-cost[data-open="false"] .dl-chevron {
  transform: rotate(-90deg);
}
```

```css
[data-theme="codex"] .dl-cost[data-open="false"] .dl-fold {
  grid-template-rows: 0fr;
}
```

**`.dl-fold`, `.dl-fold-inner` y `.dl-chevron` NO se tocan**: los usa
`DeadlockItems.tsx:199-200`.

- [ ] **Paso 9: Compilar y correr los tests**

```bash
npm --prefix games/tft/ui run build
```

Esperado: sin errores de tipo. `tsc` es lo que avisa si quedó un import o una
variable del plegado sin usar.

```bash
npm --prefix games/tft/ui run test
```

Esperado: todo en verde, incluidos `pageMeta`, `route`, `sitemap` y `prerender`
**sin haberlos tocado**. Si alguno falla, el rediseño se metió con las rutas.

- [ ] **Paso 10: Verificar EN PANTALLA, a 1920×950**

Abrir `/en/deadlock` con el viewport en 1920×950 y **mirar la captura**. Después
medir cuántas bandas entran y que cada una sea un renglón:

```js
const bandas = [...document.querySelectorAll('.dl-band')];
JSON.stringify({
  renglonesPorBanda: bandas.map(b => b.dataset.tier + ':' +
    new Set([...b.querySelectorAll('.dl-tile')].map(t => Math.round(t.getBoundingClientRect().top))).size),
  primerTile: Math.round(document.querySelector('.dl-tile').getBoundingClientRect().top + scrollY),
  tile: (() => { const r = document.querySelector('.dl-tile').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(),
  sobreElPliegue: [...document.querySelectorAll('.dl-tile')].filter(t => t.getBoundingClientRect().bottom <= 950).length
});
```

Esperado: `renglonesPorBanda` todos en `:1`, `tile` cerca de `[66,101]`.
`sobreElPliegue` va a dar bajo todavía porque el encabezado sigue midiendo
345px — eso lo arregla la Tarea 4.

- [ ] **Paso 11: Verificar que la pestaña de ítems sigue plegando**

Abrir `/en/deadlock/items`, apretar un grupo de precio y **mirar** que se plegue
y se despliegue con su animación. Es la regresión que puede haber causado el
Paso 8.

- [ ] **Paso 12: Commit**

```bash
git add games/tft/ui/src/Deadlock.tsx games/tft/ui/src/styles/codex.css games/tft/ui/test/deadlock.test.ts
git commit -m "feat(deadlock): la tier list de heroes pasa a bandas de tier"
```

---

### Tarea 3: El panel que se abre debajo de la banda

**Archivos:**
- Modificar: `games/tft/ui/src/Deadlock.tsx` (agrega `HeroPanel`, lo monta en `TierBand`)
- Modificar: `games/tft/ui/src/styles/codex.css` (agrega `.dl-band-panel` y su caret)

**Interfaces:**
- Consume: `TierBand` de la Tarea 2, con su prop `allHeroes` ya declarada.
- Produce: `HeroPanel`, que recibe `{ hero: Hero; rank: number }`.

- [ ] **Paso 1: Escribir `HeroPanel`**

Agregar en `Deadlock.tsx`, arriba de `TierBand`:

```tsx
/**
 * El héroe abierto: su ficha completa y su build.
 *
 * **Es donde vive todo lo que no entra en un tile de 66px** — el puesto, las
 * etiquetas con su texto entero, el pickrate rotulado. Adentro va lo que ya
 * existía en la fila desplegable, sin tocarlo.
 *
 * El `scrollIntoView` es para el teléfono: ahí la banda D se parte en seis
 * renglones y el panel puede abrirse lejos del tile que se apretó. `block:
 * "nearest"` no mueve nada si ya se ve, así que en escritorio no hace nada.
 */
function HeroPanel({ hero, rank }: { hero: Hero; rank: number }) {
  const copy = useCopy();
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    caja.current?.scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <div className="dl-band-panel" ref={caja}>
      <header className="dl-panel-id">
        <span className="dl-rank">{String(rank).padStart(2, "0")}</span>

        {hero.img && <img className="dl-panel-face" src={hero.img} alt="" width={64} height={64} />}

        <span className="dl-identity">
          <span className="dl-name">{hero.name}</span>
          <span className="dl-chips">
            {hero.difficulty && (
              <span
                className="dl-chip"
                data-kind={hero.difficulty}
                title={copy.deadlock.why.skillGap(signed(hero.skillGap))}
              >
                {copy.deadlock.difficulty[hero.difficulty]}
              </span>
            )}
            {hero.momentum && (
              <span
                className="dl-chip"
                data-kind={hero.momentum}
                title={copy.deadlock.why.trend(signed(hero.trend))}
              >
                <span aria-hidden="true">{hero.momentum === "up" ? "▲" : "▼"}</span>{" "}
                {copy.deadlock.momentum[hero.momentum]}
              </span>
            )}
            {hero.thinData && (
              <span className="dl-chip" data-kind="thin" title={copy.deadlock.thinWhy}>
                {copy.deadlock.thin}
              </span>
            )}
          </span>
        </span>

        <span className="stats dl-stats">
          <span className="stat stat-primary">
            <span className="stat-value">{pct(hero.winRate)}</span>
            <span className="stat-label">{copy.deadlock.stats.winRate}</span>
          </span>
          <span className="stat">
            <span className="stat-value">{pct(hero.pickRate)}</span>
            <span className="stat-label">{copy.deadlock.stats.pickRate}</span>
          </span>
        </span>
      </header>

      <DeadlockBuildCard heroId={hero.heroId} heroWinRate={hero.winRate} />
      <DeadlockMastery heroId={hero.heroId} />
    </div>
  );
}
```

Agregar `useEffect` y `useRef` al import de React que ya está arriba del archivo:

```tsx
import { useEffect, useRef } from "react";
```

(Si el Paso 6 de la Tarea 2 dejó el import vacío, esta es la línea entera.)

- [ ] **Paso 2: Montarlo dentro de `TierBand`**

En `TierBand`, calcular el héroe abierto y dibujarlo después del `<ol>`:

```tsx
  const abierto = heroes.find(
    (h) => heroSlugs.toSlug.get(String(h.heroId)) === abiertoSlug
  );
```

y justo antes de cerrar el `</section>`:

```tsx
      {abierto && <HeroPanel hero={abierto} rank={allHeroes.indexOf(abierto) + 1} />}
```

- [ ] **Paso 3: CSS del panel**

Agregar en `codex.css`, después del bloque de `.dl-tile-pr`:

```css
/* El panel cruza las dos columnas de la banda: el riel de la letra es la
   primera, así que sin esto caería adentro del riel. */
[data-theme="codex"] .dl-band-panel {
  grid-column: 1 / -1;
  position: relative;
  padding: 1rem 0.9rem 0.9rem;
  border-top: 1px solid rgba(201, 162, 74, 0.2);
  background: rgba(0, 0, 0, 0.22);
}

[data-theme="codex"] .dl-panel-id {
  display: grid;
  grid-template-columns: 2rem 3.4rem minmax(7rem, 1fr) auto;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.9rem;
}

[data-theme="codex"] .dl-panel-face {
  width: 3.4rem;
  height: 3.4rem;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid rgba(201, 162, 74, 0.4);
}

@media (max-width: 40rem) {
  [data-theme="codex"] .dl-panel-id {
    grid-template-columns: 2rem 2.6rem 1fr;
    gap: 0.6rem;
  }

  /* Los números se van al renglón de abajo, a lo ancho: en 375px no entran al
     lado del nombre sin partirlo. */
  [data-theme="codex"] .dl-panel-id .dl-stats {
    grid-column: 1 / -1;
    justify-content: space-around;
  }
}
```

- [ ] **Paso 4: Compilar**

```bash
npm --prefix games/tft/ui run build
```

Esperado: sin errores de tipo.

- [ ] **Paso 5: Verificar EN PANTALLA que abre donde tiene que abrir**

Con el viewport en 1920×950, apretar un héroe de tier S y **mirar la captura**.
Tiene que verse: el tile marcado con borde dorado, y el panel inmediatamente
debajo de esa banda, a ancho completo, con la build adentro.

Después medir que el panel esté pegado a la banda del héroe y no a otra:

```js
const abierto = document.querySelector('.dl-tile[data-open="true"]');
const panel = document.querySelector('.dl-band-panel');
JSON.stringify({
  bandaDelTile: abierto.closest('.dl-band').dataset.tier,
  bandaDelPanel: panel.closest('.dl-band').dataset.tier,
  distancia: Math.round(panel.getBoundingClientRect().top - abierto.getBoundingClientRect().bottom)
});
```

Esperado: las dos bandas iguales y `distancia` menor a 40px.

- [ ] **Paso 6: Verificar el link directo**

Abrir `/en/deadlock/mirage` (tier D) directo, sin pasar por la lista. **Mirar**
que el panel de Mirage esté abierto y a la vista. Antes esto necesitaba forzar
el grupo visible; ahora no hay nada plegado, así que tiene que salir solo.

- [ ] **Paso 7: Correr los tests**

```bash
npm --prefix games/tft/ui run test
```

Esperado: todo en verde.

- [ ] **Paso 8: Commit**

```bash
git add games/tft/ui/src/Deadlock.tsx games/tft/ui/src/styles/codex.css
git commit -m "feat(deadlock): la build se despliega debajo de la banda del heroe"
```

---

### Tarea 4: El encabezado comprimido

Es la tarea que de verdad mueve el número: 345px de los 731 que hay antes del
primer héroe.

**Archivos:**
- Modificar: `games/tft/ui/src/Deadlock.tsx` (el bloque `.tool-head`)
- Modificar: `games/tft/ui/src/DeadlockBandPicker.tsx` (pastillas en vez de botón + select)
- Modificar: `games/tft/ui/src/styles/codex.css:1996-2090`

**Interfaces:**
- Consume: `BANDS`, `PUBLISHED_BAND`, `bandBadge` de `deadlockData.ts`, sin cambios.
- Produce: nada nuevo. `DeadlockBandPicker` conserva su firma
  `{ band: BandId; onChange: (band: BandId) => void }`.

- [ ] **Paso 1: Las cuatro bandas como pastillas**

Reemplazar el `<div className="band-controls">` entero de
`DeadlockBandPicker.tsx` (líneas 35-65) por:

```tsx
      {/* Las cuatro en línea, como pastillas. Antes eran un botón para la banda
          publicada y un `<select>` para las otras tres, que ocupaba dos
          renglones y escondía tres de las cuatro opciones detrás de un click.
          Siguen siendo botones de verdad, con `aria-pressed`, así que el
          teclado y el lector de pantalla no pierden nada. */}
      <div className="band-controls dl-band-pills" role="group" aria-label={copy.deadlock.ranks.filter}>
        {BANDS.map((b) => {
          const insignia = bandBadge(b.id);
          return (
            <button
              key={b.id}
              className="dl-band-pill"
              data-active={band === b.id}
              aria-pressed={band === b.id}
              onClick={() => onChange(b.id)}
            >
              {insignia.img && (
                <img className="dl-band-badge" src={insignia.img} alt="" width={20} height={20} />
              )}
              {copy.deadlock.bands[b.id]}
            </button>
          );
        })}
      </div>
```

Borrar las variables `principal` y `elegida`, que ya no se usan, y **sacar
`PUBLISHED_BAND` del import**, que queda huérfano — la versión de pastillas
recorre `BANDS` entero y no necesita saber cuál es la publicada. La primera
línea del import queda:

```tsx
import { BANDS, bandBadge, type BandId } from "./deadlockData";
```

- [ ] **Paso 2: Fundir las notas del encabezado en una línea**

En `Deadlock.tsx`, dentro de `<div className="tool-controls">`, reemplazar los
dos `<p className="detail-note dl-sample">`, el `<p className="detail-note dl-since">`
y el `<p className="dl-fallback">` por:

```tsx
              {/* Una sola línea de metadatos en vez de tres notas apiladas más
                  un aviso: las cuatro juntas medían 167px de los 345 del
                  encabezado, y ninguna es la respuesta que se vino a buscar. */}
              <p className="detail-note dl-meta-line">
                {insignia.img && <img src={insignia.img} alt="" width={18} height={18} />}
                {meta.file.matches === 0
                  ? copy.deadlock.emptyBand
                  : `${copy.deadlock.sample(
                      meta.file.matches.toLocaleString(locale),
                      meta.file.from,
                      meta.file.to
                    )} · ${copy.deadlock.patch.since(meta.file.patch.title)}`}
              </p>

              {/* Mientras lo publicado no sea Fantasma+. Se apaga solo. */}
              {ON_FALLBACK_BAND && (
                <p className="detail-note dl-fallback">
                  {insigniaPublicada.img && (
                    <img src={insigniaPublicada.img} alt="" width={18} height={18} />
                  )}
                  <span>{copy.deadlock.fallback(copy.deadlock.bands[PUBLISHED_BAND])}</span>
                </p>
              )}

              {meta.file.provisional && meta.file.matches > 0 && (
                <p className="dl-provisional">{copy.deadlock.patch.provisional}</p>
              )}
```

**No se agrega ni una clave de i18n**: la línea se compone con `sample` y
`patch.since`, que ya existen en los dos idiomas.

- [ ] **Paso 3: NO tocar el eyebrow del JSX**

**Verificado: las cinco pestañas de Deadlock lo dibujan** — `Deadlock.tsx:441`,
`DeadlockItems.tsx:275`, `DeadlockPlayer.tsx:222`, `DeadlockRanks.tsx:66` y
`DeadlockReport.tsx:533`. Sacarlo de una sola las descoloca entre sí, y sacarlo
de las cinco es una decisión de producto que este pedido no incluye. Se le baja
el margen por CSS en el Paso 4 y listo.

Si el Paso 6 no llega al presupuesto, **ahí** se evalúa sacarlo de las cinco: son
~33px y es el único recorte grande que queda sin tocar nada compartido con TFT.

- [ ] **Paso 4: CSS del encabezado**

Las tres reglas se **modifican en su lugar**; ninguna se duplica.

En `[data-theme="codex"] .tool-head` (línea ~1999), cambiar el hueco. **Ojo: la
declaración que está es `gap: 1.6rem 3rem`** — hay que conservar los `3rem` de
la columna, o el título y los controles se pegan:

```css
  gap: 0.9rem 3rem;
```

En `[data-theme="codex"] .tool-head .eyebrow` (línea ~2019), reemplazar su única
declaración por:

```css
  margin-bottom: 0.25rem;
  font-size: 0.58rem;
```

En `[data-theme="codex"] .tool-head .standfirst` (línea ~2045), reemplazar el
bloque entero por:

```css
/* El encabezado de una pestaña que se USA, no de una página de aterrizaje. La
   bajada se recorta a dos renglones el 2026-08-12: con 731px de cromo arriba, un
   1080p mostraba 2,6 héroes en la primera pantalla. Sigue estando entera en el
   HTML —Google la lee— pero deja de costar media pantalla. */
[data-theme="codex"] .tool-head .standfirst {
  max-width: 46ch;
  margin: 0.5rem 0 0;
  font-size: 0.72rem;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

Y agregar, después de esa regla:

```css
[data-theme="codex"] .dl-band-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

[data-theme="codex"] .dl-band-pill {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.28rem 0.5rem;
  border: 1px solid rgba(201, 162, 74, 0.35);
  border-radius: 3px;
  background: none;
  color: var(--vellum-dim);
  font-family: "Barlow Condensed", system-ui, sans-serif;
  font-size: 0.66rem;
  letter-spacing: 0.04em;
  cursor: pointer;
}

[data-theme="codex"] .dl-band-pill[data-active="true"] {
  background: rgba(201, 162, 74, 0.16);
  border-color: var(--gold-lit);
  color: var(--vellum);
}

[data-theme="codex"] .dl-meta-line,
[data-theme="codex"] .tool-head .dl-fallback {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.6rem;
  line-height: 1.35;
}
```

- [ ] **Paso 5: Compilar y correr los tests**

```bash
npm --prefix games/tft/ui run build && npm --prefix games/tft/ui run test
```

Esperado: sin errores de tipo y todo en verde.

- [ ] **Paso 6: Medir si se cumplió el presupuesto**

Con el viewport en 1920×950, en `/en/deadlock`:

```js
const y = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; };
JSON.stringify({
  toolHead: Math.round(document.querySelector('.tool-head').getBoundingClientRect().height),
  primerTile: y('.dl-tile'),
  sobreElPliegue: [...document.querySelectorAll('.dl-tile')].filter(t => t.getBoundingClientRect().bottom <= 950).length,
  alto: document.documentElement.scrollHeight
});
```

**Criterio de aceptación:** `toolHead` ≤ 145, `primerTile` ≤ 435 y
`sobreElPliegue` ≥ 20.

Si `sobreElPliegue` da menos de 20, **no achicar el tile**: el presupuesto está
en el encabezado. En orden, las palancas que quedan son (1) sacar el eyebrow de
las cinco pestañas de Deadlock, ~33px, que es lo que el Paso 3 dejó reservado, y
(2) recortar la bajada a un renglón en vez de dos. Recién si ninguna alcanza se
discute el tile, y eso vuelve a ZoTaD.

- [ ] **Paso 7: Verificar las OTRAS CUATRO pestañas de Deadlock**

`.tool-head`, `.eyebrow` y `.standfirst` los comparten cinco páginas, y
`DeadlockBandPicker` dos. **Mirar** las cuatro que este plan no rediseña:

- `/en/deadlock/items` — además de la cabecera, que las pastillas se dibujen y
  que cambiar de banda siga recargando los ítems
- `/en/deadlock/ranks`
- `/en/deadlock/player`
- `/en/deadlock/patches`

En las cuatro: que el título y la bajada no se solapen y que la bajada no quede
recortada dejando una frase sin sentido. **Ninguna página de TFT se toca** — el
CSS de `.tool-head` es de las pestañas de herramienta, no del sitio entero;
confirmarlo abriendo `/en/tft/meta`.

- [ ] **Paso 8: Commit**

```bash
git add games/tft/ui/src/Deadlock.tsx games/tft/ui/src/DeadlockBandPicker.tsx games/tft/ui/src/styles/codex.css
git commit -m "feat(deadlock): el encabezado de la tier list baja de 345 a ~110px"
```

---

### Tarea 5: Verificación final, y los dos casos que los datos no dejan ver

**Archivos:** ninguno, salvo que algo falle.

- [ ] **Paso 1: Los glifos que hoy nadie dispara**

**Medido el 2026-08-12: 0 de 38 héroes tienen `trend` y 0 tienen `thinData`.**
El glifo ▲▼ y el atenuado del tile **no se pueden ver con los datos publicados**.
Para no publicarlos sin que nadie los haya mirado, forzarlos a mano en la
consola y **mirar la captura**:

```js
const t = document.querySelector('.dl-tile');
t.dataset.thin = 'true';
const g = document.createElement('span');
g.className = 'dl-tile-trend'; g.dataset.kind = 'up'; g.textContent = '▲';
t.querySelector('.dl-tile-face').appendChild(g);
```

Confirmar que el triángulo se ve, es verde, está en la esquina y **no tapa el
retrato**, y que el tile atenuado se distingue del de al lado. Después recargar.

- [ ] **Paso 2: Teléfono**

Poner el viewport en 375×812 y **mirar** `/en/deadlock`:

```js
JSON.stringify({
  renglones: [...document.querySelectorAll('.dl-band')].map(b => b.dataset.tier + ':' +
    new Set([...b.querySelectorAll('.dl-tile')].map(t => Math.round(t.getBoundingClientRect().top))).size),
  desborda: document.documentElement.scrollWidth > window.innerWidth
});
```

Esperado: `desborda: false`. La banda D va a dar 6 renglones y está previsto.
Apretar un héroe de D y confirmar que el `scrollIntoView` deja el panel a la
vista.

- [ ] **Paso 3: Los dos idiomas**

Abrir `/es/deadlock` y **mirar** que las pastillas, los nombres de héroe y la
línea de metadatos estén en español y no desborden — "Arcanista y abajo" es la
más larga.

- [ ] **Paso 4: La suite entera, una vez más**

```bash
npm --prefix games/tft/ui run build && npm --prefix games/tft/ui run test
```

- [ ] **Paso 5: Anotar el resultado real en el diseño**

Agregar al final de `docs/design/2026-08-12-bandas-de-tier-deadlock-design.md`
una sección "Lo que dio al implementarlo" con los números medidos de verdad:
alto del `tool-head`, `y` del primer tile y héroes sobre el pliegue. **Si no
coinciden con lo proyectado, va el número real y por qué difiere** — el
documento tiene que poder releerse dentro de seis meses sin mentir.

- [ ] **Paso 6: Commit**

```bash
git add docs/design/2026-08-12-bandas-de-tier-deadlock-design.md
git commit -m "docs(deadlock): lo que dieron las bandas de tier al implementarlas"
```

- [ ] **Paso 7: Publicar, sólo con el visto bueno**

`main` publica solo en Netlify con cada push. **No empujar hasta que ZoTaD
haya visto la página funcionando.**

```bash
git push
```

---

## Riesgos que este plan no cierra

- **`.dl-tile-name` a 0,52rem son 9,9px.** Es chico y es a propósito, pero es lo
  primero a mirar en la captura. Si no se lee, la salida es subir el tile a dos
  renglones de nombre, no achicar más.
- **Sólo "The Doorman" pasa de 10 caracteres** de los 38, así que el recorte con
  elipsis afecta a un tile. Verificarlo en él.
- **El comentario de `test/deadlock.test.ts:184` dice "±2 etiqueta 17"**, que es
  un número viejo: hoy son 12. Corregirlo al pasar por ahí en la Tarea 2.
