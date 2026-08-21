-- Un lote, una transacción — incluida la marca.
--
-- `upsertAll` (0007) hacía seis llamadas HTTP por lote, cada una trozada en tajadas
-- de 500 filas: con un lote de 200 partidas eran del orden de un centenar de
-- transacciones separadas, y `upsert_band_stats` era la última de todas. Si el
-- proceso moría en el medio, el reintento volvía a sumar TODO lo ya escrito
-- mientras alguna de las seis tablas se hubiera escrito una sola vez: un contador
-- quedaba inflado, otro correcto, y una razón (playRate, itemPriority, lo que sea)
-- mal para siempre — sin que la auditoría más obvia (comparar `band_stats.matches`
-- contra `count(*) from matches`) la detectara, porque el desalineamiento vive
-- ENTRE las seis tablas del resumen, no entre el resumen y `matches`.
--
-- Y había un segundo punto de corte: entre escribir los contadores y marcar las
-- partidas con `summarized_at`. Si el proceso moría ahí, el reintento contaba el
-- lote dos veces.
--
-- Acá va todo: las seis acumulaciones Y la marca, en una sola función. Postgres
-- corre una función en una única transacción de principio a fin — si CUALQUIER
-- paso de acá adentro falla (una fila que no castea, una restricción que no
-- cierra), no queda nada escrito, ni siquiera parte de una tabla, y el reintento
-- de un lote que murió es limpio: nunca hay una partida contada pero sin marcar,
-- ni marcada pero sin contar.
--
-- Llama a las funciones de 0007 en vez de repetir sus cuerpos. Son SECURITY
-- INVOKER (no DEFINER), así que llamarlas desde acá adentro —también INVOKER—
-- sigue corriendo con los permisos de quien invocó summarize_batch: no hay
-- escalada de privilegios por el camino. Con esto hay una sola forma de escribir
-- cada contador (la de 0007); summarize_batch es solo el sobre transaccional
-- alrededor. Desde esta migración, summarize-run.ts llama exclusivamente a
-- summarize_batch — las funciones de 0007 quedan en la base (llamarlas es lo que
-- hace esta función) pero ya no las invoca nada del pipeline directamente.
create or replace function public.summarize_batch(
  match_ids text[],
  comp jsonb,
  unit jsonb,
  unit_item jsonb,
  trait jsonb,
  item jsonb,
  band jsonb
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  marked integer;
begin
  perform public.upsert_comp_stats(comp);
  perform public.upsert_comp_unit_stats(unit);
  perform public.upsert_comp_unit_item_stats(unit_item);
  perform public.upsert_comp_trait_stats(trait);
  perform public.upsert_comp_item_stats(item);
  perform public.upsert_band_stats(band);

  -- `and summarized_at is null`: si por lo que sea a esta función le llegara un
  -- match_id ya marcado (no debería, summarize-run.ts solo pide partidas
  -- pendientes), no lo vuelve a tocar ni lo cuenta en `marked`.
  update public.matches
     set summarized_at = now()
   where match_id = any(match_ids)
     and summarized_at is null;
  get diagnostics marked = row_count;

  return marked;
end;
$$;

-- Mismo motivo que las seis de 0007: nadie más que la service role tiene por qué
-- correr esto. El resto del cierre (revocar también las de 0007 y el insert/update
-- directo sobre las seis tablas) va en 0010_revoke_summary_from_anon.sql.
--
-- Dos revokes, no uno: Postgres otorga EXECUTE a PUBLIC por default en toda función
-- nueva (a diferencia de las tablas, que no le dan nada a PUBLIC por default), y esa
-- entrada de ACL es independiente de cualquier otorgamiento explícito a anon o
-- authenticated. Revocar solo "from anon, authenticated" deja esa entrada de PUBLIC
-- intacta y anon sigue pudiendo ejecutar la función a través de ella — verificado
-- contra la base real: con un solo revoke, `has_function_privilege('anon', ...)`
-- seguía dando true.
revoke execute on function public.summarize_batch(
  text[], jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from anon, authenticated;

revoke execute on function public.summarize_batch(
  text[], jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public;
