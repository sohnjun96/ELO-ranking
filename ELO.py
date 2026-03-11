import pandas as pd

# 변수 설정
k_정기 = 200
k_상시 = 100
k_친선 = 0


class Elo:
    def __init__(self, initial_k=100, initial_base = 1, default_rating=2000):
        self.ratings = {}
        self.k = initial_k
        self.base = initial_base
        self.default_rating = default_rating
        self.pending_deltas = []  # 대기 중인 델타 저장
        self.games = []

    def 등록(self, name, init_point=None):
        if name not in self.ratings:
            self.ratings[name] = init_point if init_point is not None else self.default_rating
            return True
        return False

    def 선수(self):
        return list(self.ratings.keys())

    def 델타(self, player_a, player_b, result_a):
        if player_a not in self.ratings or player_b not in self.ratings:
            raise ValueError(f"플레이어가 등록되지 않았습니다: {player_a}, {player_b}")

        rating_a = self.ratings[player_a]
        rating_b = self.ratings[player_b]

        expected_a = 1 / (1 + 10 ** ((rating_b - rating_a) / 400))
        delta = abs(self.k * (result_a - expected_a))
        delta_a = self.k * (result_a - expected_a)
        delta_b = -delta_a

        return round(delta_a), round(delta_b)

    def 델타_복식(self, team_a, team_b, result_a):
        if any(player not in self.ratings for player in team_a) or any(player not in self.ratings for player in team_b):
            raise ValueError(f"플레이어가 등록되지 않았습니다: {team_a}, {team_b}")

        avg_rating_a = sum(self.ratings[player] for player in team_a) / len(team_a)
        avg_rating_b = sum(self.ratings[player] for player in team_b) / len(team_b)

        expected_a = 1 / (1 + 10 ** ((avg_rating_b - avg_rating_a) / 400))
        expected_b = 1 - expected_a

        delta_a = self.k * (result_a - expected_a)
        delta_b = self.k * ((1 - result_a) - expected_b)

        return round(delta_a), round(delta_b)

    # 게임 ELO 계산 기능
    def 게임(self, player_a, player_b, score_a, score_b):
        if player_a not in self.ratings or player_b not in self.ratings:
            raise ValueError(f"플레이어가 등록되지 않았습니다: {player_a}, {player_b}")
        
        result = scoring(score_a, score_b)
        
        rating_a = self.ratings[player_a]
        rating_b = self.ratings[player_b]

        expected_a = 1 / (1 + 10 ** ((rating_b - rating_a) / 400))
        delta = round(abs(self.k * (result - expected_a)))
        delta_a = round(self.k * (result - expected_a)) + self.base
        delta_b = round(-self.k * (result - expected_a)) + self.base

        self.pending_deltas.append((player_a, delta_a))
        self.pending_deltas.append((player_b, delta_b))
        
        game = {
            '복식여부': '단식',
            '이름1' : player_a,
            '이름1A': '',
            '이름2': player_b,
            '이름2A': '',
            '점수1': score_a,
            '점수2': score_b,
            '델타1': delta_a,
            '델타2': delta_b,
        }
        self.games.append(game)
        
        return game
    
    
    def 게임_복식(self, team_a, team_b, score_a, score_b):
        if any(player not in self.ratings for player in team_a) or any(player not in self.ratings for player in team_b):
            raise ValueError(f"플레이어가 등록되지 않았습니다: {team_a}, {team_b}")
        
        result = scoring(score_a, score_b)
        
        avg_rating_a = sum(self.ratings[player] for player in team_a) / len(team_a)
        avg_rating_b = sum(self.ratings[player] for player in team_b) / len(team_b)

        expected_a = 1 / (1 + 10 ** ((avg_rating_b - avg_rating_a) / 400))
        expected_b = 1 - expected_a

        delta_a = round(self.k * (result - expected_a)) + self.base
        delta_b = round(self.k * ((1 - result) - expected_b)) + self.base

        for player in team_a:
            self.pending_deltas.append((player, delta_a))

        for player in team_b:
            self.pending_deltas.append((player, delta_b))
        
        game = {
            '복식여부': '단식',
            '이름1' : team_a[0],
            '이름1A': team_a[1],
            '이름2': team_b[0],
            '이름2A': team_b[1],
            '점수1': score_a,
            '점수2': score_b,
            '델타1': delta_a,
            '델타2': delta_b,
        }
        self.games.append(game)
        
        return game

    def 승률(self):
        players = list(self.ratings.keys())
        winrates = []

        for i, player_a in enumerate(players):
            for j, player_b in enumerate(players):
                if i < j:
                    rating_a = self.ratings[player_a]
                    rating_b = self.ratings[player_b]
                    expected_a = 1 / (1 + 10 ** ((rating_b - rating_a) / 400))
                    winrates.append((player_a, player_b, round(expected_a, 4)))

        return winrates

    def 랭킹(self):
        return sorted(self.ratings.items(), key=lambda x: x[1], reverse=True)
        
    def 점수(self):
        return self.ratings

    def 종료(self):
        """
        대기 중인 델타를 한꺼번에 반영하고, 현재 점수를 출력.
        """
        for player, delta in self.pending_deltas:
            self.ratings[player] += delta

        self.pending_deltas.clear()
        
        return self.점수()
    
    def 초기화(self):
        return self.ratings.clear()
    
    
