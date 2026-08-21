# Cuatro cosas nuevas en Deadlock: la escalera, el lado del mapa, la maestría y el parche

**Fecha:** 2026-08-01
**Estado:** implementado el 2026-08-01. Plan en
`docs/plans/2026-08-01-escalera-y-maestria-plan.md`.
**Pedido de ZoTaD.** Salió de mirar `statlocker.gg` buscando qué copiar. Este
documento decide qué se copia, dónde vive y con qué datos, y **verifica contra el
snapshot real todo lo que después va a salir en pantalla**.

## De dónde salen las cuatro, y qué se dejó afuera

Statlocker tiene unas treinta páginas. De ésas se toman cuatro ideas y se
descartan el resto por razones que conviene dejar escritas, porque si no se
vuelven a discutir solas:

| Idea de ellos | Qué hacemos |
|---|---|
| Rank Distribution / Playtime by Rank | **Se copia** y se le agrega el eje que ellos no tienen: el día a día |
| Hidden King vs Archmother | **Se copia** |
| Hero Mastery | **Se copia** |
| Winners & Losers | **Se copia** |
| Rank Migration (rango viejo → nuevo) | **No se puede**: antes del 30/7 el snapshot no traía rango por jugador, sólo el promedio del equipo. Ese dato no lo tenemos y no lo vamos a tener |
| Community Difficulty (votada) | Más adelante. Necesita cuentas, que hoy no existen. Y nuestro `skillGap` ya contesta esa pregunta **medida** en vez de votada |
| Coming from Dota / League | Descartada por ZoTaD |
| Vision / WPA (modelo ML de ítems) | Ya lo tenemos por otro camino (pareo + encogimiento). Lo único que vale copiarles es **el eje de "cuándo se compra"**, que es presentación y va aparte |
| Leaderboards, one-tricks, perfiles | Necesitan perfil de jugador, que es otro proyecto |

## Lo que se midió antes de escribir esto

Todo sobre las particiones **95 y 96**, las únicas que traen `average_badge` y
`player_rank_initial_display_rank` (el esquema del snapshot crece: las viejas
tienen 139 columnas y las nuevas 153).

**Cobertura del rango por jugador, en ranked, por día:**

| Día | Partidas | Filas de jugador | Con rango | Cuentas | Cuentas con rango |
|---|---|---|---|---|---|
| 2026-07-30 | 11.700 | 140.400 | 2,3% | 61.573 | 2.322 |
| 2026-07-31 | 20.300 | 243.599 | 23,8% | 92.640 | 22.717 |
| 2026-08-01 | 9.262 | 111.144 | **47,6%** | 59.403 | 26.206 |

**Jugadores por rango** (38.455 con rango conocido) y **partidas por rango**
(promedio de la sala), en la ventana ranked desde el 30/7:

| Rango | Jugadores | Partidas |
|---|---|---|
| Initiate | 2.583 | 1.821 |
| Seeker | 3.658 | 2.553 |
| Acolyte | 3.846 | 2.687 |
| Sentinel | 3.932 | 2.839 |
| Mystic | 4.600 | 3.318 |
| Ritualist | 4.778 | 3.379 |
| Emissary | 5.361 | 3.972 |
| Oracle | 9.663 | 8.181 |
| Phantom | 34 | 0 |

**Cuidado con la división en DuckDB**: `badge / 10` es división real, así que
`(86/10)::INT` **redondea a 9** y manda un Oráculo 6 a Fantasma. Va
`floor(badge / 10.0)::INT`, igual que `tierOfBadge` en el pipeline. La primera
medición de este documento salió mal por esto y hubo que rehacerla.

**Costo de escanear la historia** (`match_player`, 97 particiones, de la 0 a la 96):

| Partición | Período | Filas | Tiempo |
|---|---|---|---|
| 32 | 2025-01-19 → 2025-02-16 | 7.885.823 | 10,2 s |
| 64 | 2026-03-03 → 2026-03-07 | 2.440.442 | 4,2 s |
| 96 | 2026-07-27 → 2026-08-01 | 2.150.941 | 3,9 s |

Las viejas son las grandes. Extrapolando, la historia entera está en el orden de
**11-15 minutos**, que es lo mismo que ya cuesta `build:builds`. El agregado
`(cuenta, héroe)` sobre una partición da 1.162.060 pares en 1,1 s.

---

## 1. La escalera — pestaña nueva `/deadlock/ranks`

Contesta tres preguntas, en este orden:

