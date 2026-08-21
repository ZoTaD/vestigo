# La tier list de héroes de Deadlock, en bandas de tier

**Fecha:** 2026-08-12
**Estado:** diseñado, sin implementar
**Pedido de ZoTaD.** Dos cosas en el mismo pedido: los íconos de ítems se ven
grandes en un monitor de 24" a 1080p, y el meta de la tier list tiene que
mostrarse más legible.

Todo número con un "medido" adelante se midió sobre la página real corriendo en
`localhost:5173`, con viewport de **1920×950** —un 1080p maximizado— o sobre una
maqueta a tamaño real con los 38 héroes y los datos de Arconte/Oráculo del
2026-08-11. Nada acá está estimado a ojo.

## El diagnóstico, que no era el que parecía

**En 1080p y en 1440p el sitio dibuja exactamente los mismos píxeles.**
`.deadlock` topea en `max-width: 1400px` (`base.css:1183`), así que de 1920 para
arriba el ancho no cambia nada. Lo que cambia son dos cosas, y las dos son
reales:

- **Tamaño físico.** Un 24" 1080p son 91,8 PPI contra 108,8 de un 27" 1440p:
  todo se ve **18,5% más grande** en el monitor chico, y los 1400px de contenido
  miden 15,2 pulgadas ahí contra 12,9 en el otro.
- **Presupuesto vertical.** El viewport pasa de ~1330px a ~950px.

**Medido: el primer héroe cae en y=731.** O sea que **el 77% de la primera
pantalla de un 1080p es encabezado**, y entran **2,6 filas de héroe**. En un
1440p entran 7,1. Ese es el motivo por el que el problema no se veía desde el
monitor en el que se diseñó.

El desglose de esos 731px:

| Tramo | px |
|---|---|
| Aire arriba de la barra | 76 |
| `.topbar` | 53 |
| Aire | 41 |
| `.switcher` (pestañas de juego) | 66 |
| Aire | 38 |
| `.tool-head` (título, controles, 3 notas, aviso de banda) | 345 |
| `.dl-tier-head` | 72 |
| **Primera fila de héroe** | **731** |

**La consecuencia de diseño es que achicar la fila casi no sirve.** Bajar la fila
de 84 a 52px sin tocar el encabezado sube de 2,6 a 4,2 héroes: sigue siendo una
página que hay que scrollear para contestar su propia pregunta. La palanca está
en los 731px, no en los 84.

La página entera mide **5.539px** con C y D plegados, y abrir un héroe suma
**1.583px** más — 1,7 pantallas de 1080p.

## Las tres formas que se compararon, medidas

Se maquetaron las tres a tamaño real con los 38 héroes, y se contó cuántos
quedaban arriba del pliegue:

| | Héroes sobre el pliegue | Alto en la maqueta |
|---|---|---|
| Hoy | 2,6 | 5.539px (página real) |
| **A** — la misma lista, comprimida | 12 | 2.409px |
| **B** — bandas de tier | **38** | **811px** |
| **C** — dos columnas | 22 | 1.373px |

> La columna de alto es de la **maqueta comparativa**, que lleva su propio
> encabezado y no el del sitio: sirve para comparar las tres entre sí, no para
> predecir la página. El número que vale para la página está más abajo, en "Lo
> que entra en la primera pantalla". B se volvió a medir después, ya con la
> segunda línea de pickrate: **621px de bandas**.

**Se eligió B.** Tres motivos:

1. Es la única que contesta la pregunta de la página —quién es mejor— sin
   scrollear.
2. **Medido: 16 de los 38 héroes están en D y sólo 2 en C.** La lista está
   cargada abajo. En A y C hay que pasar 16 filas de D scrolleando; en B la D es
   un bloque que se ve y se saltea.
3. Es la forma que se reconoce como "tier list", y el sitio pelea por esa
   consulta.

## El hecho del que depende el desplegable

**Medido: a 1400px cada banda entra en un solo renglón de tiles.** Se probó a
seis anchos, contando renglones distintos por banda:

| Ancho | S | A | B | C | D |
|---|---|---|---|---|---|
| 1400 | 1 | 1 | 1 | 1 | **1** |
| 1200 · 980 · 760 | 1 | 1 | 1 | 1 | 2 |
| 560 | 1 | 2 | 1 | 1 | 3 |
| 375 | 2 | 3 | 2 | 1 | 6 |

