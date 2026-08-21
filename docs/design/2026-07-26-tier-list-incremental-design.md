# Tier list incremental: resumir al ingerir y borrar la partida

**Fecha:** 2026-07-26
**Estado:** aprobado, pendiente de implementación
**Decisión de arquitectura de ZoTaD.** Este documento la escribe y la verifica.

> **Corregido el 2026-07-26 a la noche, después de medir.** Tres cosas de este
> documento cambiaron y están marcadas abajo: la compresión corre en la Action diaria
> y no en el cron; **el borrado de partidas crudas queda apagado**; y el resumen
> comprime mucho menos de lo que este documento suponía. Ver "Lo que costó medirlo".

## Lo que costó medirlo (2026-07-26)

Medido sobre el parche vigente completo (7.253 partidas, 112.520 tableros entre las
cinco bandas), el resumen de **un parche son ~460.000 filas**:

| | filas |
|---|---|
| comp (banda, parche, día, firma) | 4.175 |
| unidad | 72.167 |
| **unidad-ítem** | **349.293** |
| trait | 34.947 |

Unos 40-70 MB, contra ~85 MB que pesan las partidas crudas de ese mismo parche.
**Hoy el resumen comprime menos de 2 a 1**, no los órdenes de magnitud que este
documento daba por sentados. El detalle por ítem se lleva el 76% de las filas.

Cortar la cola de firmas ayuda poco y a las bandas equivocadas: con un piso de 5
tableros por firma se ahorra 19%, y con uno de 20 se ahorra 42% pero `silver-below`
se queda con el 25% de sus tableros con detalle.

**Donde el resumen gana es en escala, no hoy.** Esas filas son combinatoria —firmas
por unidades por ítems—, no volumen: con diez veces más partidas el crudo pesaría
850 MB y el resumen seguiría siendo el mismo. Ahí sí es 20 a 1. Por eso se construye
igual; pero la razón real para construirlo ahora es lo que habilita —tendencia por
día, comps que nacen solas— y no el espacio.

## Esto es temporal hasta el plan Pro de Supabase

Decisión de ZoTaD del 2026-07-26: el plan gratuito es la restricción de hoy, no
una condición permanente. Cuando el sitio tenga usuarios concurrentes se paga Pro.

De ahí sale la regla que ordena todo lo demás: **armar el resumen es reversible y
vale para siempre; borrar las partidas crudas es lo único irreversible.** Un resumen
no se puede des-resumir. Una restricción temporal no puede comprarse con una pérdida
permanente, así que el borrado se implementa detrás de una constante de retención y
**nace apagado**.

## El problema

Hoy la tier list **no se actualiza sola**. Verificado: `pipeline/src/build.ts:42` define
`STORE = "../data/matches"`, o sea el disco de la máquina de ZoTaD. El cron
(`tft-pull`, cada 30 min) escribe en **Postgres**, que el build nunca lee. Resultado:
las partidas se juntan solas, pero publicar la tier list sigue siendo correr el build a
mano y pushear.

Y no alcanza con apuntar el build a Postgres:

| | disco | Postgres |
|---|---|---|
| partidas totales | 22.016 | 6.610 |
| del parche vigente, ranked | 7.253 | **2.402** |

Construir de Postgres hoy publicaría un tercio de la muestra. Y aunque se subiera el disco
entero, el plan gratuito son 500 MB y cada partida cuesta ~14 KB con todo: el crecimiento
choca contra la pared en semanas.

## La decisión

**Resumir cada partida al llegar y borrar la cruda.** La base guarda contadores, no
partidas. Así hay millones de partidas detrás de la tier list con una base de pocos MB.

## Por qué se puede: la verificación que lo habilita

El riesgo era que el agrupamiento de comps necesitara los tableros crudos. **No los
necesita.** En `pipeline/src/aggregate/group.ts`:

