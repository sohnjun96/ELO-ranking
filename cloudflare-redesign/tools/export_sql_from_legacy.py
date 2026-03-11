#!/usr/bin/env python3
"""
Export SQL seed statements for the Cloudflare D1 redesign schema
from legacy Excel + pickle data.
"""

from __future__ import annotations

import argparse
import os
import pickle
import sys
from collections import OrderedDict, defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import pandas as pd


# Make legacy project modules importable for pickle loading (e.g., ELO.Elo).
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Excel column keys
COL_DATE = "\ub0a0\uc9dc"
COL_TOURNAMENT = "\ub300\ud68c\uba85"
COL_K = "K\uac12"
COL_PLAYER = "\uc774\ub984"
COL_ELO = "ELO"
COL_DOUBLES_FLAG = "\ubcf5\uc2dd\uc5ec\ubd80"
COL_NAME1 = "\uc774\ub9841"
COL_NAME1A = "\uc774\ub9841A"
COL_NAME2 = "\uc774\ub9842"
COL_NAME2A = "\uc774\ub9842A"
COL_SCORE1 = "\uc810\uc2181"
COL_SCORE2 = "\uc810\uc2182"
COL_DELTA1 = "\ub378\ud0c01"
COL_DELTA2 = "\ub378\ud0c02"

# Pickle keys
PK_TOURNAMENT = "\ub300\ud68c\uba85"
PK_DATE = "\ub300\ud68c\uc77c\uc790"
PK_TYPE = "\ub300\ud68c\uc885\ub958"
PK_PARTICIPANTS = "\ucc38\uac00\uc790"
PK_MATCHES = "\uacbd\uae30\uae30\ub85d"
PK_ELO_BLOB = "ELO"
PK_ELO_BEFORE = "\uae30\uc874"
PK_ELO_AFTER = "\uacb0\uacfc"

# Legacy values
VAL_REGISTER = "\ub4f1\ub85d"
VAL_DOUBLES = "\ubcf5\uc2dd"
VAL_TYPE_REGULAR = "\uc815\uae30"
VAL_TYPE_ADHOC = "\uc815\uc2dc"
VAL_TYPE_ADHOC_ALT = "\uc0c1\uc2dc"
VAL_TYPE_FRIENDLY = "\uce5c\uc120"

TOURNAMENT_TYPE_BY_K = {
    200: "REGULAR",
    100: "ADHOC",
    0: "FRIENDLY",
}

K_BY_TOURNAMENT_TYPE = {
    "REGULAR": 200,
    "ADHOC": 100,
    "FRIENDLY": 0,
}

TOURNAMENT_TYPE_BY_KOR = {
    VAL_TYPE_REGULAR: "REGULAR",
    VAL_TYPE_ADHOC: "ADHOC",
    VAL_TYPE_ADHOC_ALT: "ADHOC",
    VAL_TYPE_FRIENDLY: "FRIENDLY",
}

BASE_POINTS_BY_TYPE = {
    "REGULAR": 4,
    "ADHOC": 1,
    "FRIENDLY": 0,
}

DATE_FMT = "%Y-%m-%d"


@dataclass
class TournamentMeta:
    tid: int
    name: str
    date: str
    tournament_type: str
    k_factor: int
    base_points: int


@dataclass
class PickleTournamentData:
    tournament_type: Optional[str] = None
    participants: List[str] = field(default_factory=list)
    matches: List[dict] = field(default_factory=list)
    elo_before: Dict[str, int] = field(default_factory=dict)
    elo_after: Dict[str, int] = field(default_factory=dict)


def sql_quote(value: object) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, float) and pd.isna(value):
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return str(value)
    text = str(value).replace("'", "''")
    return f"'{text}'"


def normalize_date(value: object) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    parsed = pd.to_datetime(value)
    return parsed.strftime(DATE_FMT)


def normalize_str(value: object) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value).strip()


def normalize_optional_name(value: object) -> Optional[str]:
    text = normalize_str(value)
    return text if text else None


def normalize_int(value: object, default: int = 0) -> int:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return default
    return int(value)


def add_unique(items: List[str], value: Optional[str]) -> None:
    if value is None:
        return
    if value not in items:
        items.append(value)