**a) ¿En qué rango se juega?** Partidas por rango, del promedio de la sala
(`average_badge`). Cubre el **100%** de la muestra y es el mismo dato con el que
ya se arman las bandas, así que no puede contradecir a la tier list.

**b) ¿Cuánta gente hay en cada rango?** Jugadores distintos por rango, de
`player_rank_initial_display_rank`. Hoy cubre el 47,6% y sube todos los días.

**c) ¿Cómo se mueve día a día?** Las dos series, por día, desde el 30/7. **Es el
eje que statlocker no tiene** — ellos publican una foto — y describe algo que sólo
se puede mirar una vez en la vida del juego: la escalera reconstruyéndose después
de un reset.

### El cartel de calibración no es una nota al pie: es parte del dato

El corte por jugador **está sesgado hacia arriba y se ve a simple vista**: Oráculo
tiene 9.663 jugadores contra 2.583 de Initiate. Eso no es la forma de la escalera,
es que **el que terminó de calibrar primero es el que más juega, que es el que
está más arriba**.

Decisión de ZoTaD: **se publica con el cartel**, como hace statlocker. El cartel
dice el número que lo respalda —qué fracción de las cuentas vistas tiene rango
hoy— y por qué eso infla los rangos altos. Es la misma regla que el resto del
sitio: una etiqueta sin el dato que la respalda es una opinión.

El sesgo se corrige solo, y la página también: cuando la cobertura llegue al 100%
el cartel desaparece por su cuenta, sin deploy, igual que el de banda provisional.

### Se dibuja por SUBRANGO, no por rango (cambio de ZoTaD, 2026-08-01)

La primera versión eran doce barras horizontales, una por rango. **No se leían
como una distribución**: había que recorrerlas de a una y no aparecía ninguna
forma. Se rehízo como **histograma de columnas por subrango** — 54 escalones, de
Iniciado 1 a Fantasma 6 — con las insignias de rango en el eje.

El dato siempre estuvo y lo estábamos tirando: el badge vale `rango*10 +
subnivel`, y dividir por diez descartaba el subnivel. La muestra lo aguanta
(37.569 jugadores en ~54 escalones, ~700 cada uno).

**Y la forma fina muestra algo que las doce barras escondían**: la gente se
amontona en el subnivel 6 de cada rango (Ritualista 6 tiene 990 jugadores contra
576 del 5), y Oráculo se apila en los subniveles 4 y 5 (2.243 y 2.236) y cae a 622
en el 6, que es donde topea la colocación.

**El eje y las columnas son dos filas flex con el mismo peso total** —cada columna
pesa 1, cada grupo del eje pesa cuantas columnas abarque— así que las insignias
caen debajo de sus escalones sin que nada mida píxeles, y siguen alineadas con el
zoom del navegador.

#### El numeral de cada escalón sale del juego, no se escribe

Arriba de cada columna va **la insignia del subrango que publica la API de
assets** (`small_subrank1..6`), montada sobre el borde superior de su barra para
que suba y baje con ella.

**No se escriben los romanos a mano, y el motivo no es la tipografía: el sexto
subrango no es un "VI", es una estrella de seis puntas.** Verificado mirando las
seis imágenes de Oráculo una por una — la del 5 dibuja una V y la del 6 la
estrella. Escribirlos obligaría a imitar la fuente de Valve *y* a decidir con qué
representar el sexto, que es exactamente lo que el proyecto no hace con el
vocabulario del juego.

**El hueco para el numeral sale de un `padding-top` en cada escalón, no de un
número en JavaScript.** Como el alto de la barra es un porcentaje, se resuelve
contra la caja de contenido —ya sin ese espacio— así que la columna más alta topea
justo debajo y su marca entra sin desbordar. Verificado: 0 de 54 marcas se salen
del gráfico.

#### Dibujado para la escalera completa, no para la de hoy

Hoy son 54 escalones porque el techo está en Fantasma; completa, de Iniciado a
Eternus, son **66**. Los rangos nuevos **aparecen solos**: `binsFrom` saca el
mínimo y el máximo de los propios datos y el catálogo ya trae los doce rangos con
sus seis subrangos, así que el día que alguien llegue a Ascendente esa columna
entra en la corrida siguiente sin deploy.

