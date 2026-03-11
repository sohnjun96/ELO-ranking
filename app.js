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
};

const RULES = {
  REGULAR: { kFactor: 200, basePoints: 4 },
  ADHOC: { kFactor: 100, basePoints: 1 },
  FRIENDLY: { kFactor: 0, basePoints: 0 },
};

const q = (selector) => document.querySelector(selector);

function formatNum(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function showToast(message, isError = false) {
  const el = q("#toast");
  el.textContent = message;
  el.style.background = isError ? "#8c2f2f" : "#1f333f";
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
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

function expectedScore(a, b) {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

function simCalculate({ type, aElo, bElo, aScore, bScore }) {
  const rule = RULES[type];
  const resultA = aScore / (aScore + bScore);
  const eA = expectedScore(aElo, bElo);
  const eB = 1 - eA;
  const deltaA = Math.round(rule.kFactor * (resultA - eA)) + rule.basePoints;
  const deltaB = Math.round(rule.kFactor * ((1 - resultA) - eB)) + rule.basePoints;
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
}

async function refreshTournaments() {
  const data = await api("/api/tournaments");
  state.tournaments = data.tournaments || [];
}

async function refreshOverview() {
  state.overview = await api("/api/stats/overview");
}

async function refreshAll() {
  await Promise.all([refreshBootstrap(), refreshTournaments(), refreshOverview()]);
  renderAll();
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
function selectedValues(selectEl) {
  return [...selectEl.selectedOptions].map((o) => Number(o.value));
}

function toggleDoubleInputs() {
  const doubles = q("#matchFormat").value === "DOUBLES";
  document.querySelectorAll(".team2").forEach((el) => {
    el.style.display = doubles ? "grid" : "none";
  });
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
      await refreshAll();
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
      const participantIds = selectedValues(q("#tournamentParticipants"));

      await api("/api/tournaments", "POST", { name, tournamentDate, tournamentType, participantIds });
      showToast("대회 시작 완료");
      await refreshAll();
      setTab("tournament");
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

function bindMatchForm() {
  q("#matchFormat").addEventListener("change", toggleDoubleInputs);

  q("#matchForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.openTournament) {
      showToast("진행 중 대회가 없습니다.", true);
      return;
    }

    try {
      const payload = {
        matchFormat: q("#matchFormat").value,
        teamAPlayer1Id: Number(q("#matchA1").value),
        teamAPlayer2Id: q("#matchA2").value ? Number(q("#matchA2").value) : null,
        teamBPlayer1Id: Number(q("#matchB1").value),
        teamBPlayer2Id: q("#matchB2").value ? Number(q("#matchB2").value) : null,
        scoreA: Number(q("#matchScoreA").value || 0),
        scoreB: Number(q("#matchScoreB").value || 0),
      };
      await api(`/api/tournaments/${state.openTournament.id}/matches`, "POST", payload);
      showToast("경기 추가 완료");
      await refreshBootstrap();
      renderTournament();
      renderDashboard();
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

function bindTournamentActionButtons() {
  q("#finalizeTournamentBtn").addEventListener("click", async () => {
    if (!state.openTournament) return;
    if (!confirm("대회를 종료하시겠습니까?")) return;
    try {
      await api(`/api/tournaments/${state.openTournament.id}/finalize`, "POST");
      showToast("대회 종료 완료");
      await refreshAll();
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
      await refreshAll();
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
      await refreshBootstrap();
      renderTournament();
      renderDashboard();
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
    const data = await api(`/api/tournaments/${id}/report`);
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
      const data = await api(`/api/players/${id}/stats`);
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
      await refreshOverview();
      renderStats();
      showToast("통계 갱신 완료");
    } catch (err) {
      showToast(err.message, true);
    }
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
      <td>${p.rank}</td>
      <td>${p.name}</td>
      <td>${formatNum(p.currentElo)}</td>
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

  root.innerHTML = state.recentMatches.map((m) => `
    <div class="card" style="padding:10px; margin-bottom:8px;">
      <div class="muted">${m.tournamentDate} · ${m.tournamentName}</div>
      <div><strong>${m.teamAName}</strong> ${m.scoreA} : ${m.scoreB} <strong>${m.teamBName}</strong></div>
      <div class="muted">Δ ${m.deltaTeamA >= 0 ? "+" : ""}${m.deltaTeamA} / ${m.deltaTeamB >= 0 ? "+" : ""}${m.deltaTeamB}</div>
    </div>
  `).join("");
}
function fillSelectOptions(selectEl, items, selectedValue = null) {
  selectEl.innerHTML = items.map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
  if (selectedValue != null) selectEl.value = String(selectedValue);
}

function renderTournament() {
  const open = state.openTournament;
  const createCard = q("#createTournamentCard");
  const openView = q("#openTournamentView");

  const playersForSelect = state.players.map((p) => ({ id: p.id, name: `${p.name} (${formatNum(p.currentElo)})` }));
  q("#tournamentParticipants").innerHTML = playersForSelect.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");

  if (!open) {
    createCard.style.display = "block";
    openView.innerHTML = '<p class="muted">진행 중 대회 없음</p>';
    q("#openParticipants").innerHTML = '<p class="muted">대회 시작 후 표시됩니다.</p>';
    q("#openMatches").innerHTML = '<p class="muted">대회 시작 후 표시됩니다.</p>';
    q("#matchForm").querySelectorAll("input,select,button").forEach((el) => { el.disabled = true; });
    q("#finalizeTournamentBtn").disabled = true;
    q("#cancelTournamentBtn").disabled = true;
    return;
  }

  createCard.style.display = "none";
  openView.innerHTML = `
    <div><strong>${open.name}</strong></div>
    <div class="muted">${open.tournamentDate} · ${open.tournamentType} · K=${open.kFactor} · base=${open.basePoints}</div>
    <div class="muted">참가자 ${open.participants.length}명 · 경기 ${open.matchCount}개</div>
  `;

  const participantRows = [...open.participants]
    .sort((a, b) => b.projectedElo - a.projectedElo || a.name.localeCompare(b.name))
    .map((p, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${p.name}</td>
        <td>${formatNum(p.seedElo)}</td>
        <td>${p.pendingDelta >= 0 ? "+" : ""}${p.pendingDelta}</td>
        <td>${formatNum(p.projectedElo)}</td>
      </tr>
    `).join("");

  q("#openParticipants").innerHTML = `
    <table class="table">
      <thead><tr><th>#</th><th>이름</th><th>시드</th><th>델타</th><th>예상 ELO</th></tr></thead>
      <tbody>${participantRows}</tbody>
    </table>
  `;

  const matchRows = open.matches.map((m) => `
    <tr>
      <td>${m.matchOrder}</td>
      <td>${m.matchFormat}</td>
      <td>${m.teamAName}</td>
      <td>${m.scoreA}:${m.scoreB}</td>
      <td>${m.teamBName}</td>
      <td>${m.deltaTeamA >= 0 ? "+" : ""}${m.deltaTeamA}/${m.deltaTeamB >= 0 ? "+" : ""}${m.deltaTeamB}</td>
      <td><button data-delete-id="${m.id}" class="danger">삭제</button></td>
    </tr>
  `).join("");

  q("#openMatches").innerHTML = open.matches.length
    ? `<table class="table"><thead><tr><th>#</th><th>형식</th><th>팀A</th><th>점수</th><th>팀B</th><th>델타</th><th></th></tr></thead><tbody>${matchRows}</tbody></table>`
    : '<p class="muted">아직 기록된 경기가 없습니다.</p>';

  const participantOptions = open.participants.map((p) => ({ id: p.playerId, name: p.name }));
  fillSelectOptions(q("#matchA1"), participantOptions);
  fillSelectOptions(q("#matchA2"), participantOptions);
  fillSelectOptions(q("#matchB1"), participantOptions);
  fillSelectOptions(q("#matchB2"), participantOptions);
  q("#matchForm").querySelectorAll("input,select,button").forEach((el) => { el.disabled = false; });
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
    <tr><td>${r.name}</td><td>${formatNum(r.eloBefore)}</td><td>${r.delta >= 0 ? "+" : ""}${r.delta}</td><td>${formatNum(r.eloAfter)}</td></tr>
  `).join("");

  const matchRows = (t.matches || []).map((m) => `
    <tr><td>${m.matchOrder}</td><td>${m.matchFormat}</td><td>${m.teamAName}</td><td>${m.scoreA}:${m.scoreB}</td><td>${m.teamBName}</td></tr>
  `).join("");

  root.innerHTML = `
    <article class="card">
      <h2>${t.name}</h2>
      <p class="muted">${t.tournamentDate} · ${t.tournamentType} · 경기 ${t.matchCount}개</p>
    </article>
    <div class="grid two">
      <article class="card">
        <h3>ELO 변동</h3>
        <table class="table"><thead><tr><th>선수</th><th>Before</th><th>Delta</th><th>After</th></tr></thead><tbody>${ratingRows}</tbody></table>
      </article>
      <article class="card">
        <h3>경기 결과</h3>
        <table class="table"><thead><tr><th>#</th><th>형식</th><th>팀A</th><th>점수</th><th>팀B</th></tr></thead><tbody>${matchRows}</tbody></table>
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
    <tr><td>${e.eventDate}</td><td>${e.eventType}</td><td>${formatNum(e.eloBefore)}</td><td>${e.delta >= 0 ? "+" : ""}${e.delta}</td><td>${formatNum(e.eloAfter)}</td></tr>
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

  const topRows = data.topPlayers.map((p) => `<tr><td>${p.rank}</td><td>${p.name}</td><td>${formatNum(p.currentElo)}</td></tr>`).join("");
  const tourRows = data.recentTournaments.map((t) => `<tr><td>${t.tournamentDate}</td><td>${t.name}</td><td>${t.status}</td><td>${t.matchCount}</td></tr>`).join("");

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

function renderDashboard() {
  renderRanking();
  renderRecentMatches();
  renderSimulator();
}

function renderAll() {
  renderDashboard();
  renderTournament();
  renderRecord();
  renderPlayerStats();
  renderStats();
}

async function init() {
  bindTabEvents();
  bindPlayerForm();
  bindSimForm();
  bindTournamentCreateForm();
  bindMatchForm();
  bindTournamentActionButtons();
  bindRecordActions();
  bindPlayerActions();
  bindStatsActions();

  q("#tournamentDate").value = new Date().toISOString().slice(0, 10);
  toggleDoubleInputs();

  await checkHealth();
  await refreshAll();
  await loadRecordDefault();
}

init().catch((err) => {
  showToast(err.message || "초기화 실패", true);
});
