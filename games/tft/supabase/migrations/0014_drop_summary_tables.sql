-- El resumen se mudó a Cloudflare R2. Estas seis tablas ya no las escribe ni las
-- lee nadie.
--
-- Por qué se van en vez de quedarse por las dudas: ocupaban 322 MB de los 500 del
-- plan gratuito y crecían ~100 MB por día, mientras las partidas crudas —lo único
-- que Postgres todavía tiene que guardar, porque units/items/habits y la
-- calibración miden la mesa entera y no salen de contadores— pesan 93 MB. Dejarlas
-- "por las dudas" era chocar el techo en un día, y un DELETE no devuelve el
-- espacio: sólo DROP/TRUNCATE liberan el archivo.
--
-- Qué las reemplaza, y por qué esto no es una apuesta: antes de tocar nada se
-- verificó con `npm run verify:r2` que las dos fuentes daban el MISMO BandSummary
-- —que es exactamente lo que consume build.ts— en las cinco bandas y para el parche
-- vigente, dos veces: después del backfill y después de la primera corrida que
-- fusionó en R2. Y el backfill subió las 215.547 filas del parche anterior antes de
-- que se borrara ninguna.
--
-- Las funciones se van con las tablas. `summarize_batch` (0008) y los seis upserts
-- de 0007 sólo existían para escribir acá; el pipeline ahora escribe objetos y a
-- Postgres sólo le pide marcar `matches.summarized_at` con un PATCH común (ver
-- markSummarized en summarize-run.ts).
--
-- Lo que NO se toca, para que quede explícito: `matches`, `match_players`,
-- `players`, `ladder`, `rank_snapshots`, `pull_runs`, `rate_limit` y
-- `pipeline_locks` siguen igual. Supabase queda como backend de la API y de la
-- ventana de partidas crudas; el histórico vive en R2.

drop function if exists public.summarize_batch(text[], jsonb, jsonb, jsonb, jsonb, jsonb, jsonb);
drop function if exists public.upsert_comp_stats(jsonb);
drop function if exists public.upsert_comp_unit_stats(jsonb);
drop function if exists public.upsert_comp_unit_item_stats(jsonb);
drop function if exists public.upsert_comp_trait_stats(jsonb);
drop function if exists public.upsert_comp_item_stats(jsonb);
drop function if exists public.upsert_band_stats(jsonb);

drop table if exists public.comp_unit_item_stats;
drop table if exists public.comp_unit_stats;
drop table if exists public.comp_item_stats;
drop table if exists public.comp_trait_stats;
drop table if exists public.comp_stats;
drop table if exists public.band_stats;