# 엑셀 로드 함수
def load_excel(file_path):
    data = pd.ExcelFile(file_path)
    elo_hist = data.parse("ELO")
    games_hist = data.parse("Games")
    return elo_hist, games_hist

# 엑셀 저장 함수
def save_to_excel(file_path, elo_hist, games_hist):
    with pd.ExcelWriter(file_path) as writer:
        elo_hist.to_excel(writer, sheet_name="ELO", index=False)
        games_hist.to_excel(writer, sheet_name="Games", index=False)


# 전적계산 
def 전적계산(검색결과):
    try:
        result = {"승리": sum(검색결과["점수1"] > 검색결과["점수2"]),
                  "패배": sum(검색결과["점수1"] < 검색결과["점수2"]),
                  "무승부": sum(검색결과["점수1"] == 검색결과["점수2"]),
                  "전체": len(검색결과)
                 }
    except:
        result = {"승리": 0,
                  "패배": 0,
                  "무승부": 0,
                  "전체": 0
                 }
    return result     

# ELO 점수 확인
def elo_check(ranking_table, name):
    return ranking_table.loc[ranking_table['이름']==name,["ELO"]].iloc[0,0]

# 승리 계수 계산
def scoring(score1, score2):
    return score1/(score1+score2)

# 랭킹 테이블 생성 함수
def create_ranking_table(elo_hist):
    # 이름별로 가장 아래쪽(마지막) 행 추출
    latest_elo = (
        elo_hist.groupby('이름', as_index=False).last()  # 이름별 가장 마지막 행 선택
    )

    # ELO 값 기준으로 정렬
    ranking_table = (
        latest_elo.sort_values(['ELO'], ascending=False)
        .reset_index(drop=True)  # 인덱스 재설정
    )

    # 필요한 열만 선택 및 랭킹 번호 추가
    ranking_table = ranking_table[['이름', 'ELO']]
    ranking_table.index += 1  # 인덱스를 1부터 시작
    
    return ranking_table

# 승자 및 팀 정보 반환 함수
def get_match_result(row, name):
    def format_names(row):
        if row['복식여부'] == '복식':
            player1 = f"{row['이름1']} & {row['이름1A']}" if row['이름1A'] else row['이름1']
            player2 = f"{row['이름2']} & {row['이름2A']}" if row['이름2A'] else row['이름2']
        else:
            player1 = row['이름1']
            player2 = row['이름2']
        return player1, player2
    
    player1, player2 = format_names(row)
    
    # 이름1, 이름1A에 해당하는 팀 점수
    if name in [row['이름1'], row['이름1A']]:
        my_score = row['점수1']
        my_delta = row['델타1']
        my_team = player1
        opponent_score = row['점수2']
        opponent_delta = row['델타2']
        opponent_team = player2
    # 이름2, 이름2A에 해당하는 팀 점수
    elif name in [row['이름2'], row['이름2A']]:      
        my_score = row['점수2']
        my_delta = row['델타2']
        my_team = player2
        opponent_score = row['점수1']
        opponent_delta = row['델타1']
        opponent_team = player1
    else:
        return "이름이 입력되지 않았습니다."
    
    if '대회명' in row.keys():
        result = {
            '이름': name,
            '팀1': my_team,
            '점수1': my_score,
            '팀2': opponent_team,
            '점수2': opponent_score,
            '날짜': row['날짜'],
            '대회명': row['대회명'],
            'K값': row['K값'],
            '복식여부': row['복식여부'],
            '델타1': my_delta,
            '델타2': opponent_delta,
        }
    else:
        result = {
            '이름': name,
            '팀1': my_team,
            '점수1': my_score,
            '팀2': opponent_team,
            '점수2': opponent_score,
            '날짜': '',
            '대회명': '',
            'K값': '',
            '복식여부': row['복식여부'],
            '델타1': my_delta,
            '델타2': opponent_delta,
        }

    return result


