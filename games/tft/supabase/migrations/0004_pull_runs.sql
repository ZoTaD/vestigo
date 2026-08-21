-- El cron que junta partidas solo, y el registro que lo hace observable.
--
-- Hasta ahora la única forma de que entraran partidas nuevas era que alguien
-- corriera `npm run pull` a mano. El sitio publica lo que se haya juntado la
-- última vez que eso pasó.
--
-- El obstáculo no es técnico: la dev key vence cada 24 horas, así que esto va a
-- fallar todos los días hasta que Riot apruebe la production key. Por eso lo
-- primero que se construye no es el cron sino su registro: un cron que falla en
-- silencio es peor que no tenerlo, porque parece que anda.

create table if not exists public.pull_runs (
  id          bigserial   primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  -- Cuántos jugadores se miraron y cuántas partidas nuevas entraron.
  players     integer     not null default 0,
  matches     integer     not null default 0,
  -- Llamadas a Riot que se gastaron. Es lo que hay que mirar para saber si el
  -- cron le está comiendo la cuota a las búsquedas en vivo.
  riot_calls  integer     not null default 0,
  -- "ok", o el motivo. Una key vencida deja "RIOT_401" acá, que es exactamente
  -- lo que uno quiere ver cuando el sitio parece desactualizado.
  status      text        not null default 'running',
  detail      text
);

create index if not exists pull_runs_started_idx
  on public.pull_runs (started_at desc);

alter table public.pull_runs enable row level security;

-- Cuándo se le pidieron partidas a cada jugador por última vez.
--
-- Va aparte de `updated_at`, que ya significa otra cosa: la Edge Function la usa
-- como TTL del caché de Riot ID → puuid, y pisarla desde el cron haría que un
-- nombre cambiado se quedara viejo para siempre. Dos relojes distintos porque
-- son dos preguntas distintas.
alter table public.players
  add column if not exists pulled_at timestamptz;

create index if not exists players_pulled_idx
  on public.players (pulled_at nulls first);

-- El agendado en sí NO está acá, y es a propósito: la llamada lleva el secreto
-- del cron y la clave publicable en el cuerpo del job, y esos no van a git. Se
-- corrió una sola vez contra la base, con esta forma:
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
--   select cron.schedule('tft-pull', '*/30 * * * *', $$
--     select net.http_post(
--       url := 'https://<ref>.supabase.co/functions/v1/tft-pull',
--       headers := jsonb_build_object(
--         'content-type',   'application/json',
--         'x-cron-secret',  '<CRON_SECRET>',
--         'apikey',         '<clave publicable>',
--         'Authorization',  'Bearer <clave publicable>'),
--       timeout_milliseconds := 120000);
--   $$);
--
-- Cada media hora, y no cada cinco minutos, por espacio y no por cuota de Riot.
-- Medido el 2026-07-25: la base ocupa 87 MB de los 500 del plan gratuito y cada
-- partida cuesta ~11,7 KB entre `matches` y `match_players`, así que entran unas
-- 35.000 más. Una corrida trae ~17. Cada 5 minutos eso llena la base en una
-- semana; cada 30 minutos da unas seis. **Ninguna de las dos es sostenible sin
-- borrado**, que es el proceso que la política de privacidad ya promete y que
-- todavía no existe. Ver `pull_runs` para saber a qué ritmo va de verdad.
