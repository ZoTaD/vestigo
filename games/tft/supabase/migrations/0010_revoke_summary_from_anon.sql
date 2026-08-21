-- Sacarle a anon (y a authenticated) el permiso sobre los contadores del resumen.
--
-- Verificado contra la base real antes de este fix: el rol `anon` podía ejecutar
-- las seis funciones de upsert de 0007_summary_upsert.sql y tenía INSERT/UPDATE
-- en las seis tablas de 0006_comp_summary.sql. Hoy no entra nada porque RLS está
-- activo sin políticas — pero para contadores que solo suman y nunca se pueden
-- corregir (no hay resta; el día que se borren las partidas crudas tampoco habrá
-- con qué reconstruir), lo único que separa la service role key de una inflación
-- permanente es que nadie agregue, alguna vez, una política RLS permisiva. Ese es
-- el error de Supabase más común de todos: agregar una policy y no notar que
-- ahora cualquiera puede escribir.
--
-- Dos revokes por función, no uno — igual que en 0008 y 0009, y por el mismo
-- motivo: Postgres otorga EXECUTE a PUBLIC por default en toda función nueva,
-- aparte de cualquier otorgamiento explícito a un rol puntual. Este proyecto
-- además otorga esas funciones a anon/authenticated por default al crearlas (ver
-- pg_default_acl), así que hay DOS otorgamientos independientes que cerrar, y
-- revocar solo uno de los dos deja al otro intacto — exactamente el error que ya
-- se cometió una vez en 0008 antes de verificar con has_function_privilege.
revoke execute on function public.upsert_comp_stats(jsonb) from anon, authenticated;
revoke execute on function public.upsert_comp_stats(jsonb) from public;

revoke execute on function public.upsert_comp_unit_stats(jsonb) from anon, authenticated;
revoke execute on function public.upsert_comp_unit_stats(jsonb) from public;

revoke execute on function public.upsert_comp_unit_item_stats(jsonb) from anon, authenticated;
revoke execute on function public.upsert_comp_unit_item_stats(jsonb) from public;

revoke execute on function public.upsert_comp_trait_stats(jsonb) from anon, authenticated;
revoke execute on function public.upsert_comp_trait_stats(jsonb) from public;

revoke execute on function public.upsert_comp_item_stats(jsonb) from anon, authenticated;
revoke execute on function public.upsert_comp_item_stats(jsonb) from public;

revoke execute on function public.upsert_band_stats(jsonb) from anon, authenticated;
revoke execute on function public.upsert_band_stats(jsonb) from public;

-- Las tablas, a diferencia de las funciones, no le dan nada a PUBLIC por
-- default — el INSERT/UPDATE de anon acá venía de un otorgamiento explícito
-- (ver pg_default_acl para el schema public), así que un solo revoke alcanza.
revoke insert, update on public.comp_stats           from anon, authenticated;
revoke insert, update on public.comp_unit_stats      from anon, authenticated;
revoke insert, update on public.comp_unit_item_stats from anon, authenticated;
revoke insert, update on public.comp_trait_stats     from anon, authenticated;
revoke insert, update on public.comp_item_stats      from anon, authenticated;
revoke insert, update on public.band_stats           from anon, authenticated;
