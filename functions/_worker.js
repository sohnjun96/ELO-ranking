import { calculateMatchDelta } from "./_lib/elo.js";
import { TOURNAMENT_RULE_DEFAULTS, TOURNAMENT_TYPES, normalizeTournamentType } from "./_lib/constants.js";
import { assert, badRequest, json, methodNotAllowed, notFound, readJson } from "./_lib/http.js";

async function dbAll(db, sql, ...params) {
  const result = await db.prepare(sql).bind(...params).all();
  return result.results || [];
}

async function dbFirst(db, sql, ...params) {
  return await db.prepare(sql).bind(...params).first();
}

async function dbRun(db, sql, ...params) {
  return await db.prepare(sql).bind(...params).run();
}

function parseId(raw, label = "id") {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${label}`);
  return parsed;
}

function parseNonNegativeInt(raw, label) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid ${label}`);
  return value;
}

function normalizeDate(raw) {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
  return d.toISOString().slice(0, 10);
}

function normalizeMatchFormat(raw) {
  const value = String(raw || "SINGLES").trim().toUpperCase();
  if (![
    "SINGLES",
    "DOUBLES",
  ].includes(value)) {
    throw new Error("matchFormat must be SINGLES or DOUBLES");
  }
  return value;
}

function normalizeStatus(raw) {
  if (!raw) return null;
  const value = String(raw).trim().toUpperCase();
  return ["OPEN", "FINALIZED", "CANCELED"].includes(value) ? value : null;
}

async function ensureTournamentRules(db) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS tournament_rules (
      tournament_type TEXT PRIMARY KEY CHECK (tournament_type IN ('REGULAR', 'ADHOC', 'FRIENDLY')),
      display_name TEXT NOT NULL,
      k_factor INTEGER NOT NULL CHECK (k_factor >= 0),
      base_points INTEGER NOT NULL CHECK (base_points >= 0),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );

  for (const type of TOURNAMENT_TYPES) {
    const defaults = TOURNAMENT_RULE_DEFAULTS[type];
    await dbRun(
      db,
      `INSERT OR IGNORE INTO tournament_rules (tournament_type, display_name, k_factor, base_points, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))`,
      type,
      defaults.displayName,
      Number(defaults.kFactor),
      Number(defaults.basePoints)
    );
  }
}

async function listTournamentRules(db) {
  await ensureTournamentRules(db);
  const rows = await dbAll(
    db,
    `SELECT tournament_type AS tournamentType, display_name AS displayName, k_factor AS kFactor, base_points AS basePoints
    FROM tournament_rules
    ORDER BY CASE tournament_type
      WHEN 'REGULAR' THEN 1
      WHEN 'ADHOC' THEN 2
      WHEN 'FRIENDLY' THEN 3
      ELSE 9
    END`
  );

  return rows.map((row) => ({
    tournamentType: row.tournamentType,
    displayName: row.displayName,
    kFactor: Number(row.kFactor),
    basePoints: Number(row.basePoints),
  }));
}

async function getTournamentRuleForType(db, rawType) {
  const tournamentType = normalizeTournamentType(rawType);
  assert(tournamentType, "tournamentType must be REGULAR, ADHOC or FRIENDLY");
  await ensureTournamentRules(db);
  const row = await dbFirst(
    db,
    `SELECT display_name AS displayName, k_factor AS kFactor, base_points AS basePoints
    FROM tournament_rules
    WHERE tournament_type=?`,
    tournamentType
  );
  assert(row, `Tournament rule not found: ${tournamentType}`);
  return {
    tournamentType,
    displayName: row.displayName,
    kFactor: Number(row.kFactor),
    basePoints: Number(row.basePoints),
  };
}

function teamName(p1, p2, format) {
  return format === "DOUBLES" && p2 ? `${p1} / ${p2}` : p1;
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  return new Response(response.body, { status: response.status, headers });
}

function apiSegments(url) {
  const path = new URL(url).pathname;
  if (!path.startsWith("/api")) return null;
  const stripped = path.replace(/^\/api\/?/, "");
  return stripped ? stripped.split("/").filter(Boolean) : [];
}

async function getOpenTournamentRow(db) {
  return await dbFirst(db, "SELECT * FROM tournaments WHERE status='OPEN' ORDER BY id DESC LIMIT 1");
}

async function getTournamentRow(db, tournamentId) {
  return await dbFirst(db, "SELECT * FROM tournaments WHERE id=?", tournamentId);
}

async function listPlayers(db) {
  return await dbAll(
    db,
    `SELECT
      p.id,
      p.name,
      p.current_elo AS currentElo,
      (
        SELECT COUNT(*) + 1
        FROM players p2
        WHERE p2.is_active=1
          AND (p2.current_elo > p.current_elo OR (p2.current_elo = p.current_elo AND p2.name < p.name))
      ) AS rank
    FROM players p
    WHERE p.is_active=1
    ORDER BY p.current_elo DESC, p.name ASC`
  );
}

