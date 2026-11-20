-- Seguidos y "Soy yo" por juego (2026-11-20, Age of Empires II). Una fila por cuenta de Steam y juego.
create table follows (
  steam_id text not null,
  game text not null,
  -- JSON: los perfiles seguidos (ids del juego), sin repetidos.
  profile_ids text not null default '[]',
  -- El perfil del juego que la cuenta dijo que es suyo ("Soy yo").
  me integer,
  updated_at integer not null,
  primary key (steam_id, game)
);
