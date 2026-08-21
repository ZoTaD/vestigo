-- Snapshots del rango, para poder dibujar el LP en el tiempo.
--
-- Riot no reporta el LP de una partida ni su delta: el MatchDto no lo trae y
-- by-puuid contesta el rango de ahora, no una serie. La historia vieja no se
-- puede reconstruir, ni con la production key, así que se empieza a grabar.
-- Cada búsqueda ya pide el rango, de modo que esto no cuesta ni una llamada
-- más a Riot.
--
-- `games` es wins + losses de la cola rankeada, y es lo que convierte la
-- atribución en un hecho en vez de una estimación: entre dos snapshots dice
-- exactamente cuántas rankeds pasaron, incluidas las que no bajamos. Verificado
-- contra la API en vivo el 2026-07-25 sobre seis cuentas separadas por dos días
-- —una de ellas sin jugar nada, que movió cero— y sobre las cuarenta partidas
-- de esas ventanas, todas de la cola 1100.

create table if not exists public.rank_snapshots (
  puuid         text        not null,
  region        text        not null,
  -- El set en que se tomó. El rango se resetea entre sets, así que una serie
  -- que cruce ese corte dibujaría un derrumbe que nunca pasó.
  set_number    integer,
  tier          text        not null,
  -- Vacía en apex, que no tiene divisiones. No se le inventa una.
  division      text        not null default '',
  league_points integer     not null,
  games         integer     not null,
  taken_at      timestamptz not null default now(),
  primary key (puuid, taken_at)
);

create index if not exists rank_snapshots_puuid_idx
  on public.rank_snapshots (puuid, taken_at desc);

-- Misma postura que las otras cuatro tablas: RLS activo y CERO políticas. Con
-- la clave publicable no devuelve ni una fila; solo el service role, que vive
-- únicamente dentro de la Edge Function, la toca.
alter table public.rank_snapshots enable row level security;
