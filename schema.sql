PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  current_elo INTEGER NOT NULL DEFAULT 2000 CHECK (current_elo BETWEEN 0 AND 5000),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tournament_date TEXT NOT NULL,
  tournament_type TEXT NOT NULL CHECK (tournament_type IN ('REGULAR', 'ADHOC', 'FRIENDLY')),
  k_factor INTEGER NOT NULL CHECK (k_factor >= 0),
  base_points INTEGER NOT NULL CHECK (base_points >= 0),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'FINALIZED', 'CANCELED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finalized_at TEXT,
  canceled_at TEXT,
  UNIQUE (name, tournament_date)
);

CREATE TABLE IF NOT EXISTS tournament_rules (
  tournament_type TEXT PRIMARY KEY CHECK (tournament_type IN ('REGULAR', 'ADHOC', 'FRIENDLY')),
  display_name TEXT NOT NULL,
  k_factor INTEGER NOT NULL CHECK (k_factor >= 0),
  base_points INTEGER NOT NULL CHECK (base_points >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO tournament_rules (tournament_type, display_name, k_factor, base_points)
VALUES ('REGULAR', '정규 대회', 200, 4);

INSERT OR IGNORE INTO tournament_rules (tournament_type, display_name, k_factor, base_points)
VALUES ('ADHOC', '상시 대회', 100, 1);

INSERT OR IGNORE INTO tournament_rules (tournament_type, display_name, k_factor, base_points)
VALUES ('FRIENDLY', '친선전', 0, 0);

CREATE TABLE IF NOT EXISTS tournament_participants (
  tournament_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  seed_elo INTEGER NOT NULL CHECK (seed_elo BETWEEN 0 AND 5000),
  seed_rank INTEGER,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tournament_id, player_id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  match_order INTEGER NOT NULL CHECK (match_order >= 1),
  match_format TEXT NOT NULL CHECK (match_format IN ('SINGLES', 'DOUBLES')),
  team_a_player1_id INTEGER NOT NULL,
  team_a_player2_id INTEGER,
  team_b_player1_id INTEGER NOT NULL,
  team_b_player2_id INTEGER,
  score_a INTEGER NOT NULL CHECK (score_a >= 0),
  score_b INTEGER NOT NULL CHECK (score_b >= 0),
  delta_team_a INTEGER,
  delta_team_b INTEGER,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DELETED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (team_a_player1_id) REFERENCES players(id),
  FOREIGN KEY (team_a_player2_id) REFERENCES players(id),
  FOREIGN KEY (team_b_player1_id) REFERENCES players(id),
  FOREIGN KEY (team_b_player2_id) REFERENCES players(id),
  CHECK (score_a + score_b > 0),
  CHECK (
    (match_format = 'SINGLES' AND team_a_player2_id IS NULL AND team_b_player2_id IS NULL)
    OR
    (match_format = 'DOUBLES' AND team_a_player2_id IS NOT NULL AND team_b_player2_id IS NOT NULL)
  ),
  UNIQUE (tournament_id, match_order)
);

CREATE TABLE IF NOT EXISTS match_player_deltas (
  match_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  team_side TEXT NOT NULL CHECK (team_side IN ('A', 'B')),
  delta INTEGER NOT NULL,
  PRIMARY KEY (match_id, player_id),
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS rating_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('REGISTER', 'TOURNAMENT', 'ADJUSTMENT')),
  event_date TEXT NOT NULL,
  tournament_id INTEGER,
  k_factor INTEGER NOT NULL DEFAULT 0 CHECK (k_factor >= 0),
  base_points INTEGER NOT NULL DEFAULT 0 CHECK (base_points >= 0),
  elo_before INTEGER NOT NULL CHECK (elo_before BETWEEN 0 AND 5000),
  delta INTEGER NOT NULL CHECK (delta BETWEEN -2000 AND 2000),
  elo_after INTEGER NOT NULL CHECK (elo_after BETWEEN 0 AND 5000),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (player_id) REFERENCES players(id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL,
  CHECK (elo_before + delta = elo_after)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_single_open_tournament
ON tournaments(status)
WHERE status = 'OPEN';

CREATE UNIQUE INDEX IF NOT EXISTS idx_rating_register_once
ON rating_events(player_id, event_type)
WHERE event_type = 'REGISTER';

CREATE UNIQUE INDEX IF NOT EXISTS idx_rating_tournament_once
ON rating_events(player_id, tournament_id)
WHERE event_type = 'TOURNAMENT';

CREATE INDEX IF NOT EXISTS idx_tournaments_date
ON tournaments(tournament_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_tournaments_status_date
ON tournaments(status, tournament_date DESC);

CREATE INDEX IF NOT EXISTS idx_participants_player
ON tournament_participants(player_id, tournament_id);

CREATE INDEX IF NOT EXISTS idx_matches_tournament_order
ON matches(tournament_id, match_order);

CREATE INDEX IF NOT EXISTS idx_match_deltas_player
ON match_player_deltas(player_id, match_id);

CREATE INDEX IF NOT EXISTS idx_rating_events_player_date
ON rating_events(player_id, event_date, id);

CREATE INDEX IF NOT EXISTS idx_rating_events_tournament
ON rating_events(tournament_id, player_id);

CREATE VIEW IF NOT EXISTS v_current_rankings AS
SELECT
  p.id AS player_id,
  p.name,
  p.current_elo,
  ROW_NUMBER() OVER (ORDER BY p.current_elo DESC, p.name ASC) AS rank
FROM players p
WHERE p.is_active = 1;

CREATE VIEW IF NOT EXISTS v_matches_flat AS
SELECT
  m.id AS match_id,
  m.tournament_id,
  t.name AS tournament_name,
  t.tournament_date,
  t.tournament_type,
  t.k_factor,
  t.base_points,
  m.match_order,
  m.match_format,
  pa1.name AS team_a_player1_name,
  pa2.name AS team_a_player2_name,
  pb1.name AS team_b_player1_name,
  pb2.name AS team_b_player2_name,
  m.score_a,
  m.score_b,
  m.delta_team_a,
  m.delta_team_b,
  m.status,
  m.created_at
FROM matches m
JOIN tournaments t ON t.id = m.tournament_id
JOIN players pa1 ON pa1.id = m.team_a_player1_id
LEFT JOIN players pa2 ON pa2.id = m.team_a_player2_id
JOIN players pb1 ON pb1.id = m.team_b_player1_id
LEFT JOIN players pb2 ON pb2.id = m.team_b_player2_id;