Esto es lo que hace que el panel de build pueda abrirse **debajo de la banda**
sin que ningún JavaScript mida dónde cayó el tile: en escritorio "debajo de la
banda" es literalmente debajo del tile que se apretó. Es el mismo criterio que
ya usa el plegado actual, que anima con `grid-template-rows: 0fr → 1fr`
justamente para no medir nada.

**La que rompe primero es D**, porque tiene 16 héroes. A 375px el panel puede
quedar hasta 5 renglones de tiles más abajo del tile apretado, y eso se resuelve
con un `scrollIntoView({ block: "nearest" })` al abrir — que no es medir layout,
es pedirle al navegador que acerque un elemento.

## La banda y el tile

Cinco bandas. Cada una: la letra en un riel a la izquierda y los tiles fluyendo
a la derecha.

**El tile mide 66×101px** y lleva, de arriba a abajo:

- **Retrato de 3rem (57px).** Es lo único con lo que se reconoce a un héroe de un
  vistazo; por eso no se achica para ganar espacio.
- **Nombre**, en una línea, recortado con elipsis.
- **Winrate**, grande.
- **Pickrate**, chico y en gris.

Los dos números y en ese orden porque es lo que ya hace la fila de hoy: "sólo dos
números, y el de victorias al doble de tamaño". El pickrate cuesta **13px por
banda, 65px en total** — medido agregándole la línea a la maqueta y volviendo a
medir— y se paga a propósito (decisión de ZoTaD, 2026-08-12): un tile con un
solo número obligaría a abrir el héroe para saber si además de bueno es popular.

**Las etiquetas van como glifo en la esquina del retrato**, no como palabra: en
66px no entra "Subiendo". El glifo lleva **el mismo `title` y el mismo número
atrás** que la etiqueta de hoy, que es la regla del proyecto — una etiqueta sin
el dato que la respalda es una opinión.

- Dificultad (`skillGap` ≥ +2 o ≤ −2): marcador en la esquina superior izquierda.
- Tendencia (`trend` ≥ +1 o ≤ −1): ▲ o ▼ en la esquina superior derecha.
- Muestra fina (`thinData`): el tile va atenuado, como hoy `data-thin`.

**Medido sobre `heroes.json` del 2026-08-11, y no es lo que decía la memoria:**

| Etiqueta | Héroes que la llevan hoy |
|---|---|
| Dificultad | **12 de 38** (22 tienen `skillGap`; 12 pasan el ±2) |
| Tendencia | **0 de 38** — ningún héroe tiene `trend` |
| Muestra fina | **0 de 38** — el mínimo son 10.592 partidas |

Dos consecuencias para quien implemente. La primera: la propiedad que hace
legibles a las etiquetas —que la mayoría no tenga ninguna— se cumple **de sobra**,
así que no hay que tocar umbrales. La segunda, y la que importa: **el glifo de
tendencia y el atenuado de muestra fina no se van a poder ver en pantalla al
implementarlos**, porque hoy ningún héroe los dispara. `trend` está vacío por el
mismo motivo que deja vacía la pestaña de parches: falta un segundo parche ranked
que comparar. **Hay que verificarlos con datos inventados a mano**, o quedan
publicados sin que nadie los haya mirado nunca.

**Los tiers dejan de plegarse.** Plegar existía porque la página era de dos
pantallas de scroll y para que la lista arrancara liviana; con 621px de bandas ya
no lo es. Eso borra `OPEN_BY_DEFAULT`, el estado `abiertos`, `abiertosEfectivo`,
`.dl-fold` y `.dl-fold-inner` de `Deadlock.tsx`. **El motivo por el que el
contenido se montaba aunque estuviera plegado —que Ctrl+F y Google lo
encontraran— se cumple solo ahora**, porque ya no hay nada plegado.

## El panel

Se abre **a ancho completo debajo de la banda**, con el tile abierto marcado
como activo — borde y anillo dorados en `.dl-tile-face`, ver `codex.css`.

**Nota post-implementación: no se construyó un caret, y no debería.** Esta
sección decía que el panel abría "con un caret apuntando al tile abierto".
Un caret que señale a un tile específico necesita la posición horizontal de
ese tile — es decir, JavaScript midiendo el layout, que es exactamente lo que
este mismo diseño rechaza en la sección de arriba (el motivo por el que el
plegado usa `grid-template-rows` y no un `max-height` a ojo, o por el que el
panel no persigue al tile en el teléfono más que con un `scrollIntoView`). El
borde y el anillo dorados alcanzan para marcar cuál tile está abierto sin medir
nada; que nadie lo vuelva a agregar.

