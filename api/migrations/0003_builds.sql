-- Builds subidas a Vestigo (2026-11-15). La build vive en el juego; acá va
-- quién la subió (verificado con su cuenta de Steam) y lo que suma Vestigo.
create table builds (
  build_id integer primary key,
  hero_id integer not null,
  account_id integer not null,
  -- El nombre en el juego al subirla, para listarla sin pedirle al juego.
  name text not null,
  -- JSON: las etiquetas de Vestigo (`TAGS` en src/builds/routes.ts).
  tags text not null default '[]',
  note text not null default '',
  created_at integer not null,
  updated_at integer not null
);
create index builds_hero on builds (hero_id, updated_at);
create index builds_account on builds (account_id);
