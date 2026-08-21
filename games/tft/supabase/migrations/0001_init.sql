-- ProBuilds TFT — esquema inicial (Fase 3).
--
-- Guarda el payload de Riot verbatim, igual que el store local en disco:
-- normalizar en lectura significa que agregar un campo nuevo nunca obliga a
-- re-descargar nada.

create table if not exists public.matches (
  match_id      text primary key,
  region        text        not null,
  set_number    integer,
  queue_id      integer,
  game_datetime bigint,
  game_version  text,
  payload       jsonb       not null,
  fetched_at    timestamptz not null default now()
);

comment on column public.matches.payload is
  'Respuesta cruda de tft-match-v1, sin tocar. Se normaliza al leer.';

create index if not exists matches_played_at_idx
  on public.matches (game_datetime desc);
create index if not exists matches_set_idx
  on public.matches (set_number);

-- Caché de account-v1, para no gastar rate limit resolviendo el mismo Riot ID.
create table if not exists public.players (
  puuid      text primary key,
  game_name  text        not null,
  tag_line   text        not null,
  region     text,
  updated_at timestamptz not null default now()
);

-- La búsqueda es case-insensitive: nadie escribe su propio tag en mayúsculas.
create unique index if not exists players_riot_id_idx
  on public.players (lower(game_name), lower(tag_line));

-- Qué jugador estuvo en qué partida. Sin esto, listar el historial de alguien
-- obliga a escanear el jsonb de todas las partidas.
create table if not exists public.match_players (
  match_id  text    not null references public.matches (match_id) on delete cascade,
  puuid     text    not null,
  placement integer,
  primary key (match_id, puuid)
);

create index if not exists match_players_puuid_idx
  on public.match_players (puuid);

-- Seguridad: RLS activo y CERO políticas. Con la clave anon estas tablas no
-- devuelven ni una fila. Solo el service role —que vive únicamente dentro de la
-- Edge Function— las toca. El navegador nunca ve ni la base ni la key de Riot.
alter table public.matches       enable row level security;
alter table public.players       enable row level security;
alter table public.match_players enable row level security;
