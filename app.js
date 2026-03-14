import { createApp } from "https://unpkg.com/vue@3.5.13/dist/vue.esm-browser.prod.js";

const TABS = [
  { id: "dashboard", label: "대시보드", desc: "랭킹 · 최근 경기" },
  { id: "tournament", label: "대회 진행", desc: "참가자 · 경기 기록" },
  { id: "records", label: "대회 기록", desc: "종료 대회 리포트" },
  { id: "player", label: "선수별 기록", desc: "전적 · ELO 이력" },
  { id: "stats", label: "통계", desc: "전체 분포 · 요약" },
  { id: "admin", label: "관리", desc: "선수 · 규칙 조정" },
];

const DEFAULT_RULES = [
  { tournamentType: "REGULAR", displayName: "정규 대회", kFactor: 200, basePoints: 4 },
  { tournamentType: "ADHOC", displayName: "상시 대회", kFactor: 100, basePoints: 1 },
  { tournamentType: "FRIENDLY", displayName: "친선전", kFactor: 0, basePoints: 0 },
];

function toInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function formatNum(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatSigned(value) {
  const n = Number(value || 0);
  return `${n >= 0 ? "+" : ""}${n}`;
}

function formatDateTime(value, includeYear = false) {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", {
    year: includeYear ? "numeric" : undefined,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function normalizeSearch(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "").trim();
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

function expectedScore(a, b) {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

async function requestApi(path, method = "GET", body) {
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

function normalizePlayer(row) {
  return {
    id: toInt(row?.id),
    name: String(row?.name || ""),
    currentElo: toInt(row?.currentElo),
    rank: toInt(row?.rank),
  };
}

function normalizeAdminPlayer(row) {
  return {
    id: toInt(row?.id),
    name: String(row?.name || ""),
    currentElo: toInt(row?.currentElo),
    isActive: Boolean(row?.isActive),
    inOpenTournament: Boolean(row?.inOpenTournament),
    matchCount: toInt(row?.matchCount),
    createdAt: row?.createdAt || null,
    updatedAt: row?.updatedAt || null,
  };
}

function normalizeMatch(row) {
  return {
    id: toInt(row?.id),
    matchId: toInt(row?.matchId ?? row?.id),
    tournamentId: toInt(row?.tournamentId),
    tournamentName: row?.tournamentName || "",
    tournamentDate: row?.tournamentDate || "",
    tournamentType: row?.tournamentType || "",
    matchOrder: row?.matchOrder == null ? null : toInt(row?.matchOrder),
    matchFormat: row?.matchFormat || "SINGLES",
    teamAName: row?.teamAName || row?.myTeamName || "팀 A",
    teamBName: row?.teamBName || row?.opponentTeamName || "팀 B",
    scoreA: toInt(row?.scoreA ?? row?.myScore),
    scoreB: toInt(row?.scoreB ?? row?.opponentScore),
    deltaTeamA: toInt(row?.deltaTeamA ?? row?.myDelta),
    deltaTeamB: toInt(row?.deltaTeamB ?? row?.opponentDelta),
  };
}

function normalizeTournamentSummary(row) {
  return {
    id: toInt(row?.id),
    name: String(row?.name || ""),
    tournamentDate: row?.tournamentDate || "",
    tournamentType: row?.tournamentType || "REGULAR",
    kFactor: toInt(row?.kFactor),
    basePoints: toInt(row?.basePoints),
    status: row?.status || "OPEN",
    matchCount: toInt(row?.matchCount),
    participantCount: toInt(row?.participantCount),
  };
}

function normalizeTournamentDetail(detail) {
  if (!detail) return null;
  return {
    id: toInt(detail.id),
    name: String(detail.name || ""),
    tournamentDate: detail.tournamentDate || "",
    tournamentType: detail.tournamentType || "REGULAR",
    kFactor: toInt(detail.kFactor),
    basePoints: toInt(detail.basePoints),
    status: detail.status || "OPEN",
    participants: Array.isArray(detail.participants)
      ? detail.participants.map((p) => ({
          playerId: toInt(p.playerId),
          name: p.name || "",
          seedElo: toInt(p.seedElo),
          seedRank: toInt(p.seedRank),
          pendingDelta: toInt(p.pendingDelta),
          projectedElo: toInt(p.projectedElo),
        }))
      : [],
    matches: Array.isArray(detail.matches) ? detail.matches.map(normalizeMatch) : [],
    ratingEvents: Array.isArray(detail.ratingEvents)
      ? detail.ratingEvents.map((e) => ({
          playerId: toInt(e.playerId),
          name: e.name || "",
          eloBefore: toInt(e.eloBefore),
          delta: toInt(e.delta),
          eloAfter: toInt(e.eloAfter),
        }))
      : [],
    scheduleMatrix: detail.scheduleMatrix && typeof detail.scheduleMatrix === "object" ? detail.scheduleMatrix : {},
  };
}

function normalizeOverview(raw) {
  if (!raw) return null;
  return {
    summary: {
      players: toInt(raw.summary?.players),
      finalizedTournaments: toInt(raw.summary?.finalizedTournaments),
      openTournaments: toInt(raw.summary?.openTournaments),
      finalizedMatches: toInt(raw.summary?.finalizedMatches),
      avgElo: toInt(raw.summary?.avgElo),
    },
    topPlayers: Array.isArray(raw.topPlayers) ? raw.topPlayers.map(normalizePlayer) : [],
    recentTournaments: Array.isArray(raw.recentTournaments)
      ? raw.recentTournaments.map((row) => ({
          id: toInt(row.id),
          name: row.name || "",
          tournamentDate: row.tournamentDate || "",
          tournamentType: row.tournamentType || "REGULAR",
          status: row.status || "OPEN",
          matchCount: toInt(row.matchCount),
        }))
      : [],
    eloHistogram: raw.eloHistogram && typeof raw.eloHistogram === "object" ? raw.eloHistogram : {},
  };
}

const MatchCard = {
  name: "MatchCard",
  props: {
    match: { type: Object, required: true },
    typeLabel: { type: String, default: "" },
    showMeta: { type: Boolean, default: true },
    deletable: { type: Boolean, default: false },
  },
  emits: ["delete"],
  computed: {
    winnerSide() {
      const a = Number(this.match?.scoreA || 0);
      const b = Number(this.match?.scoreB || 0);
      if (a > b) return "A";
      if (b > a) return "B";
      return "DRAW";
    },
    cardClass() {
      if (this.winnerSide === "A") return "winner-a";
      if (this.winnerSide === "B") return "winner-b";
      return "draw";
    },
  },
  methods: {
    formatSigned,
    matchFormatLabel,
  },
  template: `
    <article class="match-card" :class="cardClass">
      <header class="match-head">
        <div class="match-head-left">
          <span v-if="match.matchOrder != null" class="match-order">#{{ match.matchOrder }}</span>
          <span class="match-format">{{ matchFormatLabel(match.matchFormat) }}</span>
        </div>
        <button v-if="deletable" type="button" class="btn danger mini" @click="$emit('delete')">삭제</button>
      </header>

      <div v-if="showMeta" class="match-meta">
        <span v-if="match.tournamentDate">{{ match.tournamentDate }}</span>
        <span v-if="match.tournamentName">{{ match.tournamentName }}</span>
        <span v-if="typeLabel">{{ typeLabel }}</span>
      </div>

      <div class="match-body">
        <div class="team-row" :class="{ winner: winnerSide === 'A', loser: winnerSide === 'B' }">
          <div class="team-main">
            <span class="team-side">A</span>
            <span class="team-name">{{ match.teamAName }}</span>
          </div>
          <div class="team-score">{{ match.scoreA }}</div>
        </div>

        <div class="team-row" :class="{ winner: winnerSide === 'B', loser: winnerSide === 'A' }">
          <div class="team-main">
            <span class="team-side">B</span>
            <span class="team-name">{{ match.teamBName }}</span>
          </div>
          <div class="team-score">{{ match.scoreB }}</div>
        </div>
      </div>

      <footer class="delta-row">
        <span class="delta-chip" :class="Number(match.deltaTeamA) >= 0 ? 'up' : 'down'">A {{ formatSigned(match.deltaTeamA) }}</span>
        <span class="delta-chip" :class="Number(match.deltaTeamB) >= 0 ? 'up' : 'down'">B {{ formatSigned(match.deltaTeamB) }}</span>
      </footer>
    </article>
  `,
};

const app = createApp({
  components: { MatchCard },

  data() {
    return {
      tabs: TABS,
      activeTab: "dashboard",
      loading: {
        count: 0,
        message: "데이터를 동기화하는 중...",
      },
      toast: {
        visible: false,
        error: false,
        message: "",
        timer: null,
      },
      health: {
        ok: null,
        text: "API 확인 중...",
      },
      lastSyncedAt: null,

      players: [],
      recentMatches: [],
      openTournament: null,
      tournaments: [],
      selectedRecordTournamentId: "",
      recordTournament: null,
      selectedPlayerId: "",
      playerStats: null,
      overview: null,
      tournamentRules: [],
      ruleDrafts: {
        REGULAR: { kFactor: 200, basePoints: 4 },
        ADHOC: { kFactor: 100, basePoints: 1 },
        FRIENDLY: { kFactor: 0, basePoints: 0 },
      },
      adminPlayers: [],
      selectedAdminPlayerId: "",

      ui: {
        rankingQuery: "",
        recentFormat: "ALL",
        participantQuery: "",
        participantIds: [],
        recordQuery: "",
        playerQuery: "",
        adminQuery: "",
        adminStatus: "ALL",
      },

      forms: {
        playerName: "",
        tournamentName: "",
        tournamentDate: new Date().toISOString().slice(0, 10),
        tournamentType: "REGULAR",
        matchFormat: "SINGLES",
        matchA1: "",
        matchA2: "",
        matchB1: "",
        matchB2: "",
        matchScoreA: 6,
        matchScoreB: 4,
        simType: "REGULAR",
        simAelo: 2000,
        simBelo: 2000,
        simAscore: 6,
        simBscore: 4,
        adminRename: "",
        adminElo: null,
        tournamentEditName: "",
        tournamentEditDate: "",
        tournamentEditType: "REGULAR",
      },

      modals: {
        matchEntry: false,
        tournamentSettings: false,
      },

      simResult: null,
    };
  },  computed: {
    isLoading() {
      return this.loading.count > 0;
    },

    activeRules() {
      return this.tournamentRules.length ? this.tournamentRules : DEFAULT_RULES;
    },

    ruleMap() {
      const map = new Map();
      for (const rule of this.activeRules) {
        map.set(rule.tournamentType, rule);
      }
      return map;
    },

    quickMetrics() {
      const openCount = this.tournaments.filter((t) => t.status === "OPEN").length;
      const finalizedCount = this.tournaments.filter((t) => t.status === "FINALIZED").length;
      return [
        { label: "활성 선수", value: this.players.length, help: "운영 대상 선수" },
        { label: "진행 중 대회", value: openCount, help: "OPEN 상태" },
        { label: "종료 대회", value: finalizedCount, help: "FINALIZED 누적" },
        { label: "종료 경기", value: toInt(this.overview?.summary?.finalizedMatches), help: "통계 기준 경기" },
      ];
    },

    filteredRankingPlayers() {
      const query = normalizeSearch(this.ui.rankingQuery);
      const rows = [...this.players].sort((a, b) => Number(a.rank) - Number(b.rank));
      if (!query) return rows;
      return rows.filter((player) => normalizeSearch(player.name).includes(query));
    },

    filteredRecentMatches() {
      return this.recentMatches.filter((match) => {
        if (this.ui.recentFormat === "ALL") return true;
        return match.matchFormat === this.ui.recentFormat;
      });
    },

    participantPool() {
      return [...this.players].sort((a, b) => b.currentElo - a.currentElo || a.name.localeCompare(b.name, "ko"));
    },

    filteredParticipantPool() {
      const query = normalizeSearch(this.ui.participantQuery);
      if (!query) return this.participantPool;
      return this.participantPool.filter((player) => normalizeSearch(player.name).includes(query));
    },

    selectedParticipants() {
      const set = new Set(this.ui.participantIds.map((id) => toInt(id)).filter((id) => id > 0));
      return this.participantPool.filter((player) => set.has(toInt(player.id)));
    },

    openTournamentParticipants() {
      return (this.openTournament?.participants || []).slice().sort((a, b) => a.seedRank - b.seedRank || a.name.localeCompare(b.name, "ko"));
    },

    openTournamentMatches() {
      return (this.openTournament?.matches || []).slice().sort((a, b) => a.matchOrder - b.matchOrder || a.matchId - b.matchId);
    },

    recordTournamentOptions() {
      return [...this.tournaments].sort((a, b) => String(b.tournamentDate).localeCompare(String(a.tournamentDate)) || b.id - a.id);
    },

    filteredRecordTournamentOptions() {
      const query = normalizeSearch(this.ui.recordQuery);
      if (!query) return this.recordTournamentOptions;
      return this.recordTournamentOptions.filter((tournament) =>
        normalizeSearch(`${tournament.tournamentDate}${tournament.name}`).includes(query)
      );
    },

    filteredPlayersForSelector() {
      const query = normalizeSearch(this.ui.playerQuery);
      const rows = [...this.players].sort((a, b) => Number(a.rank) - Number(b.rank));
      if (!query) return rows;
      return rows.filter((player) => normalizeSearch(player.name).includes(query));
    },

    recordMatrixPlayers() {
      if (!this.recordTournament?.scheduleMatrix) return [];
      return Object.keys(this.recordTournament.scheduleMatrix);
    },

    recordMatrixRows() {
      const names = this.recordMatrixPlayers;
      if (!names.length) return [];
      return names.map((rowName) => ({
        name: rowName,
        cells: names.map((colName) => ({
          key: colName,
          value: this.recordTournament.scheduleMatrix?.[rowName]?.[colName] || "",
        })),
      }));
    },

    histogramRows() {
      const hist = this.overview?.eloHistogram || {};
      const rows = Object.entries(hist)
        .map(([range, count]) => {
          const [start] = String(range).split("-");
          return {
            range,
            count: toInt(count),
            sortKey: toInt(start),
          };
        })
        .sort((a, b) => a.sortKey - b.sortKey);
      const max = Math.max(1, ...rows.map((row) => row.count));
      return rows.map((row) => ({
        ...row,
        ratio: Math.round((row.count / max) * 100),
      }));
    },

    filteredAdminPlayers() {
      const query = normalizeSearch(this.ui.adminQuery);
      return this.adminPlayers.filter((player) => {
        if (this.ui.adminStatus === "ACTIVE" && !player.isActive) return false;
        if (this.ui.adminStatus === "INACTIVE" && player.isActive) return false;
        if (!query) return true;
        return normalizeSearch(player.name).includes(query);
      });
    },

    selectedAdminPlayer() {
      const id = toInt(this.selectedAdminPlayerId);
      return this.adminPlayers.find((player) => player.id === id) || null;
    },

    playerMatchCards() {
      const rows = this.playerStats?.matches || [];
      return rows.map((match) => normalizeMatch(match));
    },
  },

  methods: {
    formatNum,
    formatSigned,
    formatDateTime,
    matchFormatLabel,
    tournamentStatusLabel,

    tournamentTypeLabel(type) {
      return this.ruleMap.get(type)?.displayName || String(type || "-");
    },

    statusClass(status) {
      if (status === "OPEN") return "open";
      if (status === "FINALIZED") return "active";
      if (status === "CANCELED") return "inactive";
      return "";
    },

    showToast(message, isError = false) {
      if (!message) return;
      if (this.toast.timer) {
        clearTimeout(this.toast.timer);
        this.toast.timer = null;
      }
      this.toast.message = message;
      this.toast.error = isError;
      this.toast.visible = true;
      this.toast.timer = setTimeout(() => {
        this.toast.visible = false;
      }, 2400);
    },

    setLoading(enabled, message = "데이터를 동기화하는 중...") {
      if (enabled) {
        this.loading.count += 1;
        this.loading.message = message;
      } else {
        this.loading.count = Math.max(0, this.loading.count - 1);
      }
    },

    async withLoading(message, work) {
      this.setLoading(true, message);
      try {
        return await work();
      } finally {
        this.setLoading(false);
      }
    },

    async checkHealth() {
      try {
        await requestApi("/api/health");
        this.health.ok = true;
        this.health.text = "API 정상";
      } catch (error) {
        this.health.ok = false;
        this.health.text = "API 오류";
        throw error;
      }
    },

    applyRuleList(rules) {
      const source = Array.isArray(rules) && rules.length ? rules : DEFAULT_RULES;
      this.tournamentRules = source.map((rule) => ({
        tournamentType: rule.tournamentType,
        displayName: rule.displayName,
        kFactor: toInt(rule.kFactor),
        basePoints: toInt(rule.basePoints),
      }));

      const drafts = {};
      for (const rule of this.tournamentRules) {
        drafts[rule.tournamentType] = {
          kFactor: toInt(rule.kFactor),
          basePoints: toInt(rule.basePoints),
        };
      }
      this.ruleDrafts = drafts;

      if (!this.tournamentRules.some((rule) => rule.tournamentType === this.forms.tournamentType)) {
        this.forms.tournamentType = this.tournamentRules[0]?.tournamentType || "REGULAR";
      }
      if (!this.tournamentRules.some((rule) => rule.tournamentType === this.forms.simType)) {
        this.forms.simType = this.tournamentRules[0]?.tournamentType || "REGULAR";
      }
    },

    syncParticipantSelection() {
      const valid = new Set(this.players.map((player) => toInt(player.id)));
      this.ui.participantIds = this.ui.participantIds
        .map((id) => toInt(id))
        .filter((id) => id > 0 && valid.has(id));
    },

    syncMatchSelectDefaults() {
      const ids = this.openTournamentParticipants.map((player) => toInt(player.playerId)).filter((id) => id > 0);
      const has = (value) => ids.includes(toInt(value));
      const pick = (index) => (ids[index] ? String(ids[index]) : "");

      if (!has(this.forms.matchA1)) this.forms.matchA1 = pick(0);
      if (!has(this.forms.matchB1)) this.forms.matchB1 = pick(1);

      if (this.forms.matchFormat === "DOUBLES") {
        if (!has(this.forms.matchA2)) this.forms.matchA2 = pick(2);
        if (!has(this.forms.matchB2)) this.forms.matchB2 = pick(3);
      } else {
        this.forms.matchA2 = "";
        this.forms.matchB2 = "";
      }
    },

    isParticipantSelected(playerId) {
      return this.ui.participantIds.map((id) => toInt(id)).includes(toInt(playerId));
    },

    toggleParticipant(playerId) {
      const id = toInt(playerId);
      if (id <= 0) return;
      if (this.isParticipantSelected(id)) {
        this.ui.participantIds = this.ui.participantIds.filter((pickedId) => toInt(pickedId) !== id);
        return;
      }
      this.ui.participantIds = [...this.ui.participantIds.map((pickedId) => toInt(pickedId)), id];
    },

    clearParticipantSelection() {
      this.ui.participantIds = [];
    },

    selectAllParticipants() {
      this.ui.participantIds = this.participantPool.map((player) => toInt(player.id));
    },

    selectTopParticipants(limit = 8) {
      this.ui.participantIds = this.participantPool.slice(0, Math.max(1, toInt(limit, 8))).map((player) => toInt(player.id));
    },

    addFirstSearchedParticipant() {
      const target = this.filteredParticipantPool.find((player) => !this.isParticipantSelected(player.id));
      if (target) {
        this.toggleParticipant(target.id);
      }
    },

    setMatchFormat(value) {
      this.forms.matchFormat = value === "DOUBLES" ? "DOUBLES" : "SINGLES";
    },

    openMatchEntryModal() {
      if (!this.openTournament) return;
      this.syncMatchSelectDefaults();
      this.modals.matchEntry = true;
    },

    closeMatchEntryModal() {
      this.modals.matchEntry = false;
    },

    openTournamentSettingsModal() {
      if (!this.openTournament) return;
      this.forms.tournamentEditName = this.openTournament.name;
      this.forms.tournamentEditDate = this.openTournament.tournamentDate;
      this.forms.tournamentEditType = this.openTournament.tournamentType;
      this.modals.tournamentSettings = true;
    },

    closeTournamentSettingsModal() {
      this.modals.tournamentSettings = false;
    },

    async submitTournamentSettings() {
      if (!this.openTournament) return;

      const name = String(this.forms.tournamentEditName || "").trim();
      const tournamentDate = this.forms.tournamentEditDate;
      const tournamentType = this.forms.tournamentEditType;

      if (!name) {
        this.showToast("대회명을 입력하세요.", true);
        return;
      }

      const payload = {};
      if (name !== this.openTournament.name) payload.name = name;
      if (tournamentDate && tournamentDate !== this.openTournament.tournamentDate) payload.tournamentDate = tournamentDate;
      if (tournamentType && tournamentType !== this.openTournament.tournamentType) {
        if ((this.openTournament.matches || []).length > 0) {
          this.showToast("경기 기록이 있으면 대회 종류를 바꿀 수 없습니다.", true);
          return;
        }
        payload.tournamentType = tournamentType;
      }

      if (!Object.keys(payload).length) {
        this.modals.tournamentSettings = false;
        this.showToast("변경된 내용이 없습니다.");
        return;
      }

      try {
        await this.withLoading("대회 설정을 저장하는 중...", async () => {
          await requestApi(`/api/tournaments/${this.openTournament.id}`, "PATCH", payload);
          await Promise.all([this.refreshBootstrap(), this.refreshTournaments()]);
          this.lastSyncedAt = new Date().toISOString();
        });
        this.modals.tournamentSettings = false;
        this.showToast("대회 설정을 저장했습니다.");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "대회 설정 저장 실패", true);
      }
    },

    async refreshBootstrap() {
      const data = await requestApi("/api/bootstrap");
      this.players = Array.isArray(data.players) ? data.players.map(normalizePlayer) : [];
      this.recentMatches = Array.isArray(data.recentMatches) ? data.recentMatches.map(normalizeMatch) : [];
      this.openTournament = normalizeTournamentDetail(data.openTournament);
      this.applyRuleList(data.tournamentRules);

      this.syncParticipantSelection();
      this.syncMatchSelectDefaults();

      if (!this.selectedPlayerId && this.players.length) {
        this.selectedPlayerId = String(this.players[0].id);
      }
      if (this.selectedPlayerId) {
        const exists = this.players.some((player) => String(player.id) === String(this.selectedPlayerId));
        if (!exists) {
          this.selectedPlayerId = this.players.length ? String(this.players[0].id) : "";
        }
      }
    },

    async refreshTournaments() {
      const data = await requestApi("/api/tournaments");
      this.tournaments = Array.isArray(data.tournaments) ? data.tournaments.map(normalizeTournamentSummary) : [];

      if (!this.selectedRecordTournamentId && this.tournaments.length) {
        this.selectedRecordTournamentId = String(this.tournaments[0].id);
      }
      if (this.selectedRecordTournamentId) {
        const exists = this.tournaments.some((tournament) => String(tournament.id) === String(this.selectedRecordTournamentId));
        if (!exists) {
          this.selectedRecordTournamentId = this.tournaments.length ? String(this.tournaments[0].id) : "";
        }
      }
    },

    async refreshOverview() {
      const data = await requestApi("/api/stats/overview");
      this.overview = normalizeOverview(data);
    },

    async refreshAdminPlayers() {
      const data = await requestApi("/api/admin/players");
      this.adminPlayers = Array.isArray(data.players) ? data.players.map(normalizeAdminPlayer) : [];

      if (!this.selectedAdminPlayerId && this.adminPlayers.length) {
        this.selectedAdminPlayerId = String(this.adminPlayers[0].id);
      }
      if (this.selectedAdminPlayerId) {
        const exists = this.adminPlayers.some((player) => String(player.id) === String(this.selectedAdminPlayerId));
        if (!exists) {
          this.selectedAdminPlayerId = this.adminPlayers.length ? String(this.adminPlayers[0].id) : "";
        }
      }
    },    async refreshAll(message = "전체 데이터를 동기화하는 중...") {
      try {
        await this.withLoading(message, async () => {
          await this.checkHealth();
          await Promise.all([
            this.refreshBootstrap(),
            this.refreshTournaments(),
            this.refreshOverview(),
            this.refreshAdminPlayers(),
          ]);
          this.lastSyncedAt = new Date().toISOString();
        });
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "데이터 동기화 실패", true);
      }
    },

    runSimulator() {
      try {
        const type = this.forms.simType;
        const rule = this.ruleMap.get(type) || DEFAULT_RULES[0];

        const aElo = Number(this.forms.simAelo);
        const bElo = Number(this.forms.simBelo);
        const aScore = Number(this.forms.simAscore);
        const bScore = Number(this.forms.simBscore);

        if (!Number.isFinite(aElo) || aElo <= 0 || !Number.isFinite(bElo) || bElo <= 0) {
          throw new Error("ELO는 1 이상의 숫자여야 합니다.");
        }
        if (!Number.isFinite(aScore) || !Number.isFinite(bScore) || aScore < 0 || bScore < 0 || aScore + bScore <= 0) {
          throw new Error("점수는 음수가 아니어야 하며 합이 1 이상이어야 합니다.");
        }

        const resultA = aScore / (aScore + bScore);
        const expA = expectedScore(aElo, bElo);
        const expB = 1 - expA;

        const deltaA = Math.round(Number(rule.kFactor) * (resultA - expA)) + Number(rule.basePoints);
        const deltaB = Math.round(Number(rule.kFactor) * ((1 - resultA) - expB)) + Number(rule.basePoints);

        this.simResult = {
          deltaA,
          deltaB,
          expectedA: Math.round(expA * 100),
          expectedB: Math.round(expB * 100),
        };
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "시뮬레이션 실패", true);
      }
    },

    async submitPlayer() {
      const name = String(this.forms.playerName || "").trim();
      if (!name) {
        this.showToast("선수 이름을 입력하세요.", true);
        return;
      }

      try {
        await this.withLoading("선수를 등록하는 중...", async () => {
          await requestApi("/api/players", "POST", { name });
          this.forms.playerName = "";
          await Promise.all([this.refreshBootstrap(), this.refreshAdminPlayers(), this.refreshOverview()]);
          this.lastSyncedAt = new Date().toISOString();
        });
        this.showToast("선수를 등록했습니다.");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "선수 등록 실패", true);
      }
    },

    async submitTournament() {
      const name = String(this.forms.tournamentName || "").trim();
      if (!name) {
        this.showToast("대회명을 입력하세요.", true);
        return;
      }

      const participantIds = [...new Set(this.ui.participantIds.map((id) => toInt(id)).filter((id) => id > 0))];
      if (participantIds.length < 2) {
        this.showToast("참가자는 최소 2명 이상 선택해야 합니다.", true);
        return;
      }

      try {
        await this.withLoading("대회를 생성하는 중...", async () => {
          await requestApi("/api/tournaments", "POST", {
            name,
            tournamentDate: this.forms.tournamentDate,
            tournamentType: this.forms.tournamentType,
            participantIds,
          });

          this.forms.tournamentName = "";
          this.ui.participantIds = [];
          this.ui.participantQuery = "";

          await Promise.all([
            this.refreshBootstrap(),
            this.refreshTournaments(),
            this.refreshOverview(),
            this.refreshAdminPlayers(),
          ]);
          this.lastSyncedAt = new Date().toISOString();
          this.activeTab = "tournament";
        });
        this.showToast("대회를 시작했습니다.");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "대회 생성 실패", true);
      }
    },

    buildMatchPayload() {
      if (!this.openTournament) throw new Error("진행 중 대회가 없습니다.");

      const matchFormat = this.forms.matchFormat === "DOUBLES" ? "DOUBLES" : "SINGLES";
      const scoreA = toInt(this.forms.matchScoreA, -1);
      const scoreB = toInt(this.forms.matchScoreB, -1);

      if (scoreA < 0 || scoreB < 0 || scoreA + scoreB <= 0) {
        throw new Error("점수는 0 이상이어야 하며 합이 1 이상이어야 합니다.");
      }

      const teamAPlayer1Id = toInt(this.forms.matchA1, -1);
      const teamBPlayer1Id = toInt(this.forms.matchB1, -1);
      if (teamAPlayer1Id <= 0 || teamBPlayer1Id <= 0) {
        throw new Error("팀 A/B의 선수 1을 선택하세요.");
      }

      let teamAPlayer2Id = null;
      let teamBPlayer2Id = null;
      if (matchFormat === "DOUBLES") {
        teamAPlayer2Id = toInt(this.forms.matchA2, -1);
        teamBPlayer2Id = toInt(this.forms.matchB2, -1);
        if (teamAPlayer2Id <= 0 || teamBPlayer2Id <= 0) {
          throw new Error("복식은 팀별 선수 2를 모두 선택해야 합니다.");
        }
      }

      const picked = [teamAPlayer1Id, teamAPlayer2Id, teamBPlayer1Id, teamBPlayer2Id].filter((id) => id != null);
      const unique = new Set(picked);
      if (unique.size !== picked.length) {
        throw new Error("한 경기에서 동일 선수를 중복 선택할 수 없습니다.");
      }

      return {
        matchFormat,
        teamAPlayer1Id,
        teamAPlayer2Id,
        teamBPlayer1Id,
        teamBPlayer2Id,
        scoreA,
        scoreB,
      };
    },

    async submitMatch() {
      try {
        const payload = this.buildMatchPayload();
        await this.withLoading("경기 결과를 저장하는 중...", async () => {
          await requestApi(`/api/tournaments/${this.openTournament.id}/matches`, "POST", payload);
          await this.refreshBootstrap();
          this.lastSyncedAt = new Date().toISOString();
        });
        this.modals.matchEntry = false;
        this.showToast("경기 결과를 기록했습니다.");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "경기 기록 실패", true);
      }
    },

    async deleteMatch(matchId) {
      if (!this.openTournament) return;
      if (!window.confirm("이 경기를 삭제할까요?")) return;

      try {
        await this.withLoading("경기를 삭제하는 중...", async () => {
          await requestApi(`/api/tournaments/${this.openTournament.id}/matches/${matchId}`, "DELETE");
          await this.refreshBootstrap();
          this.lastSyncedAt = new Date().toISOString();
        });
        this.showToast("경기를 삭제했습니다.");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "경기 삭제 실패", true);
      }
    },

    async finalizeTournament() {
      if (!this.openTournament) return;
      if (!window.confirm("대회를 종료하고 ELO를 반영할까요?")) return;

      try {
        await this.withLoading("대회를 종료하는 중...", async () => {
          await requestApi(`/api/tournaments/${this.openTournament.id}/finalize`, "POST");
          await Promise.all([
            this.refreshBootstrap(),
            this.refreshTournaments(),
            this.refreshOverview(),
            this.refreshAdminPlayers(),
          ]);
          this.lastSyncedAt = new Date().toISOString();
        });
        this.modals.matchEntry = false;
        this.modals.tournamentSettings = false;
        this.showToast("대회를 종료하고 점수를 반영했습니다.");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "대회 종료 실패", true);
      }
    },

    async cancelTournament() {
      if (!this.openTournament) return;
      if (!window.confirm("진행 중인 대회를 취소할까요?")) return;

      try {
        await this.withLoading("대회를 취소하는 중...", async () => {
          await requestApi(`/api/tournaments/${this.openTournament.id}/cancel`, "POST");
          await Promise.all([
            this.refreshBootstrap(),
            this.refreshTournaments(),
            this.refreshOverview(),
            this.refreshAdminPlayers(),
          ]);
          this.lastSyncedAt = new Date().toISOString();
        });
        this.modals.matchEntry = false;
        this.modals.tournamentSettings = false;
        this.showToast("대회를 취소했습니다.");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "대회 취소 실패", true);
      }
    },

    async loadRecordBySelection() {
      const tournamentId = toInt(this.selectedRecordTournamentId);
      if (tournamentId <= 0) {
        this.recordTournament = null;
        return;
      }

      try {
        await this.withLoading("대회 기록을 불러오는 중...", async () => {
          const data = await requestApi(`/api/tournaments/${tournamentId}/report`);
          this.recordTournament = normalizeTournamentDetail(data.tournament);
        });
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "대회 기록 조회 실패", true);
      }
    },

    async loadPlayerBySelection() {
      const playerId = toInt(this.selectedPlayerId);
      if (playerId <= 0) {
        this.playerStats = null;
        return;
      }

      try {
        await this.withLoading("선수 기록을 불러오는 중...", async () => {
          const data = await requestApi(`/api/players/${playerId}/stats`);
          this.playerStats = {
            player: normalizePlayer(data.player),
            summary: {
              total: toInt(data.summary?.total),
              wins: toInt(data.summary?.wins),
              losses: toInt(data.summary?.losses),
              draws: toInt(data.summary?.draws),
              winRate: toInt(data.summary?.winRate),
              singlesTotal: toInt(data.summary?.singlesTotal),
              singlesWins: toInt(data.summary?.singlesWins),
              singlesWinRate: toInt(data.summary?.singlesWinRate),
              doublesTotal: toInt(data.summary?.doublesTotal),
              doublesWins: toInt(data.summary?.doublesWins),
              doublesWinRate: toInt(data.summary?.doublesWinRate),
            },
            events: Array.isArray(data.events)
              ? data.events.map((event) => ({
                  id: toInt(event.id),
                  eventType: event.eventType || "",
                  eventDate: event.eventDate || "",
                  kFactor: toInt(event.kFactor),
                  basePoints: toInt(event.basePoints),
                  eloBefore: toInt(event.eloBefore),
                  delta: toInt(event.delta),
                  eloAfter: toInt(event.eloAfter),
                }))
              : [],
            matches: Array.isArray(data.matches) ? data.matches.map(normalizeMatch) : [],
            opponents: Array.isArray(data.opponents)
              ? data.opponents.map((op) => ({
                  opponent: op.opponent || "",
                  matches: toInt(op.matches),
                  wins: toInt(op.wins),
                  losses: toInt(op.losses),
                  draws: toInt(op.draws),
                }))
              : [],
          };
        });
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "선수 기록 조회 실패", true);
      }
    },

    async refreshStats() {
      try {
        await this.withLoading("통계를 갱신하는 중...", async () => {
          await this.refreshOverview();
          this.lastSyncedAt = new Date().toISOString();
        });
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "통계 갱신 실패", true);
      }
    },

    async saveRule(tournamentType) {
      const draft = this.ruleDrafts[tournamentType];
      if (!draft) return;

      const kFactor = toInt(draft.kFactor, -1);
      const basePoints = toInt(draft.basePoints, -1);
      if (kFactor < 0 || basePoints < 0) {
        this.showToast("K값과 base 점수는 0 이상이어야 합니다.", true);
        return;
      }

      try {
        await this.withLoading("대회 규칙을 저장하는 중...", async () => {
          const data = await requestApi(`/api/settings/tournament-rules/${tournamentType}`, "PATCH", {
            kFactor,
            basePoints,
          });
          this.applyRuleList(data.tournamentRules);
          this.lastSyncedAt = new Date().toISOString();
        });
        this.showToast("규칙을 저장했습니다.");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "규칙 저장 실패", true);
      }
    },

    async renameAdminPlayer() {
      if (!this.selectedAdminPlayer) {
        this.showToast("관리할 선수를 선택하세요.", true);
        return;
      }
      const name = String(this.forms.adminRename || "").trim();
      if (!name) {
        this.showToast("변경할 이름을 입력하세요.", true);
        return;
      }

      try {
        await this.withLoading("선수 이름을 변경하는 중...", async () => {
          await requestApi(`/api/admin/players/${this.selectedAdminPlayer.id}`, "PATCH", { name });
          await Promise.all([this.refreshBootstrap(), this.refreshAdminPlayers(), this.refreshOverview()]);
          this.lastSyncedAt = new Date().toISOString();
        });
        this.showToast("선수 이름을 변경했습니다.");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "이름 변경 실패", true);
      }
    },

    async adjustAdminElo() {
      if (!this.selectedAdminPlayer) {
        this.showToast("관리할 선수를 선택하세요.", true);
        return;
      }
      if (this.forms.adminElo == null || this.forms.adminElo === "") {
        this.showToast("조정할 ELO를 입력하세요.", true);
        return;
      }
      const currentElo = toInt(this.forms.adminElo, -1);
      if (currentElo < 0) {
        this.showToast("조정할 ELO를 입력하세요.", true);
        return;
      }

      try {
        await this.withLoading("ELO를 조정하는 중...", async () => {
          await requestApi(`/api/admin/players/${this.selectedAdminPlayer.id}`, "PATCH", { currentElo });
          await Promise.all([this.refreshBootstrap(), this.refreshAdminPlayers(), this.refreshOverview()]);
          this.lastSyncedAt = new Date().toISOString();
        });
        this.showToast("선수 ELO를 조정했습니다.");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "ELO 조정 실패", true);
      }
    },

    async deleteAdminPlayer() {
      if (!this.selectedAdminPlayer) {
        this.showToast("관리할 선수를 선택하세요.", true);
        return;
      }
      if (!window.confirm("선수를 비활성화할까요?")) return;

      try {
        await this.withLoading("선수를 비활성화하는 중...", async () => {
          await requestApi(`/api/admin/players/${this.selectedAdminPlayer.id}`, "DELETE");
          await Promise.all([this.refreshBootstrap(), this.refreshAdminPlayers(), this.refreshOverview()]);
          this.lastSyncedAt = new Date().toISOString();
        });
        this.showToast("선수를 비활성화했습니다.");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "선수 삭제 실패", true);
      }
    },
  },

  watch: {
    openTournament: {
      handler() {
        this.syncMatchSelectDefaults();
        if (!this.openTournament) {
          this.modals.matchEntry = false;
          this.modals.tournamentSettings = false;
        }
      },
      deep: false,
    },

    players: {
      handler() {
        this.syncParticipantSelection();
      },
      deep: true,
    },

    "forms.matchFormat"(value) {
      if (value === "SINGLES") {
        this.forms.matchA2 = "";
        this.forms.matchB2 = "";
      }
      this.syncMatchSelectDefaults();
    },

    selectedRecordTournamentId(newValue, oldValue) {
      if (newValue === oldValue) return;
      this.loadRecordBySelection();
    },

    selectedPlayerId(newValue, oldValue) {
      if (newValue === oldValue) return;
      this.loadPlayerBySelection();
    },

    selectedAdminPlayer: {
      handler(player) {
        this.forms.adminRename = player?.name || "";
        this.forms.adminElo = player ? toInt(player.currentElo) : null;
      },
      immediate: true,
    },
  },

  async mounted() {
    await this.refreshAll("초기 데이터를 불러오는 중...");
  },
  template: `
    <div class="app-root">
      <div class="bg-orb orb-a"></div>
      <div class="bg-orb orb-b"></div>
      <div class="bg-orb orb-c"></div>

      <div class="layout-shell">
        <aside class="side-nav">
          <div class="brand-panel">
            <p class="brand-overline">ELO RANKING SYSTEM</p>
            <h1>ELO Ops Studio</h1>
            <p>Cloudflare Pages + D1 기반 운영 콘솔</p>
          </div>

          <nav class="tab-nav" aria-label="주요 메뉴">
            <button
              v-for="item in tabs"
              :key="item.id"
              type="button"
              class="tab-btn"
              :class="{ active: activeTab === item.id }"
              @click="activeTab = item.id"
            >
              <span class="tab-label">{{ item.label }}</span>
              <small>{{ item.desc }}</small>
            </button>
          </nav>

          <div class="side-foot">
            <p>저장소: Cloudflare D1</p>
            <p>런타임: Pages Functions</p>
          </div>
        </aside>

        <div class="workspace">
          <header class="workspace-head">
            <div class="head-copy">
              <h2>경기 운영 대시보드</h2>
              <p>선수 등록부터 대회 종료 반영까지 한 흐름으로 관리합니다.</p>
            </div>
            <div class="head-actions">
              <button type="button" class="btn ghost" @click="refreshAll('전체 데이터를 동기화하는 중...')">전체 동기화</button>
              <div class="sync-text">마지막 동기화: {{ formatDateTime(lastSyncedAt, true) }}</div>
              <div class="health-pill" :class="{ ok: health.ok === true, bad: health.ok === false }">{{ health.text }}</div>
            </div>
          </header>

          <section class="kpi-grid" aria-label="핵심 지표">
            <article v-for="metric in quickMetrics" :key="metric.label" class="kpi-card">
              <span>{{ metric.label }}</span>
              <strong>{{ metric.value }}</strong>
              <small>{{ metric.help }}</small>
            </article>
          </section>

          <main class="panel-stack">
            <section v-show="activeTab === 'dashboard'" class="panel-group">
              <div class="panel-grid two">
                <article class="surface accent">
                  <h3>선수 등록</h3>
                  <p class="muted">신규 선수는 활성 선수 평균 ELO를 기준으로 자동 초기화됩니다.</p>
                  <form class="inline-form" @submit.prevent="submitPlayer">
                    <input v-model.trim="forms.playerName" placeholder="선수 이름" required />
                    <button type="submit" class="btn primary">등록</button>
                  </form>
                </article>

                <article class="surface">
                  <h3>ELO 시뮬레이터</h3>
                  <form class="sim-grid" @submit.prevent="runSimulator">
                    <label>대회 타입
                      <select v-model="forms.simType">
                        <option v-for="rule in activeRules" :key="rule.tournamentType" :value="rule.tournamentType">{{ rule.displayName }}</option>
                      </select>
                    </label>
                    <label>Player A ELO<input v-model.number="forms.simAelo" type="number" min="1" /></label>
                    <label>Player B ELO<input v-model.number="forms.simBelo" type="number" min="1" /></label>
                    <label>Score A<input v-model.number="forms.simAscore" type="number" min="0" /></label>
                    <label>Score B<input v-model.number="forms.simBscore" type="number" min="0" /></label>
                    <button type="submit" class="btn primary">계산</button>
                  </form>

                  <div v-if="simResult" class="sim-result">
                    <div class="sim-pill up">A {{ formatSigned(simResult.deltaA) }}</div>
                    <div class="sim-pill down">B {{ formatSigned(simResult.deltaB) }}</div>
                    <small>예상승률 A {{ simResult.expectedA }}% · B {{ simResult.expectedB }}%</small>
                  </div>
                </article>
              </div>

              <div class="panel-grid two">
                <article class="surface">
                  <header class="surface-head">
                    <h3>현재 랭킹</h3>
                    <input v-model.trim="ui.rankingQuery" placeholder="선수 이름 검색" />
                  </header>
                  <div class="table-shell">
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th>순위</th>
                          <th>선수</th>
                          <th>ELO / 점수</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="player in filteredRankingPlayers" :key="'rank-' + player.id">
                          <td>#{{ player.rank }}</td>
                          <td>{{ player.name }}</td>
                          <td>
                            <div class="elo-cell">
                              <strong>{{ formatNum(player.currentElo) }}</strong>
                              <small>ELO</small>
                            </div>
                          </td>
                        </tr>
                        <tr v-if="!filteredRankingPlayers.length">
                          <td colspan="3" class="empty-row">표시할 선수가 없습니다.</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </article>

                <article class="surface">
                  <header class="surface-head">
                    <h3>최근 경기</h3>
                    <select v-model="ui.recentFormat">
                      <option value="ALL">전체</option>
                      <option value="SINGLES">단식</option>
                      <option value="DOUBLES">복식</option>
                    </select>
                  </header>

                  <div class="card-list">
                    <match-card
                      v-for="match in filteredRecentMatches"
                      :key="'recent-' + match.matchId"
                      :match="match"
                      :type-label="tournamentTypeLabel(match.tournamentType)"
                    />
                    <p v-if="!filteredRecentMatches.length" class="empty-copy">최근 경기 데이터가 없습니다.</p>
                  </div>
                </article>
              </div>
            </section>

            <section v-show="activeTab === 'tournament'" class="panel-group">
              <div class="panel-grid two">
                <article class="surface" v-if="!openTournament">
                  <h3>새 대회 시작</h3>
                  <form class="stack-form" @submit.prevent="submitTournament">
                    <label>대회명<input v-model.trim="forms.tournamentName" required /></label>
                    <label>대회일자<input v-model="forms.tournamentDate" type="date" required /></label>
                    <label>대회종류
                      <select v-model="forms.tournamentType">
                        <option v-for="rule in activeRules" :key="'rule-start-' + rule.tournamentType" :value="rule.tournamentType">{{ rule.displayName }}</option>
                      </select>
                    </label>

                    <div class="participant-box">
                      <div class="participant-head">
                        <span>참가자 선택</span>
                        <strong>{{ selectedParticipants.length }}명 선택</strong>
                      </div>

                      <input
                        v-model.trim="ui.participantQuery"
                        placeholder="선수 검색 후 Enter로 첫 결과 추가"
                        @keydown.enter.prevent="addFirstSearchedParticipant"
                      />

                      <div class="picker-actions">
                        <button type="button" class="btn ghost mini" @click="selectAllParticipants">전체 선택</button>
                        <button type="button" class="btn ghost mini" @click="selectTopParticipants(8)">상위 8명</button>
                        <button type="button" class="btn ghost mini" @click="clearParticipantSelection">선택 초기화</button>
                      </div>

                      <div class="selected-chip-wrap">
                        <button
                          v-for="player in selectedParticipants"
                          :key="'picked-' + player.id"
                          type="button"
                          class="selected-chip"
                          @click="toggleParticipant(player.id)"
                        >
                          {{ player.name }}
                        </button>
                        <p v-if="!selectedParticipants.length" class="empty-copy">아직 선택된 참가자가 없습니다.</p>
                      </div>

                      <div class="pick-grid">
                        <button
                          v-for="player in filteredParticipantPool"
                          :key="'pool-' + player.id"
                          type="button"
                          class="pick-item"
                          :class="{ selected: isParticipantSelected(player.id) }"
                          @click="toggleParticipant(player.id)"
                        >
                          <span>{{ player.name }}</span>
                          <small>{{ formatNum(player.currentElo) }}</small>
                        </button>
                      </div>
                    </div>

                    <button type="submit" class="btn primary">대회 시작</button>
                  </form>
                </article>

                <article class="surface" v-else>
                  <h3>대회 진행 도구</h3>
                  <p class="muted">대회는 동시에 하나만 진행할 수 있습니다. 설정 변경과 경기 결과 입력은 버튼으로 열리는 모달에서 처리합니다.</p>
                </article>

                <article class="surface">
                  <h3>진행 중 대회</h3>
                  <div v-if="openTournament" class="open-summary">
                    <p class="open-title">{{ openTournament.name }}</p>
                    <div class="summary-row">
                      <span>{{ openTournament.tournamentDate }}</span>
                      <span>{{ tournamentTypeLabel(openTournament.tournamentType) }}</span>
                      <span class="status-chip open">{{ tournamentStatusLabel(openTournament.status) }}</span>
                    </div>
                    <div class="summary-stat-grid">
                      <div><strong>{{ openTournament.participants.length }}</strong><small>참가자</small></div>
                      <div><strong>{{ openTournament.matches.length }}</strong><small>경기</small></div>
                      <div><strong>K {{ openTournament.kFactor }}</strong><small>base {{ openTournament.basePoints }}</small></div>
                    </div>
                  </div>
                  <p v-else class="empty-copy">진행 중 대회가 없습니다.</p>
                </article>
              </div>

              <div v-if="openTournament" class="tournament-toolbar">
                <button type="button" class="btn ghost" @click="openTournamentSettingsModal">대회 설정 변경</button>
                <button type="button" class="btn primary" @click="openMatchEntryModal">경기 결과 입력</button>
              </div>

              <div class="panel-grid two">
                <article class="surface">
                  <h3>참가자 / 예상 ELO</h3>
                  <div class="table-shell">
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th>시드</th>
                          <th>선수</th>
                          <th>시작 ELO</th>
                          <th>누적 Δ</th>
                          <th>예상 ELO</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="player in openTournamentParticipants" :key="'open-player-' + player.playerId">
                          <td>#{{ player.seedRank }}</td>
                          <td>{{ player.name }}</td>
                          <td>{{ formatNum(player.seedElo) }}</td>
                          <td :class="{ up: player.pendingDelta > 0, down: player.pendingDelta < 0 }">{{ formatSigned(player.pendingDelta) }}</td>
                          <td>
                            <div class="elo-cell">
                              <strong>{{ formatNum(player.projectedElo) }}</strong>
                              <small>ELO</small>
                            </div>
                          </td>
                        </tr>
                        <tr v-if="!openTournamentParticipants.length">
                          <td colspan="5" class="empty-row">참가자 정보가 없습니다.</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </article>

                <article class="surface">
                  <h3>경기 목록</h3>
                  <div class="card-list">
                    <match-card
                      v-for="match in openTournamentMatches"
                      :key="'open-match-' + match.id"
                      :match="match"
                      :show-meta="false"
                      :deletable="true"
                      @delete="deleteMatch(match.id)"
                    />
                    <p v-if="!openTournamentMatches.length" class="empty-copy">아직 기록된 경기가 없습니다.</p>
                  </div>

                  <div class="action-row">
                    <button type="button" class="btn danger" :disabled="!openTournament" @click="cancelTournament">대회 취소</button>
                    <button type="button" class="btn primary" :disabled="!openTournament" @click="finalizeTournament">대회 종료</button>
                  </div>
                </article>
              </div>
            </section>

            <section v-show="activeTab === 'records'" class="panel-group">
              <article class="surface">
                <header class="surface-head">
                  <h3>대회 기록</h3>
                  <div class="inline-form selector-form">
                    <input v-model.trim="ui.recordQuery" placeholder="대회 검색" />
                    <select v-model="selectedRecordTournamentId">
                      <option v-for="tournament in filteredRecordTournamentOptions" :key="'record-select-' + tournament.id" :value="String(tournament.id)">
                        {{ tournament.tournamentDate }} · {{ tournament.name }} ({{ tournamentStatusLabel(tournament.status) }})
                      </option>
                    </select>
                  </div>
                </header>
                <p class="muted">검색 후 선택하면 자동으로 기록이 불러와집니다.</p>

                <div v-if="recordTournament" class="record-overview">
                  <div class="summary-row">
                    <strong>{{ recordTournament.name }}</strong>
                    <span>{{ recordTournament.tournamentDate }}</span>
                    <span>{{ tournamentTypeLabel(recordTournament.tournamentType) }}</span>
                    <span class="status-chip" :class="statusClass(recordTournament.status)">{{ tournamentStatusLabel(recordTournament.status) }}</span>
                  </div>
                  <div class="summary-stat-grid">
                    <div><strong>{{ recordTournament.participants.length }}</strong><small>참가자</small></div>
                    <div><strong>{{ recordTournament.matches.length }}</strong><small>경기수</small></div>
                    <div><strong>K {{ recordTournament.kFactor }}</strong><small>base {{ recordTournament.basePoints }}</small></div>
                  </div>
                </div>
                <p v-else class="empty-copy">조회할 대회를 선택하세요.</p>
              </article>

              <div v-if="recordTournament" class="panel-grid two">
                <article class="surface">
                  <h3>최종 반영 점수</h3>
                  <div class="table-shell">
                    <table class="data-table">
                      <thead>
                        <tr><th>선수</th><th>ELO 변동</th></tr>
                      </thead>
                      <tbody>
                        <tr v-for="event in recordTournament.ratingEvents" :key="'rating-' + event.playerId">
                          <td>{{ event.name }}</td>
                          <td>
                            <div class="elo-result-cell">
                              <span>{{ formatNum(event.eloBefore) }}</span>
                              <span :class="{ up: event.delta > 0, down: event.delta < 0 }">{{ formatSigned(event.delta) }}</span>
                              <strong>{{ formatNum(event.eloAfter) }}</strong>
                            </div>
                          </td>
                        </tr>
                        <tr v-if="!recordTournament.ratingEvents.length">
                          <td colspan="2" class="empty-row">점수 반영 데이터가 없습니다.</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </article>

                <article class="surface">
                  <h3>단식 스케줄 매트릭스</h3>
                  <div class="table-shell">
                    <table class="data-table matrix">
                      <thead>
                        <tr>
                          <th>선수</th>
                          <th v-for="name in recordMatrixPlayers" :key="'matrix-head-' + name">{{ name }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="row in recordMatrixRows" :key="'matrix-row-' + row.name">
                          <th>{{ row.name }}</th>
                          <td v-for="cell in row.cells" :key="'matrix-cell-' + row.name + '-' + cell.key">{{ cell.value || '-' }}</td>
                        </tr>
                        <tr v-if="!recordMatrixRows.length">
                          <td colspan="99" class="empty-row">단식 매트릭스 데이터가 없습니다.</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </article>
              </div>

              <article v-if="recordTournament" class="surface">
                <h3>경기 결과</h3>
                <div class="card-list">
                  <match-card
                    v-for="match in recordTournament.matches"
                    :key="'record-match-' + match.id"
                    :match="match"
                    :show-meta="false"
                  />
                  <p v-if="!recordTournament.matches.length" class="empty-copy">기록된 경기가 없습니다.</p>
                </div>
              </article>
            </section>

            <section v-show="activeTab === 'player'" class="panel-group">
              <article class="surface">
                <header class="surface-head">
                  <h3>선수별 기록</h3>
                  <div class="inline-form selector-form">
                    <input v-model.trim="ui.playerQuery" placeholder="선수 검색" />
                    <select v-model="selectedPlayerId">
                      <option v-for="player in filteredPlayersForSelector" :key="'player-select-' + player.id" :value="String(player.id)">{{ player.name }}</option>
                    </select>
                  </div>
                </header>
                <p class="muted">검색 후 선수를 선택하면 자동으로 기록이 불러와집니다.</p>
              </article>

              <article v-if="playerStats" class="surface">
                <h3>{{ playerStats.player.name }} 기록 요약</h3>
                <div class="summary-stat-grid player-summary">
                  <div><strong>{{ formatNum(playerStats.player.currentElo) }}</strong><small>ELO</small></div>
                  <div><strong>#{{ playerStats.player.rank }}</strong><small>현재 순위</small></div>
                  <div><strong>{{ playerStats.summary.wins }}승 {{ playerStats.summary.losses }}패</strong><small>전체 전적</small></div>
                  <div><strong>{{ playerStats.summary.winRate }}%</strong><small>전체 승률</small></div>
                  <div><strong>{{ playerStats.summary.singlesWinRate }}%</strong><small>단식 승률</small></div>
                  <div><strong>{{ playerStats.summary.doublesWinRate }}%</strong><small>복식 승률</small></div>
                </div>
              </article>

              <div v-if="playerStats" class="panel-grid two">
                <article class="surface">
                  <h3>경기 기록</h3>
                  <div class="card-list">
                    <match-card
                      v-for="match in playerMatchCards"
                      :key="'player-match-' + match.matchId"
                      :match="match"
                    />
                    <p v-if="!playerMatchCards.length" class="empty-copy">경기 데이터가 없습니다.</p>
                  </div>
                </article>

                <article class="surface">
                  <h3>상대 전적(단식)</h3>
                  <div class="table-shell">
                    <table class="data-table">
                      <thead>
                        <tr><th>상대</th><th>경기</th><th>승-패-무</th></tr>
                      </thead>
                      <tbody>
                        <tr v-for="opponent in playerStats.opponents" :key="'opponent-' + opponent.opponent">
                          <td>{{ opponent.opponent }}</td>
                          <td>{{ opponent.matches }}</td>
                          <td>{{ opponent.wins }}-{{ opponent.losses }}-{{ opponent.draws }}</td>
                        </tr>
                        <tr v-if="!playerStats.opponents.length">
                          <td colspan="3" class="empty-row">상대 전적 데이터가 없습니다.</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </article>
              </div>

              <article v-if="playerStats" class="surface">
                <h3>ELO 이력</h3>
                <div class="table-shell">
                  <table class="data-table">
                    <thead>
                      <tr><th>날짜</th><th>유형</th><th>K / base</th><th>점수 변동</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="event in playerStats.events" :key="'event-' + event.id">
                        <td>{{ event.eventDate }}</td>
                        <td>{{ event.eventType }}</td>
                        <td>{{ event.kFactor }} / {{ event.basePoints }}</td>
                        <td>
                          <div class="elo-result-cell">
                            <span>{{ formatNum(event.eloBefore) }}</span>
                            <span :class="{ up: event.delta > 0, down: event.delta < 0 }">{{ formatSigned(event.delta) }}</span>
                            <strong>{{ formatNum(event.eloAfter) }}</strong>
                          </div>
                        </td>
                      </tr>
                      <tr v-if="!playerStats.events.length">
                        <td colspan="4" class="empty-row">ELO 이벤트가 없습니다.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </article>
            </section>

            <section v-show="activeTab === 'stats'" class="panel-group">
              <article class="surface">
                <header class="surface-head">
                  <h3>전체 통계</h3>
                  <button type="button" class="btn ghost" @click="refreshStats">새로고침</button>
                </header>
                <div v-if="overview" class="summary-stat-grid">
                  <div><strong>{{ overview.summary.players }}</strong><small>활성 선수</small></div>
                  <div><strong>{{ overview.summary.finalizedTournaments }}</strong><small>종료 대회</small></div>
                  <div><strong>{{ overview.summary.openTournaments }}</strong><small>진행중 대회</small></div>
                  <div><strong>{{ overview.summary.finalizedMatches }}</strong><small>종료 경기</small></div>
                  <div><strong>{{ formatNum(overview.summary.avgElo) }}</strong><small>평균 ELO</small></div>
                </div>
              </article>

              <div class="panel-grid two" v-if="overview">
                <article class="surface">
                  <h3>상위 랭킹</h3>
                  <div class="table-shell">
                    <table class="data-table">
                      <thead>
                        <tr><th>순위</th><th>선수</th><th>ELO</th></tr>
                      </thead>
                      <tbody>
                        <tr v-for="player in overview.topPlayers.slice(0, 20)" :key="'top-' + player.id">
                          <td>#{{ player.rank }}</td>
                          <td>{{ player.name }}</td>
                          <td>{{ formatNum(player.currentElo) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </article>

                <article class="surface">
                  <h3>최근 대회</h3>
                  <div class="table-shell">
                    <table class="data-table">
                      <thead>
                        <tr><th>일자</th><th>대회명</th><th>타입</th><th>상태</th><th>경기</th></tr>
                      </thead>
                      <tbody>
                        <tr v-for="tournament in overview.recentTournaments" :key="'recent-tour-' + tournament.id">
                          <td>{{ tournament.tournamentDate }}</td>
                          <td>{{ tournament.name }}</td>
                          <td>{{ tournamentTypeLabel(tournament.tournamentType) }}</td>
                          <td>{{ tournamentStatusLabel(tournament.status) }}</td>
                          <td>{{ tournament.matchCount }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </article>
              </div>

              <article class="surface" v-if="overview">
                <h3>ELO 분포</h3>
                <div class="histogram">
                  <div v-for="row in histogramRows" :key="'hist-' + row.range" class="hist-row">
                    <label>{{ row.range }}</label>
                    <div class="bar-track"><span class="bar-fill" :style="{ width: row.ratio + '%' }"></span></div>
                    <strong>{{ row.count }}</strong>
                  </div>
                </div>
              </article>
            </section>

            <section v-show="activeTab === 'admin'" class="panel-group">
              <div class="panel-grid two">
                <article class="surface">
                  <h3>대회 타입 점수 규칙</h3>
                  <p class="muted">정규 대회 / 상시 대회 / 친선전의 K 값과 base 점수를 조정합니다.</p>
                  <div class="rule-grid">
                    <div v-for="rule in activeRules" :key="'admin-rule-' + rule.tournamentType" class="rule-card">
                      <strong>{{ rule.displayName }}</strong>
                      <label>K Factor
                        <input v-model.number="ruleDrafts[rule.tournamentType].kFactor" type="number" min="0" />
                      </label>
                      <label>Base Points
                        <input v-model.number="ruleDrafts[rule.tournamentType].basePoints" type="number" min="0" />
                      </label>
                      <button type="button" class="btn primary mini" @click="saveRule(rule.tournamentType)">저장</button>
                    </div>
                  </div>
                </article>

                <article class="surface">
                  <h3>선수 관리</h3>
                  <div class="stack-form">
                    <label>관리 대상
                      <select v-model="selectedAdminPlayerId">
                        <option v-for="player in adminPlayers" :key="'admin-select-' + player.id" :value="String(player.id)">
                          {{ player.name }} ({{ player.isActive ? '활성' : '비활성' }})
                        </option>
                      </select>
                    </label>

                    <div v-if="selectedAdminPlayer" class="admin-meta">
                      <strong>{{ selectedAdminPlayer.name }}</strong>
                      <span>ELO {{ formatNum(selectedAdminPlayer.currentElo) }}</span>
                      <span>상태: {{ selectedAdminPlayer.isActive ? '활성' : '비활성' }}</span>
                    </div>

                    <form class="inline-form" @submit.prevent="renameAdminPlayer">
                      <input v-model.trim="forms.adminRename" placeholder="새 선수 이름" />
                      <button type="submit" class="btn primary">이름 변경</button>
                    </form>

                    <form class="inline-form" @submit.prevent="adjustAdminElo">
                      <input v-model.number="forms.adminElo" type="number" min="0" placeholder="새 ELO" />
                      <button type="submit" class="btn ghost">점수 조정</button>
                    </form>

                    <button type="button" class="btn danger" @click="deleteAdminPlayer">선수 삭제(비활성화)</button>
                  </div>
                </article>
              </div>

              <article class="surface">
                <header class="surface-head">
                  <h3>선수 현황</h3>
                  <div class="inline-form">
                    <input v-model.trim="ui.adminQuery" placeholder="선수 이름 검색" />
                    <select v-model="ui.adminStatus">
                      <option value="ALL">전체 상태</option>
                      <option value="ACTIVE">활성</option>
                      <option value="INACTIVE">비활성</option>
                    </select>
                  </div>
                </header>

                <div class="table-shell">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>선수</th>
                        <th>ELO / 점수</th>
                        <th>상태</th>
                        <th>진행중 대회</th>
                        <th>누적 경기</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="player in filteredAdminPlayers" :key="'admin-table-' + player.id">
                        <td>{{ player.name }}</td>
                        <td>
                          <div class="elo-cell">
                            <strong>{{ formatNum(player.currentElo) }}</strong>
                            <small>ELO</small>
                          </div>
                        </td>
                        <td>
                          <span class="status-chip" :class="player.isActive ? 'active' : 'inactive'">{{ player.isActive ? '활성' : '비활성' }}</span>
                        </td>
                        <td>{{ player.inOpenTournament ? '예' : '아니오' }}</td>
                        <td>{{ player.matchCount }}</td>
                      </tr>
                      <tr v-if="!filteredAdminPlayers.length">
                        <td colspan="5" class="empty-row">검색 결과가 없습니다.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
          </main>
        </div>
      </div>

      <div
        v-if="modals.tournamentSettings && openTournament"
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        @click.self="closeTournamentSettingsModal"
      >
        <div class="modal-card">
          <header class="modal-head">
            <h3>대회 설정 변경</h3>
            <button type="button" class="modal-close" @click="closeTournamentSettingsModal">닫기</button>
          </header>

          <form class="stack-form modal-body" @submit.prevent="submitTournamentSettings">
            <label>대회명
              <input v-model.trim="forms.tournamentEditName" required />
            </label>
            <label>대회일자
              <input v-model="forms.tournamentEditDate" type="date" required />
            </label>
            <label>대회종류
              <select v-model="forms.tournamentEditType" :disabled="openTournament.matches.length > 0">
                <option v-for="rule in activeRules" :key="'edit-type-' + rule.tournamentType" :value="rule.tournamentType">
                  {{ rule.displayName }}
                </option>
              </select>
            </label>
            <p v-if="openTournament.matches.length > 0" class="muted">이미 경기 기록이 있어 대회 종류는 변경할 수 없습니다.</p>

            <div class="modal-actions">
              <button type="button" class="btn ghost" @click="closeTournamentSettingsModal">취소</button>
              <button type="submit" class="btn primary">저장</button>
            </div>
          </form>
        </div>
      </div>

      <div
        v-if="modals.matchEntry && openTournament"
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        @click.self="closeMatchEntryModal"
      >
        <div class="modal-card wide">
          <header class="modal-head">
            <h3>경기 결과 입력</h3>
            <button type="button" class="modal-close" @click="closeMatchEntryModal">닫기</button>
          </header>

          <form class="modal-body" @submit.prevent="submitMatch">
            <div class="format-switch">
              <span>형식</span>
              <div class="switch-toggle">
                <button type="button" :class="{ active: forms.matchFormat === 'SINGLES' }" @click="setMatchFormat('SINGLES')">단식</button>
                <button type="button" :class="{ active: forms.matchFormat === 'DOUBLES' }" @click="setMatchFormat('DOUBLES')">복식</button>
              </div>
            </div>

            <div class="match-entry-grid">
              <section class="team-entry team-a">
                <h4>팀 A</h4>
                <label>선수 1
                  <select v-model="forms.matchA1">
                    <option value="">선수 선택</option>
                    <option v-for="player in openTournamentParticipants" :key="'modal-match-a1-' + player.playerId" :value="String(player.playerId)">
                      {{ player.name }} ({{ formatNum(player.projectedElo) }})
                    </option>
                  </select>
                </label>
                <label v-if="forms.matchFormat === 'DOUBLES'">선수 2
                  <select v-model="forms.matchA2">
                    <option value="">선수 선택</option>
                    <option v-for="player in openTournamentParticipants" :key="'modal-match-a2-' + player.playerId" :value="String(player.playerId)">
                      {{ player.name }} ({{ formatNum(player.projectedElo) }})
                    </option>
                  </select>
                </label>
                <label class="score-field">점수
                  <input v-model.number="forms.matchScoreA" type="number" min="0" />
                </label>
              </section>

              <section class="team-entry team-b">
                <h4>팀 B</h4>
                <label>선수 1
                  <select v-model="forms.matchB1">
                    <option value="">선수 선택</option>
                    <option v-for="player in openTournamentParticipants" :key="'modal-match-b1-' + player.playerId" :value="String(player.playerId)">
                      {{ player.name }} ({{ formatNum(player.projectedElo) }})
                    </option>
                  </select>
                </label>
                <label v-if="forms.matchFormat === 'DOUBLES'">선수 2
                  <select v-model="forms.matchB2">
                    <option value="">선수 선택</option>
                    <option v-for="player in openTournamentParticipants" :key="'modal-match-b2-' + player.playerId" :value="String(player.playerId)">
                      {{ player.name }} ({{ formatNum(player.projectedElo) }})
                    </option>
                  </select>
                </label>
                <label class="score-field">점수
                  <input v-model.number="forms.matchScoreB" type="number" min="0" />
                </label>
              </section>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn ghost" @click="closeMatchEntryModal">취소</button>
              <button type="submit" class="btn primary">경기 추가</button>
            </div>
          </form>
        </div>
      </div>

      <div class="loading-overlay" :class="{ show: isLoading }" role="status" aria-live="polite" :aria-hidden="!isLoading">
        <div class="loading-card">
          <div class="spinner" aria-hidden="true"></div>
          <strong>{{ loading.message }}</strong>
          <p>잠시만 기다려주세요.</p>
        </div>
      </div>

      <div class="toast" :class="{ show: toast.visible, error: toast.error }">{{ toast.message }}</div>
    </div>
  `,
});

app.mount("#app");
