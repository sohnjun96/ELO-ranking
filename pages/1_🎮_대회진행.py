from ELO import *
import pandas as pd
import streamlit as st
import pickle
import os
from datetime import datetime
from slack import *
import shutil
import zipfile

# 파일 경로 설정
data_file_path = "data/data.xlsx"
state_file_path = "state.pickle"

# ELO 데이터 로드
def load_elo_data(file_path):
    try:
        data = pd.ExcelFile(file_path)
        elo_data = data.parse("ELO")
        return sorted(elo_data["이름"].unique())
    except Exception as e:
        st.error(f"ELO 데이터를 로드하는 중 오류 발생: {e}")
        return []

# State 저장
def save_state(state):
    with open(state_file_path, "wb") as f:
        pickle.dump(state, f)

# State 종료
def finish_state(state):
    with open(f"data/pickles/{state['대회일자']}_{state['대회명']}.pickle", "wb") as f:
        pickle.dump(state, f)
    if os.path.exists(state_file_path):
        os.remove(state_file_path)
        
# State 로드
def load_state():
    if os.path.exists(state_file_path):
        with open(state_file_path, "rb") as f:
            return pickle.load(f)
    return None

# 새로운 ELO 기록 등록 함수
def add_elo(elo_hist, record):
    elo_hist = pd.concat([elo_hist, pd.DataFrame([record])], ignore_index=True)
    return elo_hist

def add_games(games_hist, game):
    games_hist = pd.concat([games_hist, pd.DataFrame([game])], ignore_index=True)
    return games_hist

def 대회종료(state):
    
    # data.xlsx 로드
    elo_hist, games_hist = load_excel(data_file_path)
    elo_prev = elo_system.점수().copy()
    
    for 경기기록 in state['경기기록']:
        이름1 = 경기기록['이름1']
        이름1A = 경기기록['이름1A']
        이름2 = 경기기록['이름2']
        이름2A = 경기기록['이름2A']
        팀A = (이름1, 이름1A)
        팀B = (이름2, 이름2A)
        점수1 = 경기기록['점수1']
        점수2 = 경기기록['점수2']
        
        if 경기기록['복식여부'] == "복식":
            tmp_game = elo_system.게임_복식(팀A, 팀B, 점수1, 점수2)
        else:
            tmp_game = elo_system.게임(이름1, 이름2, 점수1, 점수2)
        
        경기기록['델타1'] = tmp_game['델타1']
        경기기록['델타2'] = tmp_game['델타2']
        
        game = {"날짜": state['대회일자'],
                 "대회명": state['대회명'],
                 "K값": elo_system.k,
                "복식여부": 경기기록['복식여부'],
                 "이름1": 이름1,
                "이름1A": 이름1A,
                "이름2": 이름2,
                "이름2A": 이름2A,
                "점수1": 점수1,
                "점수2": 점수2,
                "델타1": tmp_game['델타1'],
                "델타2": tmp_game['델타2'],
               }
        
        
        games_hist = add_games(games_hist, game)
    
    elo_result = elo_system.종료().copy()
    
    for 참가자 in state['참가자']:
        record = {"날짜": state['대회일자'],
                 "대회명": state['대회명'],
                 "K값": elo_system.k,
                 "이름": 참가자,
                 "ELO": elo_result[참가자]
                 }
        elo_hist = add_elo(elo_hist, record)
    
    save_to_excel(data_file_path, elo_hist, games_hist)
    
    state["ELO"] = {"기존": elo_prev, 
                   "결과": elo_result,
                   "elo_system": elo_system}
    
    finish_state(state)
    
    st.toast("대회 입력 완료! 대회기록에서 결과를 확인하세요")
        
    return elo_result


# 초기 상태 확인
state = load_state()
elo_names = load_elo_data(data_file_path)

if state is None:
    st.title("새 대회 시작")

    # 대회 정보 입력
    tournament_name = st.text_input("대회명")
    tournament_date = st.date_input("대회일자", datetime.today())
    tournament_type = st.radio(
            "대회종류",
            ["정기", "상시", "친선"],
            help=f"정기는 K={k_정기}, 상시는 K={k_상시}, 친선은 K={k_친선} 입니다",
        )
    participants = st.multiselect("참가자", elo_names)

    # 확인 버튼
    if st.button("확인"):
        if not tournament_name.strip():
            st.error("대회명을 입력해주세요.")
        elif not participants:
            st.error("참가자를 선택해주세요.")
        else:
            state = {
                "대회명": tournament_name,
                "대회일자": str(tournament_date),
                "대회종류": tournament_type,
                "참가자": participants,
                "경기기록": []
            }
            save_state(state)
            st.success("대회가 시작되었습니다!")
            st.rerun()

