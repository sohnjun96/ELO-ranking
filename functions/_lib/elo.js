function ensurePositiveScore(scoreA, scoreB) {
  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB) || scoreA < 0 || scoreB < 0 || scoreA + scoreB <= 0) {
    throw new Error("scoreA and scoreB must be non-negative and not both zero");
  }
}

function resultFromScore(scoreA, scoreB) {
  ensurePositiveScore(scoreA, scoreB);
  return scoreA / (scoreA + scoreB);
}

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

function average(values) {
  if (!values.length) {
    throw new Error("cannot average empty array");
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resolveTeamPlayers(team, format) {
  const player1 = Number(team.player1);
  const player2 = team.player2 == null ? null : Number(team.player2);

  if (!Number.isInteger(player1) || player1 <= 0) {
    throw new Error("Invalid player1");
  }

  if (format === "SINGLES") {
    if (player2 != null) {
      throw new Error("singles match cannot include player2");
    }
    return [player1];
  }

  if (!Number.isInteger(player2) || player2 <= 0) {
    throw new Error("doubles match requires player2");
  }

  if (player1 === player2) {
    throw new Error("doubles team cannot contain duplicate players");
  }

  return [player1, player2];
}

function getSeedRating(seedRatings, playerId) {
  const rating = seedRatings[playerId];
  if (rating == null) {
    throw new Error(`missing seed rating for player ${playerId}`);
  }
  return Number(rating);
}

export function calculateMatchDelta(seedRatings, match, rule) {
  const teamAPlayers = resolveTeamPlayers(match.teamA, match.matchFormat);
  const teamBPlayers = resolveTeamPlayers(match.teamB, match.matchFormat);

  const duplicateGuard = new Set([...teamAPlayers, ...teamBPlayers]);
  if (duplicateGuard.size !== teamAPlayers.length + teamBPlayers.length) {
    throw new Error("One player cannot appear in both teams");
  }

  const teamASeed = average(teamAPlayers.map((id) => getSeedRating(seedRatings, id)));
  const teamBSeed = average(teamBPlayers.map((id) => getSeedRating(seedRatings, id)));

  const resultA = resultFromScore(Number(match.scoreA), Number(match.scoreB));
  const expectedA = expectedScore(teamASeed, teamBSeed);
  const expectedB = 1 - expectedA;

  const rawDeltaA = Number(rule.kFactor) * (resultA - expectedA);
  const rawDeltaB = Number(rule.kFactor) * ((1 - resultA) - expectedB);

  const deltaTeamA = Math.round(rawDeltaA) + Number(rule.basePoints);
  const deltaTeamB = Math.round(rawDeltaB) + Number(rule.basePoints);

  return {
    deltaTeamA,
    deltaTeamB,
    teamAPlayers,
    teamBPlayers,
  };
}