def load_pickle_metadata(pickle_dir: str) -> Dict[Tuple[str, str], PickleTournamentData]:
    metadata: Dict[Tuple[str, str], PickleTournamentData] = {}
    if not pickle_dir or not os.path.isdir(pickle_dir):
        return metadata

    for filename in sorted(os.listdir(pickle_dir)):
        if not filename.endswith(".pickle"):
            continue
        path = os.path.join(pickle_dir, filename)
        try:
            with open(path, "rb") as handle:
                data = pickle.load(handle)
        except Exception:
            continue

        if not isinstance(data, dict):
            continue

        name = normalize_str(data.get(PK_TOURNAMENT))
        date = normalize_date(data.get(PK_DATE))
        if not name or not date:
            continue

        tournament_type = TOURNAMENT_TYPE_BY_KOR.get(normalize_str(data.get(PK_TYPE)))
        participants: List[str] = []
        for player in data.get(PK_PARTICIPANTS, []):
            pname = normalize_str(player)
            if pname:
                participants.append(pname)

        matches: List[dict] = []
        for match in data.get(PK_MATCHES, []):
            if isinstance(match, dict):
                matches.append(match)

        elo_before: Dict[str, int] = {}
        elo_after: Dict[str, int] = {}
        elo_blob = data.get(PK_ELO_BLOB)
        if isinstance(elo_blob, dict):
            raw_before = elo_blob.get(PK_ELO_BEFORE)
            raw_after = elo_blob.get(PK_ELO_AFTER)
            if isinstance(raw_before, dict):
                for pname, value in raw_before.items():
                    key_name = normalize_str(pname)
                    if key_name:
                        elo_before[key_name] = normalize_int(value, default=2000)
            if isinstance(raw_after, dict):
                for pname, value in raw_after.items():
                    key_name = normalize_str(pname)
                    if key_name:
                        elo_after[key_name] = normalize_int(value, default=2000)

        metadata[(date, name)] = PickleTournamentData(
            tournament_type=tournament_type,
            participants=participants,
            matches=matches,
            elo_before=elo_before,
            elo_after=elo_after,
        )

    return metadata


def infer_tournament_type(k_factor: int, pickle_type: Optional[str]) -> str:
    if pickle_type in BASE_POINTS_BY_TYPE:
        return pickle_type
    return TOURNAMENT_TYPE_BY_K.get(k_factor, "ADHOC")


def build_tournaments(
    elo_df: pd.DataFrame,
    games_df: pd.DataFrame,
    pickle_meta: Dict[Tuple[str, str], PickleTournamentData],
) -> OrderedDict[Tuple[str, str], TournamentMeta]:
    ordered: OrderedDict[Tuple[str, str], TournamentMeta] = OrderedDict()

    def ensure_tournament(date: str, name: str, k_factor: int, pickle_type: Optional[str]) -> None:
        key = (date, name)
        if key in ordered:
            return
        ttype = infer_tournament_type(k_factor, pickle_type)
        tid = len(ordered) + 1
        ordered[key] = TournamentMeta(
            tid=tid,
            name=name,
            date=date,
            tournament_type=ttype,
            k_factor=k_factor,
            base_points=BASE_POINTS_BY_TYPE[ttype],
        )

    for _, row in games_df.iterrows():
        date = normalize_date(row[COL_DATE])
        name = normalize_str(row[COL_TOURNAMENT])
        k_factor = normalize_int(row[COL_K], default=0)
        if date and name:
            ptype = pickle_meta.get((date, name), PickleTournamentData()).tournament_type
            ensure_tournament(date, name, k_factor, ptype)

    for _, row in elo_df.iterrows():
        name = normalize_str(row[COL_TOURNAMENT])
        if name == VAL_REGISTER:
            continue
        date = normalize_date(row[COL_DATE])
        k_factor = normalize_int(row[COL_K], default=0)
        if date and name:
            ptype = pickle_meta.get((date, name), PickleTournamentData()).tournament_type
            ensure_tournament(date, name, k_factor, ptype)

    for (date, name), pmeta in pickle_meta.items():
        k_factor = K_BY_TOURNAMENT_TYPE.get(pmeta.tournament_type or "", 0)
        ensure_tournament(date, name, k_factor, pmeta.tournament_type)

    return ordered


