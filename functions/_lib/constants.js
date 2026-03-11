export const TOURNAMENT_RULES = {
  REGULAR: { kFactor: 200, basePoints: 4 },
  ADHOC: { kFactor: 100, basePoints: 1 },
  FRIENDLY: { kFactor: 0, basePoints: 0 },
};

export const TOURNAMENT_TYPES = Object.keys(TOURNAMENT_RULES);

export function normalizeTournamentType(input) {
  if (!input) return null;
  const value = String(input).trim().toUpperCase();
  return TOURNAMENT_RULES[value] ? value : null;
}

export function getTournamentRule(type) {
  const normalized = normalizeTournamentType(type);
  if (!normalized) {
    throw new Error(`Unsupported tournament type: ${type}`);
  }
  return TOURNAMENT_RULES[normalized];
}
