export const TOURNAMENT_RULE_DEFAULTS = {
  REGULAR: { displayName: "정규 대회", kFactor: 200, basePoints: 4 },
  ADHOC: { displayName: "상시 대회", kFactor: 100, basePoints: 1 },
  FRIENDLY: { displayName: "친선전", kFactor: 0, basePoints: 0 },
};

export const TOURNAMENT_TYPES = Object.keys(TOURNAMENT_RULE_DEFAULTS);

export function normalizeTournamentType(input) {
  if (!input) return null;
  const value = String(input).trim().toUpperCase();
  return TOURNAMENT_RULE_DEFAULTS[value] ? value : null;
}

export function getTournamentRuleDefault(type) {
  const normalized = normalizeTournamentType(type);
  if (!normalized) {
    throw new Error(`Unsupported tournament type: ${type}`);
  }
  return TOURNAMENT_RULE_DEFAULTS[normalized];
}
