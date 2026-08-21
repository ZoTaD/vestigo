# Publicación automática: que la tier list se actualice sin que nadie la corra

**Fecha:** 2026-07-26
**Estado:** aprobado, pendiente de implementación
**Alcance:** que el ciclo se sostenga solo hasta que abra el Set 18. El cambio de set
se hace a mano, a propósito.

Este documento cubre la **fase 1** de la decisión tomada en
`2026-07-26-tier-list-incremental-design.md`: publicar automáticamente leyendo las
partidas crudas de Postgres, sin tocar el agregador. Los contadores incrementales son
la fase 2 y quedan descritos allá.

## El problema, en una línea

El cron junta partidas solo desde el 2026-07-25, pero `build.ts:42` lee del disco de
la máquina de ZoTaD (`STORE = "../data/matches"`). Publicar sigue siendo correr el
build y pushear a mano.

## Por qué la fase 1 va antes que los contadores

Los contadores son la arquitectura correcta y son más trabajo del que dice su
documento. Verificado en el código: `build.ts:161-170` no publica solo `comps.json`,
publica también `units.json`, `items.json`, `habits.json` y el bloque `calibration`.
Y de esos, dos **no se pueden reconstruir desde contadores por firma**:

- `calibrate()` compara los 8 tableros de un lobby entre sí. Estar disputado es un
  hecho de la mesa, no del tablero (`calibrate.ts:128-163`).
- `aggregateHabits()` necesita lo mismo (`habits.ts:130-155`).

Son aditivos *si se miden al ingerir*, pero eso es portar mucho más código a la Edge
Function. Mientras tanto, la ventana de partidas crudas del parche vigente —que el
diseño de contadores conserva igual— alcanza para correr el build tal como está.

Y hay un beneficio que no es de cronograma: **la ventana cruda es el test de los
contadores**. Construir desde crudo y desde contadores sobre la misma ventana tiene
que dar el mismo JSON, comp por comp. Si los contadores se construyen primero, esa
comparación no existe.

## Qué se construye

### 1. El `tier` que el backfill no sube

`migrate-to-postgres.ts:113-124` arma la fila de `matches` **sin el campo `tier`**,
que el store en disco sí tiene (`store.ts:18`). Y `bandCovers` manda todo lo que no
tiene tier a **global y apex** (`bands.ts:91`, con `untagged: true` en esas dos
bandas).

O sea que subir el disco tal como está hoy inflaría las dos bandas de arriba y dejaría
a las otras tres sin evidencia. Se arregla antes de subir nada.

### 2. El backfill del parche vigente

| | disco | Postgres |
|---|---|---|
| partidas totales | 22.016 | 6.620 |
| del parche vigente (16.14), ranked | 7.253 | 2.411 |

Construir de Postgres hoy publicaría un tercio de la muestra. El backfill sube las
~4.800 que faltan del parche vigente (~56 MB; la base pasa de 93 a ~150 MB de los 400
en que empieza a podar). `migrate-to-postgres.ts` ya es idempotente: saltea lo que
existe, así que se puede correr de nuevo sin pensarlo.

**Con qué se compara el resultado.** Lo publicado hoy desde el disco, parche 16.14:

| banda | tableros | comps |
|---|---|---|
| global | 54.496 | 50 |
| apex | 25.072 | 44 |
| diamond-emerald | 24.048 | 50 |
| platinum-gold | 7.328 | 47 |
| silver-below | 1.576 | 0 (insuficiente) |

La primera publicación automática tiene que quedar cerca de esos números. Si no queda,
el backfill o el `tier` están mal.

### 3. El lector de Postgres

`pipeline/src/pgStore.ts` devuelve `LobbyRecord[]` —**la misma forma que
`loadLobbies`**— leyendo `matches` paginado por PostgREST. `build.ts` elige la fuente
por argumento (`--from=pg`, disco por defecto), como ya elige banda y parche.

El build de disco queda intacto: es lo que reconstruye un parche viejo y lo que
permite comparar las dos fuentes.

### 4. Parche nuevo: umbral provisional

`MIN_BAND_BOARDS` son 2.000 tableros y hoy solo lo incumple `silver-below`.
Automatizado, el día que Riot saca un parche lo incumplen **las cuatro bandas**, y
`MetaView.tsx:532` deja `/tft/meta` sin tier list —justo la página que pelea por esa
búsqueda— hasta que junte muestra.

Se agrega `PROVISIONAL_BAND_BOARDS = 500`: si el parche es el más nuevo y la banda
todavía no llegó a 2.000, publica igual con `provisional: true` y su conteo de
tableros adentro, y la UI lo dice con un aviso propio: el parche recién empieza, esta
lista se arma con N tableros y va a moverse. Al cruzar los 2.000 la bandera desaparece
sola.

**Atado al cambio de parche, no permanente.** La razón para aceptar una muestra fina
es que la alternativa —el meta del parche anterior— está *equivocada*, no que sea
mejor tener algo que nada. Para `silver-below`, que es fina siempre y no por
transición, la decisión del 2026-07-24 sigue en pie: publica vacío y explica por qué.

### 5. La Action

Programada a las 06:00 UTC (03:00 ART, tráfico bajo) más `workflow_dispatch`. Corre el
build contra Postgres y, si el resultado cambió, commitea los cinco JSON y pushea.
Netlify despliega solo.

**Una vez por día y no más seguido**, por dos razones medidas: Netlify cancela un
deploy si llega otro commit mientras construye (pasó el 2026-07-23), y cada commit
reescribe ~2,2 MB de JSON, que a diario son ~0,8 GB de historia de git por año.

