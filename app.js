const state = {
  players: [],
  recentMatches: [],
  openTournament: null,
  tournaments: [],
  selectedRecordTournamentId: null,
  recordTournament: null,
  selectedPlayerId: null,
  playerStats: null,
  overview: null,
  simResult: null,
  tournamentRules: [],
  adminPlayers: [],
  adminSelectedPlayerId: null,
  participantPicker: {
    selectedIds: [],
    query: "",
  },
  loading: {
    count: 0,
    message: "데이터를 동기화하는 중...",
  },
};

const DEFAULT_RULES = [
  { tournamentType: "REGULAR", displayName: "정규 대회", kFactor: 200, basePoints: 4 },
  { tournamentType: "ADHOC", displayName: "상시 대회", kFactor: 100, basePoints: 1 },
  { tournamentType: "FRIENDLY", displayName: "친선전", kFactor: 0, basePoints: 0 },
];

const q = (selector) => document.querySelector(selector);

function getTournamentRules() {
  return state.tournamentRules.length ? state.tournamentRules : DEFAULT_RULES;
}

function tournamentRuleByType(type) {
  const map = new Map(getTournamentRules().map((rule) => [rule.tournamentType, rule]));
  return map.get(type) || DEFAULT_RULES.find((rule) => rule.tournamentType === type) || DEFAULT_RULES[0];
}

function tournamentTypeLabel(type) {
  return tournamentRuleByType(type)?.displayName || String(type || "");
}

function renderTournamentTypeSelectOptions() {
  const rules = getTournamentRules();
  const simSelect = q("#simType");
  const tournamentSelect = q("#tournamentType");
  if (!simSelect || !tournamentSelect) return;

  const currentSim = simSelect.value || "REGULAR";
  const currentTournament = tournamentSelect.value || "REGULAR";
  const optionsHtml = rules.map((rule) => `<option value="${rule.tournamentType}">${rule.displayName}</option>`).join("");

  simSelect.innerHTML = optionsHtml;
  tournamentSelect.innerHTML = optionsHtml;

  const hasSim = rules.some((rule) => rule.tournamentType === currentSim);
  const hasTournament = rules.some((rule) => rule.tournamentType === currentTournament);
  simSelect.value = hasSim ? currentSim : "REGULAR";
  tournamentSelect.value = hasTournament ? currentTournament : "REGULAR";
}

