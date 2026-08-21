# LP en el tiempo

**Fecha:** 2026-07-24
**Estado:** aprobado, pendiente de implementación

## El problema

El perfil no dice en qué elo está el jugador. El rango se pide en cada búsqueda
—`/tft/league/v1/by-puuid`— pero se usa solo para elegir la banda del meta y
después se descarta. Un jugador que se busca a sí mismo ve veinte partidas y
ningún LP.

Lo que se pidió es más que eso: **la progresión de LP partida a partida**.

## Verificación de la premisa: lo que NO se puede

**El payload de match de Riot no trae LP ni delta de LP.** No es que no lo
estemos leyendo: no existe. El commit `e38b7fe` recorrió el `MatchDto` entero
campo por campo buscando justamente lo que estábamos dejando pasar, y lo que
apareció fue `players_eliminated`, `time_eliminated`, `total_damage_to_players`
y el estilo del trait. Nada de LP.

La única fuente de LP es `by-puuid`, y da **el LP de ahora**, no una serie. La
tabla `ladder` guarda LP pero se pisa en cada corrida (PK `region+puuid`), así
que tampoco hay historia ahí.

**Conclusión: la progresión hacia atrás no se puede reconstruir.** Ni con la
production key. Lo que sí se puede es empezar a medirla desde hoy.

## Lo que sí se puede, y por qué es exacto

`by-puuid` devuelve `wins` y `losses` además del rango. Están declarados en
`supabase/functions/tft-api/index.ts` y hoy se tiran. Su suma es la cantidad de
partidas rankeds jugadas, así que **restando dos snapshots se sabe exactamente
cuántas rankeds pasaron entre medio**.

Con eso, la atribución deja de ser una estimación:

> Si entre dos snapshots `Δgames === 1` y tenemos esa única partida, el `Δlp` de
> esa ventana **es** el LP de esa partida. Es un hecho verificable, no un modelo.

Si `Δgames > 1`, la fila calla. No se reparte el total entre las partidas de la
ventana: eso sería inventar un número con cara de dato, exactamente lo que el
proyecto rechazó en los Player Tags y en el cerebro de coaching.

## Decisiones tomadas

| Decisión | Elección |
|---|---|
| Alcance | Trackear desde hoy; la historia vieja no existe y no se simula |
| Dónde vive el dato | Postgres, tabla nueva `rank_snapshots` |
| Dónde vive la lógica | **UI**, módulo puro con tests (`ui/src/lp.ts`) |
| Costo en Riot | **Cero**: la llamada al rango ya se hace en cada búsqueda |
| Delta ambiguo (`Δgames > 1`) | Sin chip. La fila calla |
| Retención | Sin límite (decisión explícita del 2026-07-24) |
| Cruce de sets | El gráfico filtra por set: el rango se resetea |
| Append del ladder | **Afuera**: ~1.000 filas por corrida de un script manual |

## Escala absoluta de LP

Un ascenso de Oro I 100 LP a Platino IV 12 LP es **+12**, no −88. Comparar LP
crudo entre snapshots sin normalizar dibujaría un derrumbe cada vez que alguien
sube de división.

```
absoluteLp(tier, division, lp):
  IRON..DIAMOND  →  tierIndex*400 + (4 − división)*100 + lp
  MASTER, GRANDMASTER, CHALLENGER  →  2800 + lp
```

Master, Grandmaster y Challenger comparten un mismo pool de LP: son cortes sobre
la misma escala, no escalones con LP propio. Por eso los tres mapean igual y un
Challenger de 900 LP da 3700.

## Arquitectura

### Almacenamiento — `0003_rank_snapshots.sql`

```sql
create table if not exists public.rank_snapshots (
  puuid         text        not null,
  region        text        not null,
  set_number    integer,
  tier          text        not null,
  division      text        not null,
  league_points integer     not null,
  games         integer     not null,   -- wins + losses: el validador
  taken_at      timestamptz not null default now(),
  primary key (puuid, taken_at)
);

create index if not exists rank_snapshots_puuid_idx
  on public.rank_snapshots (puuid, taken_at desc);

alter table public.rank_snapshots enable row level security;
```

Misma postura que las otras cuatro tablas: **RLS activo y cero políticas**. Con
la clave publicable no devuelve ni una fila; solo la Edge Function la toca.

**Dedup en la escritura**: se inserta solo si el último snapshot difiere en LP
absoluto o en `games`. Buscarse cinco veces en un minuto no debe dejar cinco
puntos idénticos en el gráfico.

