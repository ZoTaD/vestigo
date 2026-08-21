# Arquetipos de build en Deadlock

**2026-08-02.** Reemplaza la firma hecha a mano que agrupaba las builds desde el
2026-07-30, y arregla cuatro cosas del algoritmo que se habían acumulado. Leer
junto con `2026-07-31-tarjeta-de-build-deadlock-design.md`, que describe la
tarjeta y el motor de medición — **ese motor no cambia**.

## El problema

La firma era `(héroe, tipo de daño, habilidad imbuida)`. No fallaba por simple:
fallaba por **incompleta**. No miraba qué sube el jugador, así que un McGinnis
que maxea el muro y uno que maxea la torreta caían en el mismo grupo si compraban
parecido, y la tarjeta les mostraba la misma build a dos formas distintas de
jugar.

Además había tres cosas más, que se arreglan acá porque tocan el mismo código:

1. **La ventana de las builds no estaba anclada al parche** y la tier list que las
   contiene sí. No se notaba porque ranked se estrenó el 2026-07-29 y todavía no
   hay quince días de historia — o sea que **se iba a romper solo**, en silencio.
2. **El `edge` se medía y no decidía nada.** Los doce cuadrados salen por
   prevalencia, así que todo el pareo terminaba siendo una etiqueta al costado.
3. **`MIN_GROUP` estaba en 150** con una nota que dice que vuelve a 500 cuando la
   muestra se recupere, y nada medía si ya se podía.
4. **El tipo de daño se definía dos veces**: la firma contaba objetos por tipo y
   el panel de inversión sumaba almas. Cuatro objetos baratos de bala pesaban más
   que dos caros de espíritu en una definición y menos en la otra.

## El hallazgo que lo habilita

**El orden de subida de habilidades está en el snapshot.** La nota del proyecto
decía que no —y es cierto de `ability_stats`, que viene vacío— pero el dato vive
en otro lado: cada nivel que se sube aparece como **un evento más en
`items.item_id`**, mezclado con las compras, y se reconoce porque su id no está
en el catálogo de objetos.

Verificado sobre 400 filas de McGinnis: aparecen exactamente **4 ids ajenos al
catálogo** —sus cuatro habilidades— repetidos y con su minuto. Un jugador real:

```
ids:     [1725685134, 1725685134, 1342610602, 2142734020, 2142734020, ...]
minutos: [       0.5,        1.1,        1.7,        2.1,        2.7, ...]
```

Sube una habilidad dos veces, compra un objeto, sube otra dos veces. Es la
secuencia completa.

**Consecuencia de arquitectura**: el panel de habilidades deja de depender de la
API en vivo, que era una dependencia aceptada con la condición de que si fallaba
el panel no apareciera.

## El método: Archetypal Analysis

### Por qué no k-means

Un centroide es el **promedio** de su grupo, y el promedio de "McGinnis torreta"
y "McGinnis arma" es una build que no juega nadie. Es la misma objeción que ya
está anotada contra el k-means de Blitz para las comps de TFT, donde los
centroides no son tableros jugables y hay que pegarlos a uno real después.

AA busca lo contrario: cada arquetipo es una **combinación convexa de jugadores
reales**, así que vive dentro del casco convexo de lo que la gente hizo, y los que
encuentra son los **puntos extremos** — las formas puras. La asignación es
**blanda**: un jugador puede ser 70% torreta y 30% arma, y ese peso se publica
como `commitment`, porque una build armada con gente que apenas la juega merece
leerse distinto que una armada con puristas.

Referencias: Cutler & Breiman (1994); Mørup & Hansen, *Archetypal analysis for
machine learning and data mining* (2012), de donde sale la inicialización
FurthestSum.

### El vector

Una fila por jugador-partida, tres bloques, **todos en 0..1** para que la
distancia entre dos arquetipos se lea directo:

1. **Objetos**: binario por objeto que el héroe se construye al menos el 5% de las
   veces. Binario y no cantidad, porque un objeto se compra una vez.
2. **Almas por categoría**: qué fracción fue a arma, vitalidad y espíritu. **Esto
   reemplaza al conteo de objetos por tipo**, y con eso queda resuelto el arreglo 4.
3. **Habilidades**: qué fracción de los niveles subidos fue a cada una.

**Los bloques se balancean** para que aporten lo mismo a la distancia. Sin eso los
objetos ahogan al resto por cantidad —cuarenta columnas contra tres y cuatro— y
dos builds que difieren en qué maxean quedarían a distancia casi cero, que es
justo el caso que esto existe para detectar.

### Cuántos arquetipos

Se sube a k+1 sólo si se cumplen **las tres**:

- **Varianza explicada**: gana al menos `MEJORA_MINIMA` = 0,05.
- **Separación**: la máxima diferencia entre coordenadas del par más parecido es
  al menos `MIN_SEPARACION` = 0,15. O sea, hay algo que una build hace quince
  puntos más que la otra. Es el trabajo que hace `MAX_OVERLAP` con Jaccard,
  dicho en el espacio de features.
- **Cuota**: cada arquetipo describe al menos `MIN_CUOTA` = 0,15 de los jugadores.

**Las tres hacen falta, y las dos últimas se descubrieron escribiendo los tests.**

La varianza explicada sola miente: un héroe que todo el mundo juega igual forma
una nube apretada, y partirla mejora el error *en proporción* aunque los pedazos
sean casi el mismo punto. El primer test devolvía 3 arquetipos para un cúmulo
cuyas coordenadas variaban 0,008.