function formatNum(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatSigned(value) {
  const num = Number(value || 0);
  return `${num >= 0 ? "+" : ""}${num}`;
}

function matchFormatLabel(format) {
  return format === "DOUBLES" ? "복식" : "단식";
}

function tournamentStatusLabel(status) {
  if (status === "OPEN") return "진행중";
  if (status === "FINALIZED") return "종료";
  if (status === "CANCELED") return "취소";
  return String(status || "-");
}

function renderMatchResultCard(match, options = {}) {
  const withMeta = options.withMeta !== false;
  const showDelete = Boolean(options.showDelete);
  const deleteId = options.deleteId;
  const metaText = withMeta
    ? [match.tournamentDate, match.tournamentName, tournamentTypeLabel(match.tournamentType)].filter(Boolean).join(" · ")
    : "";

  return `
    <article class="match-result-card">
      <header class="match-result-head">
        <div class="match-head-main">
          ${match.matchOrder != null ? `<span class="match-order">#${match.matchOrder}</span>` : ""}
          <span class="match-format">${matchFormatLabel(match.matchFormat)}</span>
        </div>
        ${showDelete ? `<button type="button" data-delete-id="${deleteId}" class="danger match-delete-btn">삭제</button>` : ""}
      </header>
      ${metaText ? `<div class="match-meta">${metaText}</div>` : ""}
      <div class="match-score-body">
        <div class="match-team-line">
          <span class="match-team-name">${match.teamAName}</span>
          <span class="match-team-score">${match.scoreA}</span>
        </div>
        <div class="match-vs">VS</div>
        <div class="match-team-line">
          <span class="match-team-name">${match.teamBName}</span>
          <span class="match-team-score">${match.scoreB}</span>
        </div>
      </div>
      <footer class="match-delta-row">
        <span class="delta-pill ${Number(match.deltaTeamA) >= 0 ? "up" : "down"}">A ${formatSigned(match.deltaTeamA)}</span>
        <span class="delta-pill ${Number(match.deltaTeamB) >= 0 ? "up" : "down"}">B ${formatSigned(match.deltaTeamB)}</span>
      </footer>
    </article>
  `;
}

function showToast(message, isError = false) {
  const el = q("#toast");
  el.textContent = message;
  el.style.background = isError ? "#8c2f2f" : "#1f333f";
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function setLoading(isOn, message = "데이터를 동기화하는 중...") {
  const overlay = q("#appLoading");
  if (!overlay) return;

  if (isOn) {
    state.loading.count += 1;
    state.loading.message = message;
  } else {
    state.loading.count = Math.max(0, state.loading.count - 1);
  }

  const active = state.loading.count > 0;
  overlay.classList.toggle("show", active);
  overlay.setAttribute("aria-hidden", active ? "false" : "true");

  const messageEl = overlay.querySelector("strong");
  if (messageEl) messageEl.textContent = state.loading.message;
}

async function withLoading(work, message) {
  setLoading(true, message);
  try {
    return await work();
  } finally {
    setLoading(false);
  }
}

async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("API 응답 형식 오류: Pages Functions 라우팅을 확인하세요.");
  }

  const data = await res.json().catch(() => null);
  if (!data || data.ok !== true) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }

  return data;
}

function setTab(tab) {
  document.querySelectorAll(".tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.toggle("active", panel.id === tab));
}

function bindTabEvents() {
  q("#tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    setTab(btn.dataset.tab);
  });
}

function bindGlobalActions() {
  const refreshButton = q("#refreshAllBtn");
  if (!refreshButton) return;

  refreshButton.addEventListener("click", async () => {
    try {
      await checkHealth();
      await refreshAll({ loadingMessage: "전체 데이터를 갱신하는 중..." });
      showToast("전체 동기화 완료");
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

function expectedScore(a, b) {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

function simCalculate({ type, aElo, bElo, aScore, bScore }) {
  const rule = tournamentRuleByType(type);
  const resultA = aScore / (aScore + bScore);
  const eA = expectedScore(aElo, bElo);
  const eB = 1 - eA;
  const deltaA = Math.round(Number(rule.kFactor) * (resultA - eA)) + Number(rule.basePoints);
  const deltaB = Math.round(Number(rule.kFactor) * ((1 - resultA) - eB)) + Number(rule.basePoints);
  return {
    aAfter: aElo + deltaA,
    bAfter: bElo + deltaB,
    deltaA,
    deltaB,
  };
}

function bindSimForm() {
  q("#simForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const type = q("#simType").value;
    const aElo = Number(q("#simAelo").value || 0);
    const bElo = Number(q("#simBelo").value || 0);
    const aScore = Number(q("#simAscore").value || 0);
    const bScore = Number(q("#simBscore").value || 0);
    if (aScore + bScore <= 0) {
      showToast("점수 합계는 1 이상이어야 합니다.", true);
      return;
    }
    state.simResult = simCalculate({ type, aElo, bElo, aScore, bScore });
    renderSimulator();
  });
}

function renderSimulator() {
  const target = q("#simResult");
  if (!state.simResult) {
    target.textContent = "";
    return;
  }
  const r = state.simResult;
  target.innerHTML = `A: ${formatNum(r.aAfter)} (${r.deltaA >= 0 ? "+" : ""}${r.deltaA}) / B: ${formatNum(r.bAfter)} (${r.deltaB >= 0 ? "+" : ""}${r.deltaB})`;
}

async function refreshBootstrap() {
  const data = await api("/api/bootstrap");
  state.players = data.players || [];
  state.recentMatches = data.recentMatches || [];
  state.openTournament = data.openTournament || null;
  state.tournamentRules = data.tournamentRules || [];
  renderTournamentTypeSelectOptions();
}

async function refreshTournaments() {
  const data = await api("/api/tournaments");
  state.tournaments = data.tournaments || [];
}

async function refreshOverview() {
  state.overview = await api("/api/stats/overview");
}

async function refreshAdminPlayers() {
  const data = await api("/api/admin/players");
  state.adminPlayers = data.players || [];

  if (!state.adminPlayers.length) {
    state.adminSelectedPlayerId = null;
    return;
  }

  const exists = state.adminPlayers.some((player) => Number(player.id) === Number(state.adminSelectedPlayerId));
  if (!exists) {
    const firstActive = state.adminPlayers.find((player) => player.isActive);
    state.adminSelectedPlayerId = Number(firstActive?.id || state.adminPlayers[0].id);
  }
}

async function refreshAll(options = {}) {
  const { loadingMessage = "데이터를 동기화하는 중..." } = options;
  return withLoading(async () => {
    await Promise.all([refreshBootstrap(), refreshTournaments(), refreshOverview(), refreshAdminPlayers()]);
    renderAll();
  }, loadingMessage);
}

async function checkHealth() {
  try {
    await api("/api/health");
    q("#healthStatus").textContent = "API 정상";
    q("#healthStatus").style.background = "#18a679";
  } catch {
    q("#healthStatus").textContent = "API 오류";
    q("#healthStatus").style.background = "#d64545";
  }
}
function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function syncParticipantSelectionWithPlayers() {
  const validIds = new Set(state.players.map((player) => Number(player.id)));
  state.participantPicker.selectedIds = state.participantPicker.selectedIds
    .map((id) => Number(id))
    .filter((id) => validIds.has(id));
}

function sortedPlayersByElo() {
  return [...state.players].sort((a, b) => Number(b.currentElo) - Number(a.currentElo) || a.name.localeCompare(b.name));
}

function renderTournamentParticipantPicker() {
  const searchEl = q("#participantSearchInput");
  const selectedEl = q("#participantSelectedList");
  const pickListEl = q("#participantPickList");
  const countEl = q("#participantSelectionCount");
  if (!searchEl || !selectedEl || !pickListEl || !countEl) return;

  syncParticipantSelectionWithPlayers();

  searchEl.value = state.participantPicker.query;
  const query = normalizeSearch(state.participantPicker.query);
  const players = sortedPlayersByElo();
  const selectedSet = new Set(state.participantPicker.selectedIds);
  const filteredPlayers = query
    ? players.filter((player) => normalizeSearch(player.name).includes(query))
    : players;
  const selectedPlayers = players.filter((player) => selectedSet.has(Number(player.id)));

  countEl.textContent = `${selectedSet.size}명 선택`;

  selectedEl.innerHTML = selectedPlayers.length
    ? selectedPlayers.map((player) => `
      <button type="button" class="selected-chip" data-remove-participant-id="${player.id}" title="선택 해제">
        <span>${player.name}</span>
        <small>${formatNum(player.currentElo)}</small>
      </button>
    `).join("")
    : '<p class="muted">아직 선택된 참가자가 없습니다.</p>';

  pickListEl.innerHTML = filteredPlayers.length
    ? filteredPlayers.map((player) => `
      <button type="button" class="pick-item ${selectedSet.has(Number(player.id)) ? "active" : ""}" data-participant-id="${player.id}">
        <span class="pick-name">${player.name}</span>
        <span class="pick-elo">${formatNum(player.currentElo)} ELO</span>
      </button>
    `).join("")
    : '<p class="muted">검색 결과가 없습니다.</p>';
}

function toggleParticipantSelection(playerId) {
  const id = Number(playerId);
  if (!Number.isInteger(id) || id <= 0) return;

  syncParticipantSelectionWithPlayers();
  const selectedSet = new Set(state.participantPicker.selectedIds);
  if (selectedSet.has(id)) selectedSet.delete(id);
  else selectedSet.add(id);
  state.participantPicker.selectedIds = [...selectedSet];

  renderTournamentParticipantPicker();
}

function bindTournamentParticipantPicker() {
  const searchEl = q("#participantSearchInput");
  const selectedEl = q("#participantSelectedList");
  const pickListEl = q("#participantPickList");
  if (!searchEl || !selectedEl || !pickListEl) return;

  searchEl.addEventListener("input", (e) => {
    state.participantPicker.query = String(e.target.value || "");
    renderTournamentParticipantPicker();
  });

  searchEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const query = normalizeSearch(state.participantPicker.query);
    if (!query) return;

    const selectedSet = new Set(state.participantPicker.selectedIds);
    const firstMatch = sortedPlayersByElo().find((player) => normalizeSearch(player.name).includes(query) && !selectedSet.has(Number(player.id)));
    if (firstMatch) {
      toggleParticipantSelection(firstMatch.id);
    }
  });

  pickListEl.addEventListener("click", (e) => {
    const button = e.target.closest("[data-participant-id]");
    if (!button) return;
    toggleParticipantSelection(button.dataset.participantId);
  });

  selectedEl.addEventListener("click", (e) => {
    const button = e.target.closest("[data-remove-participant-id]");
    if (!button) return;
    toggleParticipantSelection(button.dataset.removeParticipantId);
  });
}

function syncMatchFormatToggle() {
  const formatSelect = q("#matchFormat");
  const toggleRoot = q("#matchFormatToggle");
  if (!formatSelect || !toggleRoot) return;

  const value = formatSelect.value || "SINGLES";
  toggleRoot.querySelectorAll("button[data-format]").forEach((button) => {
    const isActive = button.dataset.format === value;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function setMatchFormat(value, options = {}) {
  const { triggerChange = true } = options;
  const formatSelect = q("#matchFormat");
  if (!formatSelect) return;

  const nextValue = value === "DOUBLES" ? "DOUBLES" : "SINGLES";
  const changed = formatSelect.value !== nextValue;
  formatSelect.value = nextValue;

  if (changed && triggerChange) {
    formatSelect.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  syncMatchFormatToggle();
}

function setDoublesToggleAvailability(enabled) {
  const doublesButton = q("#matchFormatToggle button[data-format='DOUBLES']");
  if (!doublesButton) return;
  doublesButton.disabled = !enabled;
  doublesButton.title = enabled ? "" : "복식은 참가자 4명 이상일 때 선택할 수 있습니다.";
}

function toggleDoubleInputs() {
  const doubles = q("#matchFormat").value === "DOUBLES";
  document.querySelectorAll(".team2").forEach((el) => {
    el.style.display = doubles ? "grid" : "none";
  });

  const teamA2 = q("#matchA2");
  const teamB2 = q("#matchB2");
  if (teamA2) teamA2.disabled = !doubles;
  if (teamB2) teamB2.disabled = !doubles;
  syncMatchFormatToggle();
}

function readMatchPayloadFromForm() {
  const matchFormat = q("#matchFormat").value;
  const isDoubles = matchFormat === "DOUBLES";
  return {
    matchFormat,
    teamAPlayer1Id: Number(q("#matchA1").value),
    teamAPlayer2Id: isDoubles ? Number(q("#matchA2").value) : null,
    teamBPlayer1Id: Number(q("#matchB1").value),
    teamBPlayer2Id: isDoubles ? Number(q("#matchB2").value) : null,
    scoreA: Number(q("#matchScoreA").value || 0),
    scoreB: Number(q("#matchScoreB").value || 0),
  };
}

function setSelectValueIfPossible(selectEl, value) {
  if (!selectEl || value == null) return;
  const stringValue = String(value);
  const hasOption = [...selectEl.options].some((option) => option.value === stringValue);
  if (hasOption) selectEl.value = stringValue;
}

function applyMatchSelectDefaults(participants) {
  const ids = participants.map((player) => Number(player.playerId)).filter((id) => Number.isInteger(id));
  if (!ids.length) return;

  const a1 = ids[0] ?? null;
  const b1 = ids[1] ?? ids[0] ?? null;
  const a2 = ids[2] ?? ids[0] ?? null;
  const b2 = ids[3] ?? ids[1] ?? ids[0] ?? null;

  setSelectValueIfPossible(q("#matchA1"), a1);
  setSelectValueIfPossible(q("#matchB1"), b1);
  setSelectValueIfPossible(q("#matchA2"), a2);
  setSelectValueIfPossible(q("#matchB2"), b2);
}

function validateMatchPayload(payload) {
  if (!payload.teamAPlayer1Id || !payload.teamBPlayer1Id) {
    return "팀별 선수1을 선택하세요.";
  }

  if (payload.scoreA + payload.scoreB <= 0) {
    return "점수 합계는 1 이상이어야 합니다.";
  }

  const playerIds = [payload.teamAPlayer1Id, payload.teamBPlayer1Id];
  if (payload.matchFormat === "DOUBLES") {
    if (!payload.teamAPlayer2Id || !payload.teamBPlayer2Id) {
      return "복식은 팀별 선수 2명이 필요합니다.";
    }
    playerIds.push(payload.teamAPlayer2Id, payload.teamBPlayer2Id);
  }

  const unique = new Set(playerIds.map((value) => Number(value)));
  if (unique.size !== playerIds.length) {
    return "한 경기에서 같은 선수를 중복 선택할 수 없습니다.";
  }

  return null;
}

function bindPlayerForm() {
  q("#playerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = q("#playerNameInput").value.trim();
    if (!name) return;
    try {
      await api("/api/players", "POST", { name });
      q("#playerNameInput").value = "";
      showToast("선수 등록 완료");
      await refreshAll({ loadingMessage: "선수 목록을 갱신하는 중..." });
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

function bindTournamentCreateForm() {
  q("#tournamentCreateForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const name = q("#tournamentName").value.trim();
      const tournamentDate = q("#tournamentDate").value;
      const tournamentType = q("#tournamentType").value;
      syncParticipantSelectionWithPlayers();
      const participantIds = [...state.participantPicker.selectedIds];
      if (participantIds.length < 2) {
        showToast("참가자는 2명 이상 선택해야 합니다.", true);
        return;
      }

      await api("/api/tournaments", "POST", { name, tournamentDate, tournamentType, participantIds });
      state.participantPicker.selectedIds = [];
      state.participantPicker.query = "";
      showToast("대회 시작 완료");
      await refreshAll({ loadingMessage: "대회 데이터를 준비하는 중..." });
      setTab("tournament");
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

function bindMatchForm() {
  const formatSelect = q("#matchFormat");
  const formatToggle = q("#matchFormatToggle");

  formatSelect.addEventListener("change", () => {
    if (state.openTournament?.participants?.length) {
      const draftPayload = readMatchPayloadFromForm();
      const isInvalid = Boolean(validateMatchPayload({ ...draftPayload, scoreA: 1, scoreB: 0 }));
      if (isInvalid) {
        applyMatchSelectDefaults(state.openTournament.participants);
      }
    }
    toggleDoubleInputs();
  });

  formatToggle.addEventListener("click", (e) => {
    const button = e.target.closest("button[data-format]");
    if (!button || button.disabled) return;
    setMatchFormat(button.dataset.format);
  });

  q("#matchForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.openTournament) {
      showToast("진행 중 대회가 없습니다.", true);
      return;
    }

    try {
      const payload = readMatchPayloadFromForm();

      const validationError = validateMatchPayload(payload);
      if (validationError) {
        showToast(validationError, true);
        return;
      }

      await api(`/api/tournaments/${state.openTournament.id}/matches`, "POST", payload);
      showToast("경기 추가 완료");
      await refreshAll({ loadingMessage: "대회 데이터를 갱신하는 중..." });
    } catch (err) {
      showToast(err.message, true);
    }
  });

  syncMatchFormatToggle();
}

function bindTournamentActionButtons() {
  q("#finalizeTournamentBtn").addEventListener("click", async () => {
    if (!state.openTournament) return;
    if (!confirm("대회를 종료하시겠습니까?")) return;
    try {
      await api(`/api/tournaments/${state.openTournament.id}/finalize`, "POST");
      showToast("대회 종료 완료");
      await refreshAll({ loadingMessage: "대회 종료 결과를 반영하는 중..." });
      await loadRecordDefault();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  q("#cancelTournamentBtn").addEventListener("click", async () => {
    if (!state.openTournament) return;
    if (!confirm("진행 중 대회를 취소하시겠습니까?")) return;
    try {
      await api(`/api/tournaments/${state.openTournament.id}/cancel`, "POST");
      showToast("대회 취소 완료");
      await refreshAll({ loadingMessage: "대회 상태를 갱신하는 중..." });
    } catch (err) {
      showToast(err.message, true);
    }
  });

  q("#openMatches").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-delete-id]");
    if (!btn || !state.openTournament) return;
    if (!confirm("해당 경기를 삭제할까요?")) return;
    try {
      await api(`/api/tournaments/${state.openTournament.id}/matches/${btn.dataset.deleteId}`, "DELETE");
      showToast("경기 삭제 완료");
      await refreshAll({ loadingMessage: "대회 데이터를 갱신하는 중..." });
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

function bindRecordActions() {
  q("#loadRecordBtn").addEventListener("click", async () => {
    await loadRecordBySelect();
  });
}

async function loadRecordBySelect() {
  const id = Number(q("#recordTournamentSelect").value || 0);
  if (!id) {
    state.recordTournament = null;
    renderRecord();
    return;
  }
  try {
    const data = await withLoading(() => api(`/api/tournaments/${id}/report`), "대회 기록을 불러오는 중...");
    state.recordTournament = data.tournament;
    renderRecord();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function loadRecordDefault() {
  const finalized = state.tournaments.filter((t) => t.status === "FINALIZED");
  if (!finalized.length) {
    state.recordTournament = null;
    renderRecord();
    return;
  }
  q("#recordTournamentSelect").value = String(finalized[0].id);
  await loadRecordBySelect();
}

function bindPlayerActions() {
  q("#loadPlayerBtn").addEventListener("click", async () => {
    const id = Number(q("#playerSelect").value || 0);
    if (!id) return;
    try {
      const data = await withLoading(() => api(`/api/players/${id}/stats`), "선수 기록을 불러오는 중...");
      state.playerStats = data;
      renderPlayerStats();
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

function bindStatsActions() {
  q("#refreshStatsBtn").addEventListener("click", async () => {
    try {
      await withLoading(() => refreshOverview(), "통계를 갱신하는 중...");
      renderStats();
      renderQuickMetrics();
      showToast("통계 갱신 완료");
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

function getSelectedAdminPlayer() {
  return state.adminPlayers.find((player) => Number(player.id) === Number(state.adminSelectedPlayerId)) || null;
}

function bindAdminActions() {
  const playerSelect = q("#adminPlayerSelect");
  if (!playerSelect) return;

  playerSelect.addEventListener("change", (e) => {
    state.adminSelectedPlayerId = Number(e.target.value || 0) || null;
    renderAdmin();
  });

  q("#adminRenameForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const player = getSelectedAdminPlayer();
    if (!player) {
      showToast("선수를 먼저 선택하세요.", true);
      return;
    }

    const name = q("#adminRenameInput").value.trim();
    if (!name) {
      showToast("변경할 이름을 입력하세요.", true);
      return;
    }

    try {
      await api(`/api/admin/players/${player.id}`, "PATCH", { name });
      q("#adminRenameInput").value = "";
      showToast("선수 이름 변경 완료");
      await refreshAll({ loadingMessage: "선수 데이터를 갱신하는 중..." });
    } catch (err) {
      showToast(err.message, true);
    }
  });

  q("#adminEloForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const player = getSelectedAdminPlayer();
    if (!player) {
      showToast("선수를 먼저 선택하세요.", true);
      return;
    }

    const eloRaw = q("#adminEloInput").value;
    if (eloRaw === "") {
      showToast("변경할 ELO를 입력하세요.", true);
      return;
    }

    try {
      await api(`/api/admin/players/${player.id}`, "PATCH", { currentElo: Number(eloRaw) });
      q("#adminEloInput").value = "";
      showToast("선수 점수 조정 완료");
      await refreshAll({ loadingMessage: "점수 변경 내용을 반영하는 중..." });
    } catch (err) {
      showToast(err.message, true);
    }
  });

  q("#adminDeletePlayerBtn").addEventListener("click", async () => {
    const player = getSelectedAdminPlayer();
    if (!player) {
      showToast("선수를 먼저 선택하세요.", true);
      return;
    }
    if (!confirm(`'${player.name}' 선수를 삭제(비활성화)할까요?`)) return;

    try {
      await api(`/api/admin/players/${player.id}`, "DELETE");
      showToast("선수 비활성화 완료");
      await refreshAll({ loadingMessage: "선수 목록을 갱신하는 중..." });
      renderAdmin();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  q("#ruleEditorRows").addEventListener("click", async (e) => {
    const button = e.target.closest("button[data-save-rule]");
    if (!button) return;
    const type = button.dataset.saveRule;
    const kInput = q(`#ruleK-${type}`);
    const baseInput = q(`#ruleBase-${type}`);
    if (!kInput || !baseInput) return;

    try {
      await api(`/api/settings/tournament-rules/${type}`, "PATCH", {
        kFactor: Number(kInput.value),
        basePoints: Number(baseInput.value),
      });
      showToast(`${tournamentTypeLabel(type)} 규칙 저장 완료`);
      await refreshAll({ loadingMessage: "대회 규칙을 반영하는 중..." });
    } catch (err) {
      showToast(err.message, true);
    }
  });

  q("#adminPlayersTable").addEventListener("click", (e) => {
    const button = e.target.closest("button[data-admin-select]");
    if (!button) return;
    state.adminSelectedPlayerId = Number(button.dataset.adminSelect || 0) || null;
    renderAdmin();
  });
}

