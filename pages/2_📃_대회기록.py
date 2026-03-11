from ELO import *
import numpy as np
import pandas as pd
import streamlit as st
import pickle
import os
from datetime import datetime
from 홈 import create_recent_games_form

# 디렉토리 경로 지정
directory_path = 'data/pickles'

# 디렉토리에 있는 파일 목록 읽기
file_names = os.listdir(directory_path)
game_names = []
for file in file_names:
    if 'pickle' in file:
        game_names.append(file.split('.')[0])

game_names.sort(reverse=True)

if len(game_names)>0:
    state_file_path = directory_path + '/'+st.selectbox("대회를 선택해주세요.", game_names, index = 0)+'.pickle'
    
# State 로드
def load_state():
    if os.path.exists(state_file_path):
        with open(state_file_path, "rb") as f:
            return pickle.load(f)
    return None

# 경기 폼 생성
def create_recent_games_form_변형(game_hist):
    game = game_hist.copy()
    
    if game['복식여부'] == '복식':
        player1 = f"{game['이름1']} & {game['이름1A']}" if game['이름1A'] else game['이름1']
        player2 = f"{game['이름2']} & {game['이름2A']}" if game['이름2A'] else game['이름2']
    else:
        player1 = game['이름1']
        player2 = game['이름2']
 
    game['팀1'] = player1
    game['팀2'] = player2
    game.reset_index(drop=True, inplace=True)
    game.index += 1  # 인덱스를 1부터 시작하도록 설정
    
    with st.container(border=True):
        델타1 = game_hist["델타1"]
        델타2 = game_hist["델타2"]
        
        st.write("##### "+game_hist['복식여부'])
        col1, col2 = st.columns(2)
        with col1:
            st.metric(label = f'{player1}', value = f'{game_hist["점수1"]}', delta = f'{round(델타1)} 점 ELO')
        with col2:
            st.metric(label = f'{player2}', value = f'{game_hist["점수2"]}', delta = f'{round(델타2)} 점 ELO')

if game_names:
    # 데이터 로드
    state = load_state()
    elo_system = state["ELO"]["elo_system"]
    elo_prev = state["ELO"]["기존"]
    elo_result = state["ELO"]["결과"]

    st.title(state["대회명"])
    st.write(f"**대회일자**: {state['대회일자']}")
    st.write(f"**대회종류**: {state['대회종류']}")

    # 탭 구성
    tabs = st.tabs(["정보", "결과", "분석"])
    
    경기기록 = pd.DataFrame(state["경기기록"])
    경기기록.index = 경기기록.index+1
    
    # 정보 탭
    with tabs[0]:
        st.write(f'### 참가자: {len(state["참가자"])} 명')
        with st.container(height = 800):
            for 참가자, 점수 in sorted(state['ELO']['결과'].items(), key=lambda x: x[1], reverse=True):
                with st.container(border=True):
                    col1, col2, col3 = st.columns(3)
                    with col1:
                        st.subheader(참가자)
                    with col2:
                        결과 = round(elo_result[참가자],)
                        기존 = round(elo_prev[참가자],)
                        델타 = round(elo_result[참가자] - elo_prev[참가자],)
                        
                        st.metric(label="ELO", value = f"{결과} 점", delta=f"{델타} 점 ({기존} 점)")

    # 결과 탭
    with tabs[1]:
        단식 = 경기기록[경기기록["복식여부"] == "단식"]
        복식 = 경기기록[경기기록["복식여부"] == "복식"]

        if len(경기기록)>0:
            st.subheader(f"**경기(단식/복식)**: 총 {len(경기기록)} 회 ({len(단식)}/{len(복식)})")
            #st.write(경기기록)

            with st.container(border=True, height = 800):
                for idx, game in 경기기록.iterrows():
                    create_recent_games_form_변형(game)

        else:
            st.warning("경기를 기록해주세요. ")

    # 분석 탭
    with tabs[2]:
        # st.subheader("분석")
        # st.warning("제작 중...")
        
        입력_이름 = st.selectbox("선수를 선택해주세요.", state["참가자"])
        검색결과 = 검색_게임(경기기록, 입력_이름)
        검색결과.index = 검색결과.index+1
        게임_전적 = 전적계산(검색결과)
        단식_전적 = 전적계산(검색결과[검색결과['복식여부']=='단식'])
        복식_전적 = 전적계산(검색결과[검색결과['복식여부']=='복식'])
        
        try:
            st.write(f'**전적**: 총 {게임_전적["전체"]} 경기 ({게임_전적["승리"]} 승 / {게임_전적["패배"]} 패)')
            if 단식_전적["전체"]:
                st.write(f' - 단식: 총 {단식_전적["전체"]} 경기 ({단식_전적["승리"]} 승 / {단식_전적["패배"]} 패) / 승률 {round(단식_전적["승리"]/단식_전적["전체"]*100)}%')
            if 복식_전적["전체"]:
                st.write(f' - 복식: 총 {복식_전적["전체"]} 경기 ({복식_전적["승리"]} 승 / {복식_전적["패배"]} 패) / 승률 {round(복식_전적["승리"]/복식_전적["전체"]*100)}%')
            경기수 = num_of_games(검색결과)
            if 경기수>0:
                st.write(검색결과.loc[:,["팀1", "팀2", "점수1", "점수2", "복식여부", "델타1", "델타2"]])
            with st.container(border=True, height = 800):
                try:
                    for idx, game in 검색결과.iterrows():
                        with st.container(border=True):
                            델타1 = game["델타1"]
                            델타2 = game["델타2"]
                            st.write("#### "+game['복식여부'])
                            col1, col2 = st.columns(2)
                            with col1:
                                st.metric(label = f'{game["팀1"]}', value = f'{game["점수1"]}', delta = f'{round(델타1)} 점 ELO')
                            with col2:
                                st.metric(label = f'{game["팀2"]}', value = f'{game["점수2"]}', delta = f'{round(델타2)} 점 ELO')
                except:
                    pass
                    
        except:
           pass

else:
    st.title("대회기록")
    st.error("저장된 대회가 없습니다. ")