async function listAdminPlayers(db) {
  const rows = await dbAll(
    db,
    `SELECT
      p.id,
      p.name,
      p.current_elo AS currentElo,
      p.is_active AS isActive,
      p.created_at AS createdAt,
      p.updated_at AS updatedAt,
      EXISTS(
        SELECT 1
        FROM tournament_participants tp
        JOIN tournaments t ON t.id = tp.tournament_id
        WHERE tp.player_id = p.id AND t.status = 'OPEN'
      ) AS inOpenTournament,
      (
        SELECT COUNT(*)
        FROM matches m
        WHERE m.status='ACTIVE'
          AND (m.team_a_player1_id=p.id OR m.team_a_player2_id=p.id OR m.team_b_player1_id=p.id OR m.team_b_player2_id=p.id)
      ) AS matchCount
    FROM players p
    ORDER BY p.is_active DESC, p.current_elo DESC, p.name ASC`
  );

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    currentElo: Number(row.currentElo),
    isActive: Number(row.isActive) === 1,
    inOpenTournament: Number(row.inOpenTournament) === 1,
    matchCount: Number(row.matchCount || 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

async function getAdminPlayer(db, playerId) {
  const row = await dbFirst(
    db,
    `SELECT id, name, current_elo AS currentElo, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
    FROM players
    WHERE id=?`,
    playerId
  );
  if (!row) return null;

  const openRow = await dbFirst(
    db,
    `SELECT t.id AS tournamentId, t.name
    FROM tournament_participants tp
    JOIN tournaments t ON t.id = tp.tournament_id
    WHERE tp.player_id=? AND t.status='OPEN'
    LIMIT 1`,
    playerId
  );

  return {
    id: Number(row.id),
    name: row.name,
    currentElo: Number(row.currentElo),
    isActive: Number(row.isActive) === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    openTournament: openRow ? { id: Number(openRow.tournamentId), name: openRow.name } : null,
  };
}

async function adminUpdatePlayer(db, playerId, body) {
  const current = await getAdminPlayer(db, playerId);
  assert(current, "Player not found");

  const statements = [];

  if (body.name != null) {
    const newName = String(body.name).trim();
    assert(newName.length > 0, "Player name cannot be empty");
    if (newName !== current.name) {
      const exists = await dbFirst(db, `SELECT id FROM players WHERE name=? AND id<>?`, newName, playerId);
      assert(!exists, "Player name already exists");
      statements.push(db.prepare(`UPDATE players SET name=?, updated_at=datetime('now') WHERE id=?`).bind(newName, playerId));
    }
  }

  if (body.currentElo != null) {
    assert(!current.openTournament, "Cannot adjust ELO while player is in OPEN tournament");
    const targetElo = parseNonNegativeInt(body.currentElo, "currentElo");
    if (targetElo !== current.currentElo) {
      const delta = targetElo - current.currentElo;
      const note = String(body.note || "관리자 점수 조정").trim() || "관리자 점수 조정";
      statements.push(db.prepare(`UPDATE players SET current_elo=?, updated_at=datetime('now') WHERE id=?`).bind(targetElo, playerId));
      statements.push(
        db.prepare(
          `INSERT INTO rating_events (
            player_id, event_type, event_date, k_factor, base_points, elo_before, delta, elo_after, note, created_at
          ) VALUES (?, 'ADJUSTMENT', date('now'), 0, 0, ?, ?, ?, ?, datetime('now'))`
        ).bind(playerId, current.currentElo, delta, targetElo, note)
      );
    }
  }

  assert(statements.length > 0, "No changes requested");
  await db.batch(statements);
  return await getAdminPlayer(db, playerId);
}

async function adminDeletePlayer(db, playerId) {
  const current = await getAdminPlayer(db, playerId);
  assert(current, "Player not found");
  assert(current.isActive, "Player is already inactive");
  assert(!current.openTournament, "Cannot delete player while in OPEN tournament");

  await dbRun(db, `UPDATE players SET is_active=0, updated_at=datetime('now') WHERE id=?`, playerId);
  return await getAdminPlayer(db, playerId);
}

async function updateTournamentRule(db, rawType, body) {
  const tournamentType = normalizeTournamentType(rawType);
  assert(tournamentType, "Invalid tournamentType");
  await ensureTournamentRules(db);

  const current = await dbFirst(
    db,
    `SELECT tournament_type AS tournamentType, display_name AS displayName, k_factor AS kFactor, base_points AS basePoints
    FROM tournament_rules
    WHERE tournament_type=?`,
    tournamentType
  );
  assert(current, "Tournament rule not found");

  const hasK = body.kFactor != null;
  const hasBase = body.basePoints != null;
  assert(hasK || hasBase, "kFactor or basePoints is required");

  const kFactor = hasK ? parseNonNegativeInt(body.kFactor, "kFactor") : Number(current.kFactor);
  const basePoints = hasBase ? parseNonNegativeInt(body.basePoints, "basePoints") : Number(current.basePoints);

  await dbRun(
    db,
    `UPDATE tournament_rules
    SET k_factor=?, base_points=?, updated_at=datetime('now')
    WHERE tournament_type=?`,
    kFactor,
    basePoints,
    tournamentType
  );

  const updated = await dbFirst(
    db,
    `SELECT tournament_type AS tournamentType, display_name AS displayName, k_factor AS kFactor, base_points AS basePoints
    FROM tournament_rules
    WHERE tournament_type=?`,
    tournamentType
  );

  return {
    tournamentType: updated.tournamentType,
    displayName: updated.displayName,
    kFactor: Number(updated.kFactor),
    basePoints: Number(updated.basePoints),
  };
}

async function listRecentMatches(db, limit = 20) {
  const rows = await dbAll(
    db,
    `SELECT vm.*, t.status AS tournamentStatus
    FROM v_matches_flat vm
    JOIN tournaments t ON t.id = vm.tournament_id
    WHERE vm.status='ACTIVE' AND t.status != 'CANCELED'
    ORDER BY vm.tournament_date DESC, vm.match_order DESC, vm.match_id DESC
    LIMIT ?`,
    limit
  );

  return rows.map((row) => ({
    matchId: Number(row.match_id),
    tournamentId: Number(row.tournament_id),
    tournamentName: row.tournament_name,
    tournamentDate: row.tournament_date,
    tournamentType: row.tournament_type,
    matchOrder: Number(row.match_order),
    matchFormat: row.match_format,
    teamAName: teamName(row.team_a_player1_name, row.team_a_player2_name, row.match_format),
    teamBName: teamName(row.team_b_player1_name, row.team_b_player2_name, row.match_format),
    scoreA: Number(row.score_a),
    scoreB: Number(row.score_b),
    deltaTeamA: Number(row.delta_team_a),
    deltaTeamB: Number(row.delta_team_b),
  }));
}
async function getTournamentParticipants(db, tournamentId) {
  return await dbAll(
    db,
    `SELECT tp.player_id AS playerId, p.name, tp.seed_elo AS seedElo, tp.seed_rank AS seedRank
    FROM tournament_participants tp
    JOIN players p ON p.id = tp.player_id
    WHERE tp.tournament_id = ?
    ORDER BY tp.seed_rank ASC, p.name ASC`,
    tournamentId
  );
}

async function getPendingDeltaMap(db, tournamentId) {
  const rows = await dbAll(
    db,
    `SELECT
      tp.player_id AS playerId,
      COALESCE(SUM(CASE WHEN m.status='ACTIVE' THEN mpd.delta END), 0) AS pendingDelta
    FROM tournament_participants tp
    LEFT JOIN match_player_deltas mpd ON mpd.player_id = tp.player_id
    LEFT JOIN matches m ON m.id = mpd.match_id AND m.tournament_id = tp.tournament_id
    WHERE tp.tournament_id = ?
    GROUP BY tp.player_id`,
    tournamentId
  );

  const map = new Map();
  for (const row of rows) map.set(Number(row.playerId), Number(row.pendingDelta || 0));
  return map;
}

async function getTournamentMatches(db, tournamentId) {
  const rows = await dbAll(
    db,
    `SELECT
      m.id, m.tournament_id AS tournamentId, m.match_order AS matchOrder, m.match_format AS matchFormat,
      m.score_a AS scoreA, m.score_b AS scoreB, m.delta_team_a AS deltaTeamA, m.delta_team_b AS deltaTeamB,
      pa1.id AS teamAPlayer1Id, pa1.name AS teamAPlayer1Name,
      pa2.id AS teamAPlayer2Id, pa2.name AS teamAPlayer2Name,
      pb1.id AS teamBPlayer1Id, pb1.name AS teamBPlayer1Name,
      pb2.id AS teamBPlayer2Id, pb2.name AS teamBPlayer2Name
    FROM matches m
    JOIN players pa1 ON pa1.id = m.team_a_player1_id
    LEFT JOIN players pa2 ON pa2.id = m.team_a_player2_id
    JOIN players pb1 ON pb1.id = m.team_b_player1_id
    LEFT JOIN players pb2 ON pb2.id = m.team_b_player2_id
    WHERE m.tournament_id = ? AND m.status = 'ACTIVE'
    ORDER BY m.match_order ASC, m.id ASC`,
    tournamentId
  );

  return rows.map((row) => ({
    id: Number(row.id),
    tournamentId: Number(row.tournamentId),
    matchOrder: Number(row.matchOrder),
    matchFormat: row.matchFormat,
    scoreA: Number(row.scoreA),
    scoreB: Number(row.scoreB),
    deltaTeamA: Number(row.deltaTeamA),
    deltaTeamB: Number(row.deltaTeamB),
    teamAPlayer1Id: Number(row.teamAPlayer1Id),
    teamAPlayer2Id: row.teamAPlayer2Id == null ? null : Number(row.teamAPlayer2Id),
    teamBPlayer1Id: Number(row.teamBPlayer1Id),
    teamBPlayer2Id: row.teamBPlayer2Id == null ? null : Number(row.teamBPlayer2Id),
    teamAName: teamName(row.teamAPlayer1Name, row.teamAPlayer2Name, row.matchFormat),
    teamBName: teamName(row.teamBPlayer1Name, row.teamBPlayer2Name, row.matchFormat),
  }));
}

function singlesMatrix(participants, matches) {
  const names = participants.map((p) => p.name);
  const matrix = {};
  for (const rowName of names) {
    matrix[rowName] = {};
    for (const colName of names) matrix[rowName][colName] = rowName === colName ? "\\" : "";
  }
  for (const match of matches) {
    if (match.matchFormat !== "SINGLES") continue;
    matrix[match.teamAName][match.teamBName] = `${match.scoreA}:${match.scoreB}`;
    matrix[match.teamBName][match.teamAName] = `${match.scoreB}:${match.scoreA}`;
  }
  return matrix;
}

async function tournamentDetail(db, tournamentId) {
  const tournament = await getTournamentRow(db, tournamentId);
  if (!tournament) return null;

  const participantsRaw = await getTournamentParticipants(db, tournamentId);
  const pendingDeltaMap = await getPendingDeltaMap(db, tournamentId);
  const matches = await getTournamentMatches(db, tournamentId);

  const participants = participantsRaw.map((p) => {
    const pendingDelta = pendingDeltaMap.get(Number(p.playerId)) || 0;
    return {
      playerId: Number(p.playerId),
      name: p.name,
      seedElo: Number(p.seedElo),
      seedRank: Number(p.seedRank),
      pendingDelta,
      projectedElo: Number(p.seedElo) + pendingDelta,
    };
  });

  const ratingEventsRaw = await dbAll(
    db,
    `SELECT re.player_id AS playerId, p.name, re.elo_before AS eloBefore, re.delta, re.elo_after AS eloAfter
    FROM rating_events re
    JOIN players p ON p.id = re.player_id
    WHERE re.tournament_id = ? AND re.event_type = 'TOURNAMENT'
    ORDER BY re.elo_after DESC, p.name ASC`,
    tournamentId
  );

  const ratingEvents = ratingEventsRaw.map((row) => ({
    playerId: Number(row.playerId),
    name: row.name,
    eloBefore: Number(row.eloBefore),
    delta: Number(row.delta),
    eloAfter: Number(row.eloAfter),
  }));

  return {
    id: Number(tournament.id),
    name: tournament.name,
    tournamentDate: tournament.tournament_date,
    tournamentType: tournament.tournament_type,
    kFactor: Number(tournament.k_factor),
    basePoints: Number(tournament.base_points),
    status: tournament.status,
    createdAt: tournament.created_at,
    finalizedAt: tournament.finalized_at,
    canceledAt: tournament.canceled_at,
    participants,
    matches,
    matchCount: matches.length,
    scheduleMatrix: singlesMatrix(participants, matches),
    ratingEvents,
  };
}

async function fetchPlayersByIds(db, ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  return await dbAll(
    db,
    `SELECT id, name, current_elo AS currentElo
     FROM players
     WHERE is_active = 1 AND id IN (${placeholders})`,
    ...ids
  );
}

function parseParticipantIds(rawIds) {
  assert(Array.isArray(rawIds), "participantIds must be an array");
  const ids = [...new Set(rawIds.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0))];
  assert(ids.length >= 2, "At least 2 participants are required");
  return ids;
}

function seedMapFromParticipants(participants) {
  const result = {};
  for (const p of participants) result[Number(p.playerId)] = Number(p.seedElo);
  return result;
}
async function createTournament(db, body) {
  const open = await getOpenTournamentRow(db);
  assert(!open, "An OPEN tournament already exists");

  const name = String(body.name || "").trim();
  assert(name.length > 0, "Tournament name is required");

  const tournamentDate = normalizeDate(body.tournamentDate || body.date || new Date());
  const rule = await getTournamentRuleForType(db, body.tournamentType);
  const tournamentType = rule.tournamentType;

  const participantIds = parseParticipantIds(body.participantIds);
  const players = await fetchPlayersByIds(db, participantIds);
  assert(players.length === participantIds.length, "Some participants do not exist");

  const inserted = await dbRun(
    db,
    `INSERT INTO tournaments (name, tournament_date, tournament_type, k_factor, base_points, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'OPEN', datetime('now'))`,
    name,
    tournamentDate,
    tournamentType,
    rule.kFactor,
    rule.basePoints
  );

  const tournamentId = Number(inserted.meta?.last_row_id);
  const sorted = players
    .map((p) => ({ playerId: Number(p.id), currentElo: Number(p.currentElo) }))
    .sort((a, b) => b.currentElo - a.currentElo || a.playerId - b.playerId);

  await db.batch(
    sorted.map((p, idx) =>
      db.prepare(
        `INSERT INTO tournament_participants (tournament_id, player_id, seed_elo, seed_rank, joined_at)
        VALUES (?, ?, ?, ?, datetime('now'))`
      ).bind(tournamentId, p.playerId, p.currentElo, idx + 1)
    )
  );

  return await tournamentDetail(db, tournamentId);
}

async function updateTournament(db, tournamentId, body) {
  const tournament = await getTournamentRow(db, tournamentId);
  assert(tournament, "Tournament not found");
  assert(tournament.status === "OPEN", "Only OPEN tournaments can be edited");

  const countRow = await dbFirst(
    db,
    `SELECT COUNT(*) AS count FROM matches WHERE tournament_id = ? AND status='ACTIVE'`,
    tournamentId
  );
  const matchCount = Number(countRow?.count || 0);

  const updateSql = [];
  const values = [];

  if (body.name != null) {
    const name = String(body.name).trim();
    assert(name.length > 0, "Tournament name cannot be empty");
    updateSql.push("name=?");
    values.push(name);
  }

  if (body.tournamentDate != null || body.date != null) {
    const date = normalizeDate(body.tournamentDate || body.date);
    updateSql.push("tournament_date=?");
    values.push(date);
  }

  if (body.tournamentType != null) {
    assert(matchCount === 0, "Cannot change tournament type after matches are recorded");
    const rule = await getTournamentRuleForType(db, body.tournamentType);
    const tournamentType = rule.tournamentType;
    updateSql.push("tournament_type=?", "k_factor=?", "base_points=?");
    values.push(tournamentType, rule.kFactor, rule.basePoints);
  }

  if (updateSql.length > 0) {
    values.push(tournamentId);
    await dbRun(db, `UPDATE tournaments SET ${updateSql.join(",")} WHERE id=?`, ...values);
  }

  if (body.participantIds != null) {
    assert(matchCount === 0, "Cannot change participants after matches are recorded");
    const ids = parseParticipantIds(body.participantIds);
    const players = await fetchPlayersByIds(db, ids);
    assert(players.length === ids.length, "Some participants do not exist");

    await dbRun(db, `DELETE FROM tournament_participants WHERE tournament_id=?`, tournamentId);
    const sorted = players
      .map((p) => ({ playerId: Number(p.id), currentElo: Number(p.currentElo) }))
      .sort((a, b) => b.currentElo - a.currentElo || a.playerId - b.playerId);

    await db.batch(
      sorted.map((p, idx) =>
        db.prepare(
          `INSERT INTO tournament_participants (tournament_id, player_id, seed_elo, seed_rank, joined_at)
          VALUES (?, ?, ?, ?, datetime('now'))`
        ).bind(tournamentId, p.playerId, p.currentElo, idx + 1)
      )
    );
  }

  return await tournamentDetail(db, tournamentId);
}

async function addMatch(db, tournamentId, body) {
  const tournament = await getTournamentRow(db, tournamentId);
  assert(tournament, "Tournament not found");
  assert(tournament.status === "OPEN", "Only OPEN tournaments can accept matches");

  const participants = await getTournamentParticipants(db, tournamentId);
  const seedRatings = seedMapFromParticipants(participants);

  const matchFormat = normalizeMatchFormat(body.matchFormat);
  const scoreA = parseNonNegativeInt(body.scoreA, "scoreA");
  const scoreB = parseNonNegativeInt(body.scoreB, "scoreB");
  assert(scoreA + scoreB > 0, "scoreA and scoreB cannot both be 0");

  const teamAPlayer1Id = parseId(body.teamAPlayer1Id, "teamAPlayer1Id");
  const teamBPlayer1Id = parseId(body.teamBPlayer1Id, "teamBPlayer1Id");
  const teamAPlayer2Id = body.teamAPlayer2Id == null || body.teamAPlayer2Id === "" ? null : parseId(body.teamAPlayer2Id, "teamAPlayer2Id");
  const teamBPlayer2Id = body.teamBPlayer2Id == null || body.teamBPlayer2Id === "" ? null : parseId(body.teamBPlayer2Id, "teamBPlayer2Id");

  if (matchFormat === "SINGLES") {
    assert(teamAPlayer2Id == null && teamBPlayer2Id == null, "SINGLES cannot include second players");
  } else {
    assert(teamAPlayer2Id != null && teamBPlayer2Id != null, "DOUBLES requires second players");
  }

  const inMatchIds = [teamAPlayer1Id, teamAPlayer2Id, teamBPlayer1Id, teamBPlayer2Id].filter((x) => x != null);
  const uniqueIds = new Set(inMatchIds);
  assert(uniqueIds.size === inMatchIds.length, "A player cannot be repeated in one match");
  for (const playerId of uniqueIds) {
    assert(seedRatings[playerId] != null, `Player ${playerId} is not a participant`);
  }

  const delta = calculateMatchDelta(
    seedRatings,
    {
      matchFormat,
      teamA: { player1: teamAPlayer1Id, player2: teamAPlayer2Id },
      teamB: { player1: teamBPlayer1Id, player2: teamBPlayer2Id },
      scoreA,
      scoreB,
    },
    { kFactor: Number(tournament.k_factor), basePoints: Number(tournament.base_points) }
  );

  const orderRow = await dbFirst(
    db,
    `SELECT COALESCE(MAX(match_order), 0) + 1 AS nextOrder
    FROM matches
    WHERE tournament_id=? AND status='ACTIVE'`,
    tournamentId
  );
  const matchOrder = Number(orderRow?.nextOrder || 1);

  const inserted = await dbRun(
    db,
    `INSERT INTO matches (
      tournament_id, match_order, match_format, team_a_player1_id, team_a_player2_id, team_b_player1_id, team_b_player2_id,
      score_a, score_b, delta_team_a, delta_team_b, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', datetime('now'))`,
    tournamentId,
    matchOrder,
    matchFormat,
    teamAPlayer1Id,
    teamAPlayer2Id,
    teamBPlayer1Id,
    teamBPlayer2Id,
    scoreA,
    scoreB,
    delta.deltaTeamA,
    delta.deltaTeamB
  );

  const matchId = Number(inserted.meta?.last_row_id);
  const stmts = [];
  for (const playerId of delta.teamAPlayers) {
    stmts.push(db.prepare(`INSERT INTO match_player_deltas (match_id, player_id, team_side, delta) VALUES (?, ?, 'A', ?)`).bind(matchId, playerId, delta.deltaTeamA));
  }
  for (const playerId of delta.teamBPlayers) {
    stmts.push(db.prepare(`INSERT INTO match_player_deltas (match_id, player_id, team_side, delta) VALUES (?, ?, 'B', ?)`).bind(matchId, playerId, delta.deltaTeamB));
  }
  await db.batch(stmts);

  return await tournamentDetail(db, tournamentId);
}

async function deleteMatch(db, tournamentId, matchId) {
  const tournament = await getTournamentRow(db, tournamentId);
  assert(tournament, "Tournament not found");
  assert(tournament.status === "OPEN", "Only OPEN tournaments can delete matches");

  const match = await dbFirst(db, `SELECT id FROM matches WHERE id=? AND tournament_id=? AND status='ACTIVE'`, matchId, tournamentId);
  assert(match, "Match not found");

  await dbRun(db, `DELETE FROM matches WHERE id=? AND tournament_id=?`, matchId, tournamentId);
  const remain = await dbAll(db, `SELECT id FROM matches WHERE tournament_id=? AND status='ACTIVE' ORDER BY match_order ASC, id ASC`, tournamentId);
  if (remain.length) {
    await db.batch(remain.map((row, index) => db.prepare(`UPDATE matches SET match_order=? WHERE id=?`).bind(index + 1, Number(row.id))));
  }

  return await tournamentDetail(db, tournamentId);
}

async function finalizeTournament(db, tournamentId) {
  const tournament = await getTournamentRow(db, tournamentId);
  assert(tournament, "Tournament not found");
  assert(tournament.status === "OPEN", "Only OPEN tournaments can be finalized");

  const rows = await dbAll(
    db,
    `SELECT
      tp.player_id AS playerId,
      tp.seed_elo AS seedElo,
      COALESCE(SUM(CASE WHEN m.status='ACTIVE' THEN mpd.delta END), 0) AS totalDelta
    FROM tournament_participants tp
    LEFT JOIN match_player_deltas mpd ON mpd.player_id = tp.player_id
    LEFT JOIN matches m ON m.id = mpd.match_id AND m.tournament_id = tp.tournament_id
    WHERE tp.tournament_id = ?
    GROUP BY tp.player_id, tp.seed_elo
    ORDER BY tp.seed_rank ASC, tp.player_id ASC`,
    tournamentId
  );
  assert(rows.length > 0, "No tournament participants");

  const stmts = [];
  for (const row of rows) {
    const playerId = Number(row.playerId);
    const eloBefore = Number(row.seedElo);
    const delta = Number(row.totalDelta || 0);
    const eloAfter = eloBefore + delta;

    stmts.push(
      db.prepare(
        `INSERT INTO rating_events (
          player_id, event_type, event_date, tournament_id, k_factor, base_points, elo_before, delta, elo_after, note, created_at
        ) VALUES (?, 'TOURNAMENT', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(playerId, tournament.tournament_date, tournamentId, Number(tournament.k_factor), Number(tournament.base_points), eloBefore, delta, eloAfter, "Tournament finalized")
    );
    stmts.push(db.prepare(`UPDATE players SET current_elo=?, updated_at=datetime('now') WHERE id=?`).bind(eloAfter, playerId));
  }

  stmts.push(db.prepare(`UPDATE tournaments SET status='FINALIZED', finalized_at=datetime('now') WHERE id=?`).bind(tournamentId));
  await db.batch(stmts);

  return await tournamentDetail(db, tournamentId);
}

async function cancelTournament(db, tournamentId) {
  const tournament = await getTournamentRow(db, tournamentId);
  assert(tournament, "Tournament not found");
  assert(tournament.status === "OPEN", "Only OPEN tournaments can be canceled");

  await dbRun(db, `UPDATE tournaments SET status='CANCELED', canceled_at=datetime('now') WHERE id=?`, tournamentId);
  return await tournamentDetail(db, tournamentId);
}
async function playerStats(db, playerId) {
  const player = await dbFirst(
    db,
    `SELECT p.id, p.name, p.current_elo AS currentElo,
      (
        SELECT COUNT(*) + 1
        FROM players p2
        WHERE p2.is_active=1
          AND (p2.current_elo > p.current_elo OR (p2.current_elo = p.current_elo AND p2.name < p.name))
      ) AS rank
    FROM players p
    WHERE p.id=? AND p.is_active=1`,
    playerId
  );
  assert(player, "Player not found");

  const events = await dbAll(
    db,
    `SELECT id, event_type AS eventType, event_date AS eventDate, tournament_id AS tournamentId, k_factor AS kFactor, base_points AS basePoints,
      elo_before AS eloBefore, delta, elo_after AS eloAfter, note
    FROM rating_events
    WHERE player_id=?
    ORDER BY event_date ASC, id ASC`,
    playerId
  );

  const matches = await dbAll(
    db,
    `SELECT
      m.id, m.match_format AS matchFormat, m.match_order AS matchOrder,
      m.score_a AS scoreA, m.score_b AS scoreB, m.delta_team_a AS deltaTeamA, m.delta_team_b AS deltaTeamB,
      t.id AS tournamentId, t.name AS tournamentName, t.tournament_date AS tournamentDate,
      pa1.id AS teamAPlayer1Id, pa1.name AS teamAPlayer1Name,
      pa2.id AS teamAPlayer2Id, pa2.name AS teamAPlayer2Name,
      pb1.id AS teamBPlayer1Id, pb1.name AS teamBPlayer1Name,
      pb2.id AS teamBPlayer2Id, pb2.name AS teamBPlayer2Name
    FROM matches m
    JOIN tournaments t ON t.id = m.tournament_id
    JOIN players pa1 ON pa1.id = m.team_a_player1_id
    LEFT JOIN players pa2 ON pa2.id = m.team_a_player2_id
    JOIN players pb1 ON pb1.id = m.team_b_player1_id
    LEFT JOIN players pb2 ON pb2.id = m.team_b_player2_id
    WHERE m.status='ACTIVE' AND t.status='FINALIZED'
      AND (m.team_a_player1_id=? OR m.team_a_player2_id=? OR m.team_b_player1_id=? OR m.team_b_player2_id=?)
    ORDER BY t.tournament_date DESC, m.match_order DESC, m.id DESC`,
    playerId,
    playerId,
    playerId,
    playerId
  );

  let total = 0;
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let singlesTotal = 0;
  let singlesWins = 0;
  let doublesTotal = 0;
  let doublesWins = 0;
  const opponentMap = new Map();

  const normalizedMatches = matches.map((row) => {
    const inTeamA = Number(row.teamAPlayer1Id) === playerId || Number(row.teamAPlayer2Id) === playerId;
    const myScore = inTeamA ? Number(row.scoreA) : Number(row.scoreB);
    const opponentScore = inTeamA ? Number(row.scoreB) : Number(row.scoreA);
    const myDelta = inTeamA ? Number(row.deltaTeamA) : Number(row.deltaTeamB);
    const opponentDelta = inTeamA ? Number(row.deltaTeamB) : Number(row.deltaTeamA);
    const result = myScore > opponentScore ? "WIN" : myScore < opponentScore ? "LOSE" : "DRAW";

    total += 1;
    if (result === "WIN") wins += 1;
    if (result === "LOSE") losses += 1;
    if (result === "DRAW") draws += 1;

    if (row.matchFormat === "SINGLES") {
      singlesTotal += 1;
      if (result === "WIN") singlesWins += 1;

      const opponent = inTeamA ? row.teamBPlayer1Name : row.teamAPlayer1Name;
      const current = opponentMap.get(opponent) || { opponent, matches: 0, wins: 0, losses: 0, draws: 0 };
      current.matches += 1;
      if (result === "WIN") current.wins += 1;
      if (result === "LOSE") current.losses += 1;
      if (result === "DRAW") current.draws += 1;
      opponentMap.set(opponent, current);
    } else {
      doublesTotal += 1;
      if (result === "WIN") doublesWins += 1;
    }

    return {
      id: Number(row.id),
      tournamentId: Number(row.tournamentId),
      tournamentName: row.tournamentName,
      tournamentDate: row.tournamentDate,
      matchOrder: Number(row.matchOrder),
      matchFormat: row.matchFormat,
      myTeamName: inTeamA ? teamName(row.teamAPlayer1Name, row.teamAPlayer2Name, row.matchFormat) : teamName(row.teamBPlayer1Name, row.teamBPlayer2Name, row.matchFormat),
      opponentTeamName: inTeamA ? teamName(row.teamBPlayer1Name, row.teamBPlayer2Name, row.matchFormat) : teamName(row.teamAPlayer1Name, row.teamAPlayer2Name, row.matchFormat),
      myScore,
      opponentScore,
      myDelta,
      opponentDelta,
      result,
    };
  });

  const opponents = [...opponentMap.values()].sort((a, b) => b.matches - a.matches || b.wins - a.wins || a.opponent.localeCompare(b.opponent));

  return {
    player: { id: Number(player.id), name: player.name, currentElo: Number(player.currentElo), rank: Number(player.rank) },
    summary: {
      total,
      wins,
      losses,
      draws,
      winRate: total ? Math.round((wins / total) * 100) : 0,
      singlesTotal,
      singlesWins,
      singlesWinRate: singlesTotal ? Math.round((singlesWins / singlesTotal) * 100) : 0,
      doublesTotal,
      doublesWins,
      doublesWinRate: doublesTotal ? Math.round((doublesWins / doublesTotal) * 100) : 0,
    },
    events: events.map((e) => ({
      id: Number(e.id),
      eventType: e.eventType,
      eventDate: e.eventDate,
      tournamentId: e.tournamentId == null ? null : Number(e.tournamentId),
      kFactor: Number(e.kFactor),
      basePoints: Number(e.basePoints),
      eloBefore: Number(e.eloBefore),
      delta: Number(e.delta),
      eloAfter: Number(e.eloAfter),
      note: e.note,
    })),
    matches: normalizedMatches,
    opponents,
  };
}

async function statsOverview(db) {
  const summary = await dbFirst(
    db,
    `SELECT
      (SELECT COUNT(*) FROM players WHERE is_active=1) AS players,
      (SELECT COUNT(*) FROM tournaments WHERE status='FINALIZED') AS finalizedTournaments,
      (SELECT COUNT(*) FROM tournaments WHERE status='OPEN') AS openTournaments,
      (
        SELECT COUNT(*)
        FROM matches m
        JOIN tournaments t ON t.id = m.tournament_id
        WHERE m.status='ACTIVE' AND t.status='FINALIZED'
      ) AS finalizedMatches,
      (SELECT ROUND(AVG(current_elo), 0) FROM players WHERE is_active=1) AS avgElo`
  );

  const topPlayers = await listPlayers(db);
  const recentTournaments = await dbAll(
    db,
    `SELECT
      t.id, t.name, t.tournament_date AS tournamentDate, t.tournament_type AS tournamentType, t.status,
      (SELECT COUNT(*) FROM matches m WHERE m.tournament_id=t.id AND m.status='ACTIVE') AS matchCount
    FROM tournaments t
    ORDER BY t.tournament_date DESC, t.id DESC
    LIMIT 10`
  );

  const eloValues = topPlayers.map((p) => Number(p.currentElo));
  const bucketSize = 100;
  const min = eloValues.length ? Math.floor(Math.min(...eloValues) / bucketSize) * bucketSize : 0;
  const max = eloValues.length ? Math.ceil(Math.max(...eloValues) / bucketSize) * bucketSize : 0;
  const histogram = {};
  for (let v = min; v <= max; v += bucketSize) histogram[`${v}-${v + bucketSize - 1}`] = 0;
  for (const elo of eloValues) {
    const start = Math.floor(elo / bucketSize) * bucketSize;
    const key = `${start}-${start + bucketSize - 1}`;
    histogram[key] = (histogram[key] || 0) + 1;
  }

  return {
    summary: {
      players: Number(summary?.players || 0),
      finalizedTournaments: Number(summary?.finalizedTournaments || 0),
      openTournaments: Number(summary?.openTournaments || 0),
      finalizedMatches: Number(summary?.finalizedMatches || 0),
      avgElo: Number(summary?.avgElo || 0),
    },
    topPlayers: topPlayers.map((p) => ({ id: Number(p.id), name: p.name, currentElo: Number(p.currentElo), rank: Number(p.rank) })),
    recentTournaments: recentTournaments.map((t) => ({
      id: Number(t.id),
      name: t.name,
      tournamentDate: t.tournamentDate,
      tournamentType: t.tournamentType,
      status: t.status,
      matchCount: Number(t.matchCount || 0),
    })),
    eloHistogram: histogram,
  };
}

async function listTournaments(db, status) {
  const where = status ? "WHERE t.status=?" : "";
  const params = status ? [status] : [];
  const rows = await dbAll(
    db,
    `SELECT
      t.id, t.name, t.tournament_date AS tournamentDate, t.tournament_type AS tournamentType,
      t.k_factor AS kFactor, t.base_points AS basePoints, t.status, t.created_at AS createdAt,
      t.finalized_at AS finalizedAt, t.canceled_at AS canceledAt,
      (SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id=t.id) AS participantCount,
      (SELECT COUNT(*) FROM matches m WHERE m.tournament_id=t.id AND m.status='ACTIVE') AS matchCount
    FROM tournaments t
    ${where}
    ORDER BY t.tournament_date DESC, t.id DESC`,
    ...params
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    tournamentDate: r.tournamentDate,
    tournamentType: r.tournamentType,
    kFactor: Number(r.kFactor),
    basePoints: Number(r.basePoints),
    status: r.status,
    createdAt: r.createdAt,
    finalizedAt: r.finalizedAt,
    canceledAt: r.canceledAt,
    participantCount: Number(r.participantCount || 0),
    matchCount: Number(r.matchCount || 0),
  }));
}
async function route(request, env) {
  const segments = apiSegments(request.url);
  if (segments == null) return null;

  if (!segments.length) return json({ ok: true, message: "ELO API" });

  if (segments[0] === "health") {
    if (request.method !== "GET") return methodNotAllowed();
    return json({ ok: true, now: new Date().toISOString() });
  }

  if (segments[0] === "bootstrap") {
    if (request.method !== "GET") return methodNotAllowed();
    const players = await listPlayers(env.DB);
    const recentMatches = await listRecentMatches(env.DB, 8);
    const tournamentRules = await listTournamentRules(env.DB);
    const open = await getOpenTournamentRow(env.DB);
    const openTournament = open ? await tournamentDetail(env.DB, Number(open.id)) : null;
    return json({ ok: true, players, recentMatches, openTournament, tournamentRules });
  }

  if (segments[0] === "recent-matches") {
    if (request.method !== "GET") return methodNotAllowed();
    const limitRaw = Number(new URL(request.url).searchParams.get("limit") || 20);
    const limit = Number.isInteger(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20;
    const matches = await listRecentMatches(env.DB, limit);
    return json({ ok: true, matches });
  }

  if (segments[0] === "settings") {
    if (segments.length === 2 && segments[1] === "tournament-rules") {
      if (request.method !== "GET") return methodNotAllowed();
      return json({ ok: true, tournamentRules: await listTournamentRules(env.DB) });
    }

    if (segments.length === 3 && segments[1] === "tournament-rules") {
      if (request.method !== "PATCH") return methodNotAllowed();
      const body = await readJson(request);
      const rule = await updateTournamentRule(env.DB, segments[2], body);
      return json({ ok: true, rule, tournamentRules: await listTournamentRules(env.DB) });
    }

    return notFound();
  }

  if (segments[0] === "admin") {
    if (segments.length === 2 && segments[1] === "players") {
      if (request.method !== "GET") return methodNotAllowed();
      return json({ ok: true, players: await listAdminPlayers(env.DB) });
    }

    if (segments.length === 3 && segments[1] === "players") {
      const playerId = parseId(segments[2], "playerId");
      if (request.method === "PATCH") {
        const body = await readJson(request);
        return json({ ok: true, player: await adminUpdatePlayer(env.DB, playerId, body) });
      }
      if (request.method === "DELETE") {
        return json({ ok: true, player: await adminDeletePlayer(env.DB, playerId) });
      }
      return methodNotAllowed();
    }

    return notFound();
  }

  if (segments[0] === "players") {
    if (segments.length === 1) {
      if (request.method === "GET") {
        const players = await listPlayers(env.DB);
        return json({ ok: true, players: players.map((p) => ({ id: Number(p.id), name: p.name, currentElo: Number(p.currentElo), rank: Number(p.rank) })) });
      }

      if (request.method === "POST") {
        const body = await readJson(request);
        const name = String(body.name || "").trim();
        assert(name.length > 0, "Player name is required");

        const existing = await dbFirst(env.DB, `SELECT id FROM players WHERE name=?`, name);
        assert(!existing, "Player already exists");

        let initialElo = body.initialElo;
        if (initialElo == null || initialElo === "") {
          const avg = await dbFirst(env.DB, `SELECT ROUND(AVG(current_elo), 0) AS avgElo FROM players WHERE is_active=1`);
          initialElo = avg?.avgElo == null ? 2000 : Number(avg.avgElo);
        }
        initialElo = parseNonNegativeInt(initialElo, "initialElo");

        const inserted = await dbRun(
          env.DB,
          `INSERT INTO players (name, current_elo, is_active, created_at, updated_at)
          VALUES (?, ?, 1, datetime('now'), datetime('now'))`,
          name,
          initialElo
        );
        const playerId = Number(inserted.meta?.last_row_id);

        await dbRun(
          env.DB,
          `INSERT INTO rating_events (
            player_id, event_type, event_date, k_factor, base_points, elo_before, delta, elo_after, note, created_at
          ) VALUES (?, 'REGISTER', date('now'), 0, 0, ?, 0, ?, 'Player registered', datetime('now'))`,
          playerId,
          initialElo,
          initialElo
        );

        return json({ ok: true, player: { id: playerId, name, currentElo: initialElo } }, 201);
      }

      return methodNotAllowed();
    }

    if (segments.length === 3 && segments[2] === "stats") {
      if (request.method !== "GET") return methodNotAllowed();
      const playerId = parseId(segments[1], "playerId");
      return json({ ok: true, ...(await playerStats(env.DB, playerId)) });
    }

    return notFound();
  }

  if (segments[0] === "tournaments") {
    if (segments.length === 1) {
      if (request.method === "GET") {
        const status = normalizeStatus(new URL(request.url).searchParams.get("status"));
        return json({ ok: true, tournaments: await listTournaments(env.DB, status) });
      }
      if (request.method === "POST") {
        const body = await readJson(request);
        return json({ ok: true, tournament: await createTournament(env.DB, body) }, 201);
      }
      return methodNotAllowed();
    }

    if (segments.length === 2 && segments[1] === "open") {
      if (request.method !== "GET") return methodNotAllowed();
      const open = await getOpenTournamentRow(env.DB);
      if (!open) return json({ ok: true, tournament: null });
      return json({ ok: true, tournament: await tournamentDetail(env.DB, Number(open.id)) });
    }

    const tournamentId = parseId(segments[1], "tournamentId");

    if (segments.length === 2) {
      if (request.method === "GET") {
        const detail = await tournamentDetail(env.DB, tournamentId);
        if (!detail) return notFound("Tournament not found");
        return json({ ok: true, tournament: detail });
      }
      if (request.method === "PATCH") {
        const body = await readJson(request);
        return json({ ok: true, tournament: await updateTournament(env.DB, tournamentId, body) });
      }
      return methodNotAllowed();
    }

    if (segments.length === 3 && segments[2] === "matches") {
      if (request.method !== "POST") return methodNotAllowed();
      const body = await readJson(request);
      return json({ ok: true, tournament: await addMatch(env.DB, tournamentId, body) });
    }

    if (segments.length === 4 && segments[2] === "matches") {
      if (request.method !== "DELETE") return methodNotAllowed();
      const matchId = parseId(segments[3], "matchId");
      return json({ ok: true, tournament: await deleteMatch(env.DB, tournamentId, matchId) });
    }

    if (segments.length === 3 && segments[2] === "finalize") {
      if (request.method !== "POST") return methodNotAllowed();
      return json({ ok: true, tournament: await finalizeTournament(env.DB, tournamentId) });
    }

    if (segments.length === 3 && segments[2] === "cancel") {
      if (request.method !== "POST") return methodNotAllowed();
      return json({ ok: true, tournament: await cancelTournament(env.DB, tournamentId) });
    }

    if (segments.length === 3 && segments[2] === "report") {
      if (request.method !== "GET") return methodNotAllowed();
      const detail = await tournamentDetail(env.DB, tournamentId);
      if (!detail) return notFound("Tournament not found");
      return json({ ok: true, tournament: detail });
    }

    return notFound();
  }

  if (segments[0] === "stats") {
    if (segments.length === 2 && segments[1] === "overview") {
      if (request.method !== "GET") return methodNotAllowed();
      return json({ ok: true, ...(await statsOverview(env.DB)) });
    }

    if (segments.length === 3 && segments[1] === "player") {
      if (request.method !== "GET") return methodNotAllowed();
      const playerId = parseId(segments[2], "playerId");
      return json({ ok: true, ...(await playerStats(env.DB, playerId)) });
    }

    return notFound();
  }

  return notFound();
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    try {
      const response = await route(request, env);
      if (response) return withCors(response);
      return env.ASSETS.fetch(request);
    } catch (error) {
      return withCors(badRequest(error instanceof Error ? error.message : "Unknown error"));
    }
  },
};
