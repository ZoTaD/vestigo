-- Heartbeat para el lock de summarize_run.
--
-- `try_acquire_summarize_lock` (0009_summarize_lock.sql) escribe `locked_at` UNA
-- vez, al tomar el lock, y esa fila se considera libre en cuanto pasan 30 minutos
-- -- ver el comentario de esa migración para por qué el vencimiento existe (es el
-- reemplazo del auto-release de una sesión que nunca tuvimos, porque el lock es una
-- fila y no un advisory lock de sesión). El problema: summarize-run.ts llamaba
-- `acquireLock` una vez antes del loop y `releaseLock` una vez al final, sin tocar
-- `locked_at` en el medio. Una corrida más larga que esos 30 minutos -- el backfill,
-- por diseño, tarda más -- queda con el lock "vencido" en la tabla mientras SIGUE
-- procesando, y `try_acquire_summarize_lock` se lo presta a otra corrida que arranca
-- desde la misma primera página: las dos terminan sumando el mismo lote de partidas,
-- y ese doble conteo es permanente porque comp_stats y compañía solo suman, nunca
-- restan.
--
-- `refresh_summarize_lock` pisa `locked_at` SOLO si el `holder` todavía coincide con
-- el token que se pasa -- mismo chequeo que `release_summarize_lock`, pero sin soltar
-- la fila. Si el UPDATE afecta cero filas es porque el lock ya no es nuestro (otra
-- corrida lo tomó, sea porque lo dejamos vencer o por lo que sea): quien llama tiene
-- que abortar en vez de seguir escribiendo, exactamente como hace ahora el loop
-- principal de summarize-run.ts en cada vuelta.
create or replace function public.refresh_summarize_lock(token uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  rows_updated integer;
begin
  update public.pipeline_locks
     set locked_at = now()
   where name = 'summarize_run' and holder = token;
  get diagnostics rows_updated = row_count;
  return rows_updated > 0;
end;
$$;

-- Mismo motivo que las funciones de 0008/0009/0010: dos revokes, uno por el
-- otorgamiento explícito a anon/authenticated que este proyecto agrega por default
-- en toda función nueva, y otro por el otorgamiento implícito a PUBLIC que Postgres
-- agrega por default en toda función (a diferencia de las tablas).
revoke execute on function public.refresh_summarize_lock(uuid) from anon, authenticated;
revoke execute on function public.refresh_summarize_lock(uuid) from public;
