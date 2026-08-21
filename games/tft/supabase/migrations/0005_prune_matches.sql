-- Juntar hasta el techo, y ahí borrar lo que ya no sirve.
--
-- El plan gratuito son 500 MB y cada partida cuesta ~11,7 KB entre `matches` y
-- `match_players`. El cron juntando solo llena la base en semanas, así que la
-- alternativa a borrar no es "juntar para siempre": es que el cron se muera.
--
-- Se borra en orden de inutilidad, no por fecha a secas:
--
--   1. Sets viejos. Cuando abre un set nuevo, TODO el anterior deja de describir
--      el juego que se está jugando. Es la mayor ganancia y la de menor costo.
--   2. Rangos bajos de parches viejos.
--   3. Rangos bajos del parche vigente.
--   4. Lo más viejo que quede, sea del rango que sea.
--
-- El orden lo pidió ZoTaD así: primero lo viejo, y el rango bajo como
-- desempate. Queda anotado el costo: Oro vive dentro de la banda
-- `platinum-gold`, así que la regla 3 se come la evidencia de esa banda y de
-- `silver-below`. Hoy no se nota porque la tier list se construye del store en
-- disco; el día que el build lea de Postgres, hay que revisar esto.

-- El rango de la partida, que Postgres no guardaba y el store en disco sí.
-- "" cuando no se sabe, que es el caso de todo lo que entró antes de esto.
alter table public.matches
  add column if not exists tier text not null default '';

/**
 * Qué tan prescindible es un rango, de más a menos.
 *
 * Se usa como orden de borrado, así que el número alto se va primero. Los que
 * no tienen rango conocido valen 0: no se los prioriza para borrar, porque no
 * saber en qué elo se jugó no es lo mismo que saber que fue en Hierro.
 */
create or replace function public.tier_expendability(t text)
returns integer
language sql
immutable
as $$
  select case upper(coalesce(t, ''))
    when 'IRON'        then 6
    when 'BRONZE'      then 6
    when 'SILVER'      then 5
    when 'GOLD'        then 4
    when 'PLATINUM'    then 3
    when 'EMERALD'     then 2
    when 'DIAMOND'     then 1
    when 'MASTER'      then 0
    when 'GRANDMASTER' then 0
    when 'CHALLENGER'  then 0
    else 0
  end;
$$;

/**
 * Borra partidas hasta que la base baje del objetivo.
 *
 * Devuelve cuántas borró. Trabaja de a lotes y con un tope duro: una corrida del
 * cron no puede quedarse borrando indefinidamente, y prefiero que tarde varias
 * corridas en bajar antes que bloquear la tabla en una sola.
 *
 * NO se hace VACUUM FULL. El espacio que libera un DELETE lo reutilizan los
 * INSERT siguientes, que es exactamente lo que hace un ciclo de juntar y borrar;
 * un VACUUM FULL bloquearía la tabla entera para ganar nada en régimen.
 */
create or replace function public.prune_matches(
  target_bytes bigint,
  max_delete   integer default 500
)
returns integer
language plpgsql
as $$
declare
  current_set integer;
  deleted     integer := 0;
begin
  if pg_database_size(current_database()) <= target_bytes then
    return 0;
  end if;

  select max(set_number) into current_set from public.matches;

  with doomed as (
    select match_id
    from public.matches
    order by
      -- 1. Sets viejos primero. Un set anterior no describe este juego.
      (set_number is distinct from current_set) desc,
      -- 2 y 3. Dentro de lo que queda, el rango más prescindible.
      public.tier_expendability(tier) desc,
      -- 4. Y a igualdad de todo, lo más viejo.
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

-- match_players cae solo: su clave foránea a matches es ON DELETE CASCADE.

alter table public.pull_runs
  add column if not exists pruned integer not null default 0;
