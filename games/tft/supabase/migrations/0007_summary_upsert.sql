-- Sumar en el upsert, no pisar.
--
-- PostgREST solo sabe hacer upsert con `resolution=merge-duplicates`, que
-- REEMPLAZA la fila entera por la que llega — es lo contrario de acumular: una
-- segunda corrida sobre la misma firma pisaría los tableros de la primera en vez
-- de sumarlos. Por eso el upsert que suma vive en SQL, expuesto como RPC.
--
-- Una función por tabla, con las columnas escritas a mano, y no una función
-- genérica que reciba el nombre de la tabla por parámetro: eso sería construir
-- SQL dinámico a partir de un string que llega de afuera, exactamente la forma
-- de una inyección. Cada función de acá solo puede tocar la tabla que su nombre
-- dice.
--
-- SECURITY INVOKER (el default: no se declara SECURITY DEFINER), a propósito:
-- estas tablas tienen RLS activo y cero políticas, y una función sin DEFINER
-- corre con los permisos de quien la llama. Si algún día alguien la invoca con
-- la clave anon en vez de la service role, la misma RLS que bloquea un INSERT
-- directo bloquea el INSERT de adentro de la función.

create or replace function public.upsert_comp_stats(rows jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.comp_stats as t (
    band, patch, day, signature, boards, sum_placement, sum_placement_sq,
    top4, wins, sum_level, winner_boards, winner_sum_placement, winner_sum_level,
    winner_sum_gold, loser_boards, loser_sum_placement, loser_sum_level, loser_sum_gold
  )
  select
    band, patch, day, signature, boards, sum_placement, sum_placement_sq,
    top4, wins, sum_level, winner_boards, winner_sum_placement, winner_sum_level,
    winner_sum_gold, loser_boards, loser_sum_placement, loser_sum_level, loser_sum_gold
  from jsonb_to_recordset(rows) as x(
    band text, patch text, day date, signature text, boards integer,
    sum_placement bigint, sum_placement_sq bigint, top4 integer, wins integer,
    sum_level bigint, winner_boards integer, winner_sum_placement bigint,
    winner_sum_level bigint, winner_sum_gold bigint, loser_boards integer,
    loser_sum_placement bigint, loser_sum_level bigint, loser_sum_gold bigint
  )
  on conflict (band, patch, day, signature) do update set
    boards               = t.boards               + excluded.boards,
    sum_placement         = t.sum_placement         + excluded.sum_placement,
    sum_placement_sq      = t.sum_placement_sq      + excluded.sum_placement_sq,
    top4                  = t.top4                  + excluded.top4,
    wins                  = t.wins                  + excluded.wins,
    sum_level             = t.sum_level             + excluded.sum_level,
    winner_boards         = t.winner_boards         + excluded.winner_boards,
    winner_sum_placement  = t.winner_sum_placement  + excluded.winner_sum_placement,
    winner_sum_level      = t.winner_sum_level      + excluded.winner_sum_level,
    winner_sum_gold       = t.winner_sum_gold       + excluded.winner_sum_gold,
    loser_boards          = t.loser_boards          + excluded.loser_boards,
    loser_sum_placement   = t.loser_sum_placement   + excluded.loser_sum_placement,
    loser_sum_level       = t.loser_sum_level       + excluded.loser_sum_level,
    loser_sum_gold        = t.loser_sum_gold        + excluded.loser_sum_gold;
end;
$$;

create or replace function public.upsert_comp_unit_stats(rows jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.comp_unit_stats as t (
    band, patch, signature, unit_id, boards, sum_stars, three_star,
    sum_items, itemized, winner_boards, loser_boards, sum_placement
  )
  select
    band, patch, signature, unit_id, boards, sum_stars, three_star,
    sum_items, itemized, winner_boards, loser_boards, sum_placement
  from jsonb_to_recordset(rows) as x(
    band text, patch text, signature text, unit_id text, boards integer,
    sum_stars bigint, three_star integer, sum_items bigint, itemized integer,
    winner_boards integer, loser_boards integer, sum_placement bigint
  )
  on conflict (band, patch, signature, unit_id) do update set
    boards        = t.boards        + excluded.boards,
    sum_stars     = t.sum_stars     + excluded.sum_stars,
    three_star    = t.three_star    + excluded.three_star,
    sum_items     = t.sum_items     + excluded.sum_items,
    itemized      = t.itemized      + excluded.itemized,
    winner_boards = t.winner_boards + excluded.winner_boards,
    loser_boards  = t.loser_boards  + excluded.loser_boards,
    sum_placement = t.sum_placement + excluded.sum_placement;
end;
$$;

create or replace function public.upsert_comp_unit_item_stats(rows jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.comp_unit_item_stats as t (
    band, patch, signature, unit_id, item_id, boards, winner_boards, instances
  )
  select
    band, patch, signature, unit_id, item_id, boards, winner_boards, instances
  from jsonb_to_recordset(rows) as x(
    band text, patch text, signature text, unit_id text, item_id text,
    boards integer, winner_boards integer, instances integer
  )
  on conflict (band, patch, signature, unit_id, item_id) do update set
    boards        = t.boards        + excluded.boards,
    winner_boards = t.winner_boards + excluded.winner_boards,
    instances     = t.instances     + excluded.instances;
end;
$$;

create or replace function public.upsert_comp_trait_stats(rows jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.comp_trait_stats as t (
    band, patch, signature, trait_id, num_units, boards
  )
  select
    band, patch, signature, trait_id, num_units, boards
  from jsonb_to_recordset(rows) as x(
    band text, patch text, signature text, trait_id text, num_units integer, boards integer
  )
  on conflict (band, patch, signature, trait_id, num_units) do update set
    boards = t.boards + excluded.boards;
end;
$$;

create or replace function public.upsert_comp_item_stats(rows jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.comp_item_stats as t (
    band, patch, signature, item_id, instances
  )
  select
    band, patch, signature, item_id, instances
  from jsonb_to_recordset(rows) as x(
    band text, patch text, signature text, item_id text, instances integer
  )
  on conflict (band, patch, signature, item_id) do update set
    instances = t.instances + excluded.instances;
end;
$$;

-- band_stats cuenta TODOS los tableros de la banda, con firma o sin ella: es el
-- denominador de playRate (ver el comentario de la tabla en 0006_comp_summary.sql).
create or replace function public.upsert_band_stats(rows jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.band_stats as t (
    band, patch, day, boards, matches
  )
  select
    band, patch, day, boards, matches
  from jsonb_to_recordset(rows) as x(
    band text, patch text, day date, boards integer, matches integer
  )
  on conflict (band, patch, day) do update set
    boards  = t.boards  + excluded.boards,
    matches = t.matches + excluded.matches;
end;
$$;