def collect_participants(
    elo_df: pd.DataFrame,
    games_df: pd.DataFrame,
    tournaments: OrderedDict[Tuple[str, str], TournamentMeta],
    pickle_meta: Dict[Tuple[str, str], PickleTournamentData],
) -> Dict[Tuple[str, str], List[str]]:
    participants: Dict[Tuple[str, str], List[str]] = {key: [] for key in tournaments}

    for key in tournaments:
        pmeta = pickle_meta.get(key)
        if pmeta is None:
            continue
        for pname in pmeta.participants:
            add_unique(participants[key], pname)
        for match in pmeta.matches:
            add_unique(participants[key], normalize_optional_name(match.get(COL_NAME1)))
            add_unique(participants[key], normalize_optional_name(match.get(COL_NAME1A)))
            add_unique(participants[key], normalize_optional_name(match.get(COL_NAME2)))
            add_unique(participants[key], normalize_optional_name(match.get(COL_NAME2A)))
        for pname in pmeta.elo_before.keys():
            add_unique(participants[key], pname)
        for pname in pmeta.elo_after.keys():
            add_unique(participants[key], pname)

    for _, row in games_df.iterrows():
        key = (normalize_date(row[COL_DATE]), normalize_str(row[COL_TOURNAMENT]))
        if key not in participants:
            continue
        add_unique(participants[key], normalize_optional_name(row[COL_NAME1]))
        add_unique(participants[key], normalize_optional_name(row[COL_NAME1A]))
        add_unique(participants[key], normalize_optional_name(row[COL_NAME2]))
        add_unique(participants[key], normalize_optional_name(row[COL_NAME2A]))

    for _, row in elo_df.iterrows():
        tournament_name = normalize_str(row[COL_TOURNAMENT])
        if tournament_name == VAL_REGISTER:
            continue
        key = (normalize_date(row[COL_DATE]), tournament_name)
        if key not in participants:
            continue
        add_unique(participants[key], normalize_optional_name(row[COL_PLAYER]))

    return participants


def collect_players(
    elo_df: pd.DataFrame,
    games_df: pd.DataFrame,
    pickle_meta: Dict[Tuple[str, str], PickleTournamentData],
) -> List[str]:
    players: List[str] = []

    for _, row in elo_df.iterrows():
        add_unique(players, normalize_optional_name(row[COL_PLAYER]))

    for _, row in games_df.iterrows():
        add_unique(players, normalize_optional_name(row[COL_NAME1]))
        add_unique(players, normalize_optional_name(row[COL_NAME1A]))
        add_unique(players, normalize_optional_name(row[COL_NAME2]))
        add_unique(players, normalize_optional_name(row[COL_NAME2A]))

    for pmeta in pickle_meta.values():
        for pname in pmeta.participants:
            add_unique(players, pname)
        for pname in pmeta.elo_before.keys():
            add_unique(players, pname)
        for pname in pmeta.elo_after.keys():
            add_unique(players, pname)
        for match in pmeta.matches:
            add_unique(players, normalize_optional_name(match.get(COL_NAME1)))
            add_unique(players, normalize_optional_name(match.get(COL_NAME1A)))
            add_unique(players, normalize_optional_name(match.get(COL_NAME2)))
            add_unique(players, normalize_optional_name(match.get(COL_NAME2A)))

    return players


