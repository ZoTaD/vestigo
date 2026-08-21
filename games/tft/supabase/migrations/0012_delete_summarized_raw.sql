-- Borrado de partidas crudas ya resumidas, fuera de la ventana móvil (Arreglo 4).
--
-- Mismo patrón que `prune_matches` (0005_prune_matches.sql): una función con un
-- tope (`max_delete`), no un DELETE armado desde afuera con `limit` en la query
-- string -- PostgREST no da un LIMIT confiable sobre una sentencia DELETE, así
-- que el tope por corrida vive adentro de la transacción, igual que ahí.
--
-- El criterio (documentado también en summarize-run.ts, `matchesToDelete`, que
-- es el mismo predicado probado en JS sobre datos ya bajados): SOLO una
-- partida YA CONTABILIZADA (`summarized_at` no nulo) Y jugada antes de la
-- ventana (`game_datetime`, NUNCA `summarized_at` ni `fetched_at` -- Riot
-- devuelve las últimas veinte partidas DE CADA JUGADOR, no las últimas veinte
-- recientes del servidor, así que una partida bajada hoy puede haberse jugado
-- hace meses).
--
-- Devuelve cuántas borró Y cuántas siguen elegibles después del borrado (el
-- `count(*)` corre sobre el mismo `where`, después del DELETE): sin ese
-- segundo número, un backlog de borrado que no baja de corrida en corrida es
-- indistinguible de uno que ya se vació.
create or replace function public.delete_summarized_raw(
  cutoff_ms  bigint,
  max_delete integer default 2000
)
returns table(deleted integer, remaining integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  with doomed as (
    select match_id
    from public.matches
    where summarized_at is not null
      and game_datetime is not null
      and game_datetime < cutoff_ms
    order by game_datetime asc
    limit max_delete
  )
  delete from public.matches m
  using doomed d
  where m.match_id = d.match_id;

  get diagnostics deleted_count = row_count;

  return query
    select
      deleted_count,
      (select count(*)::integer
         from public.matches
        where summarized_at is not null
          and game_datetime is not null
          and game_datetime < cutoff_ms);
end;
$$;

-- Mismo motivo que las demás funciones de escritura/borrado de este pipeline:
-- dos revokes, uno por el otorgamiento explícito a anon/authenticated que este
-- proyecto agrega por default en toda función nueva, y otro por el
-- otorgamiento implícito a PUBLIC que Postgres agrega por default en toda
-- función (a diferencia de las tablas).
revoke execute on function public.delete_summarized_raw(bigint, integer) from anon, authenticated;
revoke execute on function public.delete_summarized_raw(bigint, integer) from public;