function renderRanking() {
  const root = q("#rankingTable");
  if (!state.players.length) {
    root.innerHTML = '<p class="muted">선수가 없습니다.</p>';
    return;
  }

  const rows = state.players.map((p) => `
    <tr>
      <td class="num-col">${p.rank}</td>
      <td>${p.name}</td>
      <td class="num-col">${formatNum(p.currentElo)}</td>
    </tr>
  `).join("");

  root.innerHTML = `
    <table class="table">
      <thead><tr><th>순위</th><th>이름</th><th>ELO</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderRecentMatches() {
  const root = q("#recentMatches");
  if (!state.recentMatches.length) {
    root.innerHTML = '<p class="muted">최근 경기가 없습니다.</p>';
    return;
  }

  root.innerHTML = `
    <div class="match-card-list">
      ${state.recentMatches.map((m) => renderMatchResultCard(m, { withMeta: true })).join("")}
    </div>
  `;
}

function renderQuickMetrics() {
  const summary = state.overview?.summary;
  const players = summary?.players ?? state.players.length;
  const openTournaments = summary?.openTournaments ?? (state.openTournament ? 1 : 0);
  const finalizedTournaments = summary?.finalizedTournaments ?? state.tournaments.filter((t) => t.status === "FINALIZED").length;
  const finalizedMatches = summary?.finalizedMatches ?? 0;

  const playersEl = q("#metricPlayers");
  const openEl = q("#metricOpenTournaments");
  const finalizedEl = q("#metricFinalizedTournaments");
  const matchEl = q("#metricFinalizedMatches");
  if (playersEl) playersEl.textContent = formatNum(players);
  if (openEl) openEl.textContent = formatNum(openTournaments);
  if (finalizedEl) finalizedEl.textContent = formatNum(finalizedTournaments);
  if (matchEl) matchEl.textContent = formatNum(finalizedMatches);
}
function fillSelectOptions(selectEl, items, selectedValue = null) {
  selectEl.innerHTML = items.map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
  if (selectedValue != null) selectEl.value = String(selectedValue);
}

function renderTournament() {
  const open = state.openTournament;
  const createCard = q("#createTournamentCard");
  const openView = q("#openTournamentView");
  renderTournamentParticipantPicker();

  if (!open) {
    createCard.style.display = "block";
    openView.innerHTML = '<p class="muted">진행 중 대회 없음</p>';
    q("#openParticipants").innerHTML = '<p class="muted">대회 시작 후 표시됩니다.</p>';
    q("#openMatches").innerHTML = '<p class="muted">대회 시작 후 표시됩니다.</p>';
    q("#matchForm").querySelectorAll("input,select,button").forEach((el) => { el.disabled = true; });
    setDoublesToggleAvailability(false);
    setMatchFormat("SINGLES", { triggerChange: false });
    q("#finalizeTournamentBtn").disabled = true;
    q("#cancelTournamentBtn").disabled = true;
    return;
  }

  createCard.style.display = "none";
  openView.innerHTML = `
    <div><strong>${open.name}</strong></div>
    <div class="muted">${open.tournamentDate} · ${tournamentTypeLabel(open.tournamentType)} · K=${open.kFactor} · base=${open.basePoints}</div>
    <div class="muted">참가자 ${open.participants.length}명 · 경기 ${open.matchCount}개</div>
  `;

  const participantRows = [...open.participants]
    .sort((a, b) => b.projectedElo - a.projectedElo || a.name.localeCompare(b.name))
    .map((p, idx) => `
      <tr>
        <td class="num-col">${idx + 1}</td>
        <td>${p.name}</td>
        <td>
          <div class="player-score-cell">
            <strong>${formatNum(p.projectedElo)}</strong>
            <span class="cell-muted">시드 ${formatNum(p.seedElo)} · 점수 ${formatSigned(p.pendingDelta)}</span>
          </div>
        </td>
      </tr>
    `).join("");

  q("#openParticipants").innerHTML = `
    <table class="table">
      <thead><tr><th>#</th><th>이름</th><th>ELO/점수</th></tr></thead>
      <tbody>${participantRows}</tbody>
    </table>
  `;

  q("#openMatches").innerHTML = open.matches.length
    ? `<div class="match-card-list">${open.matches.map((m) => renderMatchResultCard(
      { ...m, tournamentDate: open.tournamentDate, tournamentName: open.name, tournamentType: open.tournamentType },
      { withMeta: false, showDelete: true, deleteId: m.id }
    )).join("")}</div>`
    : '<p class="muted">아직 기록된 경기가 없습니다.</p>';

  const prevA1 = q("#matchA1").value;
  const prevA2 = q("#matchA2").value;
  const prevB1 = q("#matchB1").value;
  const prevB2 = q("#matchB2").value;
  const participantOptions = open.participants.map((p) => ({ id: p.playerId, name: p.name }));
  fillSelectOptions(q("#matchA1"), participantOptions);
  fillSelectOptions(q("#matchA2"), participantOptions);
  fillSelectOptions(q("#matchB1"), participantOptions);
  fillSelectOptions(q("#matchB2"), participantOptions);

  setSelectValueIfPossible(q("#matchA1"), prevA1);
  setSelectValueIfPossible(q("#matchA2"), prevA2);
  setSelectValueIfPossible(q("#matchB1"), prevB1);
  setSelectValueIfPossible(q("#matchB2"), prevB2);

  const formatSelect = q("#matchFormat");
  const doublesOption = formatSelect.querySelector("option[value='DOUBLES']");
  const doublesAvailable = open.participants.length >= 4;
  if (doublesOption) doublesOption.disabled = !doublesAvailable;
  if (!doublesAvailable && formatSelect.value === "DOUBLES") setMatchFormat("SINGLES", { triggerChange: false });

  const currentPayload = {
    matchFormat: formatSelect.value,
    teamAPlayer1Id: Number(q("#matchA1").value),
    teamAPlayer2Id: formatSelect.value === "DOUBLES" ? Number(q("#matchA2").value) : null,
    teamBPlayer1Id: Number(q("#matchB1").value),
    teamBPlayer2Id: formatSelect.value === "DOUBLES" ? Number(q("#matchB2").value) : null,
    scoreA: 1,
    scoreB: 0,
  };
  if (validateMatchPayload(currentPayload)) {
    applyMatchSelectDefaults(open.participants);
  }

  q("#matchForm").querySelectorAll("input,select,button").forEach((el) => { el.disabled = false; });
  setDoublesToggleAvailability(doublesAvailable);
  q("#finalizeTournamentBtn").disabled = false;
  q("#cancelTournamentBtn").disabled = false;
  toggleDoubleInputs();
}

function renderRecord() {
  const root = q("#recordContent");
  const finalized = state.tournaments.filter((t) => t.status === "FINALIZED");
  q("#recordTournamentSelect").innerHTML = finalized.map((t) => `<option value="${t.id}">${t.tournamentDate} · ${t.name}</option>`).join("");

  if (!state.recordTournament) {
    root.innerHTML = '<article class="card"><p class="muted">조회할 대회를 선택하세요.</p></article>';
    return;
  }

  const t = state.recordTournament;
  const ratingRows = (t.ratingEvents || []).map((r) => `
    <tr><td>${r.name}</td><td class="num-col">${formatNum(r.eloBefore)}</td><td class="num-col">${formatSigned(r.delta)}</td><td class="num-col">${formatNum(r.eloAfter)}</td></tr>
  `).join("");

  const matchCards = (t.matches || []).map((m) =>
    renderMatchResultCard(
      { ...m, tournamentDate: t.tournamentDate, tournamentName: t.name, tournamentType: t.tournamentType },
      { withMeta: false }
    )
  ).join("");

  root.innerHTML = `
    <article class="card">
      <h2>${t.name}</h2>
      <p class="muted">${t.tournamentDate} · ${tournamentTypeLabel(t.tournamentType)} · 경기 ${t.matchCount}개</p>
    </article>
    <div class="grid two">
      <article class="card">
        <h3>ELO 변동</h3>
        <table class="table"><thead><tr><th>선수</th><th>Before</th><th>Delta</th><th>After</th></tr></thead><tbody>${ratingRows}</tbody></table>
      </article>
      <article class="card">
        <h3>경기 결과</h3>
        ${matchCards ? `<div class="match-card-list">${matchCards}</div>` : '<p class="muted">기록된 경기가 없습니다.</p>'}
      </article>
    </div>
  `;
}

function renderPlayerStats() {
  const root = q("#playerContent");
  q("#playerSelect").innerHTML = state.players.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");

  if (!state.playerStats) {
    root.innerHTML = '<article class="card"><p class="muted">선수를 선택해 조회하세요.</p></article>';
    return;
  }

  const s = state.playerStats;
  const matches = s.matches.map((m) => `
    <tr>
      <td>${m.tournamentDate}</td><td>${m.tournamentName}</td><td>${m.matchFormat}</td>
      <td>${m.myTeamName}</td><td>${m.myScore}:${m.opponentScore}</td><td>${m.opponentTeamName}</td>
      <td><span class="badge ${m.result.toLowerCase()}">${m.result}</span></td>
    </tr>
  `).join("");

  const events = s.events.map((e) => `
    <tr><td>${e.eventDate}</td><td>${e.eventType}</td><td class="num-col">${formatNum(e.eloBefore)}</td><td class="num-col">${formatSigned(e.delta)}</td><td class="num-col">${formatNum(e.eloAfter)}</td></tr>
  `).join("");

  const opponents = s.opponents.map((o) => `<tr><td>${o.opponent}</td><td>${o.matches}</td><td>${o.wins}</td><td>${o.losses}</td><td>${o.draws}</td></tr>`).join("");

  root.innerHTML = `
    <article class="card">
      <h2>${s.player.name}</h2>
      <p class="muted">현재 ELO ${formatNum(s.player.currentElo)} · ${s.player.rank}위</p>
      <p>전체 ${s.summary.total}전 ${s.summary.wins}승 ${s.summary.losses}패 ${s.summary.draws}무 (${s.summary.winRate}%)</p>
      <p class="muted">단식 ${s.summary.singlesWinRate}% · 복식 ${s.summary.doublesWinRate}%</p>
    </article>
    <div class="grid two">
      <article class="card">
        <h3>경기 기록</h3>
        <table class="table"><thead><tr><th>날짜</th><th>대회</th><th>형식</th><th>내 팀</th><th>스코어</th><th>상대</th><th>결과</th></tr></thead><tbody>${matches}</tbody></table>
      </article>
      <article class="card">
        <h3>ELO 이력</h3>
        <table class="table"><thead><tr><th>날짜</th><th>타입</th><th>Before</th><th>Delta</th><th>After</th></tr></thead><tbody>${events}</tbody></table>
      </article>
    </div>
    <article class="card">
      <h3>상대 전적(단식)</h3>
      <table class="table"><thead><tr><th>상대</th><th>경기</th><th>승</th><th>패</th><th>무</th></tr></thead><tbody>${opponents}</tbody></table>
    </article>
  `;
}

function renderStats() {
  const root = q("#statsContent");
  const data = state.overview;
  if (!data) {
    root.innerHTML = '<p class="muted">통계를 불러오는 중입니다.</p>';
    return;
  }

  const topRows = data.topPlayers.map((p) => `<tr><td class="num-col">${p.rank}</td><td>${p.name}</td><td class="num-col">${formatNum(p.currentElo)}</td></tr>`).join("");
  const tourRows = data.recentTournaments
    .map((t) => `<tr><td>${t.tournamentDate}</td><td>${t.name}</td><td>${tournamentStatusLabel(t.status)}</td><td>${t.matchCount}</td></tr>`)
    .join("");

  const histEntries = Object.entries(data.eloHistogram || {});
  const histMax = Math.max(...histEntries.map(([, v]) => Number(v || 0)), 1);
  const hist = histEntries.map(([bucket, count]) => `
    <div class="hist-row">
      <div>${bucket}</div>
      <div class="hist-bar"><div class="hist-fill" style="width:${(Number(count || 0) / histMax) * 100}%"></div></div>
      <div>${count}</div>
    </div>
  `).join("");

  root.innerHTML = `
    <div class="grid two">
      <article class="card">
        <h3>요약</h3>
        <p>선수 ${data.summary.players}명 / 종료 대회 ${data.summary.finalizedTournaments}개 / 진행중 대회 ${data.summary.openTournaments}개</p>
        <p>종료 경기 ${data.summary.finalizedMatches}개 / 평균 ELO ${formatNum(data.summary.avgElo)}</p>
      </article>
      <article class="card">
        <h3>ELO 분포</h3>
        <div class="hist">${hist}</div>
      </article>
    </div>
    <div class="grid two">
      <article class="card">
        <h3>상위 랭킹</h3>
        <table class="table"><thead><tr><th>#</th><th>선수</th><th>ELO</th></tr></thead><tbody>${topRows}</tbody></table>
      </article>
      <article class="card">
        <h3>최근 대회</h3>
        <table class="table"><thead><tr><th>날짜</th><th>대회</th><th>상태</th><th>경기수</th></tr></thead><tbody>${tourRows}</tbody></table>
      </article>
    </div>
  `;
}

function renderAdmin() {
  const ruleRoot = q("#ruleEditorRows");
  const playerSelect = q("#adminPlayerSelect");
  const playerMeta = q("#adminPlayerMeta");
  const playersTableRoot = q("#adminPlayersTable");
  if (!ruleRoot || !playerSelect || !playerMeta || !playersTableRoot) return;

  const rules = getTournamentRules();
  ruleRoot.innerHTML = rules.map((rule) => `
    <div class="rule-row">
      <div class="rule-name">${rule.displayName}</div>
      <input id="ruleK-${rule.tournamentType}" type="number" min="0" value="${Number(rule.kFactor)}" />
      <input id="ruleBase-${rule.tournamentType}" type="number" min="0" value="${Number(rule.basePoints)}" />
      <button type="button" data-save-rule="${rule.tournamentType}">저장</button>
    </div>
  `).join("");

  playerSelect.innerHTML = state.adminPlayers.map((player) => {
    const status = player.isActive ? "" : " [비활성]";
    return `<option value="${player.id}">${player.name}${status} (${formatNum(player.currentElo)})</option>`;
  }).join("");

  if (state.adminSelectedPlayerId != null) {
    playerSelect.value = String(state.adminSelectedPlayerId);
  }

  const selectedPlayer = getSelectedAdminPlayer();
  const renameInput = q("#adminRenameInput");
  const eloInput = q("#adminEloInput");
  const deleteButton = q("#adminDeletePlayerBtn");
  const renameButton = q("#adminRenameForm button");
  const eloButton = q("#adminEloForm button");

  if (!selectedPlayer) {
    playerMeta.textContent = "선수를 선택하세요.";
    if (renameInput) renameInput.disabled = true;
    if (eloInput) eloInput.disabled = true;
    if (renameButton) renameButton.disabled = true;
    if (eloButton) eloButton.disabled = true;
    if (deleteButton) deleteButton.disabled = true;
  } else {
    const statusClass = selectedPlayer.isActive ? "active" : "inactive";
    const openTournamentHint = selectedPlayer.inOpenTournament ? " · 진행 중 대회 참가 중" : "";
    playerMeta.innerHTML = `
      <span class="admin-meta ${statusClass}">${selectedPlayer.isActive ? "활성" : "비활성"}</span>
      현재 ELO ${formatNum(selectedPlayer.currentElo)}${openTournamentHint}
    `;
    if (renameInput) renameInput.disabled = false;
    if (eloInput) eloInput.disabled = false;
    if (renameButton) renameButton.disabled = false;
    if (eloButton) eloButton.disabled = false;
    if (deleteButton) deleteButton.disabled = !selectedPlayer.isActive;
  }

  if (!state.adminPlayers.length) {
    playersTableRoot.innerHTML = '<p class="muted">등록된 선수가 없습니다.</p>';
    return;
  }

  const rows = state.adminPlayers.map((player) => `
    <tr>
      <td class="num-col">${player.id}</td>
      <td>${player.name}</td>
      <td class="num-col">${formatNum(player.currentElo)}</td>
      <td>${player.isActive ? "활성" : "비활성"}</td>
      <td>${player.inOpenTournament ? "참가중" : "-"}</td>
      <td class="cell-muted num-col">${player.matchCount}</td>
      <td><button type="button" data-admin-select="${player.id}">선택</button></td>
    </tr>
  `).join("");

  playersTableRoot.innerHTML = `
    <table class="table">
      <thead><tr><th>ID</th><th>이름</th><th>ELO</th><th>상태</th><th>OPEN 대회</th><th>기록 경기수</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderDashboard() {
  renderRanking();
  renderRecentMatches();
  renderSimulator();
}

function renderAll() {
  renderTournamentTypeSelectOptions();
  renderQuickMetrics();
  renderDashboard();
  renderTournament();
  renderRecord();
  renderPlayerStats();
  renderStats();
  renderAdmin();
}

async function init() {
  bindTabEvents();
  bindGlobalActions();
  bindPlayerForm();
  bindSimForm();
  bindTournamentParticipantPicker();
  bindTournamentCreateForm();
  bindMatchForm();
  bindTournamentActionButtons();
  bindRecordActions();
  bindPlayerActions();
  bindStatsActions();
  bindAdminActions();

  q("#tournamentDate").value = new Date().toISOString().slice(0, 10);
  toggleDoubleInputs();

  await checkHealth();
  await refreshAll();
  await loadRecordDefault();
}

init().catch((err) => {
  showToast(err.message || "초기화 실패", true);
});