Para que entren bien, el gráfico se dibujó con margen: **15rem de alto y barras
al 70% del hueco**, con la fracción en una variable CSS (`--dl-bar`) porque el
numeral vive adentro de la barra y tiene que dividir por ella para seguir midiendo
lo que mide el hueco. Simulado con las 66 columnas: huecos de 20,2 px, barras de
14,1 y marcas de 19,2, sin desbordes. En teléfono las marcas se ocultan y las
barras suben al 90%: a 5 px por escalón, el aire cuesta más de lo que aporta y lo
único que se lee es la forma.

### Lo que no lleva

**El percentil acumulado** ("estás en el top 29%") quedó afuera del alcance. Es
barato de agregar después: es una columna derivada de cualquiera de las dos
series.

---

## 2. El lado del mapa — adentro de la misma pestaña

Winrate por lado (`team`), desglosado por rango. La columna `won` ya existe en el
snapshot y ya se usa en `builds.ts`, así que el dato no cuesta nada nuevo.

**El hallazgo existe y es real.** Medido sobre 15 días y los dos modos (293.167
partidas): el lado 0 va de **48,68% en Initiate a 52,44% en Eternus**, monótono,
con errores estándar de 0,24 a 0,55 pp. Los extremos están a 3,8 puntos: no es
ruido. Statlocker publica 50,3% global y 52,5% en Eternus; nosotros dimos 50,31% y
52,44% por nuestra cuenta, lo que además valida las dos mediciones entre sí.

**Pero se publica con el corpus del sitio, no con ése** (decisión de ZoTaD: un
solo corpus, sin excepciones que explicar). Con ranked desde el 30/7 son 28.750
partidas: el global da 50,56% ±0,29 y **el desglose por rango todavía no se
resuelve** — cada rango tiene entre 1.821 y 8.181 partidas (±0,55 a ±1,17 pp) y la
diferencia entre rangos vecinos es de ~0,3 pp.

**Consecuencia de diseño: el rango que no llega al mínimo no se dibuja.** Es el
mismo patrón que ya usan `MIN_FOR_DELTA` y `thinData` en `build.ts` — la ausencia
dice "no sé", un número dibujado diría "son iguales". Al ritmo actual (~15.000
partidas ranked por día) la curva se completa sola en dos o tres semanas.

**A verificar antes de rotular**: cuál de `Team0`/`Team1` es Hidden King y cuál
Archmother. Hasta saberlo, los rótulos salen del juego, no de una suposición.

---

## 3. La curva de maestría — adentro de la fila del héroe

Cuánto winrate gana un héroe cuando quien lo juega ya lo jugó 50, 100 o 250 veces.

**Dónde vive: en la fila desplegable del héroe, al lado de la tarjeta de build.**
No es una pestaña. Esto no es una preferencia estética: el 2026-07-30 se publicó
`/deadlock/builds` como pestaña aparte y **se retiró el mismo día**, porque lo que
hacía falta era desplegar la fila del héroe. La maestría es una propiedad del
héroe y va donde vive el héroe.

**El costo está medido**: contar `(cuenta, héroe)` sobre las 97 particiones son
~11-15 minutos. Se corre **una vez por día**, no en la corrida horaria: la
respuesta a "¿cuánto premia la experiencia en este héroe?" no cambia de una hora a
la otra, igual que `skillGap`.

### La confusión que hay que sacarle antes de publicar

**"El que juega más un héroe gana más" no prueba que el héroe recompense la
práctica**: los jugadores que acumulan 250 partidas con alguien también son, en
promedio, mejores jugadores. Sin controlar eso, la curva mide quién lo juega y no
qué se aprende — que es exactamente el error por el que ya se sacaron KDA y almas
de la tier list, y por el que se retiró la brecha por rango de los ítems.

**Se mide dentro de una banda**, no sobre el corpus entero. Con la banda fija, "el
que jugó 250 partidas" y "el que jugó 10" están jugando al mismo nivel, así que la
diferencia que queda es del héroe. No lo elimina del todo —dentro de una banda
todavía hay rango de habilidad— pero es la misma herramienta que usa el resto del
sitio y es honesta sobre lo que hace.

**Si al medirlo la curva se aplana adentro de la banda, no se publica.** Es la
regla del proyecto: que un número tenga señal estadística no alcanza; hay que
poder decir qué la causa.

### Lo que dio al medirlo (2026-08-01, Arcón/Oráculo)

**No se aplanó**: 37 de 38 héroes quedaron con curva. Lo que la hace publicable no
es el tamaño sino **la dispersión**: el boost va de **−4,4 a +8,6 puntos, con
mediana +3,5**. Un sesgo de selección global —"los que juegan mucho un héroe son
mejores jugadores"— daría aproximadamente el mismo número para los 38; que un
héroe baje 4 puntos y otro suba 9 dice que se está midiendo al personaje.