def build_seed_elo(
    elo_df: pd.DataFrame,
    players: List[str],
    tournaments: OrderedDict[Tuple[str, str], TournamentMeta],
    participants_by_tournament: Dict[Tuple[str, str], List[str]],
    pickle_meta: Dict[Tuple[str, str], PickleTournamentData],
) -> Tuple[Dict[Tuple[str, str], Dict[str, int]], Dict[Tuple[str, str], List[pd.Series]]]:
    running_elo = {player: 2000 for player in players}
    register_seen = set()
    elo_rows_by_tournament: Dict[Tuple[str, str], List[pd.Series]] = defaultdict(list)

    for _, row in elo_df.iterrows():
        tournament_name = normalize_str(row[COL_TOURNAMENT])
        date = normalize_date(row[COL_DATE])
        player = normalize_str(row[COL_PLAYER])
        elo_after = normalize_int(row[COL_ELO], default=2000)
        if not player:
            continue

        if tournament_name == VAL_REGISTER:
            if player not in register_seen:
                running_elo[player] = elo_after
                register_seen.add(player)
            continue

        key = (date, tournament_name)
        elo_rows_by_tournament[key].append(row)

    seed_elo: Dict[Tuple[str, str], Dict[str, int]] = {}

    for key in tournaments.keys():
        pmeta = pickle_meta.get(key)
        seed_elo[key] = {}
        for player in participants_by_tournament.get(key, []):
            if pmeta and player in pmeta.elo_before:
                seed_elo[key][player] = pmeta.elo_before[player]
            else:
                seed_elo[key][player] = running_elo.get(player, 2000)

        rows = elo_rows_by_tournament.get(key, [])
        if rows:
            for row in rows:
                player = normalize_str(row[COL_PLAYER])
                elo_after = normalize_int(row[COL_ELO], default=2000)
                running_elo[player] = elo_after
        elif pmeta and pmeta.elo_after:
            for player, elo_after in pmeta.elo_after.items():
                running_elo[player] = elo_after

    return seed_elo, elo_rows_by_tournament


def build_register_rows(elo_df: pd.DataFrame, players: List[str], latest_elo: Dict[str, int]) -> Dict[str, Tuple[str, int]]:
    register_map: Dict[str, Tuple[str, int]] = {}
    min_date = None

    for _, row in elo_df.iterrows():
        date = normalize_date(row[COL_DATE])
        if date and (min_date is None or date < min_date):
            min_date = date

        if normalize_str(row[COL_TOURNAMENT]) != VAL_REGISTER:
            continue

        player = normalize_str(row[COL_PLAYER])
        elo_value = normalize_int(row[COL_ELO], default=2000)
        if player and player not in register_map:
            register_map[player] = (date or (min_date or "1970-01-01"), elo_value)

    if min_date is None:
        min_date = "1970-01-01"

    for player in players:
        if player not in register_map:
            fallback_elo = latest_elo.get(player, 2000)
            register_map[player] = (min_date, fallback_elo)

    return register_map


def build_latest_elo(
    elo_df: pd.DataFrame,
    players: List[str],
    pickle_meta: Dict[Tuple[str, str], PickleTournamentData],
) -> Dict[str, int]:
    latest_date = {player: "0000-00-00" for player in players}
    latest_elo = {player: 2000 for player in players}

    for _, row in elo_df.iterrows():
        player = normalize_str(row[COL_PLAYER])
        if not player:
            continue
        date = normalize_date(row[COL_DATE])
        elo_value = normalize_int(row[COL_ELO], default=2000)
        if date >= latest_date.get(player, "0000-00-00"):
            latest_date[player] = date
            latest_elo[player] = elo_value

    for (date, _), pmeta in pickle_meta.items():
        for player, elo_value in pmeta.elo_after.items():
            if date > latest_date.get(player, "0000-00-00"):
                latest_date[player] = date
                latest_elo[player] = elo_value

    return latest_elo


