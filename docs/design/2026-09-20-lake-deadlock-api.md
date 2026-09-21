# El snapshot de deadlock-api pasó a ser un lake, y nadie avisó

Fecha: 2026-09-20.

## Qué pasó

- El 2026-09-17 a las 13:00 UTC el snapshot público de deadlock-api
  (`s3-cache.deadlock-api.com/db-snapshot`, un Parquet por partición) dejó de
  traer partidas con rango. El 19/9 el host desapareció del DNS, junto con
  `files.deadlock-api.com` y `docs.deadlock-api.com`.
- Nuestro pipeline hizo lo que estaba diseñado para hacer: congeló la ventana
  y lo dijo en el log. Pero la página no lo decía, y la tier list quedó
  clavada en el día del parche con Celeste en S mientras la API en vivo ya la
  mostraba nerfeada. ZoTaD lo notó el 19/9.
- Las cinco corridas del bot entre el 19/9 y el 20/9 fallaron enteras porque
  `build:items` tumbaba la corrida al no encontrar el snapshot, y con ella
  caían el commit, el periódico y la tier list en modo vivo.

## Qué se hizo, en orden

1. **19/9: respaldo con la API en vivo** para la tier list de héroes
   (`liveStats.ts`; ver el añadido en `2026-09-17-ventana-mezclada-tier-list.md`).
2. **20/9: los builds que dependen del snapshot ya no tumban la corrida**
   (`runSnapshotBuild` en `snapshot.ts`): si el snapshot no está, avisan "se
   mantiene lo publicado" y salen con 0. Verificado en CI: 19 pasos en verde
   con el snapshot caído.
3. **20/9: migración al lake nuevo.** Buscando qué había cambiado, el código
   de deadlock-api (`services/data_dump`, `McpSnapshotConfig`) mostró que el
   volcado público ahora vive en **`https://data.deadlock-api.com`**, descripto
   por `v1/manifest.json`, y que su propia documentación (`llms.txt`, del
   19/9) apunta a `files.deadlock-api.com/...` —un host que tampoco resuelve—.
   El lake sí responde y estaba al día (último archivo del 21/9 00:22 UTC).

## Cómo es el lake

- Tabla `match_player`, **las mismas columnas y tipos** que el snapshot viejo
  (verificado sobre un delta real): `average_badge`, `items.item_id`,
  `stats.time_stamp_s`, etc. `start_time` es TIMESTAMPTZ, así que `connect`
  fija `TimeZone = 'UTC'`.
- Un archivo **base** por partición (`intDiv(match_id, 1000000)`, los mismos
  números que antes: 103…106 hoy), más **deltas** horarios y **residuales**
  con las filas que todavía no entraron a una base. Los deltas cubren
  cualquier partición y cualquier época (partidas que llegaron tarde), así que
  una ventana lee las bases que toca **más todos los deltas**, y el filtro por
  `start_time` hace el resto.
- Los archivos llevan la hora en el nombre y no se reescriben.

## Cómo quedó el lector (`snapshot.ts`)

- `listPartitions()` baja el manifiesto, se queda con las bases de la
  generación vigente y guarda deltas y residuales. Una corrida entera usa la
  misma versión del manifiesto.
- `partitionSource(n)` devuelve la lectura de una partición
  (`read_parquet([...], union_by_name=true)`); la partición `EXTRAS = -1` son
  los deltas. `partitionRanges` siempre la agrega, con rango abierto.
- Todos los builds pasaron de `read_parquet('${partitionUrl(n)}')` a
  `${partitionSource(n)}`. El SQL no cambió.
- Costo medido en local: `build:heroes` 3m18s (antes ~1m30s; los deltas se
  leen enteros en cada rama), `build:items` 53s, `build:ranks` ~1m.

## Lo que queda

- El respaldo con la API en vivo sigue activo por si el lake también se cae.
- Si deadlock-api publica una dirección nueva, la única constante que hay que
  tocar es `MANIFEST_URL`.

## Costo medido en local (2026-09-21) y qué mirar

| Build | Antes | Con el lake |
|---|---|---|
| heroes | ~1,5 min | 3,3 min |
| items | ~10 s | 53 s |
| builds | ~10 min | ~25 min |
| mastery | 5,6 min | 22,7 min de escaneo |
| report | 5,5 min | 23,4 min de carga |

El motivo es que la partición `EXTRAS` (todos los deltas y residuales, ~30
archivos de 70-180 MB) se lee entera en cada rama de cada consulta. Las
corridas programadas reparten los tres pesados en horas distintas, así que
cada una queda en 30-35 minutos, lejos del timeout de 90. **La corrida manual
(`workflow_dispatch`) corre los tres juntos y ronda los 80 minutos**: si se
acerca al timeout, la primera optimización es filtrar los deltas por su `hi`
(una fila creada antes de `from` no puede haber empezado después), y la
segunda, materializar los deltas una vez por corrida en una tabla temporal de
DuckDB en vez de releerlos por rama.