**"Netlify despliega solo" era falso, y lo destapó la primera publicación
automática.** Con un `base` configurado —el nuestro es `games/tft/ui`— Netlify saltea
el build si el push no tocó nada adentro de ese directorio. La Action commitea solo
`games/tft/data/*.json`, que está afuera: el commit entraba, la Action quedaba verde,
y el sitio seguía sirviendo el meta del día anterior. Se arregla con un `ignore`
explícito en `netlify.toml` que mira también el directorio de datos. Ningún test ni
revisión de código lo podía ver: vive en la configuración del hosting, no en el repo
que se revisa.

Guardas, porque nadie va a estar mirando:

- **No commitea si el JSON no cambió, ignorando `generatedAt`.** Ese campo sigue en
  los archivos (2abfa4e lo sacó de la pantalla, no del dato), así que un `git diff`
  a secas **nunca** da vacío: cada corrida estampa una hora nueva. La comparación es
  contra todo lo demás; si solo cambió la hora, se descartan los archivos y no hay
  commit.
- **Aborta sin commitear** si `sampleSize` cae más de 30% contra el archivo
  commiteado —el campo sigue publicado y es justamente el que alimenta el
  encogimiento y la etiqueta de muestra fina—. Eso no es "hay menos partidas": es una
  lectura rota. **Con una excepción, y es la que hace que esta guarda no anule la
  publicación provisional**: si el archivo nuevo es de otro parche, la caída es
  legítima y esperada — un parche recién salido arranca con el 2% de la muestra del
  anterior. Sin esa excepción la Action falla todos los días durante más de una
  semana en cada cambio de parche, que es justo cuando más falta hace que publique.
- **Falla el run** —y con eso llega el mail de GitHub— si las últimas 48 corridas de
  `pull_runs` (un día entero, a media hora cada una) vinieron todas con `RIOT_401`.
  Que la key se venza es la rutina y no rompe nada; un día sin traer una sola partida
  es un olvido. Ver abajo.

Secretos: `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` como secrets del repo. Es la
misma llave que ya usa la Edge Function. No entra a git, pero queda al alcance de
cualquiera con permiso de Actions.

### 6. La poda no puede comerse lo publicado

`prune_matches` borra por `tier_expendability`: primero los rangos bajos, **incluidos
los del parche vigente**. Eso es exactamente la evidencia de `platinum-gold` y
`silver-below`. El comentario de `0005_prune_matches.sql:16-19` ya lo anotó: *"el día
que el build lea de Postgres, hay que revisar esto"*. Ese día es este.

El arreglo: que "no pertenece al parche publicado" pese **más** que el rango en el
orden de borrado. Set viejo → parche viejo → rango bajo → antigüedad.

No es teórico. La base crece ~6 MB/día (medido: 87 MB el 25/7, 93 MB el 26/7, con
~540 partidas por día), sale del backfill en ~150 MB y toca los 400 MB en unos 40-45
días. El Set 17 dura meses: la poda se dispara dentro de esta ventana, no después.

## Lo que sigue siendo manual, y por qué

- **La key de Riot vence cada 24 h.** No hay API para regenerarla y no se va a
  scriptear el login del portal. Hoy, 2026-07-26, `pull_runs` tiene 37 corridas y una
  sola falla: `RIOT_401` a las 00:17 UTC. Cuando no se renueve, el cron sigue
  corriendo, sigue fallando, y la Action sigue publicando lo mismo del día anterior.
  Por eso la Action avisa en vez de callarse. La solución real es la production key,
  que Riot puede tardar meses en aprobar.
- **`pull:ladder`.** No afecta la tier list; sí la pestaña Ladder.
- **El cambio de set.** Decisión explícita de ZoTaD: cuando abra el Set 18 se mira a
  mano. `SET_OPENS_AT` en `patch.ts` y `TFT_SET` en `build.ts` se tocan igual, más el
  rebuild del catálogo (`npm run catalog`).
  **Y desde el 2026-07-27, las imágenes**: `npm run catalog:images`. Ya no se enlazan a
  CommunityDragon —eso era lo que las hacía tardar— sino que viven en el repo bajo
  `games/tft/ui/public/img/set<N>/`. El set va en la ruta para que el `Cache-Control`
  de un año sea seguro, y el precio de eso es este paso: **si no se corre, los
  campeones del set nuevo salen sin imagen**, porque el catálogo va a apuntar a una
  carpeta `set18/` que nadie creó.

## Orden de implementación

1. `tier` en `migrate-to-postgres.ts` + backfill del parche vigente.
2. `pgStore.ts` y `--from=pg`, con el build de disco intacto.
3. Comparar las dos fuentes sobre el mismo parche. **Esta es la verificación que
   habilita todo lo demás**: si los números no se parecen a la tabla de arriba, no se
   sigue.
4. Umbral provisional (pipeline + aviso en la UI).
5. Orden de poda.
6. La Action, con sus tres guardas.

Cada paso deja el sitio publicando como hoy.

## Riesgo abierto

El lector de Postgres baja los payloads crudos: ~7.250 partidas × ~20 KB son ~145 MB
por corrida de la Action. Es aceptable una vez por día en CI, pero es el techo que
empuja hacia la fase 2 — los contadores se leen en kilobytes.

Ver también `2026-07-26-tier-list-incremental-design.md` y
`2026-07-24-parche-vigente-y-tier-list-design.md`.