- `overlap(a: Set<string>, b: Set<string>)` (línea 129) compara **conjuntos de ids de
  unidad**, no tableros.
- El "core" de una comp son las unidades presentes en más del X% de sus tableros, que es
  exactamente **un contador de frecuencia** — dato que ya guardamos por unidad.

Es decir que la fusión por Jaccard y el `sameComp` pueden correr sobre resúmenes sin
cambiar su lógica. Lo único atado a lo crudo es la **entrada** de `coreOf(members:
Participant[])` (línea 117).

Y todo lo que publica `comps.json` es aditivo: `avgPlacement`, `top4Rate`, `winRate`,
`playRate` y, por unidad, `frequency`, `avgStars`, `threeStarRate`, `avgItems`. Incluso
`placementVar` sale de acumular la suma de cuadrados.

## Cómo funciona

### Al resumir — **en la Action diaria, no en el cron**

Corregido el 2026-07-26. El documento original ponía esto en la Edge Function
`tft-pull`, apenas la partida baja de Riot. Se movió a la GitHub Action que ya
publica todos los días, por una razón concreta: **la firma, las bandas y el parche
viven en TypeScript del pipeline, y la Edge Function corre en Deno**. Ponerlo en el
cron obliga a compartir ese código o a portarlo, y el propio documento marcaba abajo
el riesgo de eso — dos implementaciones de la firma que se separen invalidan **todos**
los contadores históricos, en silencio. En la Action corre el mismo código que ya
existe, sin una segunda copia de nada.

Lo que se paga a cambio: las partidas se acumulan crudas hasta 24 h antes de
resumirse. Son ~800 por día, unos 10 MB. Nada.

Por cada tablero de cada partida todavía no resumida:

1. Se calcula la **firma** con `aggregate/signature.ts` — determinista, ya existe.
2. Se resuelve **banda** (de `pipeline/src/bands.ts`) y **parche** (de `patch.ts`).
3. Se hace `upsert` sumando contadores.
4. La partida queda marcada como contabilizada, **y no se borra**: ver la sección de
   retención más abajo.

### Las tablas

Claves con **día** adentro, que es lo que permite ver tendencia sin guardar partidas:

```
comp_stats            (band, patch, day, signature)
  boards, sum_placement, sum_placement_sq,
  top4, wins, sum_level, sum_gold_left,
  sum_damage, sum_eliminations, sum_time_alive

comp_unit_stats       (band, patch, day, signature, unit_id)
  boards, sum_stars, three_star, sum_items, itemized,
  winner_boards, loser_boards

comp_unit_item_stats  (band, patch, day, signature, unit_id, item_id)
  boards, winner_boards

comp_trait_stats      (band, patch, day, signature, trait_id)
  boards, sum_style
```

`comp_unit_item_stats` es la que más crece: hay que ponerle un tope por unidad (los N ítems
más vistos) o podarla por antigüedad.

### Al publicar

1. Se suman los baldes de la ventana pedida (por defecto, el parche vigente).
2. Se arma un "tablero virtual" por firma desde los contadores.
3. **Corre el mismo `aggregateComps` de siempre**: fusión por Jaccard, encogimiento
   empírico de Bayes, tiers.
4. Se escribe el JSON, se commitea y Netlify despliega.

### Lo que contesta cada pregunta que se hizo

- **Actualizar una comp que ya está** → misma firma, suma a la fila existente.
- **Detectar una comp nueva** → es gratis: una firma sin fila **es** una comp nueva. Nace
  con `boards=1` y acumula. Aparece publicada al cruzar `TAG_MIN_BOARDS` (50).
- **Subió o bajó** → como los contadores están por día, "últimos 7 días contra los 7
  anteriores" es una suma sobre baldes. De ahí sale la flecha, y también la comparación
  entre parches, que es el "qué cambió en este parche" que ningún competidor hace bien.
- **Le arman otros ítems** → `comp_unit_item_stats` por día: el ítem nuevo sube y el viejo
  baja dentro de la ventana.

