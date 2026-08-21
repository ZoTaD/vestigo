-- Challenger ladder cache (leaderboard feature).
--
-- The ladder is live data that changes, so unlike the meta it cannot ship in
-- the build. It is pulled into this table by pull-ladder and read back by the
-- Edge Function's /ladder route, so an expired dev key never blanks it and a
-- visit never hits Riot.

create table if not exists public.ladder (
  region        text        not null,
  puuid         text        not null,
  league_points integer     not null,
  wins          integer     not null default 0,
  losses        integer     not null default 0,
  fetched_at    timestamptz not null default now(),
  primary key (region, puuid)
);

create index if not exists ladder_region_lp_idx
  on public.ladder (region, league_points desc);

-- Same posture as every other table: RLS on, no policies, so the publishable
-- key reads nothing. Names are joined from public.players at read time.
alter table public.ladder enable row level security;