def build_normalized_matches(
    games_df: pd.DataFrame,
    pickle_meta: Dict[Tuple[str, str], PickleTournamentData],
) -> List[dict]:
    normalized: List[dict] = []
    games_keys = set()

    for _, row in games_df.iterrows():
        key = (normalize_date(row[COL_DATE]), normalize_str(row[COL_TOURNAMENT]))
        games_keys.add(key)
        match_format = "DOUBLES" if normalize_str(row[COL_DOUBLES_FLAG]) == VAL_DOUBLES else "SINGLES"
        normalized.append(
            {
                "key": key,
                "match_format": match_format,
                "a1": normalize_optional_name(row[COL_NAME1]),
                "a2": normalize_optional_name(row[COL_NAME1A]),
                "b1": normalize_optional_name(row[COL_NAME2]),
                "b2": normalize_optional_name(row[COL_NAME2A]),
                "score_a": normalize_int(row[COL_SCORE1], default=0),
                "score_b": normalize_int(row[COL_SCORE2], default=0),
                "delta_a": normalize_int(row[COL_DELTA1], default=0),
                "delta_b": normalize_int(row[COL_DELTA2], default=0),
            }
        )

    for key, pmeta in pickle_meta.items():
        if key in games_keys:
            continue
        for match in pmeta.matches:
            match_format = "DOUBLES" if normalize_str(match.get(COL_DOUBLES_FLAG)) == VAL_DOUBLES else "SINGLES"
            normalized.append(
                {
                    "key": key,
                    "match_format": match_format,
                    "a1": normalize_optional_name(match.get(COL_NAME1)),
                    "a2": normalize_optional_name(match.get(COL_NAME1A)),
                    "b1": normalize_optional_name(match.get(COL_NAME2)),
                    "b2": normalize_optional_name(match.get(COL_NAME2A)),
                    "score_a": normalize_int(match.get(COL_SCORE1), default=0),
                    "score_b": normalize_int(match.get(COL_SCORE2), default=0),
                    "delta_a": normalize_int(match.get(COL_DELTA1), default=0),
                    "delta_b": normalize_int(match.get(COL_DELTA2), default=0),
                }
            )

    return normalized


