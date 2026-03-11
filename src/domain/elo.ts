export type TournamentType = "REGULAR" | "ADHOC" | "FRIENDLY";
export type MatchFormat = "SINGLES" | "DOUBLES";
export type PlayerId = number;

export interface TournamentRule {
  kFactor: number;
  basePoints: number;
}

export interface Team {
  player1: PlayerId;
  player2?: PlayerId | null;
}

export interface MatchInput {
  id?: number;
  matchFormat: MatchFormat;
  teamA: Team;
  teamB: Team;
  scoreA: number;
  scoreB: number;
}

export interface MatchResult {
  id?: number;
  deltaTeamA: number;
  deltaTeamB: number;
  teamAPlayers: PlayerId[];
  teamBPlayers: PlayerId[];
}

export interface TournamentComputation {
  perMatch: MatchResult[];
  totalDeltaByPlayer: Record<PlayerId, number>;
  finalRatingByPlayer: Record<PlayerId, number>;
}

export const TOURNAMENT_RULES: Record<TournamentType, TournamentRule> = {
  REGULAR: { kFactor: 200, basePoints: 4 },
  ADHOC: { kFactor: 100, basePoints: 1 },
  FRIENDLY: { kFactor: 0, basePoints: 0 },
};

function ensurePositiveScore(scoreA: number, scoreB: number): void {
  if (scoreA < 0 || scoreB < 0 || scoreA + scoreB <= 0) {
    throw new Error("scoreA and scoreB must be non-negative and not both zero");
  }
}

function resultFromScore(scoreA: number, scoreB: number): number {
  ensurePositiveScore(scoreA, scoreB);
  return scoreA / (scoreA + scoreB);
}

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

function average(values: number[]): number {
  if (values.length === 0) {
    throw new Error("cannot average empty array");
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resolveTeamPlayers(team: Team, format: MatchFormat): PlayerId[] {
  if (format === "SINGLES") {
    if (team.player2 != null) {
      throw new Error("singles match cannot include player2");
    }
    return [team.player1];
  }
  if (team.player2 == null) {
    throw new Error("doubles match requires player2");
  }
  if (team.player1 === team.player2) {
    throw new Error("doubles team cannot contain duplicate players");
  }
  return [team.player1, team.player2];
}

function getSeedRating(seedRatings: Record<PlayerId, number>, playerId: PlayerId): number {
  const rating = seedRatings[playerId];
  if (rating == null) {
    throw new Error(`missing seed rating for player ${playerId}`);
  }
  return rating;
}

export function calculateMatchDelta(
  seedRatings: Record<PlayerId, number>,
  match: MatchInput,
  rule: TournamentRule
): MatchResult {
  const teamAPlayers = resolveTeamPlayers(match.teamA, match.matchFormat);
  const teamBPlayers = resolveTeamPlayers(match.teamB, match.matchFormat);

  const teamASeed = average(teamAPlayers.map((id) => getSeedRating(seedRatings, id)));
  const teamBSeed = average(teamBPlayers.map((id) => getSeedRating(seedRatings, id)));

  const resultA = resultFromScore(match.scoreA, match.scoreB);
  const expectedA = expectedScore(teamASeed, teamBSeed);
  const expectedB = 1 - expectedA;

  const rawDeltaA = rule.kFactor * (resultA - expectedA);
  const rawDeltaB = rule.kFactor * ((1 - resultA) - expectedB);

  // Preserve legacy rounding + base points behavior.
  const deltaTeamA = Math.round(rawDeltaA) + rule.basePoints;
  const deltaTeamB = Math.round(rawDeltaB) + rule.basePoints;

  return {
    id: match.id,
    deltaTeamA,
    deltaTeamB,
    teamAPlayers,
    teamBPlayers,
  };
}

export function calculateTournamentDeltas(
  seedRatings: Record<PlayerId, number>,
  matches: MatchInput[],
  rule: TournamentRule
): TournamentComputation {
  const totalDeltaByPlayer: Record<PlayerId, number> = {};
  const finalRatingByPlayer: Record<PlayerId, number> = {};
  const perMatch: MatchResult[] = [];

  for (const playerIdRaw of Object.keys(seedRatings)) {
    const playerId = Number(playerIdRaw);
    totalDeltaByPlayer[playerId] = 0;
    finalRatingByPlayer[playerId] = seedRatings[playerId];
  }

  for (const match of matches) {
    const result = calculateMatchDelta(seedRatings, match, rule);
    perMatch.push(result);

    for (const playerId of result.teamAPlayers) {
      totalDeltaByPlayer[playerId] = (totalDeltaByPlayer[playerId] ?? 0) + result.deltaTeamA;
    }

    for (const playerId of result.teamBPlayers) {
      totalDeltaByPlayer[playerId] = (totalDeltaByPlayer[playerId] ?? 0) + result.deltaTeamB;
    }
  }

  for (const playerIdRaw of Object.keys(totalDeltaByPlayer)) {
    const playerId = Number(playerIdRaw);
    const seed = seedRatings[playerId] ?? 2000;
    finalRatingByPlayer[playerId] = seed + totalDeltaByPlayer[playerId];
  }

  return {
    perMatch,
    totalDeltaByPlayer,
    finalRatingByPlayer,
  };
}
