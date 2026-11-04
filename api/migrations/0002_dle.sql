-- Deadlockdle (2026-11-04): la respuesta de cada día, las partidas y cada intento.

-- La respuesta queda congelada con sus columnas: aunque el pozo cambie ese día, no cambia.
create table dle_days (
  date text not null,
  mode text not null,
  answer_id text not null,
  answer_json text not null,
  primary key (date, mode)
);

-- started_at es la hora del primer intento: ahí arranca el reloj del ranking.
create table dle_plays (
  steam_id text not null,
  date text not null,
  mode text not null,
  started_at integer not null,
  finished_at integer,
  guesses integer not null,
  solved integer not null default 0,
  primary key (steam_id, date, mode)
);
create index dle_plays_rank on dle_plays (date, mode, solved, guesses, finished_at);

-- Cada intento con su hora: es lo que después sirve para detectar trampas.
create table dle_guesses (
  steam_id text not null,
  date text not null,
  mode text not null,
  n integer not null,
  answer_id text not null,
  at integer not null,
  -- 1 si ese intento fue la respuesta: de acá sale el estado de la partida.
  hit integer not null default 0,
  primary key (steam_id, date, mode, n),
  unique (steam_id, date, mode, answer_id)
);

-- La última copia buena del pozo (lo publica el sitio): si vestigo.gg no contesta, el juego sigue con esta.
create table dle_pool (
  id integer primary key check (id = 1),
  json text not null,
  at integer not null
);