else:
    # ELO 로딩
    elo_system = Elo()
    
    # ELO에 k 값 수정
    if state['대회종류'] == "정기":
        elo_system.k = k_정기
        elo_system.base = 4
    elif state['대회종류'] == "상시":
        elo_system.k = k_상시
        elo_system.base = 1
    else:
        elo_system.k = k_친선
        elo_system.base = 0
        
    st.title(f'[대회 중] {state["대회명"]}')
    st.write(f"**대회일자**: {state['대회일자']}")
    st.write(f"**대회종류**: {state['대회종류']}")
    st.write(f"**K**: {elo_system.k}")
    st.write(f"**base**: {elo_system.base}")
    
    # 참가자 elo_system에 등록
    ranking_table = create_ranking_table(pd.ExcelFile(data_file_path).parse("ELO"))
    
    for 참가자 in state['참가자']:
        elo_system.등록(참가자, elo_check(ranking_table, 참가자))
    
    
    # 경기 기록 모달 대화 상자 구현
    @st.dialog("경기 기록 입력")
    def register_player():
        doubles = st.checkbox("복식 여부")

        if doubles:
            teamA1 = st.selectbox("팀 A - 선수1", state["참가자"], key="teamA1", index = 0)
            teamA2 = st.selectbox("팀 A - 선수2", state["참가자"], key="teamA2", index = 1)
            teamB1 = st.selectbox("팀 B - 선수1", state["참가자"], key="teamB1", index = 2)
            teamB2 = st.selectbox("팀 B - 선수2", state["참가자"], key="teamB2", index = 3)
        else:
            player1 = st.selectbox("선수1", state["참가자"], key="player1", index = 0)
            player2 = st.selectbox("선수2", state["참가자"], key="player2", index = 1)

        score1 = st.number_input("점수1", min_value=0, max_value=7, value=0, step=1)
        score2 = st.number_input("점수2", min_value=0, max_value=7, value=0, step=1)
        
        confirm = st.button("확인")
        cancel = st.button("취소")

        if confirm and not(score1 == 0 and score2 == 0):
            if doubles:
                delta = abs(elo_system.델타_복식((teamA1, teamA2), (teamB1, teamB2), scoring(score1,score2))[0])
            else:
                if player1 == player2:
                    st.warning("입력을 확인해주세요.")
                    confirm = False
                    st.rerun()
                delta = abs(elo_system.델타(player1, player2, scoring(score1,score2))[0])
                
            match_record = {
                "복식여부": "복식" if doubles else "단식",
                "이름1": teamA1 if doubles else player1,
                "이름1A": teamA2 if doubles else "",
                "이름2": teamB1 if doubles else player2,
                "이름2A": teamB2 if doubles else "",
                "점수1": score1,
                "점수2": score2,
            }
            state["경기기록"].append(match_record)
            save_state(state)
            st.success("경기 기록이 저장되었습니다!")
            st.rerun()
        elif confirm:
            st.warning("입력을 확인해주세요.")

        if cancel:
            st.info("경기 기록 입력이 취소되었습니다.")

    if "register" not in st.session_state:
        if st.button("경기 기록"):
            register_player()
    else:
        st.write(f"경기 기록이 저장되었습니다!")

    # 탭 구성
    tabs = st.tabs(["설정", "분석", "현황", "종료"])

    # 설정 탭
    with tabs[0]:
        # 경기시작 여부
        경기시작 = len(pd.DataFrame(state["경기기록"]))>0
        
        st.subheader("대회 설정")
        new_name = st.text_input("대회명", state["대회명"])
        new_date = st.date_input("대회일자", datetime.strptime(state["대회일자"], "%Y-%m-%d"))
        
        new_type = st.radio(
            "대회종류",
            ["정기", "상시", "친선"],
            index=["정기", "상시", "친선"].index(state["대회종류"]),
            help=f"정기는 K={k_정기}, 상시는 K={k_상시}, 친선은 K={k_친선} 입니다. 경기 시작 후에는 변경할 수 없습니다.",
            disabled=경기시작
        )
        new_participants = st.multiselect("참가자", elo_names, default=state["참가자"])

        if st.button("변경사항 저장"):
            state.update({
                "대회명": new_name,
                "대회일자": str(new_date),
                "대회종류": new_type,
                "참가자": new_participants,
            })
            save_state(state)
            st.success("변경사항이 저장되었습니다.")
            st.rerun()

    # 분석 탭
    with tabs[1]:
        
        try:           
            df_승률 = pd.DataFrame(elo_system.승률(), columns=("선수1", "선수2", "승률"))
            
            # ELO 랭킹 부분
            st.subheader("ELO 랭킹")
            df_ELO = pd.DataFrame(elo_system.랭킹(), columns=["이름", "ELO"])
            st.dataframe(df_ELO, hide_index=True, width = 200)
            
            with st.container(border=True):
                # 승률 분석 부분
                st.subheader("승률 분석")
                col1, col2 = st.columns(2)
                with col1:
                    선수1 = st.selectbox("선수1", state["참가자"], index = 0)
                with col2:
                    선수2 = st.selectbox("선수2", state["참가자"], index = 1)
                
                if 선수1 != 선수2:
                    try:
                        승률1 = df_승률.loc[(df_승률["선수1"]==선수1)*(df_승률["선수2"]==선수2),["승률"]].iloc[0,0]
                        승률2 = 1-승률1
                    except:
                        승률2 = df_승률.loc[(df_승률["선수1"]==선수2)*(df_승률["선수2"]==선수1),["승률"]].iloc[0,0]
                        승률1 = 1-승률2
                        
                    col3, col4 = st.columns(2)
                    with col3:
                        st.write(f"### {round(승률1*100,)} %")
                    with col4:
                        st.write(f"### {round(승률2*100,)} %")
                
                # st.dataframe(df_승률)
            
        except Exception as e:
            st.error(f"랭킹 테이블을 생성하는 중 오류 발생: {e}")

    # 현황 탭
    with tabs[2]:
        경기기록 = pd.DataFrame(state["경기기록"])
        경기기록.index = 경기기록.index+1
        
        st.subheader("현황")
        if len(경기기록)>0:
            st.write(f"**진행 경기** : 총 {len(경기기록)} 회")
            
            st.dataframe(generate_league_schedule(pd.DataFrame(state["경기기록"]), state["참가자"]))
            
            with st.container(border=True):
                for 참가자 in state['참가자']:
                    games_state = state_to_games_hist(state)
                    전적 = 전적계산(검색_게임(games_state, 참가자))
                    # st.write(전적)
                    st.write(f'**{참가자}** -- 총 {전적["전체"]} 경기 ( {전적["승리"]} 승 / {전적["무승부"]} 무 / {전적["패배"]} 패 )')
            
            st.dataframe(경기기록)
            
            # 경기 기록 삭제 모달 대화 상자 구현
            @st.dialog("경기 기록 삭제")
            def delete_game():
                score1 = st.number_input("n번째 경기 삭제", min_value=1, max_value=len(경기기록), value=1, step=1)

                confirm = st.button("확인")
                cancel = st.button("취소")

                if confirm:
                    del state["경기기록"][score1-1]
                    save_state(state)
                    st.success(f"{score1}번째 경기가 삭제되었습니다!")
                    st.rerun()

                if cancel:
                    st.info("경기 기록 삭제가 취소되었습니다.")

            if "register" not in st.session_state:
                if st.button("경기 삭제"):
                    delete_game()
            else:
                st.write(f"경기 기록이 삭제되었습니다!")
            
        else:
            st.warning("경기를 기록해주세요. ")

    # 종료 탭
    with tabs[3]:
        st.subheader("대회 종료")
        st.warning("아래 버튼은 대회를 종료시킵니다. ")
        st.write("#### 대회 규모별 추가 점수 : ")
        st.write("- 정기 : 경기수 x 4 점")
        st.write("- 상시 : 경기수 x 1 점")
        st.write("- 친선 : 0 점")
        st.divider()
        col1, col2 = st.columns(2)
        with col1:
            if st.button("대회 종료"):
                대회종료(state)
                file_path = 'data'
                zip_file = zipfile.ZipFile("data.zip", "w")  # "w": write 모드
                for (path, dir, files) in os.walk(file_path):
                    for file in files:
                        zip_file.write(os.path.join(path, file), compress_type=zipfile.ZIP_DEFLATED)
                zip_file.close()
                
                if slack_upload("data.zip", f"{state['대회일자']}_{state['대회명']}"):
                    with open('.version', 'w') as file:
                        file.write(f"{state['대회일자']}_{state['대회명']}")
                    state = None
                    elo_system.초기화()
                    st.rerun()
                else:
                    st.write("저장 중 오류 발생!")
        with col2:
            if st.button("대회 취소"):
                # if st.button("정말 취소하시겠습니까?"):
                if os.path.exists(state_file_path):
                    os.remove(state_file_path)
                state = None
                elo_system.초기화()
                st.rerun()
        