# 각 행에 대해 결과 생성
def process_matches(df, name):
    results = []
    for _, row in df.iterrows():
        result = get_match_result(row, name)
        results.append(result)
    return pd.DataFrame(results)[["날짜", "대회명", "팀1", "팀2", "점수1",  "점수2", "K값", "복식여부", "델타1", "델타2"]].fillna('')

# 입력_이름의 ELO 검색
def 검색_ELO(elo_hist, 입력_이름):
    return elo_hist.loc[elo_hist["이름"] == 입력_이름]

# 입력_이름의 전적 검색
def 검색_게임(games_hist, 입력_이름):
    try:
        조건 = (games_hist["이름1"] == 입력_이름) + (games_hist["이름1A"] == 입력_이름) + (games_hist["이름2"] == 입력_이름) + (games_hist["이름2A"] == 입력_이름)
        df = games_hist.loc[조건]
        result = process_matches(df, 입력_이름)
        return result.reset_index(drop=True)
    except:
        result = None
        return result

def state_to_games_hist(state):
    result = []
    for 경기 in state['경기기록']:
        games_hist = 경기.copy()
        games_hist["날짜"] = state['대회일자']
        games_hist["대회명"] = state['대회명']
        games_hist["K값"] = 200
        result.append(games_hist)
    
    return pd.DataFrame(result)

def generate_league_schedule(df, participants):
    # 단식만 필터링
    singles_df = df[df['복식여부'] == '단식']

    # 결과를 위한 빈 데이터프레임 생성 (초기값을 None으로 설정)
    score_matrix = pd.DataFrame("", index=participants, columns=participants)

    # 점수 입력
    for _, row in singles_df.iterrows():
        score_matrix.at[row['이름1'], row['이름2']] = f"{row['점수1']} : {row['점수2']}"
        score_matrix.at[row['이름2'], row['이름1']] = f"{row['점수2']} : {row['점수1']}"

    # 같은 사람끼리 대각선에 역슬래시 표시
    for participant in participants:
        score_matrix.at[participant, participant] = '\\'
        
    # 빈칸을 색칠하는 함수
    def highlight_blank_cells(val):
        if not(pd.isna(val) or val == ''):
            return 'background-color: green'  # 빈칸 색칠 (노란색)
        return ''  # 나머지는 색칠 없음
    
    # 결과 반환
    return score_matrix.style.applymap(highlight_blank_cells)

# 랭킹 이모지 반환
def rank_emoji(rank):
    table = {
        1:"🥇 ",
        2:"🥈 ",
        3:"🥉 ",
        4:":four: ",
        5:":five: ",
        6:":six: ",
        7:":seven: ",
        8:":eight: ",
        9:":nine: ",
        10:"**10**",
        11:"**11**",
        12:"**12**",
        13:"**13**",
        14:"**14**",
        15:"**15**",
        16:"**16**",
        17:"**17**",
        18:"**18**",
        19:"**19**",
        20:"**20**",
    }
    return table[rank]


def num_of_matchs(matches):
    try:
        return len(matches) - len(matches.loc[matches["대회명"] == "등록"])
    except:
        return 0

def num_of_games(games):
    try:
        return len(games)
    except:
        return 0    
    
def 랭킹_hist(elo_hist):

    tmp_날짜 = elo_hist.loc[0]['날짜']
    tmp_대회명 = elo_hist.loc[0]['대회명']
    tmp_K값 = elo_hist.loc[0]['K값']
    result = pd.DataFrame([])

    for idx, row in elo_hist.iterrows():
        if idx and ((row['날짜']!=tmp_날짜) or row['대회명'] != tmp_대회명):
            tmp = create_ranking_table(elo_hist[0:idx]).reset_index()
            tmp['대회명'] = tmp_대회명
            tmp['날짜'] = tmp_날짜
            tmp['K값'] = tmp_K값
            result = pd.concat([result, tmp])
        tmp_날짜 = row['날짜']
        tmp_대회명 = row['대회명']
        tmp_K값 = row['K값']

        if idx == len(elo_hist)-1:
            tmp = create_ranking_table(elo_hist).reset_index()
            tmp['대회명'] = tmp_대회명
            tmp['날짜'] = tmp_날짜
            tmp['K값'] = tmp_K값
            result = pd.concat([result, tmp])
    result = result.rename(columns={'index':'순위'}).reset_index(drop=True)
    
    return result
