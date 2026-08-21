-- El borrado miraba una cosa y achicaba otra, y vació la tabla de partidas.
--
-- `prune_matches` disparaba con `pg_database_size()` —la base ENTERA— pero solo
-- borra de `matches`. Cuando las tablas de contadores pasaron los 280 MB, la
-- base quedó por encima del umbral de forma permanente, y cada corrida del cron
-- borró 500 partidas intentando achicar algo que las partidas no explicaban.
--
-- Medido el 2026-07-28, después: `matches` en **0 filas**, `match_players` en 0,
-- y la base igual en 393 MB, porque el peso estaba en `comp_unit_item_stats`
-- (166 MB), `comp_item_stats` (56), `comp_unit_stats` (34), `comp_trait_stats`
-- (20) y `comp_stats` (10). El borrado nunca podía ganar esa carrera.
--
-- La regla que faltaba: **el disparador y el remedio tienen que mirar lo mismo.**
-- Ahora mide sólo el peso de las tablas crudas, que es lo único que puede
-- achicar. Con los contadores creciendo, `matches` ya no paga la cuenta.
--
-- Y arranca apagado, como fijó el diseño de la tier list incremental: resumir es
-- reversible y borrar no lo es. `target_bytes <= 0` significa "no borrar nunca".

create or replace function public.prune_matches(
  target_bytes bigint,
  max_delete   integer default 500
)
returns integer
language plpgsql
as $$
declare
  current_set   integer;
  current_patch text;
  deleted       integer := 0;
  raw_bytes     bigint;
begin
  raw_bytes := pg_total_relation_size('public.matches')
             + pg_total_relation_size('public.match_players');

  if target_bytes <= 0 or raw_bytes <= target_bytes then
    return 0;
  end if;

  select max(set_number) into current_set from public.matches;

  select substring(game_version from 'Version (\d+\.\d+)')
    into current_patch
    from public.matches
   where set_number is not distinct from current_set
   order by game_datetime desc nulls last
   limit 1;

  with doomed as (
    select match_id
    from public.matches
    order by
      (set_number is distinct from current_set) desc,
      (substring(game_version from 'Version (\d+\.\d+)') is distinct from current_patch) desc,
      public.tier_expendability(tier) desc,
      game_datetime asc nulls first
    limit max_delete
  )
  delete from public.matches m
  using doomed d
  where m.match_id = d.match_id;

  get diagnostics deleted = row_count;
  return deleted;
end;
$$;
