-- Un lock de aplicación para que dos resumidores no corran a la vez.
--
-- `pendingMatchesQuery` no reclama filas: ordena por `match_id.asc` y no marca
-- nada hasta el final del lote, así que dos corridas simultáneas piden
-- exactamente la misma primera página y suman lo mismo dos veces. El
-- `concurrency` de publish.yml serializa dos corridas de ese workflow, pero no
-- protege contra un `npm run summarize` local corriendo al lado del cron, ni
-- contra el backfill (que está pensado para correr en paralelo al cron diario).
--
-- Esto NO usa pg_try_advisory_lock, a pesar de ser la herramienta obvia para
-- "lock de aplicación". Se probó primero (ver el commit anterior, revertido
-- antes de aplicarse a este archivo) y se reprodujo en vivo el problema real:
-- pg_try_advisory_lock es un lock de SESIÓN, y PostgREST no garantiza la misma
-- conexión física entre dos llamadas RPC separadas. Con tráfico secuencial de
-- un solo cliente parecía funcionar (mismo backend pid en llamadas repetidas),
-- pero en cuanto hubo tráfico concurrente real —dos corridas a la vez, que es
-- EXACTAMENTE el escenario que este lock tiene que cubrir—, `acquire` y
-- `release` cayeron en conexiones físicas distintas: el release no liberó nada
-- (pg_advisory_unlock devuelve false si la sesión que llama no es la que
-- tomó el lock), y el lock quedó tomado para siempre en una conexión inactiva
-- del pool — verificado con `select * from pg_locks where locktype='advisory'`
-- mostrando el lock en un pid idle. Un lock que se puede quedar trabado para
-- siempre es peor que el problema que este fix intenta resolver.
--
-- La alternativa de acá es una fila, no una sesión: `pipeline_locks` guarda
-- cuándo se tomó el lock y un token random que lo identifica. "Tomar" el lock
-- es un UPDATE (envuelto en un INSERT ... ON CONFLICT para crear la fila sola
-- la primera vez) que solo pisa la fila si está libre o vencida; "soltarlo" es
-- otro UPDATE que solo limpia la fila si el token coincide con el que la tomó.
-- Ninguno de los dos depende de qué conexión física atendió el request: es
-- exactamente lo mismo sin importar el pool de PostgREST.
--
-- El vencimiento (30 minutos, igual que el timeout-minutes del workflow de
-- publicación) es lo que reemplaza el auto-release de una sesión que muere: un
-- proceso que se cuelga sin llegar al `finally` de summarize-run.ts no deja el
-- lock tomado para siempre, lo deja tomado hasta que pase ese rato.
create table if not exists public.pipeline_locks (
  name      text primary key,
  locked_at timestamptz,
  holder    uuid
);

alter table public.pipeline_locks enable row level security;

create or replace function public.try_acquire_summarize_lock()
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  token uuid := gen_random_uuid();
  rows_updated integer;
begin
  insert into public.pipeline_locks as t (name, locked_at, holder)
  values ('summarize_run', now(), token)
  on conflict (name) do update
    set locked_at = now(), holder = token
    where t.locked_at is null or t.locked_at < now() - interval '30 minutes';
  get diagnostics rows_updated = row_count;

  if rows_updated = 0 then
    return null;
  end if;
  return token;
end;
$$;

create or replace function public.release_summarize_lock(token uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  rows_updated integer;
begin
  update public.pipeline_locks
     set locked_at = null, holder = null
   where name = 'summarize_run' and holder = token;
  get diagnostics rows_updated = row_count;
  return rows_updated > 0;
end;
$$;

-- Mismo motivo que summarize_batch en 0008: dos revokes, uno por el
-- otorgamiento explícito a anon/authenticated que este proyecto agrega por
-- default en toda función nueva, y otro por el otorgamiento implícito a PUBLIC
-- que Postgres agrega por default en toda función (a diferencia de las tablas).
revoke execute on function public.try_acquire_summarize_lock() from anon, authenticated;
revoke execute on function public.try_acquire_summarize_lock() from public;
revoke execute on function public.release_summarize_lock(uuid) from anon, authenticated;
revoke execute on function public.release_summarize_lock(uuid) from public;

-- Ninguna sesión toca la tabla directamente (solo las dos funciones de arriba,
-- SECURITY INVOKER), así que ni siquiera la service role necesita insert/update
-- directo — RLS sin políticas alcanza, igual que en las seis tablas de resumen.
revoke insert, update on public.pipeline_locks from anon, authenticated;