**Adentro va lo que ya existe, sin tocarlo**: `DeadlockBuildCard` y
`DeadlockMastery`, con los mismos props de hoy. Lo único nuevo es la cabecera del
panel, que es donde vive todo lo que el tile no puede mostrar:

- el puesto en la lista (#7), que hoy es `.dl-rank`
- retrato grande, nombre y letra de tier
- winrate y pickrate con sus rótulos
- las etiquetas **con su texto completo** y su tooltip

**No se toca el portal de `ConFicha`.** Existe porque `.dl-fold-inner` recorta
con `overflow: hidden`, y aunque ese contenedor desaparezca, el portal sigue
siendo la forma correcta de que la ficha de un ítem no la recorte nada. Cambiarlo
sería tocar algo que funciona por un motivo que no es el que estamos arreglando.

**La URL sigue mandando.** `/deadlock/<héroe>` abre el panel de ese héroe, igual
que hoy, y por lo tanto `deadlockSlugs`, `route.ts`, el sitemap y `PageMeta` no
cambian. Lo que se cae es sólo el forzado del grupo visible (`heroTier`), que
existía porque un link a un héroe de tier D abría la fila con el grupo plegado.

## El encabezado

`.tool-head` baja de 345px a un **objetivo de ~110px** — es un presupuesto a
cumplir y verificar en pantalla, no una medición:

- título y controles en un renglón
- las cuatro bandas como pastillas en línea, en vez del botón más el `<select>`
- **las tres `.detail-note` y el aviso de banda fundidos en una sola línea de
  metadatos**: "76.553 partidas · 30 jul – 11 ago · parche del 28/7"

El aviso de `ON_FALLBACK_BAND` y el de `provisional` siguen existiendo pero como
parte de esa línea, no como bloques propios. El caso de `matches === 0` conserva
su frase entera: es una banda que no puede describir su ventana, y eso no se
comprime a un renglón.

**Los 155px de aire del cromo compartido NO se tocan** (decisión de ZoTaD,
2026-08-12). Son de `.topbar` y `.switcher`, que viven en todas las páginas
del sitio: recortarlos obligaría a re-verificar TFT entero, y esto es un arreglo
de Deadlock.

## Lo que entra en la primera pantalla, y lo que no

| Tramo | px |
|---|---|
| Cromo compartido (sin tocar) | 274 (medido) |
| `.tool-head` comprimido | ~110 (objetivo) |
| Las cinco bandas con pickrate | 621 (medido) |
| **Total** | **~1.005** |

**Con 950px de viewport entran S, A, B y C enteros, y D arranca justo abajo del
pliegue.** Es una decisión tomada, no un descuido: D tiene 16 de los 38 héroes y
es el tier al que nadie entra a buscar, así que pedir un scroll corto para verlo
es honesto. De 2,6 héroes a 22 sobre el pliegue son **8,5 veces más**.

## Los íconos de ítems

**Medido, los tres tamaños de ícono de ítem que hay hoy, con el retrato de héroe
de referencia:**

| Dónde | px |
|---|---|
| Orden de compra (`.dl-buy-icon`) | **75** |
| Tier list de ítems (`.dl-item-face`) | 49 |
| Cuadrados de la build (`.dl-slot-btn img`) | 47 |
| *(referencia)* retrato de héroe en la fila de hoy | 61 |

El que molesta es el de 75px (confirmado por ZoTaD), y es el más grande del
sitio por lejos. **`.dl-buy` pasa de `4.2rem` (79,8px) a `3.2rem` (60,8px)**, con
lo que el ícono queda en **~57px** — el mismo tamaño que el retrato del tile, así
que las tres superficies que muestran objetos dejan de contradecirse.

**Verificado que no rompe lo que ese número protegía.** El comentario de
`codex.css:4456` fija `4.2rem` para que un tramo de compras llene el renglón sin
partirse: el tramo más cargado que se midió tiene **11 compras**, y con 60,8px
más 7,6 de hueco entran **19 por renglón** en el panel de 1.335px. Ningún tramo
se parte. Ojo con la cuenta: **la raíz del tema son 19px, no 16** (`base.css`).

**Nota post-implementación: esto no fue lo que se envió.** `.dl-buy` terminó en
**`3.8rem` (72,2px), con el ícono en ~68px** — no en `3.2rem`/~57px como decía
el párrafo de arriba. Motivo medido: la franja del nombre está atada al ancho
de la tarjeta, y a `3.2rem` esa franja mide **52px**, mientras que la palabra
más larga en español, "Vulnerabilidad", medía **67px** a la tipografía que
tenía el nombre entonces — se partía a la mitad de una letra, no en un
espacio. La combinación que sí entra es **`3.8rem` con el nombre en `0.6rem`**,
que deja esa palabra en **59px** dentro de una franja de 62-68px, sin cortar
ninguna palabra en español ni en inglés. Es una reducción más chica que la
planeada acá (72,2px contra los 60,8px de este documento), y es por eso: el
tamaño más chico que no parte palabras en español es más grande que el que la
aritmética de esta sección predijo.

**Los otros tres tamaños no se tocan.** No fueron el pedido, y el de 47px de los
cuadrados ya viene de un arreglo previo por exactamente este problema.

## Qué NO cambia

- **Nada del pipeline ni de los datos.** Esto es 100% presentación:
  `heroes*.json`, `builds.json`, `catalog.json` y los scripts que los escriben
  quedan igual.
- **`DeadlockBuildCard`, `DeadlockMastery` y `DeadlockItemCard`**, que se montan
  adentro del panel tal cual están.
- **Las rutas, los slugs, el sitemap y los títulos de página.**
- **La pestaña de parches** (`/deadlock/patches`), que no usa la lista de tiers.
- **El cromo compartido del sitio**, y por lo tanto TFT entero.

## Tests

- **`test/deadlock.test.ts` ya cubre lo que este diseño necesita, y no hay que
  agregarle nada.** En particular `difficultyOf › "deja sin etiqueta a la mayoría
  de la lista"` (línea 203) fija justo la propiedad de la que dependen los glifos
  del tile, y está bien escrito: **afirma la relación, no un conteo**, así que
  sigue valiendo con 12 etiquetas igual que valía con 17.
- **Lo único que se le agrega es que `tierOf` siga repartiendo los 38 héroes en
  las cinco letras**, que es lo que hace que existan cinco bandas. Si algún día
  una letra queda vacía, el riel de esa banda no se debe dibujar.
- **`test/pageMeta.test.ts`, `pageMetaDeadlockParity.test.ts`, `route.test.ts`,
  `sitemap.test.ts` y `prerender.test.ts` tienen que seguir pasando sin cambios.**
  Si alguno se rompe, es señal de que el rediseño se metió con las rutas, que es
  justo lo que no debe tocar.

**Ningún test agarra lo que este diseño arregla.** El problema es geometría en
pantalla, y los tests miran datos y rutas. La verificación es **mirar la página
renderizada a 1920×950 y contar** — ver "Riesgos".

## Lo que deliberadamente no entra

- **Hacer el sitio responsivo a la densidad del monitor** (un `clamp()` en la raíz
  de 19px). Cambiaría cada rem del sitio entero por un pedido que es de una
  página, y el 19px está calibrado desde hace tiempo.
- **Tocar los 155px de aire del cromo compartido**, por lo mismo.
- **Ordenar los tiles por algo que no sea el puesto.** El orden dentro de la
  banda sigue siendo el winrate encogido, como hoy.
- **Colores por tier.** Hoy las cinco letras usan el mismo `--gold-lit`
  (verificado en la página); darle un color a cada una obligaría a una leyenda, y
  la letra ya dice lo que el color diría.

## Riesgos

- **El riesgo real es que se verifique mirando el DOM y no la pantalla.** Ya pasó
  en este mismo proyecto: la página se dio por buena con dos capturas negras.
  Durante esta sesión de diseño volvió a pasar dos veces — las maquetas medían
  bien por JS y se veían negras. **La verificación de esto es una captura a
  1920×950 con los tiers a la vista, no un `getBoundingClientRect`.**
- **El tile de 66px es angosto para nombres largos**, pero medido es un caso solo:
  **"The Doorman" es el único de los 38 que pasa de 10 caracteres** ("Grey Talon"
  y "Mo & Krill" miden exactamente 10). Se recorta con elipsis y el nombre entero
  queda en el `title` y en la cabecera del panel. Si se ve mal, la salida es el
  tile de dos renglones de nombre, no achicar la tipografía.
- **En teléfono la banda D se parte en 6 renglones** y el panel abre lejos del
  tile. Lo tapa el `scrollIntoView`, pero es el caso a mirar primero después de
  escritorio. La memoria ya registra que el "skill path" queda apretado en 299px:
  esta página tiene deuda de teléfono previa a este cambio.
- **`.dl-buy` a 3.2rem se verificó por aritmética, no en pantalla.** Hay que mirar
  un héroe con 26 compras (el máximo medido) además del de 11.
