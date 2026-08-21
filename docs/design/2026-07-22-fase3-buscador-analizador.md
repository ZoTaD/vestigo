# Fase 3 — Buscador de jugadores y analizador de partidas

- **Fecha:** 2026-07-22
- **Fase:** 3 del [design doc](2026-07-22-probuilds-tft-design.md)
- **Objetivo:** buscar un jugador por Riot ID, ver su historial y, al abrir una
  partida, decirle qué pudo hacer mejor.

---

## 1. Decisiones

| Decisión | Elegido | Por qué |
|---|---|---|
| Qué dice el analizador | Informe con **tres familias** de conclusiones | Cada familia es un módulo aislado y testeable |
| Base de datos | **Postgres en Supabase** | Reemplaza el store local; habilita el flywheel de datos |
| Quién tiene la key de Riot | **Edge Function (Deno)** | La key vive en los secrets de Supabase; el navegador nunca la ve |
| Dónde se calcula el análisis | **En el navegador** | Lógica pura testeable con Vitest, sin Deno ni red de por medio |
| Store actual (475 partidas) | **Migrar entero a Postgres** | Una sola fuente de verdad: el buscador engorda el mismo pozo que `comps.json` |

**El flywheel:** cada jugador que se busca a sí mismo persiste sus partidas en
Postgres, y esas partidas alimentan `comps.json`. El buscador no es solo una
feature: es el motor de crecimiento del dataset.

---

## 2. Arquitectura

```
games/tft/
├─ data/        comps.json + catalog.json  (generados por el pipeline)
├─ pipeline/    Node — pull/build, ahora contra Postgres
├─ analysis/    ★ NUEVO — lógica pura del informe (TS sin node:), Vitest
├─ ui/          React — buscador, historial, informe
└─ supabase/    ★ NUEVO — migraciones + Edge Functions (Deno)
```

`analysis/` es hermano de `engine/`, que el design doc reserva para el motor de
ítems de Fase 4. La UI lo importa con alias `@analysis`, igual que ya hace con
`@data`.

**Flujo:** UI → Edge Function (tiene la key, habla con Riot, persiste en
Postgres, devuelve la partida cruda) → UI cruza esa partida con `comps.json` y
produce el informe.

**Seguridad:** RLS activo y **sin políticas anon**. Solo la Edge Function
(service role) toca las tablas. El navegador nunca ve ni la key de Riot ni la
base.

---

## 3. Base de datos

| Tabla | Contenido |
|---|---|
| `matches` | `match_id` pk, region, set, `payload jsonb` **verbatim**, fetched_at |
| `players` | `puuid` pk, game_name, tag_line, region — caché de `account-v1` |
| `match_players` | `match_id` × `puuid` × placement — historial sin escanear jsonb |

Se guarda el payload crudo, igual que el store actual: normalizar en lectura
significa que agregar un campo nuevo nunca obliga a re-descargar nada.

---

## 4. Hallazgos verificados contra datos reales

Todo lo de esta sección se midió sobre las 475 partidas / 3758 tableros del
store, o se probó contra la API. Nada acá es suposición.

### 4.1 `account-v1` funciona con la dev key

`GET /riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` responde **200**
y devuelve el `puuid`. El buscador por Riot ID es viable. El `RiotClient` actual
no tiene este endpoint: hay que agregarlo.

### 4.2 El encoding de `last_round`, derivado empíricamente

`last_round` va de 1 a 42 y correlaciona con el puesto (35.5 promedio para el
1°, 24.2 para el 8°).

El histograma de eliminaciones revela la estructura sin necesidad de wikis: en
las rondas **22, 25, 29, 32, 36 y 39** casi no se elimina nadie (en la 39,
nunca). Los espacios alternan 3-4-3-4-3. Eso corresponde exactamente a los
X-4 (carrusel, sin combate) y X-7 (PvE) bajo el mapeo **etapa 1 = 4 rondas,
después 7 por etapa**:

```
etapa = last_round <= 4 ? 1 : floor((last_round - 5) / 7) + 2
ronda = last_round <= 4 ? last_round : ((last_round - 5) % 7) + 1
```

Cada hueco cae en su lugar: r15 = 3-4, r22 = 4-4, r29 = 5-4, r39 = 6-7. El
máximo observado, 42, es **7-3**.

### 4.3 La contabilidad exacta del pool NO es posible

**Esto descartó la propuesta original del módulo de comps disputadas.**

La idea era decir "6 de las 18 copias de tu carry estaban en manos ajenas".
Sumando copias por lobby (1★=1, 2★=3, 3★=9) aparecieron **17 copias de un
4-costo y 19 de un 5-costo**, cuando toda fuente coincide en 10 y 9.

La causa: **los 8 tableros no son simultáneos.** La API guarda el tablero de
cada jugador en el momento de su eliminación. Al morir, sus unidades vuelven al
pool y otro jugador las compra después. Sumar los tableros finales cuenta la
misma copia reciclada varias veces.

Confirmado achicando la distancia temporal — el máximo converge al pool real:

