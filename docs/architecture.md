# Cloudflare Pages + D1 Architecture

## 1. What changes from legacy project

Legacy storage and runtime:

- Streamlit app state in memory + pickle file
- persistent records in `data.xlsx`
- backup by zipping `data/` and uploading to Slack

Target storage and runtime:

- UI on Cloudflare Pages
- API on Cloudflare Pages Functions
- all state and history in D1
- no pickle and no file upload/download cycle

## 2. Feature parity mapping

Legacy feature -> New source of truth:

- player registration -> `players`, `rating_events (REGISTER)`
- tournament create/edit/cancel/open state -> `tournaments`, `tournament_participants`
- match recording/deleting -> `matches`
- match delta history -> `match_player_deltas`
- tournament finalize (bulk ELO apply) -> `rating_events (TOURNAMENT)` + `players.current_elo`
- ranking page -> `v_current_rankings`
- recent games / player history / statistics -> `v_matches_flat` + indexed tables
- tournament record archive -> `tournaments (FINALIZED)` + `matches` + `rating_events`

## 3. Core domain rules retained

1. ELO expected score:

`E_A = 1 / (1 + 10 ^ ((R_B - R_A) / 400))`

2. Result score from match score:

`S_A = scoreA / (scoreA + scoreB)`

3. Delta:

`delta = round(K * (S - E)) + base`

4. Doubles:

- expected score uses average seed rating of each team.
- team delta is applied equally to both players in that team.

5. Tournament finalize behavior:

- each match delta is computed from seed ratings captured at tournament start.
- ratings are updated once when tournament is finalized.

## 4. API design (Pages Functions)

Recommended route set:

- `GET /api/health`
- `GET /api/players`
- `POST /api/players`
- `GET /api/rankings/current`
- `GET /api/tournaments?status=OPEN|FINALIZED|CANCELED`
- `POST /api/tournaments`
- `GET /api/tournaments/:id`
- `PATCH /api/tournaments/:id` (before first match only for type changes)
- `POST /api/tournaments/:id/matches`
- `DELETE /api/tournaments/:id/matches/:matchId`
- `POST /api/tournaments/:id/finalize`
- `POST /api/tournaments/:id/cancel`
- `GET /api/stats/overview`
- `GET /api/stats/player/:playerId`

## 5. Finalize transaction outline

Inside one transaction:

1. Read tournament, participants (seed_elo), active matches.
2. Compute `delta_team_a`, `delta_team_b` for each match using `src/domain/elo.ts`.
3. Upsert `match_player_deltas`.
4. Insert one `rating_events (TOURNAMENT)` row per participant.
5. Update `players.current_elo`.
6. Mark tournament `FINALIZED`.

If any step fails, rollback.

## 6. Data migration strategy

1. Apply `schema.sql`.
2. Run:

```bash
python tools/export_sql_from_legacy.py \
  --excel data/data.xlsx \
  --pickles data/pickles \
  --output seed_legacy.sql
```

3. Import to D1:

```bash
wrangler d1 execute elo-prod --file=seed_legacy.sql --remote
```

4. Verify:

- player count
- tournament count
- match count
- current rankings vs legacy top N

## 7. Deployment flow

1. Create Cloudflare Pages project and connect repository.
2. Use `wrangler.toml.example` as base.
3. Bind D1 database in Pages project settings (or wrangler config).
4. Deploy preview, run migration, compare with legacy output.
5. Cut over after parity checks.

## 8. Performance notes

- No `pandas/openpyxl` runtime in production path.
- Indexed relational queries remove expensive file scanning.
- All dashboards can query directly from SQL with predictable latency.
- Single open tournament constraint prevents race conditions for seed ratings.
