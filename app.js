import { createApp } from "https://unpkg.com/vue@3.5.13/dist/vue.esm-browser.prod.js";
import Chart from "https://cdn.jsdelivr.net/npm/chart.js@4.5.0/auto/+esm";

const TABS = [
  { id: "dashboard", label: "????뺣궖??, desc: "??沅?夷?筌ㅼ뮄??野껋럡由? },
  { id: "tournament", label: "????筌욊쑵六?, desc: "筌〓㈇???夷?野껋럡由?疫꿸퀡以? },
  { id: "records", label: "????疫꿸퀡以?, desc: "?ル굝利??????귐뗫７?? },
  { id: "player", label: "?醫롫땾癰?疫꿸퀡以?, desc: "?袁⑹읅 夷?ELO ???? },
  { id: "stats", label: "????, desc: "?袁⑷퍥 ?브쑵猷?夷??遺용튋" },
  { id: "admin", label: "?온??, desc: "?醫롫땾 夷?域뱀뮇??鈺곌퀣?? },
];

const DEFAULT_RULES = [
  { tournamentType: "REGULAR", displayName: "?類?뇣 ????, kFactor: 200, basePoints: 4 },
  { tournamentType: "ADHOC", displayName: "?怨몃뻻 ????, kFactor: 100, basePoints: 1 },
  { tournamentType: "FRIENDLY", displayName: "燁살뮇苑??, kFactor: 0, basePoints: 0 },
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
  return format === "DOUBLES" ? "癰귣벊?? : "??λ뻼";
}

function tournamentStatusLabel(status) {
  if (status === "OPEN") return "筌욊쑵六얌빳?;
  if (status === "FINALIZED") return "?ル굝利?;
  if (status === "CANCELED") return "?띯뫁??;
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
    throw new Error("API ?臾먮뼗 ?類ㅻ뻼 ??살첒: Pages Functions ??깆뒭??놁뱽 ?類ㅼ뵥??뤾쉭??");
  }

  const data = await res.json().catch(() => null);
  if (!data || data.ok !== true) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

function normalizePlayer(row) {
  const matchCount = toInt(row?.matchCount);
  const wins = toInt(row?.wins);
  const losses = toInt(row?.losses);
  const draws = toInt(row?.draws);
  const winRate = row?.winRate == null ? (matchCount ? Math.round((wins / matchCount) * 100) : 0) : toInt(row?.winRate);

  return {
    id: toInt(row?.id),
    name: String(row?.name || ""),
    currentElo: toInt(row?.currentElo),
    rank: toInt(row?.rank),
    matchCount,
    wins,
    losses,
    draws,
    winRate,
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
    teamAName: row?.teamAName || row?.myTeamName || "?? A",
    teamBName: row?.teamBName || row?.opponentTeamName || "?? B",
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
      totalTournaments: toInt(raw.summary?.totalTournaments),
      totalMatches: toInt(raw.summary?.totalMatches),
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
    linkableTournament: { type: Boolean, default: false },
    showPlayerLinks: { type: Boolean, default: false },
  },
  emits: ["delete", "open-tournament", "open-player"],
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
    formatClass() {
      return String(this.match?.matchFormat || "SINGLES").toUpperCase() === "DOUBLES" ? "format-doubles" : "format-singles";
    },
    tournamentTypeText() {
      if (this.typeLabel) return this.typeLabel;
      const raw = String(this.match?.tournamentType || "").toUpperCase();
      if (raw === "REGULAR") return "정규";
      if (raw === "ADHOC") return "상시";
      if (raw === "FRIENDLY") return "친선";
      return "-";
    },
    tournamentTitle() {
      return String(this.match?.tournamentName || "").trim() || "Tournament";
    },
    isTournamentLinkable() {
      return this.linkableTournament && toInt(this.match?.tournamentId, 0) > 0;
    },
    teamAPlayers() {
      return this.splitTeamNames(this.match?.teamAName);
    },
    teamBPlayers() {
      return this.splitTeamNames(this.match?.teamBName);
    },
  },
  methods: {
    toInt,
    matchFormatLabel,
    deltaDirection(value) {
      const n = Number(value || 0);
      if (n > 0) return "up";
      if (n < 0) return "down";
      return "flat";
    },
    formatDeltaTag(value) {
      const n = Number(value || 0);
      if (n === 0) return "0";
      return `${n > 0 ? "+" : "-"}${Math.abs(n)}`;
    },
    splitTeamNames(raw) {
      return String(raw || "")
        .split("/")
        .map((name) => name.trim())
        .filter(Boolean);
    },
    openTournament() {
      const tournamentId = toInt(this.match?.tournamentId, 0);
      if (tournamentId > 0) {
        this.$emit("open-tournament", tournamentId);
      }
    },
    openPlayer(name) {
      const playerName = String(name || "").trim();
      if (playerName) {
        this.$emit("open-player", playerName);
      }
    },
  },
  template: `
    <article class="match-card" :class="[cardClass, formatClass]">
      <header class="match-card-head">
        <div class="match-head-top">
          <div class="match-head-left">
            <span class="match-order">
              <span v-if="match.matchOrder != null">#{{ match.matchOrder }}</span>
              <small class="order-type">{{ tournamentTypeText }}</small>
            </span>
            <button
              v-if="isTournamentLinkable"
              type="button"
              class="inline-link match-format match-format-link"
              @click="openTournament"
            >{{ tournamentTitle }}</button>
            <span v-else class="match-format">{{ tournamentTitle }}</span>
          </div>
          <div class="match-head-right">
            <span class="match-date">{{ match.tournamentDate || "-" }}</span>
            <button v-if="deletable" type="button" class="btn danger mini" @click="$emit('delete')">Delete</button>
          </div>
        </div>

        <div v-if="showMeta" class="match-meta-line">
          <span class="meta-pill">{{ matchFormatLabel(match.matchFormat) }}</span>
          <span class="meta-dot">&middot;</span>
          <span>Score Result</span>
        </div>
      </header>

      <div class="match-body">
        <div class="team-row" :class="{ winner: winnerSide === 'A', loser: winnerSide === 'B' }">
          <div class="team-main">
            <span class="team-side">A</span>
            <div class="team-stack">
              <div class="team-name">
                <template v-if="showPlayerLinks">
                  <template v-for="(name, idx) in teamAPlayers" :key="'a-' + name + '-' + idx">
                    <button type="button" class="inline-link team-link" @click="openPlayer(name)">{{ name }}</button>
                    <span v-if="idx < teamAPlayers.length - 1" class="team-sep">/</span>
                  </template>
                </template>
                <template v-else>{{ match.teamAName }}</template>
              </div>
              <small class="team-delta" :class="deltaDirection(match.deltaTeamA)">{{ formatDeltaTag(match.deltaTeamA) }}</small>
            </div>
          </div>
          <div class="team-score">{{ match.scoreA }}</div>
        </div>

        <div class="team-row" :class="{ winner: winnerSide === 'B', loser: winnerSide === 'A' }">
          <div class="team-main">
            <span class="team-side">B</span>
            <div class="team-stack">
              <div class="team-name">
                <template v-if="showPlayerLinks">
                  <template v-for="(name, idx) in teamBPlayers" :key="'b-' + name + '-' + idx">
                    <button type="button" class="inline-link team-link" @click="openPlayer(name)">{{ name }}</button>
                    <span v-if="idx < teamBPlayers.length - 1" class="team-sep">/</span>
                  </template>
                </template>
                <template v-else>{{ match.teamBName }}</template>
              </div>
              <small class="team-delta" :class="deltaDirection(match.deltaTeamB)">{{ formatDeltaTag(match.deltaTeamB) }}</small>
            </div>
          </div>
          <div class="team-score">{{ match.scoreB }}</div>
        </div>
      </div>
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
        message: "?怨쀬뵠?怨? ??녿┛?酉釉??餓?..",
      },
      toast: {
        visible: false,
        error: false,
        message: "",
        timer: null,
      },
      health: {
        ok: null,
        text: "API ?類ㅼ뵥 餓?..",
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
        tournamentEditParticipantQuery: "",
        tournamentEditParticipantIds: [],
        recordQuery: "",
        playerQuery: "",
        adminQuery: "",
        adminStatus: "ALL",
        isMobile: typeof window !== "undefined" ? window.matchMedia("(max-width: 1024px)").matches : false,
        desktopSidebarOpen: true,
        mobileSidebarOpen: false,
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
        playerMatches: false,
        eloSimulator: false,
      },

      charts: {
        playerStats: null,
        playerElo: null,
      },

      simResult: null,
    };
  },  computed: {
    isLoading() {
      return this.loading.count > 0;
    },

    isSidebarOpen() {
      return this.ui.isMobile ? this.ui.mobileSidebarOpen : this.ui.desktopSidebarOpen;
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
      const players = toInt(this.overview?.summary?.players, this.players.length);
      const totalMatches = toInt(this.overview?.summary?.totalMatches, toInt(this.overview?.summary?.finalizedMatches));
      const totalTournaments = toInt(this.overview?.summary?.totalTournaments, this.tournaments.length);
      const avgElo = toInt(this.overview?.summary?.avgElo);
      return [
        { label: "Total Players", value: players, help: "Active players" },
        { label: "Total Matches", value: totalMatches, help: "Excludes canceled events" },
        { label: "Total Tournaments", value: totalTournaments, help: "All tournaments" },
        { label: "Avg Rating", value: formatNum(avgElo), help: "Average active ELO" },
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

    dashboardRecentMatches() {
      return this.filteredRecentMatches.slice(0, 4);
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

    filteredTournamentEditParticipantPool() {
      const query = normalizeSearch(this.ui.tournamentEditParticipantQuery);
      if (!query) return this.participantPool;
      return this.participantPool.filter((player) => normalizeSearch(player.name).includes(query));
    },

    selectedTournamentEditParticipants() {
      const set = new Set(this.ui.tournamentEditParticipantIds.map((id) => toInt(id)).filter((id) => id > 0));
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

    playerRecentMatches() {
      return this.playerMatchCards.slice(0, 5);
    },

    hasMorePlayerMatches() {
      return this.playerMatchCards.length > 5;
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

    rankMedal(rank) {
      const n = toInt(rank, 0);
      if (n === 1) return "?履?;
      if (n === 2) return "?履?;
      if (n === 3) return "?履?;
      return "";
    },

    syncSidebarMode() {
      const mobile = window.matchMedia("(max-width: 1024px)").matches;
      if (this.ui.isMobile === mobile) return;
      this.ui.isMobile = mobile;
      if (mobile) {
        this.ui.mobileSidebarOpen = false;
      } else {
        this.ui.mobileSidebarOpen = false;
      }
    },

    toggleSidebar() {
      if (this.ui.isMobile) {
        this.ui.mobileSidebarOpen = !this.ui.mobileSidebarOpen;
      } else {
        this.ui.desktopSidebarOpen = !this.ui.desktopSidebarOpen;
      }
    },

    closeSidebar() {
      if (this.ui.isMobile) {
        this.ui.mobileSidebarOpen = false;
      } else {
        this.ui.desktopSidebarOpen = false;
      }
    },

    setActiveTab(tabId) {
      this.activeTab = tabId;
      if (this.ui.isMobile) {
        this.ui.mobileSidebarOpen = false;
      }
    },

    findPlayerByName(name) {
      const target = normalizeSearch(name);
      if (!target) return null;
      return this.players.find((player) => normalizeSearch(player.name) === target) || null;
    },

    jumpToPlayerById(playerId) {
      const id = toInt(playerId, 0);
      if (id <= 0) return;
      this.selectedPlayerId = String(id);
      this.activeTab = "player";
    },

    jumpToPlayerByName(playerName) {
      const player = this.findPlayerByName(playerName);
      if (!player) {
        this.showToast(`?醫롫땾??筌≪뼚??????곷뮸??덈뼄: ${playerName}`, true);
        return;
      }
      this.jumpToPlayerById(player.id);
    },

    jumpToTournamentById(tournamentId) {
      const id = toInt(tournamentId, 0);
      if (id <= 0) return;
      this.selectedRecordTournamentId = String(id);
      this.activeTab = "records";
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

    setLoading(enabled, message = "?怨쀬뵠?怨? ??녿┛?酉釉??餓?..") {
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
        this.health.text = "API ?類ㅺ맒";
      } catch (error) {
        this.health.ok = false;
        this.health.text = "API ??살첒";
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
      this.ui.tournamentEditParticipantIds = this.ui.tournamentEditParticipantIds
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

    isTournamentEditParticipantSelected(playerId) {
      return this.ui.tournamentEditParticipantIds.map((id) => toInt(id)).includes(toInt(playerId));
    },

    toggleTournamentEditParticipant(playerId) {
      const id = toInt(playerId);
      if (id <= 0) return;
      if (this.isTournamentEditParticipantSelected(id)) {
        this.ui.tournamentEditParticipantIds = this.ui.tournamentEditParticipantIds.filter((pickedId) => toInt(pickedId) !== id);
        return;
      }
      this.ui.tournamentEditParticipantIds = [...this.ui.tournamentEditParticipantIds.map((pickedId) => toInt(pickedId)), id];
    },

    clearTournamentEditParticipantSelection() {
      this.ui.tournamentEditParticipantIds = [];
    },

    selectAllTournamentEditParticipants() {
      this.ui.tournamentEditParticipantIds = this.participantPool.map((player) => toInt(player.id));
    },

    addFirstSearchedTournamentEditParticipant() {
      const target = this.filteredTournamentEditParticipantPool.find((player) => !this.isTournamentEditParticipantSelected(player.id));
      if (target) {
        this.toggleTournamentEditParticipant(target.id);
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
      this.ui.tournamentEditParticipantIds = (this.openTournament.participants || [])
        .map((player) => toInt(player.playerId))
        .filter((id) => id > 0);
      this.ui.tournamentEditParticipantQuery = "";
      this.modals.tournamentSettings = true;
    },

    closeTournamentSettingsModal() {
      this.modals.tournamentSettings = false;
    },

    openPlayerMatchesModal() {
      if (!this.playerMatchCards.length) return;
      this.modals.playerMatches = true;
    },

    closePlayerMatchesModal() {
      this.modals.playerMatches = false;
    },

    openEloSimulatorModal() {
      this.simResult = null;
      this.modals.eloSimulator = true;
    },

    closeEloSimulatorModal() {
      this.modals.eloSimulator = false;
    },
    destroyPlayerStatsChart() {
      if (this.charts.playerStats) {
        this.charts.playerStats.destroy();
        this.charts.playerStats = null;
      }
    },

    destroyPlayerEloChart() {
      if (this.charts.playerElo) {
        this.charts.playerElo.destroy();
        this.charts.playerElo = null;
      }
    },

    destroyPlayerCharts() {
      this.destroyPlayerStatsChart();
      this.destroyPlayerEloChart();
    },

    renderPlayerStatsChart() {
      const canvas = this.$refs.playerStatsChart;
      if (!canvas || !this.playerStats?.summary) {
        this.destroyPlayerStatsChart();
        return;
      }

      const summary = this.playerStats.summary;
      const labels = ["Total", "Singles", "Doubles"];
      const total = toInt(summary.total);
      const singlesTotal = toInt(summary.singlesTotal);
      const doublesTotal = toInt(summary.doublesTotal);
      const matchCounts = [total, singlesTotal, doublesTotal];
      const winRates = [
        total > 0 ? toInt(summary.winRate) : null,
        singlesTotal > 0 ? toInt(summary.singlesWinRate) : null,
        doublesTotal > 0 ? toInt(summary.doublesWinRate) : null,
      ];

      this.destroyPlayerStatsChart();
      this.charts.playerStats = new Chart(canvas, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              type: "bar",
              label: "Matches",
              data: matchCounts,
              yAxisID: "y",
              borderRadius: 8,
              backgroundColor: ["#5f95ff", "#6bc7a0", "#f2b46c"],
            },
            {
              type: "line",
              label: "Win Rate (%)",
              data: winRates,
              yAxisID: "y1",
              tension: 0.32,
              borderColor: "#2f3d52",
              backgroundColor: "rgba(47, 61, 82, 0.18)",
              pointRadius: 4,
              pointHoverRadius: 5,
              fill: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { position: "top" },
            tooltip: { padding: 10 },
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: "Matches" },
              ticks: { precision: 0 },
              grid: { color: "rgba(64, 92, 130, 0.16)" },
            },
            y1: {
              beginAtZero: true,
              min: 0,
              max: 100,
              position: "right",
              title: { display: true, text: "Win Rate (%)" },
              grid: { drawOnChartArea: false },
            },
            x: {
              grid: { color: "rgba(64, 92, 130, 0.1)" },
            },
          },
        },
      });
    },

    renderPlayerEloChart() {
      const canvas = this.$refs.playerEloChart;
      const events = Array.isArray(this.playerStats?.events) ? this.playerStats.events : [];
      if (!canvas || !events.length) {
        this.destroyPlayerEloChart();
        return;
      }

      const labels = events.map((event, index) => {
        const date = String(event?.eventDate || "-");
        const type = String(event?.eventType || "EVENT").toUpperCase();
        const token = type === "REGISTER" ? "R" : type === "TOURNAMENT" ? "T" : type === "ADJUSTMENT" ? "A" : "E";
        return `${date} - ${token}${index + 1}`;
      });
      const eloAfter = events.map((event) => toInt(event?.eloAfter));
      const deltas = events.map((event) => toInt(event?.delta));
      const deltaColors = deltas.map((delta) =>
        delta > 0 ? "rgba(18, 181, 141, 0.58)" : delta < 0 ? "rgba(214, 67, 97, 0.56)" : "rgba(122, 138, 158, 0.44)"
      );
      const maxAbsDelta = Math.max(10, ...deltas.map((delta) => Math.abs(delta)));

      this.destroyPlayerEloChart();
      this.charts.playerElo = new Chart(canvas, {
        data: {
          labels,
          datasets: [
            {
              type: "line",
              label: "ELO",
              data: eloAfter,
              yAxisID: "y",
              borderColor: "#1f6fff",
              backgroundColor: "rgba(31, 111, 255, 0.16)",
              pointRadius: 3.5,
              pointHoverRadius: 5,
              pointBackgroundColor: "#1f6fff",
              tension: 0.28,
              fill: true,
            },
            {
              type: "bar",
              label: "Delta",
              data: deltas,
              yAxisID: "y1",
              borderRadius: 6,
              backgroundColor: deltaColors,
              borderColor: deltaColors,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { position: "top" },
            tooltip: { padding: 10 },
          },
          scales: {
            y: {
              title: { display: true, text: "ELO" },
              grid: { color: "rgba(64, 92, 130, 0.14)" },
            },
            y1: {
              title: { display: true, text: "Delta" },
              position: "right",
              min: -maxAbsDelta,
              max: maxAbsDelta,
              grid: { drawOnChartArea: false },
            },
            x: {
              ticks: { maxRotation: 35, minRotation: 35 },
              grid: { color: "rgba(64, 92, 130, 0.08)" },
            },
          },
        },
      });
    },

    schedulePlayerChartsRender() {
      if (this.activeTab !== "player") return;
      this.$nextTick(() => {
        const scheduleFrame = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb) => setTimeout(cb, 0);
        scheduleFrame(() => {
          this.renderPlayerStatsChart();
          this.renderPlayerEloChart();
        });
      });
    },

    async submitTournamentSettings() {
      if (!this.openTournament) return;

      const name = String(this.forms.tournamentEditName || "").trim();
      const tournamentDate = this.forms.tournamentEditDate;
      const tournamentType = this.forms.tournamentEditType;
      const participantIds = [...new Set(this.ui.tournamentEditParticipantIds.map((id) => toInt(id)).filter((id) => id > 0))];

      if (!name) {
        this.showToast("?????구????낆젾??뤾쉭??", true);
        return;
      }

      const payload = {};
      if (name !== this.openTournament.name) payload.name = name;
      if (tournamentDate && tournamentDate !== this.openTournament.tournamentDate) payload.tournamentDate = tournamentDate;
      if (tournamentType && tournamentType !== this.openTournament.tournamentType) {
        if ((this.openTournament.matches || []).length > 0) {
          this.showToast("野껋럡由?疫꿸퀡以????됱몵筌??????ル굝履잏몴?獄쏅떽? ????곷뮸??덈뼄.", true);
          return;
        }
        payload.tournamentType = tournamentType;
      }

      const currentParticipantIds = [...new Set((this.openTournament.participants || []).map((player) => toInt(player.playerId)).filter((id) => id > 0))];
      const currentSet = new Set(currentParticipantIds);
      const sameParticipants =
        participantIds.length === currentParticipantIds.length && participantIds.every((id) => currentSet.has(id));

      if (!sameParticipants) {
        if (participantIds.length < 2) {
          this.showToast("筌〓㈇??癒?뮉 筌ㅼ뮇??2筌???곴맒 ?醫뤾문??곷튊 ??몃빍??", true);
          return;
        }
        payload.participantIds = participantIds;
      }

      if (!Object.keys(payload).length) {
        this.modals.tournamentSettings = false;
        this.showToast("癰궰野껋럥留???곸뒠????곷뮸??덈뼄.");
        return;
      }

      try {
        await this.withLoading("??????쇱젟?????館釉??餓?..", async () => {
          await requestApi(`/api/tournaments/${this.openTournament.id}`, "PATCH", payload);
          await Promise.all([this.refreshBootstrap(), this.refreshTournaments()]);
          this.lastSyncedAt = new Date().toISOString();
        });
        this.modals.tournamentSettings = false;
        this.showToast("??????쇱젟?????貫由??됰뮸??덈뼄.");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "??????쇱젟 ??????쎈솭", true);
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
    },    async refreshAll(message = "?袁⑷퍥 ?怨쀬뵠?怨? ??녿┛?酉釉??餓?..") {
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
        this.showToast(error instanceof Error ? error.message : "?怨쀬뵠????녿┛????쎈솭", true);
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
          throw new Error("ELO??1 ??곴맒????ъ쁽??鍮???몃빍??");
        }
        if (!Number.isFinite(aScore) || !Number.isFinite(bScore) || aScore < 0 || bScore < 0 || aScore + bScore <= 0) {
          throw new Error("?癒?땾?????땾揶쎛 ?袁⑤빍??곷튊 ??렽???뱀뵠 1 ??곴맒??곷선????몃빍??");
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
        this.showToast(error instanceof Error ? error.message : "?????됱뵠????쎈솭", true);
      }
    },

    async submitPlayer() {
      const name = String(this.forms.playerName || "").trim();
      if (!name) {
        this.showToast("?醫롫땾 ??已????낆젾??뤾쉭??", true);
        return;
      }

      try {
        await this.withLoading("?醫롫땾???源낆쨯??롫뮉 餓?..", async () => {
          await requestApi("/api/players", "POST", { name });
          this.forms.playerName = "";
          await Promise.all([this.refreshBootstrap(), this.refreshAdminPlayers(), this.refreshOverview()]);
          this.lastSyncedAt = new Date().toISOString();
        });
        this.showToast("?醫롫땾???源낆쨯??됰뮸??덈뼄.");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "?醫롫땾 ?源낆쨯 ??쎈솭", true);
      }
    },

    async submitTournament() {
      const name = String(this.forms.tournamentName || "").trim();
      if (!name) {
        this.showToast("?????구????낆젾??뤾쉭??", true);
        return;
      }

      const participantIds = [...new Set(this.ui.participantIds.map((id) => toInt(id)).filter((id) => id > 0))];
      if (participantIds.length < 2) {
        this.showToast("筌〓㈇??癒?뮉 筌ㅼ뮇??2筌???곴맒 ?醫뤾문??곷튊 ??몃빍??", true);
        return;
      }

      try {
        await this.withLoading("????? ??밴쉐??롫뮉 餓?..", async () => {
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
        this.showToast("????? ??뽰삂??됰뮸??덈뼄.");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "??????밴쉐 ??쎈솭", true);
      }
    },

    buildMatchPayload() {
      if (!this.openTournament) throw new Error("筌욊쑵六?餓?????? ??곷뮸??덈뼄.");

      const matchFormat = this.forms.matchFormat === "DOUBLES" ? "DOUBLES" : "SINGLES";
      const scoreA = toInt(this.forms.matchScoreA, -1);
      const scoreB = toInt(this.forms.matchScoreB, -1);

      if (scoreA < 0 || scoreB < 0 || scoreA + scoreB <= 0) {
        throw new Error("?癒?땾??0 ??곴맒??곷선????렽???뱀뵠 1 ??곴맒??곷선????몃빍??");
      }

      const teamAPlayer1Id = toInt(this.forms.matchA1, -1);
      const teamBPlayer1Id = toInt(this.forms.matchB1, -1);
      if (teamAPlayer1Id <= 0 || teamBPlayer1Id <= 0) {
        throw new Error("?? A/B???醫롫땾 1???醫뤾문??뤾쉭??");
      }

      let teamAPlayer2Id = null;
      let teamBPlayer2Id = null;
      if (matchFormat === "DOUBLES") {
        teamAPlayer2Id = toInt(this.forms.matchA2, -1);
        teamBPlayer2Id = toInt(this.forms.matchB2, -1);
        if (teamAPlayer2Id <= 0 || teamBPlayer2Id <= 0) {
          throw new Error("癰귣벊??? ??癰??醫롫땾 2??筌뤴뫀紐??醫뤾문??곷튊 ??몃빍??");
        }
      }

      const picked = [teamAPlayer1Id, teamAPlayer2Id, teamBPlayer1Id, teamBPlayer2Id].filter((id) => id != null);
      const unique = new Set(picked);
      if (unique.size !== picked.length) {
        throw new Error("??野껋럡由?癒?퐣 ??덉뵬 ?醫롫땾??餓λ쵎???醫뤾문??????곷뮸??덈뼄.");
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
        await this.withLoading("野껋럡由?野껉퀗?든몴????館釉??餓?..", async () => {
          await requestApi(`/api/tournaments/${this.openTournament.id}/matches`, "POST", payload);
          await this.refreshBootstrap();
          this.lastSyncedAt = new Date().toISOString();
        });
        this.modals.matchEntry = false;
        this.showToast("野껋럡由?野껉퀗?든몴?疫꿸퀡以??됰뮸??덈뼄.");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "野껋럡由?疫꿸퀡以???쎈솭", true);
      }
    },

    async deleteMatch(matchId) {
      if (!this.openTournament) return;
      if (!window.confirm("??野껋럡由곁몴?????醫됲돱??")) return;

      try {
        await this.withLoading("野껋럡由곁몴??????롫뮉 餓?..", async () => {
          await requestApi(`/api/tournaments/${this.openTournament.id}/matches/${matchId}`, "DELETE");
          await this.refreshBootstrap();
          this.lastSyncedAt = new Date().toISOString();
        });
        this.showToast("野껋럡由곁몴??????됰뮸??덈뼄.");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "野껋럡由???????쎈솭", true);
      }
    },

    async finalizeTournament() {
      if (!this.openTournament) return;
      if (!window.confirm("????? ?ル굝利??랁?ELO??獄쏆꼷??醫됲돱??")) return;

      try {
        await this.withLoading("????? ?ル굝利??롫뮉 餓?..", async () => {
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
        this.showToast("????? ?ル굝利??랁??癒?땾??獄쏆꼷???됰뮸??덈뼄.");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "?????ル굝利???쎈솭", true);
      }
    },

    async cancelTournament() {
      if (!this.openTournament) return;
      if (!window.confirm("筌욊쑵六?餓λ쵐??????? ?띯뫁??醫됲돱??")) return;

      try {
        await this.withLoading("????? ?띯뫁???롫뮉 餓?..", async () => {
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
        this.showToast("????? ?띯뫁???됰뮸??덈뼄.");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "?????띯뫁????쎈솭", true);
      }
    },

    async loadRecordBySelection() {
      const tournamentId = toInt(this.selectedRecordTournamentId);
      if (tournamentId <= 0) {
        this.recordTournament = null;
        return;
      }

      try {
        await this.withLoading("????疫꿸퀡以???븍뜄???삳뮉 餓?..", async () => {
          const data = await requestApi(`/api/tournaments/${tournamentId}/report`);
          this.recordTournament = normalizeTournamentDetail(data.tournament);
        });
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "????疫꿸퀡以?鈺곌퀬????쎈솭", true);
      }
    },

    async loadPlayerBySelection() {
      const playerId = toInt(this.selectedPlayerId);
      if (playerId <= 0) {
        this.playerStats = null;
        return;
      }

      try {
        await this.withLoading("?醫롫땾 疫꿸퀡以???븍뜄???삳뮉 餓?..", async () => {
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
          this.schedulePlayerChartsRender();
        });
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "?醫롫땾 疫꿸퀡以?鈺곌퀬????쎈솭", true);
      }
    },

    async refreshStats() {
      try {
        await this.withLoading("???롧몴?揶쏄퉮???롫뮉 餓?..", async () => {
          await this.refreshOverview();
          this.lastSyncedAt = new Date().toISOString();
        });
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "????揶쏄퉮????쎈솭", true);
      }
    },

    async saveRule(tournamentType) {
      const draft = this.ruleDrafts[tournamentType];
      if (!draft) return;

      const kFactor = toInt(draft.kFactor, -1);
      const basePoints = toInt(draft.basePoints, -1);
      if (kFactor < 0 || basePoints < 0) {
        this.showToast("K揶쏅???base ?癒?땾??0 ??곴맒??곷선????몃빍??", true);
        return;
      }

      try {
        await this.withLoading("????域뱀뮇??????館釉??餓?..", async () => {
          const data = await requestApi(`/api/settings/tournament-rules/${tournamentType}`, "PATCH", {
            kFactor,
            basePoints,
          });
          this.applyRuleList(data.tournamentRules);
          this.lastSyncedAt = new Date().toISOString();
        });
        this.showToast("域뱀뮇??????館六??щ빍??");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "域뱀뮇????????쎈솭", true);
      }
    },

    async renameAdminPlayer() {
      if (!this.selectedAdminPlayer) {
        this.showToast("?온?귐뗫막 ?醫롫땾???醫뤾문??뤾쉭??", true);
        return;
      }
      const name = String(this.forms.adminRename || "").trim();
      if (!name) {
        this.showToast("癰궰野껋?釉???已????낆젾??뤾쉭??", true);
        return;
      }

      try {
        await this.withLoading("?醫롫땾 ??已??癰궰野껋?釉??餓?..", async () => {
          await requestApi(`/api/admin/players/${this.selectedAdminPlayer.id}`, "PATCH", { name });
          await Promise.all([this.refreshBootstrap(), this.refreshAdminPlayers(), this.refreshOverview()]);
          this.lastSyncedAt = new Date().toISOString();
        });
        this.showToast("?醫롫땾 ??已??癰궰野껋?六??щ빍??");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "??已?癰궰野???쎈솭", true);
      }
    },

    async adjustAdminElo() {
      if (!this.selectedAdminPlayer) {
        this.showToast("?온?귐뗫막 ?醫롫땾???醫뤾문??뤾쉭??", true);
        return;
      }
      if (this.forms.adminElo == null || this.forms.adminElo === "") {
        this.showToast("鈺곌퀣???ELO????낆젾??뤾쉭??", true);
        return;
      }
      const currentElo = toInt(this.forms.adminElo, -1);
      if (currentElo < 0) {
        this.showToast("鈺곌퀣???ELO????낆젾??뤾쉭??", true);
        return;
      }

      try {
        await this.withLoading("ELO??鈺곌퀣???롫뮉 餓?..", async () => {
          await requestApi(`/api/admin/players/${this.selectedAdminPlayer.id}`, "PATCH", { currentElo });
          await Promise.all([this.refreshBootstrap(), this.refreshAdminPlayers(), this.refreshOverview()]);
          this.lastSyncedAt = new Date().toISOString();
        });
        this.showToast("?醫롫땾 ELO??鈺곌퀣???됰뮸??덈뼄.");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "ELO 鈺곌퀣????쎈솭", true);
      }
    },

    async deleteAdminPlayer() {
      if (!this.selectedAdminPlayer) {
        this.showToast("?온?귐뗫막 ?醫롫땾???醫뤾문??뤾쉭??", true);
        return;
      }
      if (!window.confirm("?醫롫땾????쑵??源딆넅?醫됲돱??")) return;

      try {
        await this.withLoading("?醫롫땾????쑵??源딆넅??롫뮉 餓?..", async () => {
          await requestApi(`/api/admin/players/${this.selectedAdminPlayer.id}`, "DELETE");
          await Promise.all([this.refreshBootstrap(), this.refreshAdminPlayers(), this.refreshOverview()]);
          this.lastSyncedAt = new Date().toISOString();
        });
        this.showToast("?醫롫땾????쑵??源딆넅??됰뮸??덈뼄.");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "?醫롫땾 ??????쎈솭", true);
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
      this.modals.playerMatches = false;
      this.loadPlayerBySelection();
    },

    playerStats: {
      handler() {
        if (!this.playerStats) {
          this.modals.playerMatches = false;
          this.destroyPlayerCharts();
          return;
        }
        this.schedulePlayerChartsRender();
      },
      deep: false,
    },

    activeTab(newValue) {
      if (newValue === "player") {
        this.schedulePlayerChartsRender();
      }
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
    this.syncSidebarMode();
    window.addEventListener("resize", this.syncSidebarMode);
    await this.refreshAll("?λ뜃由??怨쀬뵠?怨? ?븍뜄???삳뮉 餓?..");
  },

  beforeUnmount() {
    window.removeEventListener("resize", this.syncSidebarMode);
    this.destroyPlayerCharts();
    if (this.toast.timer) {
      clearTimeout(this.toast.timer);
      this.toast.timer = null;
    }
  },
  template: `
    <div class="app-root">
      <div class="bg-orb orb-a"></div>
      <div class="bg-orb orb-b"></div>
      <div class="bg-orb orb-c"></div>

      <button
        v-if="ui.isMobile && isSidebarOpen"
        type="button"
        class="mobile-backdrop"
        aria-label="?????뺤뺍 ??る┛"
        @click="closeSidebar"
      ></button>

      <div class="layout-shell" :class="{ 'sidebar-collapsed': !isSidebarOpen && !ui.isMobile }">
        <aside class="side-nav" :class="{ open: isSidebarOpen }">
          <div class="side-nav-top">
            <button type="button" class="side-close-btn" @click="closeSidebar">{{ ui.isMobile ? "??る┛" : "?臾롫┛" }}</button>
          </div>

          <div class="brand-panel">
            <p class="brand-overline">ELO RANKING SYSTEM</p>
            <h1>ELO Ops Studio</h1>
            <p>Cloudflare Pages + D1 疫꿸퀡而???곸겫 ?꾩꼷??/p>
          </div>

          <nav class="tab-nav" aria-label="雅뚯눘??筌롫뗀??>
            <button
              v-for="item in tabs"
                :key="item.id"
                type="button"
                class="tab-btn"
                :class="{ active: activeTab === item.id }"
                @click="setActiveTab(item.id)"
              >
                <span class="tab-label">{{ item.label }}</span>
                <small>{{ item.desc }}</small>
              </button>
            </nav>

          <div class="side-foot">
            <p>???關?? Cloudflare D1</p>
            <p>?怨??? Pages Functions</p>
          </div>
        </aside>

        <div class="workspace">
          <header class="workspace-head">
            <div class="head-copy">
              <h2>野껋럡由???곸겫 ????뺣궖??/h2>
              <p>?醫롫땾 ?源낆쨯?봔???????ル굝利?獄쏆꼷?뷸틦?? ???癒?カ??곗쨮 ?온?귐뗫???덈뼄.</p>
            </div>
            <div class="head-actions">
              <button type="button" class="btn ghost mini nav-toggle-btn" @click="toggleSidebar">
                {{ isSidebarOpen ? "筌롫뗀????ｋ┛疫? : "筌롫뗀??癰귣떯由? }}
              </button>
              <button type="button" class="btn ghost" @click="refreshAll('?袁⑷퍥 ?怨쀬뵠?怨? ??녿┛?酉釉??餓?..')">?袁⑷퍥 ??녿┛??/button>
              <div class="sync-text">筌띾뜆?筌???녿┛?? {{ formatDateTime(lastSyncedAt, true) }}</div>
              <div class="health-pill" :class="{ ok: health.ok === true, bad: health.ok === false }">{{ health.text }}</div>
            </div>
          </header>

          <main class="panel-stack">
            <section v-show="activeTab === 'dashboard'" class="panel-group">
              <section class="kpi-grid dashboard-kpi-grid" aria-label="Dashboard metrics">
                <article v-for="metric in quickMetrics" :key="'dashboard-metric-' + metric.label" class="kpi-card">
                  <span>{{ metric.label }}</span>
                  <strong>{{ metric.value }}</strong>
                  <small>{{ metric.help }}</small>
                </article>
              </section>

              <article class="surface">
                <header class="surface-head">
                  <h3>Current Ranking</h3>
                  <input v-model.trim="ui.rankingQuery" placeholder="Search player" />
                </header>
                <div class="table-shell">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Player</th>
                        <th>ELO / Rating</th>
                        <th>Matches</th>
                        <th>W/L</th>
                        <th>Win Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="player in filteredRankingPlayers" :key="'rank-' + player.id">
                        <td>
                          <span class="rank-cell">
                            <span v-if="rankMedal(player.rank)" class="rank-medal" :class="'top-' + player.rank">{{ rankMedal(player.rank) }}</span>
                            <span>#{{ player.rank }}</span>
                          </span>
                        </td>
                        <td>
                          <button type="button" class="inline-link table-link" @click="jumpToPlayerById(player.id)">
                            {{ player.name }}
                          </button>
                        </td>
                        <td>
                          <div class="elo-cell">
                            <strong>{{ formatNum(player.currentElo) }}</strong>
                            <small>ELO</small>
                          </div>
                        </td>
                        <td>{{ player.matchCount }}</td>
                        <td>{{ player.wins }}-{{ player.losses }}</td>
                        <td>{{ player.winRate }}%</td>
                      </tr>
                      <tr v-if="!filteredRankingPlayers.length">
                        <td colspan="6" class="empty-row">No players found.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </article>

              <article class="surface accent">
                <h3>Register Player</h3>
                <p class="muted">New players are initialized from the current active-player average ELO.</p>
                <form class="inline-form" @submit.prevent="submitPlayer">
                  <input v-model.trim="forms.playerName" placeholder="Player name" required />
                  <button type="submit" class="btn primary">Add</button>
                </form>
              </article>

              <article class="surface">
                <header class="surface-head">
                  <h3>Recent Matches</h3>
                  <select v-model="ui.recentFormat">
                    <option value="ALL">All</option>
                    <option value="SINGLES">Singles</option>
                    <option value="DOUBLES">Doubles</option>
                  </select>
                </header>

                <div class="card-list">
                  <match-card
                    v-for="match in dashboardRecentMatches"
                    :key="'recent-' + match.matchId"
                    :match="match"
                    :type-label="tournamentTypeLabel(match.tournamentType)"
                    :linkable-tournament="true"
                    :show-player-links="true"
                    @open-tournament="jumpToTournamentById"
                    @open-player="jumpToPlayerByName"
                  />
                  <p v-if="!dashboardRecentMatches.length" class="empty-copy">No recent matches.</p>
                </div>
              </article>
            </section>

            <section v-show="activeTab === 'tournament'" class="panel-group">
              <div v-if="!openTournament" class="panel-grid two">
                <article class="surface">
                  <h3>????????뽰삂</h3>
                  <form class="stack-form" @submit.prevent="submitTournament">
                    <label>?????구<input v-model.trim="forms.tournamentName" required /></label>
                    <label>?????뵬??input v-model="forms.tournamentDate" type="date" required /></label>
                    <label>?????쪒??                      <select v-model="forms.tournamentType">
                        <option v-for="rule in activeRules" :key="'rule-start-' + rule.tournamentType" :value="rule.tournamentType">{{ rule.displayName }}</option>
                      </select>
                    </label>

                    <div class="participant-box">
                      <div class="participant-head">
                        <span>筌〓㈇????醫뤾문</span>
                        <strong>{{ selectedParticipants.length }}筌??醫뤾문</strong>
                      </div>

                      <input
                        v-model.trim="ui.participantQuery"
                        placeholder="?醫롫땾 野꺜????Enter嚥?筌?野껉퀗???곕떽?"
                        @keydown.enter.prevent="addFirstSearchedParticipant"
                      />

                      <div class="picker-actions">
                        <button type="button" class="btn ghost mini" @click="selectAllParticipants">?袁⑷퍥 ?醫뤾문</button>
                        <button type="button" class="btn ghost mini" @click="selectTopParticipants(8)">?怨몄맄 8筌?/button>
                        <button type="button" class="btn ghost mini" @click="clearParticipantSelection">?醫뤾문 ?λ뜃由??/button>
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
                        <p v-if="!selectedParticipants.length" class="empty-copy">?袁⑹춦 ?醫뤾문??筌〓㈇??癒? ??곷뮸??덈뼄.</p>
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

                    <button type="submit" class="btn primary">??????뽰삂</button>
                  </form>
                </article>

                <article class="surface">
                  <h3>筌욊쑵六?餓?????/h3>
                  <p class="empty-copy">?袁⑹삺 筌욊쑵六?餓λ쵐??????? ??곷뮸??덈뼄.</p>
                </article>
              </div>

              <template v-else>
                <div class="tournament-toolbar">
                  <button type="button" class="btn ghost" @click="openTournamentSettingsModal">??????쇱젟 癰궰野?/button>
                  <button type="button" class="btn primary" @click="openMatchEntryModal">野껋럡由?野껉퀗????낆젾</button>
                </div>

                <article class="surface">
                  <h3>筌욊쑵六?餓?????/h3>
                  <div class="open-summary">
                    <p class="open-title">{{ openTournament.name }}</p>
                    <div class="summary-row">
                      <span>{{ openTournament.tournamentDate }}</span>
                      <span>{{ tournamentTypeLabel(openTournament.tournamentType) }}</span>
                      <span class="status-chip open">{{ tournamentStatusLabel(openTournament.status) }}</span>
                    </div>
                    <div class="summary-stat-grid">
                      <div><strong>{{ openTournament.participants.length }}</strong><small>筌〓㈇???/small></div>
                      <div><strong>{{ openTournament.matches.length }}</strong><small>野껋럡由?/small></div>
                      <div><strong>K {{ openTournament.kFactor }}</strong><small>base {{ openTournament.basePoints }}</small></div>
                    </div>
                  </div>
                </article>

                <div class="panel-grid two">
                  <article class="surface">
                    <h3>野껋럡由?筌뤴뫖以?/h3>
                    <div class="card-list">
                      <match-card
                        v-for="match in openTournamentMatches"
                        :key="'open-match-' + match.id"
                        :match="match"
                        :type-label="tournamentTypeLabel(openTournament.tournamentType)"
                        :show-meta="false"
                        :deletable="true"
                        @delete="deleteMatch(match.id)"
                      />
                      <p v-if="!openTournamentMatches.length" class="empty-copy">?袁⑹춦 疫꿸퀡以??野껋럡由겼첎? ??곷뮸??덈뼄.</p>
                    </div>
                  </article>

                  <article class="surface">
                    <h3>筌〓㈇???/ ??됯맒 ELO</h3>
                    <div class="table-shell">
                      <table class="data-table">
                        <thead>
                          <tr>
                            <th>??뺣굡</th>
                            <th>?醫롫땾</th>
                            <th>??뽰삂 ELO</th>
                            <th>?袁⑹읅 ?</th>
                            <th>??됯맒 ELO</th>
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
                            <td colspan="5" class="empty-row">筌〓㈇????類ｋ궖揶쎛 ??곷뮸??덈뼄.</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </article>
                </div>

                <div class="action-row tournament-end-actions">
                  <button type="button" class="btn danger" :disabled="!openTournament" @click="cancelTournament">?????띯뫁??/button>
                  <button type="button" class="btn primary" :disabled="!openTournament" @click="finalizeTournament">?????ル굝利?/button>
                </div>
              </template>
            </section>

            <section v-show="activeTab === 'records'" class="panel-group">
              <article class="surface">
                <header class="surface-head">
                  <h3>????疫꿸퀡以?/h3>
                  <div class="inline-form selector-form">
                    <input v-model.trim="ui.recordQuery" placeholder="????野꺜?? />
                    <select v-model="selectedRecordTournamentId">
                      <option v-for="tournament in filteredRecordTournamentOptions" :key="'record-select-' + tournament.id" :value="String(tournament.id)">
                        {{ tournament.tournamentDate }} 夷?{{ tournament.name }} ({{ tournamentStatusLabel(tournament.status) }})
                      </option>
                    </select>
                  </div>
                </header>
                <p class="muted">野꺜?????醫뤾문??롢늺 ?癒?짗??곗쨮 疫꿸퀡以???븍뜄???筌욌쵎???</p>

                <div v-if="recordTournament" class="record-overview">
                  <div class="summary-row">
                    <strong>{{ recordTournament.name }}</strong>
                    <span>{{ recordTournament.tournamentDate }}</span>
                    <span>{{ tournamentTypeLabel(recordTournament.tournamentType) }}</span>
                    <span class="status-chip" :class="statusClass(recordTournament.status)">{{ tournamentStatusLabel(recordTournament.status) }}</span>
                  </div>
                  <div class="summary-stat-grid">
                    <div><strong>{{ recordTournament.participants.length }}</strong><small>筌〓㈇???/small></div>
                    <div><strong>{{ recordTournament.matches.length }}</strong><small>野껋럡由??/small></div>
                    <div><strong>K {{ recordTournament.kFactor }}</strong><small>base {{ recordTournament.basePoints }}</small></div>
                  </div>
                </div>
                <p v-else class="empty-copy">鈺곌퀬???????? ?醫뤾문??뤾쉭??</p>
              </article>

              <div v-if="recordTournament" class="panel-grid two">
                <article class="surface">
                  <h3>筌ㅼ뮇伊?獄쏆꼷???癒?땾</h3>
                  <div class="table-shell">
                    <table class="data-table">
                      <thead>
                        <tr><th>?醫롫땾</th><th>ELO 癰궰??/th></tr>
                      </thead>
                      <tbody>
                        <tr v-for="event in recordTournament.ratingEvents" :key="'rating-' + event.playerId">
                          <td>
                            <button type="button" class="inline-link table-link" @click="jumpToPlayerById(event.playerId)">
                              {{ event.name }}
                            </button>
                          </td>
                          <td>
                            <div class="elo-result-cell">
                              <span>{{ formatNum(event.eloBefore) }}</span>
                              <span :class="{ up: event.delta > 0, down: event.delta < 0 }">{{ formatSigned(event.delta) }}</span>
                              <strong>{{ formatNum(event.eloAfter) }}</strong>
                            </div>
                          </td>
                        </tr>
                        <tr v-if="!recordTournament.ratingEvents.length">
                          <td colspan="2" class="empty-row">?癒?땾 獄쏆꼷???怨쀬뵠?怨? ??곷뮸??덈뼄.</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </article>

                <article class="surface">
                  <h3>??λ뻼 ???餓?筌띲끋?껆뵳???/h3>
                  <div class="table-shell">
                    <table class="data-table matrix">
                      <thead>
                        <tr>
                          <th>?醫롫땾</th>
                          <th v-for="name in recordMatrixPlayers" :key="'matrix-head-' + name">{{ name }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="row in recordMatrixRows" :key="'matrix-row-' + row.name">
                          <th>{{ row.name }}</th>
                          <td v-for="cell in row.cells" :key="'matrix-cell-' + row.name + '-' + cell.key">{{ cell.value || '-' }}</td>
                        </tr>
                        <tr v-if="!recordMatrixRows.length">
                          <td colspan="99" class="empty-row">??λ뻼 筌띲끋?껆뵳????怨쀬뵠?怨? ??곷뮸??덈뼄.</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </article>
              </div>

              <article v-if="recordTournament" class="surface">
                <h3>野껋럡由?野껉퀗??/h3>
                <div class="card-list">
                  <match-card
                    v-for="match in recordTournament.matches"
                    :key="'record-match-' + match.id"
                    :match="match"
                    :type-label="tournamentTypeLabel(recordTournament.tournamentType)"
                    :show-meta="false"
                    :show-player-links="true"
                    @open-player="jumpToPlayerByName"
                  />
                  <p v-if="!recordTournament.matches.length" class="empty-copy">疫꿸퀡以??野껋럡由겼첎? ??곷뮸??덈뼄.</p>
                </div>
              </article>
            </section>

            <section v-show="activeTab === 'player'" class="panel-group">
              <article class="surface">
                <header class="surface-head">
                  <h3>?醫롫땾癰?疫꿸퀡以?/h3>
                  <div class="inline-form selector-form">
                    <input v-model.trim="ui.playerQuery" placeholder="?醫롫땾 野꺜?? />
                    <select v-model="selectedPlayerId">
                      <option v-for="player in filteredPlayersForSelector" :key="'player-select-' + player.id" :value="String(player.id)">{{ player.name }}</option>
                    </select>
                  </div>
                </header>
                <p class="muted">野꺜?????醫롫땾???醫뤾문??롢늺 ?癒?짗??곗쨮 疫꿸퀡以???븍뜄???筌욌쵎???</p>
              </article>

              <article v-if="playerStats" class="surface">
                <h3>{{ playerStats.player.name }} 疫꿸퀡以??遺용튋</h3>
                <div class="summary-stat-grid player-summary">
                  <div><strong>{{ formatNum(playerStats.player.currentElo) }}</strong><small>ELO</small></div>
                  <div><strong>#{{ playerStats.player.rank }}</strong><small>?袁⑹삺 ??뽰맄</small></div>
                  <div><strong>{{ playerStats.summary.wins }}??{{ playerStats.summary.losses }}??{{ playerStats.summary.draws }}??/strong><small>?袁⑷퍥 ?袁⑹읅</small></div>
                  <div><strong>{{ playerStats.summary.winRate }}%</strong><small>?袁⑷퍥 ?諛몄ぇ</small></div>
                  <div><strong>{{ playerStats.summary.singlesWinRate }}%</strong><small>??λ뻼 ?諛몄ぇ</small></div>
                  <div><strong>{{ playerStats.summary.doublesWinRate }}%</strong><small>癰귣벊???諛몄ぇ</small></div>
                </div>
              </article>

              <article v-if="playerStats" class="surface">
                <h3>野껋럡由?疫꿸퀡以?????/h3>
                <div class="chart-wrap">
                  <canvas ref="playerStatsChart"></canvas>
                </div>
                <p class="muted">筌욌쵌??疫꿸퀣?: ?띯뫁??????? ??뽰뇚???袁⑷퍥 野껋럡由?筌욊쑵六?餓???????釉?</p>
              </article>

              <article v-if="playerStats" class="surface">
                <h3>ELO Change Trend</h3>
                <div class="chart-wrap elo-trend">
                  <canvas ref="playerEloChart"></canvas>
                </div>
                <p class="muted">Line: ELO after each event, Bar: event-by-event delta.</p>
              </article>

              <article v-if="playerStats" class="surface">
                <header class="surface-head">
                  <h3>筌ㅼ뮄??野껋럡由?疫꿸퀡以?/h3>
                  <button v-if="hasMorePlayerMatches" type="button" class="btn ghost mini" @click="openPlayerMatchesModal">?袁⑷퍥 癰귣떯由?/button>
                </header>
                <div class="card-list">
                  <match-card
                    v-for="match in playerRecentMatches"
                    :key="'player-match-' + match.matchId"
                    :match="match"
                    :type-label="tournamentTypeLabel(match.tournamentType)"
                  />
                  <p v-if="!playerRecentMatches.length" class="empty-copy">野껋럡由??怨쀬뵠?怨? ??곷뮸??덈뼄.</p>
                </div>
              </article>

              <article v-if="playerStats" class="surface">
                <h3>ELO ????/h3>
                <div class="table-shell">
                  <table class="data-table">
                    <thead>
                      <tr><th>?醫롮?</th><th>?醫륁굨</th><th>K / base</th><th>?癒?땾 癰궰??/th></tr>
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
                        <td colspan="4" class="empty-row">ELO ??源?硫? ??곷뮸??덈뼄.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </article>

              <article v-if="playerStats" class="surface compact-surface">
                <h3>?怨? ?袁⑹읅(??λ뻼)</h3>
                <div class="table-shell compact-table">
                  <table class="data-table">
                    <thead>
                      <tr><th>?怨?</th><th>野껋럡由?/th><th>??????/th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="opponent in playerStats.opponents" :key="'opponent-' + opponent.opponent">
                        <td>{{ opponent.opponent }}</td>
                        <td>{{ opponent.matches }}</td>
                        <td>{{ opponent.wins }}-{{ opponent.losses }}-{{ opponent.draws }}</td>
                      </tr>
                      <tr v-if="!playerStats.opponents.length">
                        <td colspan="3" class="empty-row">?怨? ?袁⑹읅 ?怨쀬뵠?怨? ??곷뮸??덈뼄.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </article>
            </section>

            <section v-show="activeTab === 'stats'" class="panel-group">
              <article class="surface">
                <header class="surface-head">
                  <h3>?袁⑷퍥 ????/h3>
                  <button type="button" class="btn ghost" @click="refreshStats">??덉쨮?⑥쥙臾?/button>
                </header>
                <div v-if="overview" class="summary-stat-grid">
                  <div><strong>{{ overview.summary.players }}</strong><small>??뽮쉐 ?醫롫땾</small></div>
                  <div><strong>{{ overview.summary.finalizedTournaments }}</strong><small>?ル굝利?????/small></div>
                  <div><strong>{{ overview.summary.openTournaments }}</strong><small>筌욊쑵六얌빳?????/small></div>
                  <div><strong>{{ overview.summary.finalizedMatches }}</strong><small>?ル굝利?野껋럡由?/small></div>
                  <div><strong>{{ formatNum(overview.summary.avgElo) }}</strong><small>???뇧 ELO</small></div>
                </div>
              </article>

              <div class="panel-grid two" v-if="overview">
                <article class="surface">
                  <h3>?怨몄맄 ??沅?/h3>
                  <div class="table-shell">
                    <table class="data-table">
                      <thead>
                        <tr><th>??뽰맄</th><th>?醫롫땾</th><th>ELO</th></tr>
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
                  <h3>筌ㅼ뮄??????/h3>
                  <div class="table-shell">
                    <table class="data-table">
                      <thead>
                        <tr><th>??깆쁽</th><th>?????구</th><th>????/th><th>?怨밴묶</th><th>野껋럡由?/th></tr>
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
                <h3>ELO ?브쑵猷?/h3>
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
                  <header class="surface-head">
                    <h3>?????????癒?땾 域뱀뮇??/h3>
                    <button type="button" class="btn ghost mini" @click="openEloSimulatorModal">ELO ?????됱뵠??/button>
                  </header>
                  <p class="muted">?類?뇣 ????/ ?怨몃뻻 ????/ 燁살뮇苑?袁⑹벥 K 揶쏅???base ?癒?땾??鈺곌퀣???몃빍??</p>
                  <div class="rule-grid">
                    <div v-for="rule in activeRules" :key="'admin-rule-' + rule.tournamentType" class="rule-card">
                      <strong>{{ rule.displayName }}</strong>
                      <label>K Factor
                        <input v-model.number="ruleDrafts[rule.tournamentType].kFactor" type="number" min="0" />
                      </label>
                      <label>Base Points
                        <input v-model.number="ruleDrafts[rule.tournamentType].basePoints" type="number" min="0" />
                      </label>
                      <button type="button" class="btn primary mini" @click="saveRule(rule.tournamentType)">????/button>
                    </div>
                  </div>
                </article>

                <article class="surface">
                  <h3>?醫롫땾 ?온??/h3>
                  <div class="stack-form">
                    <label>?온??????                      <select v-model="selectedAdminPlayerId">
                        <option v-for="player in adminPlayers" :key="'admin-select-' + player.id" :value="String(player.id)">
                          {{ player.name }} ({{ player.isActive ? '??뽮쉐' : '??쑵??? }})
                        </option>
                      </select>
                    </label>

                    <div v-if="selectedAdminPlayer" class="admin-meta">
                      <strong>{{ selectedAdminPlayer.name }}</strong>
                      <span>ELO {{ formatNum(selectedAdminPlayer.currentElo) }}</span>
                      <span>?怨밴묶: {{ selectedAdminPlayer.isActive ? '??뽮쉐' : '??쑵??? }}</span>
                    </div>

                    <form class="inline-form" @submit.prevent="renameAdminPlayer">
                      <input v-model.trim="forms.adminRename" placeholder="???醫롫땾 ??已? />
                      <button type="submit" class="btn primary">??已?癰궰野?/button>
                    </form>

                    <form class="inline-form" @submit.prevent="adjustAdminElo">
                      <input v-model.number="forms.adminElo" type="number" min="0" placeholder="??ELO" />
                      <button type="submit" class="btn ghost">?癒?땾 鈺곌퀣??/button>
                    </form>

                    <button type="button" class="btn danger" @click="deleteAdminPlayer">?醫롫땾 ??????쑵??源딆넅)</button>
                  </div>
                </article>
              </div>

              <article class="surface">
                <header class="surface-head">
                  <h3>?醫롫땾 ?袁れ넺</h3>
                  <div class="inline-form">
                    <input v-model.trim="ui.adminQuery" placeholder="?醫롫땾 ??已?野꺜?? />
                    <select v-model="ui.adminStatus">
                      <option value="ALL">?袁⑷퍥 ?怨밴묶</option>
                      <option value="ACTIVE">??뽮쉐</option>
                      <option value="INACTIVE">??쑵???/option>
                    </select>
                  </div>
                </header>

                <div class="table-shell">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>?醫롫땾</th>
                        <th>ELO / ?癒?땾</th>
                        <th>?怨밴묶</th>
                        <th>筌욊쑵六얌빳?????/th>
                        <th>?袁⑹읅 野껋럡由?/th>
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
                          <span class="status-chip" :class="player.isActive ? 'active' : 'inactive'">{{ player.isActive ? '??뽮쉐' : '??쑵??? }}</span>
                        </td>
                        <td>{{ player.inOpenTournament ? '?? : '?袁⑤빍?? }}</td>
                        <td>{{ player.matchCount }}</td>
                      </tr>
                      <tr v-if="!filteredAdminPlayers.length">
                        <td colspan="5" class="empty-row">野꺜??野껉퀗?드첎? ??곷뮸??덈뼄.</td>
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
        v-if="modals.eloSimulator"
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        @click.self="closeEloSimulatorModal"
      >
        <div class="modal-card">
          <header class="modal-head">
            <h3>ELO ?????됱뵠??/h3>
            <button type="button" class="modal-close" @click="closeEloSimulatorModal">??る┛</button>
          </header>

          <form class="sim-grid modal-body" @submit.prevent="runSimulator">
            <label>????????              <select v-model="forms.simType">
                <option v-for="rule in activeRules" :key="'sim-rule-' + rule.tournamentType" :value="rule.tournamentType">{{ rule.displayName }}</option>
              </select>
            </label>
            <label>Player A ELO<input v-model.number="forms.simAelo" type="number" min="1" /></label>
            <label>Player B ELO<input v-model.number="forms.simBelo" type="number" min="1" /></label>
            <label>Score A<input v-model.number="forms.simAscore" type="number" min="0" /></label>
            <label>Score B<input v-model.number="forms.simBscore" type="number" min="0" /></label>
            <button type="submit" class="btn primary">?④쑴沅?/button>
          </form>

          <div v-if="simResult" class="sim-result">
            <div class="sim-pill up">A {{ formatSigned(simResult.deltaA) }}</div>
            <div class="sim-pill down">B {{ formatSigned(simResult.deltaB) }}</div>
            <small>??됯맒?諛몄ぇ A {{ simResult.expectedA }}% 夷?B {{ simResult.expectedB }}%</small>
          </div>
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
            <h3>??????쇱젟 癰궰野?/h3>
            <button type="button" class="modal-close" @click="closeTournamentSettingsModal">??る┛</button>
          </header>

          <form class="stack-form modal-body" @submit.prevent="submitTournamentSettings">
            <label>?????구
              <input v-model.trim="forms.tournamentEditName" required />
            </label>
            <label>?????뵬??              <input v-model="forms.tournamentEditDate" type="date" required />
            </label>
            <label>?????쪒??              <select v-model="forms.tournamentEditType" :disabled="openTournament.matches.length > 0">
                <option v-for="rule in activeRules" :key="'edit-type-' + rule.tournamentType" :value="rule.tournamentType">
                  {{ rule.displayName }}
                </option>
              </select>
            </label>
            <p v-if="openTournament.matches.length > 0" class="muted">??? 野껋럡由?疫꿸퀡以????됰선 ?????ル굝履??癰궰野껋?釉?????곷뮸??덈뼄.</p>

            <div class="participant-box">
              <div class="participant-head">
                <span>筌〓㈇????紐꾩춿</span>
                <strong>{{ selectedTournamentEditParticipants.length }}筌??醫뤾문</strong>
              </div>

              <input
                v-model.trim="ui.tournamentEditParticipantQuery"
                placeholder="?醫롫땾 野꺜????Enter嚥?筌?野껉퀗???곕떽?"
                @keydown.enter.prevent="addFirstSearchedTournamentEditParticipant"
              />

              <div class="picker-actions">
                <button type="button" class="btn ghost mini" @click="selectAllTournamentEditParticipants">?袁⑷퍥 ?醫뤾문</button>
                <button type="button" class="btn ghost mini" @click="clearTournamentEditParticipantSelection">?醫뤾문 ?λ뜃由??/button>
              </div>

              <div class="selected-chip-wrap">
                <button
                  v-for="player in selectedTournamentEditParticipants"
                  :key="'edit-picked-' + player.id"
                  type="button"
                  class="selected-chip"
                  @click="toggleTournamentEditParticipant(player.id)"
                >
                  {{ player.name }}
                </button>
                <p v-if="!selectedTournamentEditParticipants.length" class="empty-copy">?袁⑹춦 ?醫뤾문??筌〓㈇??癒? ??곷뮸??덈뼄.</p>
              </div>

              <div class="pick-grid">
                <button
                  v-for="player in filteredTournamentEditParticipantPool"
                  :key="'edit-pool-' + player.id"
                  type="button"
                  class="pick-item"
                  :class="{ selected: isTournamentEditParticipantSelected(player.id) }"
                  @click="toggleTournamentEditParticipant(player.id)"
                >
                  <span>{{ player.name }}</span>
                  <small>{{ formatNum(player.currentElo) }}</small>
                </button>
              </div>

              <p v-if="openTournament.matches.length > 0" class="muted">??? 野껋럡由???醫롫땾????볤탢??????곷뮸??덈뼄.</p>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn ghost" @click="closeTournamentSettingsModal">?띯뫁??/button>
              <button type="submit" class="btn primary">????/button>
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
            <h3>野껋럡由?野껉퀗????낆젾</h3>
            <button type="button" class="modal-close" @click="closeMatchEntryModal">??る┛</button>
          </header>

          <form class="modal-body" @submit.prevent="submitMatch">
            <div class="format-switch">
              <span>?類ㅻ뻼</span>
              <div class="switch-toggle">
                <button type="button" :class="{ active: forms.matchFormat === 'SINGLES' }" @click="setMatchFormat('SINGLES')">??λ뻼</button>
                <button type="button" :class="{ active: forms.matchFormat === 'DOUBLES' }" @click="setMatchFormat('DOUBLES')">癰귣벊??/button>
              </div>
            </div>

            <div class="match-entry-grid">
              <section class="team-entry team-a">
                <h4>?? A</h4>
                <label>?醫롫땾 1
                  <select v-model="forms.matchA1">
                    <option value="">?醫롫땾 ?醫뤾문</option>
                    <option v-for="player in openTournamentParticipants" :key="'modal-match-a1-' + player.playerId" :value="String(player.playerId)">
                      {{ player.name }} ({{ formatNum(player.projectedElo) }})
                    </option>
                  </select>
                </label>
                <label v-if="forms.matchFormat === 'DOUBLES'">?醫롫땾 2
                  <select v-model="forms.matchA2">
                    <option value="">?醫롫땾 ?醫뤾문</option>
                    <option v-for="player in openTournamentParticipants" :key="'modal-match-a2-' + player.playerId" :value="String(player.playerId)">
                      {{ player.name }} ({{ formatNum(player.projectedElo) }})
                    </option>
                  </select>
                </label>
                <label class="score-field">?癒?땾
                  <input v-model.number="forms.matchScoreA" type="number" min="0" />
                </label>
              </section>

              <section class="team-entry team-b">
                <h4>?? B</h4>
                <label>?醫롫땾 1
                  <select v-model="forms.matchB1">
                    <option value="">?醫롫땾 ?醫뤾문</option>
                    <option v-for="player in openTournamentParticipants" :key="'modal-match-b1-' + player.playerId" :value="String(player.playerId)">
                      {{ player.name }} ({{ formatNum(player.projectedElo) }})
                    </option>
                  </select>
                </label>
                <label v-if="forms.matchFormat === 'DOUBLES'">?醫롫땾 2
                  <select v-model="forms.matchB2">
                    <option value="">?醫롫땾 ?醫뤾문</option>
                    <option v-for="player in openTournamentParticipants" :key="'modal-match-b2-' + player.playerId" :value="String(player.playerId)">
                      {{ player.name }} ({{ formatNum(player.projectedElo) }})
                    </option>
                  </select>
                </label>
                <label class="score-field">?癒?땾
                  <input v-model.number="forms.matchScoreB" type="number" min="0" />
                </label>
              </section>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn ghost" @click="closeMatchEntryModal">?띯뫁??/button>
              <button type="submit" class="btn primary">野껋럡由??곕떽?</button>
            </div>
          </form>
        </div>
      </div>

      <div
        v-if="modals.playerMatches && playerStats"
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        @click.self="closePlayerMatchesModal"
      >
        <div class="modal-card wide">
          <header class="modal-head">
            <h3>{{ playerStats.player.name }} ?袁⑷퍥 野껋럡由?疫꿸퀡以?/h3>
            <button type="button" class="modal-close" @click="closePlayerMatchesModal">??る┛</button>
          </header>

          <p class="muted">??{{ playerMatchCards.length }}野껋럡由?/p>
          <div class="card-list modal-card-list">
            <match-card
              v-for="match in playerMatchCards"
              :key="'player-modal-match-' + match.matchId"
              :match="match"
              :type-label="tournamentTypeLabel(match.tournamentType)"
            />
            <p v-if="!playerMatchCards.length" class="empty-copy">野껋럡由??怨쀬뵠?怨? ??곷뮸??덈뼄.</p>
          </div>
        </div>
      </div>

      <div class="loading-overlay" :class="{ show: isLoading }" role="status" aria-live="polite" :aria-hidden="!isLoading">
        <div class="loading-card">
          <div class="spinner" aria-hidden="true"></div>
          <strong>{{ loading.message }}</strong>
          <p>?醫롫뻻筌?疫꿸퀡???쇽폒?紐꾩뒄.</p>
        </div>
      </div>

      <div class="toast" :class="{ show: toast.visible, error: toast.error }">{{ toast.message }}</div>
    </div>
  `,
});

app.mount("#app");