| Jugadores considerados | c1 | c2 | c3 | c4 | c5 |
|---|---|---|---|---|---|
| los 8 | 24 | 25 | 24 | **17** | **19** |
| puestos 1-4 | 18 | 21 | 24 | 12 | 16 |
| puestos 1-2 | 18 | 18 | 15 | **9** | **9** |
| *pool publicado* | *29-30* | *22-25* | *17-18* | *10* | *9* |

Con solo los dos finalistas, todo cae dentro del pool publicado.

**Además, las fuentes web se contradicen** entre sí sobre el tamaño del pool
(esportstales 30/25/18/10/9, tft.ninja 22/20/17/10/9, redeemertft 29/22/18/10/9)
y **CDragon no expone el dato** (`campos con "pool": ninguno`). No hay fuente
confiable ni auto-actualizable. Razón de más para no depender del pool.

### 4.4 La disputa cuesta puesto, no estrellas

Crudo, disputar el carry parece no costar nada: puesto promedio **4.46**
disputado vs **4.51** sin disputar. Pero eso está confundido —las comps fuertes
se disputan más—. Comparando **dentro del mismo carry**, que elimina el sesgo:

- **Puesto: +0.28 peor** cuando te disputan. El efecto existe.
- **Estrellas: −0.027.** Ruido. Ahí no hay nada.

Muestra chica (15 carries con n≥10 en ambos grupos), así que se usa como señal
calibrada, no como ley.

### 4.5 Rarezas del payload que el parser tiene que tolerar

- **6 partidas tienen menos de 8 jugadores** (475 primeros puestos, 469 del
  resto).
- **El 6.6% de los tableros repite un campeón** (247 de 3758, 468 unidades
  extra). Ya conocido del pipeline; el analizador tiene que colapsarlos igual.
- Aparecen ids fuera del catálogo del Set 17: unidades invocadas
  (`tft17_bardfollower`, `Summon`, `PVE_ElderDragon`) y restos de otros sets
  (`TFT16_*`, `TFTEvent5YR_*`). Se ignoran, no rompen.

---

## 5. Los tres módulos del informe

Cada módulo es una función pura `(miTablero, lobby, comps) → Finding[]`. El
informe es la concatenación ordenada por severidad. Se testean por separado con
fixtures tomadas de partidas reales del store.

### `contested.ts` — quién te peleaba la comp

Afirma solo lo verificable del payload: cuántos jugadores terminaron con tu
mismo **carry**, tu misma **unidad** y tu mismo **trait dominante**, y qué
puesto sacaron. Cita la penalización medida de **+0.28 puestos** como contexto
calibrado.

**No afirma** conteo de copias del pool (ver 4.3) ni que la disputa te haya
costado las estrellas (ver 4.4).

### `metaGap.ts` — tu tablero contra lo que funciona