`set_number` sale de las partidas del propio jugador: `handleSearch` ya consulta
`matches?select=match_id&match_id=in.(…)` para calcular `cached`, sobre los ids
que está por analizar. Se le agrega `set_number` a ese `select` y se toma el más
alto. Es una columna más en una consulta que ya corre, no una consulta nueva.
Null cuando no hay ninguna partida guardada todavía, y un null nunca entra en
una serie. **No se escribe un número de set a mano**: nada en este producto lo
hace.

### Transporte

`SearchResult` gana `lpHistory?: LpSnapshot[]` con la serie del jugador. Viaja
en la misma respuesta de `search`: sin round-trip nuevo y sin tocar el
analizador. `dev-api.ts` hace exactamente lo mismo contra la misma base —ya
tiene service key por la ruta del ladder— porque una diferencia entre los dos
aparece como una feature que anda en dev y no en producción.

### Lógica — `games/tft/ui/src/lp.ts`

Puro y con tests, el mismo patrón de `families.ts` y `buildCode.ts`. El server
sirve filas; el pensamiento vive acá, donde se puede probar.

- `absoluteLp(tier, division, lp): number`
- `formatRank(...)` → "Oro I · 42 LP" (Master+ sin división)
- `series(snapshots, set)` → los puntos del gráfico, del set vigente
- `attribute(snapshots, matches)` → `Map<matchId, delta>`

El algoritmo de `attribute`, por cada par consecutivo de snapshots (A, B):

1. Candidatas = partidas **rankeds** (`queueId === 1100`) con
   `playedAt ∈ (A.taken_at, B.taken_at]`.
2. Si `B.games − A.games === 1` **y** hay exactamente una candidata →
   `delta = absoluteLp(B) − absoluteLp(A)` para esa partida.
3. Si no, la ventana no aporta ningún chip.

El paso 2 pide las dos condiciones a propósito. `Δgames` viene del contador de
Riot y cubre las partidas que no tenemos; la cuenta de candidatas cubre las que
sí. Cuando discrepan, es que falta información, y la respuesta correcta es
callarse.

### UI

- **Cabecera** (`PlayerView`): `player-rank` al lado de `player-level`.
- **Bloque "LP en el tiempo"** (`ProfilePanel`), junto a la línea de puestos.
  Con menos de dos puntos del set vigente **no dibuja gráfico**: dice que
  recién empezamos a seguirlo y que vuelva después de su próxima partida. Un
  gráfico de un punto es una mentira con forma de línea.
- **Chip `+34` / `−18`** en la fila de la partida, solo donde la atribución es
  inequívoca.
- Copia nueva **solo** en `i18n.ts`, EN y ES neutro latinoamericano. Incluye los
  diez nombres de tier (Hierro… Challenger), que hasta ahora no hacían falta
  porque el rango nunca se mostraba: la banda sí estaba traducida, el tier no.

### Errores

Todo lo que puede fallar, falla solo:

- Riot no contesta el rango → `rank: null`, banda por defecto, ningún snapshot
  nuevo, y **la serie vieja se sigue mostrando**.
- La inserción falla → se traga, igual que `playerRank` y `playerAccount`.
  Nunca romper una búsqueda por un dato accesorio.
- Camino offline → no hay rango que pedir; la serie se lee igual de la base.
- Rango de Hyper Roll → ya filtrado por `queueType === "RANKED_TFT"`.

## Privacidad

La tabla guarda un dato personal nuevo. La política de privacidad se actualiza
**en el mismo commit** —regla que fijó el propio documento— con un renglón en la
sección de servidor que agregó `63def02`: guardamos rango, LP y partidas jugadas
de las cuentas buscadas, con fecha, sin límite de tiempo.

La retención sigue siendo un pendiente conocido del proyecto, ahora con una
tabla más. No se resuelve acá.

## El hallazgo aparte: `standard` no quiere decir "ranked"

Atribuir LP obliga a distinguir la cola, y ahí apareció un problema que ya
existía.

El criterio de qué partida cuenta es `gameType === "standard"`, tanto en el
perfil (`ui/src/analyzer.ts`) como en el pipeline (`pipeline/src/store.ts`).
**Ese campo no dice "ranked".** Medido sobre las 21.751 partidas del store:

| cola | `tft_game_type` | qué es |
|---|---|---|
| 1100 | standard | **Ranked TFT** |
| 1090 | standard | Normal TFT |
| 1210 | standard | **Choncc's Treasure Mode** (evento) |
| 6120 | standard | modo de evento del Set 17 (10/6 → 14/7) |
| 6110 | standard | revival (sus partidas son de Set 4) |
| 1160 | pairs | Double Up — ya excluido |
| 1220 | pve | ya excluido |

