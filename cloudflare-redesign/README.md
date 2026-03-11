# ELO Cloudflare Redesign

This folder contains a production-oriented redesign for moving the current Streamlit + Excel + pickle + Slack upload flow to:

- Cloudflare Pages (frontend + Pages Functions API)
- Cloudflare D1 (single source of truth)

The redesign keeps the same business behavior:

- same ELO formula
- same tournament types (`REGULAR`/`ADHOC`/`FRIENDLY`)
- same `K` and base points
- same "calculate all tournament deltas from tournament start ratings, then apply at finalize" rule
- same singles/doubles support

## Folder layout

- `schema.sql`: D1 relational schema, constraints, indexes, views.
- `docs/architecture.md`: feature parity mapping, API design, migration/deployment flow.
- `src/domain/elo.ts`: typed ELO domain logic ported for Cloudflare runtime.
- `tools/export_sql_from_legacy.py`: exports SQL insert statements from legacy `data.xlsx` + `data/pickles`.
- `wrangler.toml.example`: Pages + D1 binding example.

## Quick start

1. Create D1 database.
2. Apply schema.
3. Export legacy seed SQL.
4. Import seed SQL.
5. Deploy Pages project.

Example commands:

```bash
wrangler d1 create elo-prod
wrangler d1 execute elo-prod --file=cloudflare-redesign/schema.sql --remote
python cloudflare-redesign/tools/export_sql_from_legacy.py \
  --excel data/data.xlsx \
  --pickles data/pickles \
  --output cloudflare-redesign/seed_legacy.sql
wrangler d1 execute elo-prod --file=cloudflare-redesign/seed_legacy.sql --remote
```

Then bind the DB in `wrangler.toml` using `wrangler.toml.example` as template.