def write_sql(
    output_path: str,
    players: List[str],
    player_ids: Dict[str, int],
    latest_elo: Dict[str, int],
    tournaments: OrderedDict[Tuple[str, str], TournamentMeta],
    participants_by_tournament: Dict[Tuple[str, str], List[str]],
    seed_elo_by_tournament: Dict[Tuple[str, str], Dict[str, int]],
    register_rows: Dict[str, Tuple[str, int]],
    elo_rows_by_tournament: Dict[Tuple[str, str], List[pd.Series]],
    normalized_matches: List[dict],
    pickle_meta: Dict[Tuple[str, str], PickleTournamentData],
) -> None:
    lines: List[str] = []
    lines.append("-- Generated from legacy Excel/pickle data.")
    lines.append("-- Target: cloudflare-redesign/schema.sql")
    lines.append("BEGIN TRANSACTION;")

    for player in players:
        pid = player_ids[player]
        lines.append(
            "INSERT INTO players (id, name, current_elo, is_active) VALUES "
            f"({sql_quote(pid)}, {sql_quote(player)}, {sql_quote(latest_elo.get(player, 2000))}, 1);"
        )

    for _, meta in tournaments.items():
        finalized_at = f"{meta.date} 23:59:59"
        lines.append(
            "INSERT INTO tournaments "
            "(id, name, tournament_date, tournament_type, k_factor, base_points, status, finalized_at) VALUES "
            f"({sql_quote(meta.tid)}, {sql_quote(meta.name)}, {sql_quote(meta.date)}, "
            f"{sql_quote(meta.tournament_type)}, {sql_quote(meta.k_factor)}, {sql_quote(meta.base_points)}, "
            f"'FINALIZED', {sql_quote(finalized_at)});"
        )

    for key, meta in tournaments.items():
        participant_list = participants_by_tournament.get(key, [])
        seed_map = seed_elo_by_tournament.get(key, {})
        ranked = sorted(participant_list, key=lambda p: (-seed_map.get(p, 2000), p))
        rank_by_player = {player: idx + 1 for idx, player in enumerate(ranked)}

        for player in participant_list:
            pid = player_ids[player]
            seed_elo = seed_map.get(player, 2000)
            seed_rank = rank_by_player.get(player)
            lines.append(
                "INSERT INTO tournament_participants "
                "(tournament_id, player_id, seed_elo, seed_rank) VALUES "
                f"({sql_quote(meta.tid)}, {sql_quote(pid)}, {sql_quote(seed_elo)}, {sql_quote(seed_rank)});"
            )

    match_id = 1
    match_order_counter = defaultdict(int)
    for match in normalized_matches:
        key = match["key"]
        if key not in tournaments:
            continue
        meta = tournaments[key]
        match_order_counter[meta.tid] += 1
        match_order = match_order_counter[meta.tid]

        a1 = match["a1"]
        a2 = match["a2"]
        b1 = match["b1"]
        b2 = match["b2"]
        delta_a = match["delta_a"]
        delta_b = match["delta_b"]
        match_format = match["match_format"]

        lines.append(
            "INSERT INTO matches "
            "(id, tournament_id, match_order, match_format, team_a_player1_id, team_a_player2_id, "
            "team_b_player1_id, team_b_player2_id, score_a, score_b, delta_team_a, delta_team_b, status) VALUES "
            f"({sql_quote(match_id)}, {sql_quote(meta.tid)}, {sql_quote(match_order)}, {sql_quote(match_format)}, "
            f"{sql_quote(player_ids.get(a1) if a1 else None)}, {sql_quote(player_ids.get(a2) if a2 else None)}, "
            f"{sql_quote(player_ids.get(b1) if b1 else None)}, {sql_quote(player_ids.get(b2) if b2 else None)}, "
            f"{sql_quote(match['score_a'])}, {sql_quote(match['score_b'])}, "
            f"{sql_quote(delta_a)}, {sql_quote(delta_b)}, 'ACTIVE');"
        )

        if a1:
            lines.append(
                "INSERT INTO match_player_deltas (match_id, player_id, team_side, delta) VALUES "
                f"({sql_quote(match_id)}, {sql_quote(player_ids[a1])}, 'A', {sql_quote(delta_a)});"
            )
        if a2 and match_format == "DOUBLES":
            lines.append(
                "INSERT INTO match_player_deltas (match_id, player_id, team_side, delta) VALUES "
                f"({sql_quote(match_id)}, {sql_quote(player_ids[a2])}, 'A', {sql_quote(delta_a)});"
            )
        if b1:
            lines.append(
                "INSERT INTO match_player_deltas (match_id, player_id, team_side, delta) VALUES "
                f"({sql_quote(match_id)}, {sql_quote(player_ids[b1])}, 'B', {sql_quote(delta_b)});"
            )
        if b2 and match_format == "DOUBLES":
            lines.append(
                "INSERT INTO match_player_deltas (match_id, player_id, team_side, delta) VALUES "
                f"({sql_quote(match_id)}, {sql_quote(player_ids[b2])}, 'B', {sql_quote(delta_b)});"
            )

        match_id += 1

    event_id = 1
    for player in players:
        reg_date, reg_elo = register_rows[player]
        pid = player_ids[player]
        lines.append(
            "INSERT INTO rating_events "
            "(id, player_id, event_type, event_date, tournament_id, k_factor, base_points, "
            "elo_before, delta, elo_after, note) VALUES "
            f"({sql_quote(event_id)}, {sql_quote(pid)}, 'REGISTER', {sql_quote(reg_date)}, NULL, 0, 0, "
            f"{sql_quote(reg_elo)}, 0, {sql_quote(reg_elo)}, 'legacy registration');"
        )
        event_id += 1

    for key, meta in tournaments.items():
        rows = elo_rows_by_tournament.get(key, [])
        seed_map = seed_elo_by_tournament.get(key, {})
        pmeta = pickle_meta.get(key, PickleTournamentData())
        seen_players = set()

        if rows:
            for row in rows:
                player = normalize_str(row[COL_PLAYER])
                if not player:
                    continue
                pid = player_ids[player]
                before = seed_map.get(player, pmeta.elo_before.get(player, 2000))
                after = normalize_int(row[COL_ELO], default=before)
                delta = after - before
                k_factor = normalize_int(row[COL_K], default=meta.k_factor)

                lines.append(
                    "INSERT INTO rating_events "
                    "(id, player_id, event_type, event_date, tournament_id, k_factor, base_points, "
                    "elo_before, delta, elo_after, note) VALUES "
                    f"({sql_quote(event_id)}, {sql_quote(pid)}, 'TOURNAMENT', {sql_quote(meta.date)}, "
                    f"{sql_quote(meta.tid)}, {sql_quote(k_factor)}, {sql_quote(meta.base_points)}, "
                    f"{sql_quote(before)}, {sql_quote(delta)}, {sql_quote(after)}, 'legacy tournament import');"
                )
                event_id += 1
                seen_players.add(player)
        elif pmeta.elo_after:
            for player in participants_by_tournament.get(key, []):
                pid = player_ids[player]
                before = seed_map.get(player, pmeta.elo_before.get(player, 2000))
                after = pmeta.elo_after.get(player, before)
                delta = after - before
                lines.append(
                    "INSERT INTO rating_events "
                    "(id, player_id, event_type, event_date, tournament_id, k_factor, base_points, "
                    "elo_before, delta, elo_after, note) VALUES "
                    f"({sql_quote(event_id)}, {sql_quote(pid)}, 'TOURNAMENT', {sql_quote(meta.date)}, "
                    f"{sql_quote(meta.tid)}, {sql_quote(meta.k_factor)}, {sql_quote(meta.base_points)}, "
                    f"{sql_quote(before)}, {sql_quote(delta)}, {sql_quote(after)}, 'legacy pickle tournament import');"
                )
                event_id += 1
                seen_players.add(player)

        for player in participants_by_tournament.get(key, []):
            if player in seen_players:
                continue
            pid = player_ids[player]
            before = seed_map.get(player, 2000)
            after = before
            lines.append(
                "INSERT INTO rating_events "
                "(id, player_id, event_type, event_date, tournament_id, k_factor, base_points, "
                "elo_before, delta, elo_after, note) VALUES "
                f"({sql_quote(event_id)}, {sql_quote(pid)}, 'TOURNAMENT', {sql_quote(meta.date)}, "
                f"{sql_quote(meta.tid)}, {sql_quote(meta.k_factor)}, {sql_quote(meta.base_points)}, "
                f"{sql_quote(before)}, 0, {sql_quote(after)}, 'legacy participant without ELO row');"
            )
            event_id += 1

    lines.append("COMMIT;")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))