Y **AA convierte en arquetipo a cualquier minoría**, porque una minoría es extrema
por definición. 120 jugadores que juegan igual salvo un 10% que compra un objeto
barato de más se partían en dos, con la separación bien por encima del corte. Son
doce personas, no una forma de jugar. `MIN_CUOTA` es lo que lo frena — el mismo
trabajo que `MIN_GROUP` en partidas absolutas, y hacen falta los dos porque un 20%
de un héroe poco jugado sigue siendo poca gente.

### Determinismo

FurthestSum no usa azar y el descenso es determinista. **Dos corridas sobre los
mismos datos dan los mismos arquetipos**, y hay un test que lo fija: una tarjeta
que se rebaraja sola cada hora sin que cambien los datos sería un bug.

## Los cuatro arreglos

**1. La ventana se ancla al parche, si el parche tiene con qué.** Se carga la
ventana ancha de quince días, se cuenta cuánto hay desde el parche, y si llega a
`PROVISIONAL_MATCHES` se recorta. Si no llega se queda la ancha y **el archivo lo
dice** (`crossesPatch`), para que la tarjeta avise en vez de hacer pasar quince
días por el parche vigente.

**2. El `edge` marca, no reordena.** Se marca el objeto cuyo aporte está en el
**percentil 75 de toda la corrida**, así "carga esta build" significa lo mismo en
la tarjeta de cualquier héroe y por construcción lo lleva uno de cada cuatro.
Marcar en vez de reordenar es deliberado: **la build tiene que seguir siendo la
que se juega**, y ordenarla por aporte la convertiría en otra tier list de
objetos. El número va en la ficha, porque una etiqueta sin su dato es una opinión.

**3. `MIN_GROUP`** sigue en 150, y ahora el pipeline **imprime la mediana de
partidas por arquetipo** para poder decidir cuándo vuelve a 500 con un número en
vez de a ojo.

**4. El tipo de daño sale de las almas**, vía `damageOf`, que es la misma cuenta
del panel de inversión.

## Qué NO cambia

- **La tier list.** El winrate sigue siendo por héroe; los arquetipos sólo
  ordenan las builds dentro de la fila. Partir el winrate por arquetipo parte
  también la muestra, y es una decisión aparte.
- **El pareo, el mecanismo y el encogimiento** (`matching.ts`, `mechanism.ts`).
  AA cambia **cómo se agrupa**, no cómo se mide.
- **La regla de counters**, que se arregló el mismo día por otro motivo.

## Archivos

- `src/archetypes.ts` — AA puro: símplex, FurthestSum, descenso alternado, `elegirK`.
- `src/features.ts` — el vector por jugador, el balanceo y `damageOf`.
- `src/grouping.ts` — de jugadores a builds publicables.
- `src/builds.ts` — extracción de habilidades del stream y el cableado.

## Resultados medidos (corrida del 2026-08-02, banda Arcón/Oráculo)

| | Antes | Ahora |
|---|---|---|
| Builds publicadas | 103 | **76** |
| Reparto por héroe | `{1:4, 2:3, 3:31}` | **`{1:10, 2:18, 3:10}`** |
| Partidas por build (mín / mediana) | 150 / 818 | **455 / 2.029** |
| Solape mediano entre builds de un héroe | 50% | **41%** |
| Pares con más de 70% de solape | 5 | **0** |
| Builds que miden su orden de subida sobre su propia gente | 0 | **76 de 76** |
| Pedidos a la API en vivo por build | 76 | **0** (22,8 s → 0,0 s) |

**El número que más dice es el reparto**: antes 31 de 38 héroes recibían tres
builds. El método viejo le inventaba variedad a casi todo el mundo.

**12 de 28 héroes con varias builds maxean distinto**, medido sobre sus propios
jugadores. El caso que motivó todo:

| McGinnis | Partidas | Winrate | Sube primero |
|---|---|---|---|
| Muro | 2.509 | **55,9%** | Spectral Wall |
| Torreta | 982 | 51,5% | Mini Turret |

Y hay diferencias más grandes: **Pocket** va de 42,9% a 54,5% según suba
Enchanter's Satchel o Barrage en segundo lugar, y **Seven** de 47,6% a 55,2%
entre Static Charge y Lightning Ball. Eso es un patrón que hace fuerte o débil a
un personaje y que el winrate por héroe no puede ver.

## Determinismo: dos bugs que sólo aparecieron corriendo

Los tests fijaban el determinismo **de las matrices**, y aun así la salida se
movía entre corridas con datos idénticos. Las dos causas estaban en SQL:

1. **`MAX_AJUSTE` toma una submuestra de paso fijo**, así que el orden en que
   llegan las filas decide cuáles entran — y SQL no garantiza ninguno. Dos
   corridas dieron 81 y 90 arquetipos, con McGinnis partido 2.525/966 en una y
   2.313/1.178 en la otra. Se arregla con `order by pid`.
2. **El `ntile` que arma los quintiles de patrimonio desempata solo.** Dos
   compras con el mismo patrimonio caían en quintiles distintos, y eso movía el
   `k` del encogimiento entre 854 y 864, arrastrando los aportes en el segundo
   decimal — donde cae el corte de los que cargan la build. Se arregla llevando
   `match_id` y `account_id` hasta el `ntile` y ordenando por ellos. **Este era
   anterior a este trabajo.**

Verificado después: dos corridas seguidas dan la misma huella de estructura
**y** de números.

## Riesgo, y cómo se acota

AA es una optimización iterativa, y el proyecto tiene la regla de que nada sea una
caja negra. Se acota con que **cada arquetipo es una mezcla de partidas reales**
(no un punto inventado), con que el `commitment` se publica, y con 46 tests que
fijan el comportamiento — incluidos los dos que describen el caso McGinnis
(mismos objetos, distinta habilidad → dos builds) y el caso Mo & Krill (una sola
forma → una sola build).