Costo: 50 comps × 4 bandas × 30 días ≈ 6.000 filas de cien bytes. Nada.

## Retención de partidas crudas: **nace apagada**

**Corregido el 2026-07-26.** El borrado se implementa como una constante de retención
y arranca en "no borrar nada". La razón está arriba: la restricción de espacio es
temporal y el borrado no lo es.

Y no hace falta todavía. Medido el 2026-07-26: la base está en 170 MB de 500, el
resumen la deja en ~220, y crece 6,4 MB por día — unas cuatro semanas hasta los
400 MB en que la poda ya empieza a hacer lugar sola. **El Set 18 abre en tres**, y ese
día todo el Set 17 pasa a ser descartable de golpe. El espacio se resuelve solo antes
de volverse urgente.

Prender el borrado es cambiar un número, y conviene archivar al disco antes de
hacerlo: el store local ya tiene 22.016 partidas y es gratis.

Lo que sigue es el razonamiento original, que sigue siendo el correcto **cuando haya
que prender el borrado**:

### Si algún día hay que borrar: la ventana es el parche vigente

No es una concesión, es la lección de esta semana: **dos veces hubo que reconstruir las
cuatro bandas desde las partidas crudas** — cuando el criterio pasó de `standard` a cola
ranked, y cuando el encogimiento dejó de estar clavado en 120. Con borrado inmediato, un
criterio equivocado queda horneado para siempre y solo se limpia al cambiar de set.

Con la ventana se reconstruye **lo que está publicado**, que es lo único que urge arreglar.

Efecto secundario a asumir: las crudas son el respaldo del buscador cuando la key vence,
así que en modo offline se verá el parche vigente y no más atrás.

## Qué hay que construir

1. **El resumen como tipo, y `summarize()` puro**: convertir `Participant[]` en
   contadores por firma, y saber sumar dos resúmenes. Con tests.
2. **Refactor de `aggregateComps`**: que consuma resúmenes. La clave para que sea
   seguro es que **el camino viejo pase por el nuevo** — `aggregateComps(boards)` se
   vuelve `aggregateComps(summarize(boards))` —, así los tests actuales siguen siendo
   la red y salir idéntico prueba que el resumen no pierde nada de lo que se publica.
3. **Migración**: las tablas de contadores, con RLS activo y cero políticas, como todas
   las demás.
4. **Resumen en la Action** (no en el cron, ver arriba): leer las partidas todavía no
   contabilizadas, sumarlas al resumen, marcarlas como contabilizadas.
5. **El build lee del resumen** en vez de las crudas.
6. **Backfill**: contabilizar de una vez todo lo que ya tenemos, en disco y en la base.
7. **Retención**: la constante de borrado, apagada.

**Publicación automática: ya está hecha** (2026-07-26,
`docs/design/2026-07-26-publicacion-automatica-design.md`). La Action corre todos los
días, construye contra Postgres, verifica tres guardas y commitea; Netlify despliega.
Este trabajo le cambia la fuente de datos, no el mecanismo.

## Orden sugerido

El resumen y el refactor de `aggregateComps` primero, **con los tests actuales en
verde**, porque es lo único que puede romper lo que ya está publicado — y porque hasta
que el camino viejo pase por el nuevo y dé idéntico, no hay evidencia de que resumir
no pierda nada. Recién después la base, el resumen en la Action y el backfill. Cada
paso deja el sitio publicando como hoy.

## Riesgo que queda abierto

Un cambio de firma —si algún día se toca `signature.ts`— **invalida todos los contadores
históricos**, porque la clave cambia de significado. Hay que versionar la firma en la clave
o aceptar que ese cambio obliga a empezar de cero. Decidir al implementar.

Ver también `2026-07-24-parche-vigente-y-tier-list-design.md` y
`2026-07-26-que-mas-podemos-hacer-en-tft.md`.
