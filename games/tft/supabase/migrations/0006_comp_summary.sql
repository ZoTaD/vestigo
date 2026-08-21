-- El resumen que reemplaza a leer las partidas.
--
-- Medido sobre el parche vigente: 4.175 firmas, 72.167 filas de unidad, 349.293 de
-- unidad-item y 34.947 de trait. Esas filas son combinatoria, no volumen: con diez
-- veces mas partidas siguen siendo las mismas. Por eso el dia va solo en comp_stats,
-- que es donde hace falta para responder "esta comp subio o bajo"; el detalle va por
-- parche, porque multiplicarlo por catorce dias no contesta ninguna pregunta.

create table if not exists public.comp_stats (
  band              text    not null,
  patch             text    not null,
  day               date    not null,
  signature         text    not null,
  boards            integer not null default 0,
  sum_placement     bigint  not null default 0,
  sum_placement_sq  bigint  not null default 0,
  top4              integer not null default 0,
  wins              integer not null default 0,
  sum_level         bigint  not null default 0,
  winner_boards     integer not null default 0,
  winner_sum_placement bigint not null default 0,
  winner_sum_level  bigint  not null default 0,
  winner_sum_gold   bigint  not null default 0,
  loser_boards      integer not null default 0,
  loser_sum_placement bigint not null default 0,
  loser_sum_level   bigint  not null default 0,
  loser_sum_gold    bigint  not null default 0,
  primary key (band, patch, day, signature)
);

create table if not exists public.comp_unit_stats (
  band          text    not null,
  patch         text    not null,
  signature     text    not null,
  unit_id       text    not null,
  boards        integer not null default 0,
  sum_stars     bigint  not null default 0,
  three_star    integer not null default 0,
  sum_items     bigint  not null default 0,
  itemized      integer not null default 0,
  winner_boards integer not null default 0,
  loser_boards  integer not null default 0,
  sum_placement bigint  not null default 0,
  primary key (band, patch, signature, unit_id)
);

create table if not exists public.comp_unit_item_stats (
  band          text    not null,
  patch         text    not null,
  signature     text    not null,
  unit_id       text    not null,
  item_id       text    not null,
  boards        integer not null default 0,
  winner_boards integer not null default 0,
  instances     integer not null default 0,
  primary key (band, patch, signature, unit_id, item_id)
);

-- num_units entra en la clave a proposito: traits[].units es la MODA, y una moda no
-- sale de una suma. Cada fila es un balde del histograma.
create table if not exists public.comp_trait_stats (
  band       text    not null,
  patch      text    not null,
  signature  text    not null,
  trait_id   text    not null,
  num_units  integer not null,
  boards     integer not null default 0,
  primary key (band, patch, signature, trait_id, num_units)
);

-- Instancias de item por comp, para itemPriority: cuenta copias, no tableros.
create table if not exists public.comp_item_stats (
  band      text    not null,
  patch     text    not null,
  signature text    not null,
  item_id   text    not null,
  instances integer not null default 0,
  primary key (band, patch, signature, item_id)
);

-- Cuantos tableros tuvo la banda en total, con firma o sin ella: es el denominador
-- de playRate, y los tableros sin firma cuentan en el.
create table if not exists public.band_stats (
  band   text    not null,
  patch  text    not null,
  day    date    not null,
  boards integer not null default 0,
  matches integer not null default 0,
  primary key (band, patch, day)
);

alter table public.comp_stats            enable row level security;
alter table public.comp_unit_stats       enable row level security;
alter table public.comp_unit_item_stats  enable row level security;
alter table public.comp_trait_stats      enable row level security;
alter table public.comp_item_stats       enable row level security;
alter table public.band_stats            enable row level security;

-- Que partidas ya se contabilizaron. Sin esto, una corrida repetida cuenta dos veces
-- y no hay forma de notarlo mirando los contadores.
alter table public.matches
  add column if not exists summarized_at timestamptz;

create index if not exists matches_pending_summary
  on public.matches (summarized_at) where summarized_at is null;
