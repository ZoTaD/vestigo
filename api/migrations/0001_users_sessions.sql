-- Login con Steam (2026-11-04): las cuentas y sus sesiones.
create table users (
  steam_id text primary key,
  name text not null,
  avatar text not null,
  created_at integer not null,
  seen_at integer not null
);

-- Se guarda el SHA-256 del token, nunca el token: una copia de la base no abre sesiones.
create table sessions (
  token_hash text primary key,
  steam_id text not null references users(steam_id),
  expires_at integer not null
);
create index sessions_expires on sessions(expires_at);