**El escaneo costó 5,6 minutos, no los 12-15 estimados**, sobre 75.018 pares
(jugador, héroe).

**El tramo 0-9 quedó vacío en los 38 héroes.** En Arcón/Oráculo casi nadie juega
un héroe que no jugó nunca, así que la curva arranca en 10+ partidas. El tramo se
deja definido igual: en las bandas de abajo va a tener gente.

**Y no todas las curvas suben parejo.** McGinnis va 54,6% → 58,0% → 54,4% →
50,2%. Por eso la frase que encabeza el panel **dice los dos extremos en vez de
afirmar una dirección**: la primera versión imprimía "gana −4,4 puntos más", que
además de mal escrito le inventaba una tendencia que sus cuatro tramos desmienten.

---

## 4. Winners & Losers — **ya está hecho, no hay nada que implementar**

Esto se descubrió al planear la implementación y merece quedar escrito, porque es
la segunda vez que casi construimos algo que ya existía.

`Deadlock.tsx:330` ya renderiza las dos columnas de la pestaña `patches`, y
`MoverRow` (línea 167) ya dibuja **winrate y pickrate con el "de → a"** por héroe,
que es exactamente lo que muestra statlocker. Los datos ya viajan en `heroes.json`
(`trend`, `winRateBefore`, `pickRateBefore`) y `patchMovers()` en `deadlockData.ts`
ya arma las listas de arriba y de abajo. Hasta el estado vacío existe
(`copy.deadlock.patch.none`).

**Lo único que falta es que haya dos ventanas ranked comparables**, y eso no es
código.

**El problema, dicho de frente: hoy no hay dos parches ranked que comparar.** La
cola rankeada abrió el 2026-07-30 y el corpus del sitio es ranked-only. La ventana
anterior es unranked, que **no es el mismo juego** — está medido: 8 héroes de 38 se
separan más de dos errores estándar entre los dos modos, con Lady Geist a −5,15 y
Sinclair a +5,13.

Entonces las dos columnas se llenan solas en el próximo parche, y hasta entonces
muestran su estado vacío, que es lo correcto: comparar contra unranked publicaría
38 diferencias falsas.

### Pero la pestaña no podía quedarse en una sola frase (cambio de ZoTaD, 2026-08-01)

Con las columnas vacías, la pestaña entera era un renglón que decía que todavía no
había nada. Se le agregó el **historial de parches**: los últimos doce, con la
fecha en que llegaron a los jugadores, el nombre que les puso Valve, el vigente
marcado y el enlace a las notas del foro.

Sale de `/v1/patches`, el mismo feed que ya baja `build.ts` para saber dónde
cortar la ventana — **se escribe desde ahí y no desde un script nuevo**, porque un
segundo script sería un segundo pedido a la misma API por el mismo dato.

**La fecha manda sobre el título, y la página lo explica.** Valve nombra cada
parche por la fecha de su build: el que llegó el 2026-07-28 se llama *"06-30-2026
Update"*. Ordenado o encabezado por el título, el historial se leería como si
estuviera desordenado.

---

## Arquitectura

**Pipeline** (`games/deadlock/pipeline/src/`), tres scripts nuevos que siguen el
patrón de los tres que ya hay:

| Script | Escribe | ¿Por banda? | Cadencia |
|---|---|---|---|
| `ranks.ts` | `data/ranks.json` (series por día, las dos vistas, y el lado del mapa por rango) | **No** | con la corrida horaria |
| `mastery.ts` | `data/mastery.<banda>.json` (por héroe, winrate por tramo de experiencia) | Sí | una vez por día |

**`ranks.ts` no lleva banda y `mastery.ts` sí**, y la diferencia no es arbitraria:
la escalera **es** el eje de las bandas —preguntar "¿cuánta gente hay en cada
rango, dentro de Oráculo?" no significa nada—, mientras que la maestría es una
pregunta *adentro* de un nivel de juego.

`mastery.ts` **no elige su banda**: la lee de la que publicó
`build:heroes` con `publishedDefaultBand()`, igual que hacen hoy `build:items` y
`build:builds`. Si la maestría midiera una banda y la tier list mostrara otra,
nada lo explicaría.

**Y llevan sufijo siempre**, más una copia sin sufijo de la que toque ser el
defecto: es lo que ya hace `bandPath`/`writeBands`, y existe porque una ruta de
`import()` que aparece y desaparece **rompe el build de Vite**, no la página.