**Compara contra los que ganaron, no contra el promedio.** El promedio de una
comp mezcla al 1.º con el 8.º, así que produce observaciones ("esta unidad está
en el 85% de los tableros") en vez de lecciones. Cada comp se parte en top 4 y
5.º-8.º, y lo que se reporta es la diferencia entre las dos mitades:

- **Unidad faltante:** *"Te faltó Shen. La llevaban 62% de los que hicieron top
  4 con esta comp, contra 33% de los que cayeron. Con ella la comp promedia 4.4
  de puesto; sin ella, 5.5."*
- **Unidad que sobra:** las que los ganadores dejan afuera y vos llevabas.
- **Ítems:** los que construyen los top 4 sobre ese carry, no el promedio.
- **Nivel:** contra el nivel de los top 4, mostrando también el de los que caen.

**El confundidor, medido:** los tableros ganadores tienen 8.98 unidades
distintas contra 8.24 los del fondo — 9% más, porque sobrevivir da más niveles.
Eso regala un lift base de ~0.06 a *cualquier* unidad. El umbral está en 0.20,
más de tres veces esa base, y la redacción afirma correlación, nunca causa.

Umbrales: lift ≥ 0.20, diferencia de puesto ≥ 0.5, y **mínimo 10 tableros de
cada lado**. La primera versión aceptaba 4 y 3, y producía frases como "el 63%
de los top 4 la llevaba" sobre tres tableros de cinco.

Cobertura real: 67% de los informes tienen al menos un hallazgo accionable.

### `mistakes.ts` — errores medibles

Señales duras del payload: oro sin gastar al morir (`gold_left`), carry sin
completar sus ítems, y trait a una unidad del breakpoint (los breakpoints salen
de CDragon, `effects[].minUnits`, así que se refrescan con el set).

**El check de nivel se descartó.** Comparando cada jugador contra la mediana de
los eliminados en su misma ronda: por debajo promedia **4.54** de puesto, en la
mediana **4.55**. Indistinguible. Afirmar "estabas bajo de nivel" habría sido
ruido presentado como diagnóstico.

En cambio el de ítems resultó mucho más fuerte de lo esperado: pasa en ~1% de
los tableros, y esos promedian **5.82** de puesto contra **4.48**.

### 5.1 Nada de esto está hardcodeado

Las cifras que el informe cita (cuántas partidas, cuánto cuesta la disputa, los
promedios por banda de oro) **las mide el pipeline en cada `build:comps`** y
viajan dentro de `comps.json` como `calibration`. El analizador las recibe
inyectadas, igual que los nombres para mostrar.

Estaban escritas a mano en el código, medidas una vez. Eso viola la regla de oro
del proyecto: con el Set 18 el analizador habría seguido citando números del
Set 17 sin que nadie se enterara. Al medirlas se movieron solas de 475/0.28 a
494/0.25 partidas cuando el store creció.

---

## 6. Manejo de errores

Cuatro fallos con mensaje propio, ninguno genérico:

- **Key de Riot vencida** — las dev keys mueren cada ~24h. Error tipado
  (`RIOT_KEY_INVALID`), no "algo salió mal".
- **Jugador inexistente** — 404, distinto de red caída.
- **Supabase pausado o caído** — el free tier se pausa a los 7 días sin uso.
- **Partidas con menos de 8 jugadores** — ya hay 6 en el store; no pueden
  romper el parser.

**Latencia:** traer 20 partidas son 20 llamadas a Riot. `player-search` devuelve
los IDs al toque más lo ya cacheado; la UI pinta el historial en esqueleto y
pide el detalle por lotes. Si no, la primera búsqueda tarda medio minuto.

---

## 6.1 El puente de desarrollo

`games/tft/ui/dev-api.ts` es un plugin del dev server de Vite que implementa
**el mismo contrato que la Edge Function** (`POST /api/search`, `POST /api/match`,
mismas respuestas y mismos códigos de error), pero contra el store local y la
key del pipeline.

Sirve para dos cosas: la UI se desarrolla y se prueba sin depender de Supabase, y
pasar a producción es cambiar `VITE_API_BASE`, no reescribir nada. Además cachea
en el store igual que la función cacheará en Postgres — navegar la UI ya hizo
crecer el dataset de 475 a 494 partidas.

Si Riot no responde pero el jugador ya está en el store, contesta igual desde
disco y lo marca como `offline`. El analizador sigue usable con la key vencida.

## 7. Migración

1. Migración SQL vía el MCP de Supabase.
2. Script único que sube las 475 partidas del store local.
3. `store.ts` cambia de implementación **detrás de la misma interfaz**
   (`hasMatch`, `saveMatch`, `loadRawMatches`…). `store.test.ts` ya existe y
   guía el cambio.
4. El pipeline sigue corriendo en Node como hoy.

---

## 8. Fricción conocida

Con la Edge Function, la key de Riot vive en los secrets de Supabase, y la dev
key vence cada 24 horas. **Hay que actualizar ese secreto todos los días** hasta
que Riot otorgue la production key. En local era solo editar un `.env`.

---

## 8.1 Estado al cierre de la sesión

| Pieza | Estado |
|---|---|
| `analysis/` — los tres módulos + informe | ✅ Hecho, 55 tests |
| Calibración medida por el pipeline | ✅ Hecho, 6 tests |
| `account-v1` en el `RiotClient` | ✅ Probado contra la API real |
| UI: buscador, historial, informe | ✅ Verificado en el navegador |
| `dev-api.ts` (puente de desarrollo) | ✅ Funcionando |
| Migración SQL | ✅ Aplicada en `ehqumszjcsbftojbseuk` |
| Edge Function `tft-api` | ✅ Desplegada y probada (401 sin auth, errores tipados) |
| `RIOT_API_KEY` en secrets | ⏸ **Falta** — la función responde `NOT_CONFIGURED` |
| Script de migración a Postgres | ✅ Escrito (`npm run migrate:pg`), sin correr |
| UI apuntando a la función | ✅ Cableada, falta cargar el `.env.local` |
| Perfil del jugador | ✅ Fichas + comps y campeones más usados |

**Los tres pendientes esperan credenciales que no puedo obtener yo:** el MCP de
Supabase no expone manejo de secretos, y la *service role key* —que bypassea
RLS— solo sale del dashboard. Ambas cosas son del usuario por diseño.

### Consejos que se descartaron por no enseñar nada

Tres ideas plausibles que la data rechazó. Quedan escritas para que nadie las
reintente:

| Idea | Por qué se cayó |
|---|---|
| "Con una unidad más llegabas al siguiente breakpoint" | Aritmética, no consejo. No dice qué unidad ni si ese escalón importa. |
| Unidades por encima de un breakpoint que no activan nada | Pasa en el 21% de los tableros pero mueve **0.10 puestos**. Ruido: esas unidades ganan su lugar por otro trait. |
| "Nivel bajo para la ronda" | Debajo de la mediana de tu ronda: 4.54 de puesto. En la mediana: 4.55. |

## 9. Fuera de alcance

- Motor de ítems con contención de recursos (Fase 4, `engine/`).
- Overlay en vivo (Fase 5, bloqueado por Overwolf).
- Cuentas de usuario y autenticación.
- Rate limiting distribuido en la Edge Function: v1 maneja el 429 con reintento
  y lo comunica, sin presupuesto compartido entre invocaciones.
