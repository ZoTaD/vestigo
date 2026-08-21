# Vestigo

Statistics and post-match analysis for games, starting with Teamfight Tactics.

Everything here is retrospective by design: the site reads matches that have already
been played and turns them into something a player can act on before the next one. It
does not read live game state, track or predict opponents, or suggest an action while a
match is running — the line Riot's third-party policy draws.

## What it does

- **Meta report** — a comp tier list built from high-elo matches we pull ourselves,
  ranked by average placement and discounted by how little evidence backs each one.
- **Match analysis** — look up a Riot ID and read the history back: the comps you play,
  where you place with each, the distribution of your finishes, and the correlations
  that separate your good games from your bad ones.

## Layout

| Path | What it is |
|---|---|
| `games/tft/pipeline` | Pulls matches from Riot's API, aggregates comps, writes `games/tft/data` |
| `games/tft/analysis` | Pure analysis logic — findings, history insights. No UI, no I/O |
| `games/tft/ui` | The React site. Reads the pipeline's output directly |
| `games/tft/supabase` | Postgres schema and the Edge Function the deployed site talks to |
| `docs/design` | Design docs: architecture, phases, and the reasoning behind decisions |

## Running it

```bash
npm --prefix games/tft/ui install
npm --prefix games/tft/ui run dev
```

The dev server stands in for the Edge Function with `dev-api.ts`, which speaks the same
contract and reads `RIOT_API_KEY` from `games/tft/pipeline/.env`. Copy `.env.example` to
`.env` there and put a key in it.

Rebuilding the meta from stored matches:

```bash
npm --prefix games/tft/pipeline run build:comps
```

Tests:

```bash
npm --prefix games/tft/pipeline test && npm --prefix games/tft/analysis test && npm --prefix games/tft/ui test
```

## Deploying

`netlify.toml` builds `games/tft/ui` and publishes its `dist`. Two environment variables
have to be set in Netlify for the player search to work against the deployed backend:

- `VITE_API_BASE` — the deployed Edge Function's URL, without a trailing slash
- `VITE_SUPABASE_ANON_KEY` — the project's publishable key

Without them the site still builds and the meta report still works, because it is
generated at build time from `games/tft/data`; only the player search needs a backend.

## Legal

Vestigo isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot
Games or anyone officially involved in producing or managing Riot Games properties. Riot
Games and all associated properties are trademarks or registered trademarks of Riot
Games, Inc.