1090, 1100 y 1210 salen de `queues.json` de Riot verbatim; 1210 es literalmente
"Teamfight Tactics Choncc's Treasure Mode". Las 6xxx no figuran en ese archivo,
pero 6120 corrió en una ventana cerrada (10 de junio al 14 de julio), tiene 10,6%
de solapamiento de jugadores contra ranked, y desapareció el día que entró el
parche 16.14. Es un modo de evento.

**El impacto medido, por parche:**

| parche | 1100 | 1090 | 6120 | contaminación |
|---|---|---|---|---|
| 16.14 (publicado) | 7.116 | 189 | 0 | **2,6%** |
| 16.13 | 3.990 | 137 | 585 | **12,4%** |

Hoy la tier list está contaminada 2,6%, y solo porque el modo de evento murió
justo cuando entró el parche vigente. **Eso es suerte, no diseño**: si el parche
publicado fuera 16.13, uno de cada ocho tableros de la tier list sería de otro
juego. Y en un perfil individual no hay promedio que diluya nada — quien jugó
diez normales de sus últimas veinte tiene la mitad de sus números medidos contra
un meta que no es el suyo.

**El arreglo**: el criterio pasa a ser `queueId === 1100`, en las dos copias.

- `pipeline/src/store.ts` — `usable()`
- `ui/src/analyzer.ts` — `MatchView` expone la cola, que el normalizador ya
  captura (`analysis/src/normalize.ts`) pero la vista no muestra.

Consecuencias que hay que asumir en el mismo trabajo:

- **Hay que reconstruir las cuatro bandas.** Dejar el filtro nuevo con los JSON
  viejos publicados sería que el código y los datos digan cosas distintas.
- Los números publicados se mueven. Es la corrección, no un efecto secundario.
- `queue_id` está presente en las 21.751 partidas del store, así que el filtro
  no descarta nada por ausencia del campo.

## Testing

- `ui/test/lp.test.ts`: ascenso, descenso, Master+ sin división, ventana
  ambigua, normales mezcladas en la ventana, snapshot único, serie que cruza de
  set.
- El filtro de cola, en los tests que ya cubren `usable()` y el perfil.

**Verificación empírica — hecha el 2026-07-25, contra la API en vivo.**

No hizo falta esperar a que alguien jugara: la tabla `ladder` ya era un snapshot
de 2 días y 4 horas antes, con `wins`/`losses` por jugador. Se comparó contra
`by-puuid` en vivo y contra las partidas jugadas en el medio, sobre 6 challengers
de LAS:

| jugador | contador antes | ahora | Δ | partidas en la ventana |
|---|---|---|---|---|
| #1 | 373 | 378 | 5 | 5 |
| #2 | 332 | 342 | 10 | 10 |
| #3 | 647 | 663 | 16 | 16 |
| #4 | 481 | 481 | **0** | **0** |
| #5 | 387 | 393 | 6 | 6 |
| #6 | 247 | 250 | 3 | 3 |

**6 de 6 exactos**, con el #4 de control: jugó cero y el contador se movió cero.

Y las 40 partidas de esas ventanas se bajaron una por una para mirar su cola:
**40 de 40 son 1100**. Eso descarta la lectura alternativa —que el contador
cuente cualquier cola y haya coincidido de casualidad con el total.

Hueco que queda: no se observó el caso inverso (alguien que juegue una no-ranked
y el contador no se mueva), porque ningún challenger de la muestra jugó fuera de
ranked. La razón estructural es que el contador sale de la entrada de liga de
`RANKED_TFT`, que es un objeto por cola. Se cierra solo la primera vez que haya
snapshots de una cuenta que juegue normales.

**Hallazgo lateral que le importa al pipeline**: el endpoint de ids **ignora el
parámetro `queue`**. Verificado como se verificó `startTime` en `4325da2` —
`queue=1100` y `queue=1090` devuelven la misma lista, y un filtro real habría
devuelto cero en el segundo caso. La cola solo se puede filtrar después de bajar
la partida, no en el pedido.

## Lo que NO hace

- **No estima** el delta de ninguna partida.
- **No barre divisiones enteras** para armar historia de todos: eso necesita la
  production key y es otro trabajo.
- **No toca la tier list** salvo por el filtro de cola y su reconstrucción.
- **No implementa retención**, ni la de partidas que la política ya promete.