def validate_columns(df: pd.DataFrame, required: List[str], label: str) -> None:
    missing = [column for column in required if column not in df.columns]
    if missing:
        raise ValueError(f"{label} is missing required columns: {missing}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export D1 seed SQL from legacy ELO project data.")
    parser.add_argument("--excel", required=True, help="Path to legacy xlsx file.")
    parser.add_argument("--pickles", default="", help="Path to legacy pickle folder.")
    parser.add_argument("--output", required=True, help="Output SQL file path.")
    args = parser.parse_args()

    elo_df = pd.read_excel(args.excel, sheet_name="ELO")
    games_df = pd.read_excel(args.excel, sheet_name="Games")

    validate_columns(elo_df, [COL_DATE, COL_TOURNAMENT, COL_K, COL_PLAYER, COL_ELO], "ELO sheet")
    validate_columns(
        games_df,
        [COL_DATE, COL_TOURNAMENT, COL_K, COL_DOUBLES_FLAG, COL_NAME1, COL_NAME1A, COL_NAME2, COL_NAME2A, COL_SCORE1, COL_SCORE2, COL_DELTA1, COL_DELTA2],
        "Games sheet",
    )

    pickle_meta = load_pickle_metadata(args.pickles)
    tournaments = build_tournaments(elo_df, games_df, pickle_meta)
    participants_by_tournament = collect_participants(elo_df, games_df, tournaments, pickle_meta)
    players = collect_players(elo_df, games_df, pickle_meta)
    player_ids = {name: idx + 1 for idx, name in enumerate(players)}

    latest_elo = build_latest_elo(elo_df, players, pickle_meta)
    seed_elo_by_tournament, elo_rows_by_tournament = build_seed_elo(
        elo_df=elo_df,
        players=players,
        tournaments=tournaments,
        participants_by_tournament=participants_by_tournament,
        pickle_meta=pickle_meta,
    )
    register_rows = build_register_rows(elo_df, players, latest_elo)
    normalized_matches = build_normalized_matches(games_df, pickle_meta)

    write_sql(
        output_path=args.output,
        players=players,
        player_ids=player_ids,
        latest_elo=latest_elo,
        tournaments=tournaments,
        participants_by_tournament=participants_by_tournament,
        seed_elo_by_tournament=seed_elo_by_tournament,
        register_rows=register_rows,
        elo_rows_by_tournament=elo_rows_by_tournament,
        normalized_matches=normalized_matches,
        pickle_meta=pickle_meta,
    )

    print(f"SQL export completed: {args.output}")
    print(f"Players: {len(players)}")
    print(f"Tournaments: {len(tournaments)}")
    print(f"Matches: {len(normalized_matches)}")


if __name__ == "__main__":
    main()
