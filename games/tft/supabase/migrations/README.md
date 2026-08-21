# Historia, no infraestructura

Esta carpeta describe una base que **ya no existe**. El proyecto de Supabase se
apagó el 2026-07-29: los contadores del resumen viven en Cloudflare R2 (migración
`0014`) y todo lo demás en Cloudflare D1, cuyo esquema está en
`games/tft/cloudflare/schema.sql`.

Se conservan porque cada migración explica **por qué** algo es como es, y varias de
esas razones sobrevivieron a la mudanza:

- `0005`/`0013` — el borrado que un día vació la tabla de partidas, y la regla que
  salió de ahí: el disparador y el remedio tienen que mirar lo mismo. En D1 no hay
  prune por tamaño justamente por eso.
- `0007`/`0008` — el upsert que sumaba contadores y la transacción que lo envolvía.
  Ese "todo o nada" es lo que R2 no puede dar, y es la razón de que `absorbed` viva
  adentro de cada objeto (ver `r2Summary.ts`).
- `0009`/`0011` — el lock con heartbeat. La lógica es la misma en D1, en SQL.

Las Edge Functions que vivían al lado se borraron: las reemplazaron
`games/tft/cloudflare/src/api.ts` (search, match, ladder) y `pull.ts` (el cron).