**UI** (`games/tft/ui/src/`):

- `route.ts`: `DEADLOCK_SECTIONS` pasa de `["meta","items","patches"]` a
  `["meta","items","ranks","patches"]`. El slug va **en inglés** (`ranks`), como
  todo slug del producto.
- `DeadlockRanks.tsx`: la pestaña nueva. Dos bloques: la escalera (con el toggle
  partidas/jugadores y la serie por día) y el lado del mapa.
- `DeadlockMastery.tsx`: el panel de maestría, montado dentro de la fila
  desplegable del héroe en `Deadlock.tsx`, al lado de `DeadlockBuildCard`.
- La pestaña `patches` **no se toca**: ya está entera.
- `sitemap.ts` y `prerender.ts` recogen la pestaña nueva solos (recorren
  `DEADLOCK_SECTIONS`), pero **`prerender.ts:100` hace `seo.deadlock[dlSection]`**,
  así que sin la entrada nueva en los dos idiomas el prerender rompe. La copia
  `seo` vive dentro de `i18n.ts`, no en un archivo aparte.
- **Los JSON nuevos van con `import()`, no estáticos.** Medido en su momento: el
  JSON de builds metido en el bundle lo llevaba de 1.280 a 1.726 KB, y eso lo paga
  todo el que entra al sitio. Nadie aterriza en la escalera sin hacer clic.

**Prosa**: toda en `i18n.ts` y sólo ahí, en los dos idiomas. **Español neutro
latinoamericano, sin voseo.** Los nombres de rango **no se escriben**: se bajan
traducidos de la API de assets, como ya se hace.

**Gráficos**: sin scroll propio, sin una palabra adentro del SVG, y las marcas son
la imagen del juego cuando hay una. Las tres reglas salieron de la columna derecha
de la pestaña de ítems y valen para todo gráfico nuevo.

**Netlify**: verificado hoy — `games/deadlock/data` ya está en el `ignore` de
`netlify.toml` (se agregó el 2026-07-29), así que los JSON nuevos disparan deploy
sin tocar nada. Se deja anotado igual porque es el fallo que ya costó descubrir
dos veces, vive en la configuración del hosting y **ningún test lo agarra**.

### El presupuesto de CI, que es el riesgo real

Ya estamos por encima de los 2.000 minutos gratis de Actions (`publish.yml` de TFT
~1.224, `summarize.yml` ~312, más Deadlock). **`mastery.ts` agrega ~15 min por
corrida diaria, o sea ~450 min/mes**, y los otros dos scripts son segundos.

No se puede sumar eso y no tocar nada. La palanca ya identificada es el cron
horario de Deadlock: pasarlo a `0 */3 * * *` lo baja a un cuarto y libera de
sobra. **La decisión concreta va en el plan**, medida contra el consumo real del
mes, que arrancó hoy.

## Tests

- `ranks.test.ts`: que `floor` y no redondeo (el caso 86 → Oráculo, que ya falló
  una vez); que la serie por día no tenga huecos; que el cartel de calibración se
  encienda y se apague solo según la cobertura.
- `sides.test.ts`: que un rango bajo el mínimo **no salga** en el JSON.
- `mastery.test.ts`: que los tramos se midan dentro de una banda, con un caso que
  falle si se mide sobre el corpus entero.
- `bands.test.ts` (existente) y los de la UI siguen valiendo. **Cada test de
  regresión tiene que fallar sin el arreglo antes de darlo por bueno** — ya hubo
  uno que pasaba con y sin el bug.

## Riesgos

1. **La cobertura del rango por jugador se puede estancar.** Hoy sube (2,3 → 23,8
   → 47,6%) pero si Valve deja gente sin calibrar, la vista por jugador queda a
   medias para siempre. Mitigación: el cartel ya dice la cobertura, así que el
   estancamiento se ve en la propia página.
2. **El lado del mapa puede no resolverse nunca con ranked-only** si el efecto es
   más chico de lo que da con los dos modos. Mitigación: el mínimo por rango deja
   la tabla incompleta en vez de falsa, y el número global sale igual.
3. **La maestría puede aplanarse dentro de la banda** y no ser publicable. Es un
   resultado válido y hay que estar dispuesto a tirar el panel. El pipeline queda
   igual: sirve para volver a preguntar.
4. **El escaneo de la historia depende de 97 particiones que se reescriben.** Ya
   hay `retryingOnRewrite` para eso y hay que usarlo.
