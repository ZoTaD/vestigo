-- El esquema de Vestigo en D1 (SQLite), portado del Postgres de Supabase.
--
-- Cinco diferencias con el original, todas del motor, no del diseño:
--
-- 1. No hay `jsonb`. El payload crudo de Riot se guarda como TEXT — se lee con
--    JSON.parse igual que antes, y SQLite tiene json_extract si algún día hace
--    falta filtrar por adentro.
-- 2. No hay `timestamptz`. Las fechas van como TEXT en ISO 8601 UTC, que ordena
--    y compara igual que un timestamp mientras el formato sea siempre el mismo
--    (`new Date().toISOString()`).
-- 3. No hay RLS. En Postgres protegía contra la clave pública del navegador;
--    acá el navegador NUNCA habla con la base — sólo el Worker, que corre del
--    lado del servidor con su binding. La superficie desapareció en vez de
--    protegerse.
-- 4. `bigint` es INTEGER: en SQLite ya son de 64 bits.
-- 5. Los índices que Postgres creaba solos con las claves primarias hay que
--    escribirlos donde importan. Están abajo, cada uno con la consulta que lo
--    justifica.

create table if not exists matches (
  match_id      text primary key,
  region        text not null,
  set_number    integer,
  queue_id      integer,
  game_datetime integer,
  game_version  text,
  payload       text not null,
  fetched_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  tier          text not null default '',
  summarized_at text
);

-- El resumidor pide "las no resumidas, ordenadas por match_id, desde un cursor"
-- (pendingMatchesQuery). Sin este índice eso es un scan de la ventana entera en
-- cada una de las ~300 vueltas de una corrida.
create index if not exists matches_pending on matches (summarized_at, match_id);

-- La retención elige las más viejas por fecha de partida, y el build filtra por
-- versión y cola. game_datetime ordena las dos cosas.
create index if not exists matches_datetime on matches (game_datetime);

create table if not exists match_players (
  match_id  text not null references matches(match_id) on delete cascade,
  puuid     text not null,
  placement integer,
  primary key (match_id, puuid)
);

-- El perfil de un jugador busca por puuid, no por partida: la clave primaria
-- (match_id, puuid) no sirve para eso.
create index if not exists match_players_puuid on match_players (puuid);

create table if not exists players (
  puuid      text primary key,
  game_name  text not null,
  tag_line   text not null,
  region     text,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  pulled_at  text
);

-- El cron elige los 8 jugadores con `pulled_at` más viejo en cada corrida. Sin
-- índice eso ordena 23.595 filas cada 5 minutos.
create index if not exists players_pulled_at on players (pulled_at);

-- La búsqueda por nombre#tag, que es la que hace el usuario.
create index if not exists players_riot_id on players (game_name, tag_line);

create table if not exists ladder (
  region        text not null,
  puuid         text not null,
  league_points integer not null,
  wins          integer not null default 0,
  losses        integer not null default 0,
  fetched_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (region, puuid)
);

create table if not exists rank_snapshots (
  puuid         text not null,
  region        text not null,
  set_number    integer,
  tier          text not null,
  division      text not null default '',
  league_points integer not null,
  games         integer not null,
  taken_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (puuid, taken_at)
);

-- Una fila por corrida del cron. Un cron que falla en silencio parece que anda:
-- acá queda el motivo.
create table if not exists pull_runs (
  id          integer primary key autoincrement,
  started_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at text,
  players     integer not null default 0,
  matches     integer not null default 0,
  riot_calls  integer not null default 0,
  status      text not null default 'running',
  detail      text,
  pruned      integer not null default 0
);

create index if not exists pull_runs_started on pull_runs (started_at desc);

-- El límite por IP. En Postgres esto vivía acá porque en Edge Functions cada
-- request estrena isolate y un contador en memoria no sirve; en Workers pasa
-- exactamente lo mismo, así que la razón no cambió de lugar.
create table if not exists rate_limit (
  ip           text primary key,
  window_start text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  total        integer not null default 0,
  search       integer not null default 0
);

create table if not exists pipeline_locks (
  name      text primary key,
  locked_at text,
  holder    text
);
