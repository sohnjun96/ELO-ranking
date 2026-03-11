from ELO import *
import pandas as pd
import streamlit as st
import pickle
import os
from datetime import datetime
from 홈 import create_recent_games_form
import plotly.express as px
import plotly.graph_objects as go
import numpy as np

# 색상 테마 설정
COLOR_WIN = '#2196F3'  # 승리 색상 (파란색)
COLOR_LOSE = '#F44336'  # 패배 색상 (빨간색)
COLOR_PRIMARY = '#1E88E5'  # 주요 차트 색상 (파란색)

def load_data():
    """데이터 파일을 로드하고 초기화합니다."""
    data_file_path = "data/data.xlsx"
    state_file_path = "data/state.pickle"
    
    elo_hist, games_hist = load_excel(data_file_path)
    ranking_table = create_ranking_table(elo_hist)
    등록선수 = ranking_table["이름"].unique()
    
    return elo_hist, games_hist, ranking_table, 등록선수

def calculate_statistics(elo_hist, games_hist, 등록선수, ranking_table):
    """선수별 통계 데이터를 계산합니다."""
    통계_tmp = []
    
    for 선수 in 등록선수:
        대회수 = num_of_matchs(검색_ELO(elo_hist, 선수))
        경기수 = num_of_games(검색_게임(games_hist, 선수))
        
        검색결과 = 검색_게임(games_hist, 선수)
        게임_전적 = 전적계산(검색결과)
        단식_전적 = 전적계산(검색결과[검색결과['복식여부']=='단식'])
        복식_전적 = 전적계산(검색결과[검색결과['복식여부']=='복식'])
        ELO_전적 = 검색_ELO(elo_hist, 선수)
        
        ELO_현재 = round(elo_check(ranking_table, 선수))
        랭킹_현재 = ranking_table.index[(ranking_table["이름"]==선수)][0]
        
        record = {
            "이름": 선수,
            "랭킹_현재": 랭킹_현재,
            "ELO 현재": ELO_현재,
            "ELO 최고": ELO_전적["ELO"].max(),
            "ELO 최저": ELO_전적["ELO"].min(),
            "대회수": 대회수,
            "전체_경기수": 게임_전적['전체'],
            "전체_승리수": 게임_전적['승리'],
            "전체_패배수": 게임_전적['패배'],
            "전체_승률": ZeroDivision(게임_전적['승리'], 게임_전적['전체']),
            "단식_경기수": 단식_전적['전체'],
            "단식_승리수": 단식_전적['승리'],
            "단식_패배수": 단식_전적['패배'],
            "단식_승률": ZeroDivision(단식_전적['승리'], 단식_전적['전체']),
            "복식_경기수": 복식_전적['전체'],
            "복식_승리수": 복식_전적['승리'],
            "복식_패배수": 복식_전적['패배'],
            "복식_승률": ZeroDivision(복식_전적['승리'], 복식_전적['전체']),
        }
        통계_tmp.append(record)
    
    통계_전체 = pd.DataFrame(통계_tmp)
    통계_전체.set_index("이름", inplace=True)
    return 통계_전체

def create_elo_trend_data(elo_hist, 등록선수):
    """ELO 추이 데이터를 생성합니다."""
    elo_trend = pd.DataFrame()
    
    # 날짜 데이터를 datetime 형식으로 변환
    elo_hist['날짜'] = pd.to_datetime(elo_hist['날짜'])
    
    # 모든 대회 날짜 가져오기
    all_dates = sorted(elo_hist['날짜'].unique())
    
    for player in 등록선수:
        player_elo = 검색_ELO(elo_hist, player)
        player_elo['날짜'] = pd.to_datetime(player_elo['날짜'])  # 선수 데이터의 날짜도 변환
        player_elo['선수'] = player
        
        # 선수의 첫 점수가 기록된 날짜 찾기
        first_date = player_elo['날짜'].min()
        
        # 선수의 첫 점수 이후의 모든 날짜에 대해 데이터 생성
        player_dates = [date for date in all_dates if date >= first_date]
        player_data = pd.DataFrame({'날짜': player_dates})
        
        # 기존 데이터와 병합
        player_data = pd.merge(player_data, player_elo, on='날짜', how='left')
        player_data['선수'] = player
        
        # ELO 점수를 forward fill 방식으로 채우기
        player_data['ELO'] = player_data['ELO'].ffill()
        
        elo_trend = pd.concat([elo_trend, player_data])
    
    return elo_trend

def create_elo_distribution_plot(통계_전체):
    """ELO 분포 그래프를 생성합니다."""
    fig = go.Figure()
    
    hist_data = 통계_전체['ELO 현재']
    hist, bin_edges = np.histogram(hist_data, bins=10)
    bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2
    
    fig.add_trace(go.Scatter(
        x=bin_centers,
        y=hist,
        mode='lines',
        line=dict(
            shape='spline',
            smoothing=0.6,
            color=COLOR_PRIMARY,
            width=3
        ),
        fill='tozeroy',
        fillcolor='rgba(30, 136, 229, 0.2)',
        name='ELO 분포'
    ))
    
    평균_ELO = 통계_전체['ELO 현재'].mean()
    표준편차 = 통계_전체['ELO 현재'].std()
    
    fig.add_vline(
        x=평균_ELO,
        line_dash="dash",
        line_color="red",
        annotation_text=f"평균: {int(평균_ELO)}",
        annotation_position="top right"
    )
    
    fig.add_vrect(
        x0=평균_ELO - 표준편차,
        x1=평균_ELO + 표준편차,
        fillcolor="gray",
        opacity=0.2,
        line_width=0,
        annotation_text=f"±{int(표준편차)}",
        annotation_position="top left"
    )
    
    fig.update_layout(
        title='ELO 점수 분포',
        xaxis_title='ELO 점수',
        yaxis_title='선수 수',
        height=400,
        showlegend=False,
        plot_bgcolor='rgba(0,0,0,0)',
        paper_bgcolor='rgba(0,0,0,0)',
        xaxis=dict(
            gridcolor='lightgray',
            zerolinecolor='lightgray',
            showgrid=False
        ),
        yaxis=dict(
            gridcolor='lightgray',
            zerolinecolor='lightgray',
            showgrid=False
        ),
        margin=dict(l=40, r=40, t=40, b=40)
    )
    
    return fig, 평균_ELO, 표준편차

def create_elo_trend_plot(elo_trend, selected_players):
    """ELO 추이 그래프를 생성합니다."""
    fig = px.line(elo_trend[elo_trend['선수'].isin(selected_players)], 
                  x='날짜', 
                  y='ELO', 
                  color='선수',
                  title='선택한 선수들의 ELO 점수 추이',
                  markers=True)
    fig.update_layout(
        height=500,
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1
        )
    )
    return fig

def create_match_stats_plot(통계_전체, 종류_select, 단복_select):
    """경기 통계 그래프를 생성합니다."""
    if 단복_select == "전체":
        df = 통계_전체[["전체_승률", "전체_경기수", "전체_승리수", "전체_패배수"]].rename(
            columns={"전체_승률":"승률", "전체_경기수":"경기", "전체_승리수":"승리", "전체_패배수":"패배"})
    elif 단복_select == "단식":
        df = 통계_전체[["단식_승률", "단식_경기수", "단식_승리수", "단식_패배수"]].rename(
            columns={"단식_승률":"승률", "단식_경기수":"경기", "단식_승리수":"승리", "단식_패배수":"패배"})
    else:
        df = 통계_전체[["복식_승률", "복식_경기수", "복식_승리수", "복식_패배수"]].rename(
            columns={"복식_승률":"승률", "복식_경기수":"경기", "복식_승리수":"승리", "복식_패배수":"패배"})
    
    if 종류_select == "승률":
        df = df.sort_values('승률', ascending=False)
    elif 종류_select == "승리 수":
        df = df.sort_values('승리', ascending=False)
    else:
        df = df.sort_values('경기', ascending=False)
    
    fig = go.Figure()
    
    if 종류_select == "승률":
        fig.add_trace(go.Bar(
            x=df.index,
            y=df['승률'],
            name='승률',
            marker_color=COLOR_PRIMARY,
            text=df['승률'].apply(lambda x: f"{x}%"),
            textposition='auto'
        ))
        fig.update_layout(
            title=f'{단복_select} 승률 TOP 10',
            yaxis_title='승률 (%)',
            height=400
        )
    elif 종류_select == "승리 수":
        fig.add_trace(go.Bar(
            x=df.index,
            y=df['승리'],
            name='승리',
            marker_color=COLOR_WIN,
            text=df['승리'],
            textposition='auto'
        ))
        fig.add_trace(go.Bar(
            x=df.index,
            y=df['패배'],
            name='패배',
            marker_color=COLOR_LOSE,
            text=df['패배'],
            textposition='auto'
        ))
        fig.update_layout(
            title=f'{단복_select} 승패 수 TOP 10',
            yaxis_title='경기 수',
            barmode='stack',
            height=400
        )
    else:
        fig.add_trace(go.Bar(
            x=df.index,
            y=df['경기'],
            name='경기 수',
            marker_color=COLOR_PRIMARY,
            text=df['경기'],
            textposition='auto'
        ))
        fig.update_layout(
            title=f'{단복_select} 경기 수 TOP 10',
            yaxis_title='경기 수',
            height=400
        )
    
    fig.update_traces(
        textfont_size=12,
        textangle=0,
        textposition="auto",
        cliponaxis=False
    )
    
    return fig, df

def create_tournament_stats_plot(games_hist):
    """대회 통계 그래프를 생성합니다."""
    대회별_경기수 = games_hist.groupby('대회명').size().reset_index(name='경기수')
    대회별_경기수 = 대회별_경기수.sort_values('경기수', ascending=False)
    
    fig = px.bar(대회별_경기수.head(10), 
                 x='대회명', 
                 y='경기수',
                 title='대회별 경기 수 TOP 10',
                 color_discrete_sequence=[COLOR_PRIMARY])
    return fig

def ZeroDivision(num1, num2):
    """0으로 나누는 것을 방지하는 함수"""
    if num2 >= 3:
        result = round(num1/num2*100)
    else:
        result = 0
    return result

def main():
    # 데이터 로드
    elo_hist, games_hist, ranking_table, 등록선수 = load_data()
    
    # 통계 데이터 계산
    통계_전체 = calculate_statistics(elo_hist, games_hist, 등록선수, ranking_table)
    
    # ELO 추이 데이터 생성
    elo_trend = create_elo_trend_data(elo_hist, 등록선수)
    
    # 페이지 헤더
    st.header("🎯 전체 통계")
    
    # 상단 요약 카드
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("총 선수 수", len(등록선수))
    with col2:
        st.metric("총 경기 수", len(games_hist))
    with col3:
        st.metric("총 대회 수", len(games_hist['대회명'].unique()))
    with col4:
        st.metric("평균 ELO", round(통계_전체['ELO 현재'].mean()))
    
    # 탭 생성
    tab1, tab2, tab3 = st.tabs(["랭킹", "경기", "대회"])
    
    # 랭킹 탭
    with tab1:
        st.subheader("랭킹 및 ELO 통계")
        
        # ELO 분포 그래프
        fig, 평균_ELO, 표준편차 = create_elo_distribution_plot(통계_전체)
        st.plotly_chart(fig, use_container_width=True)
        
        # ELO 통계 요약
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("평균 ELO", int(평균_ELO))
        with col2:
            st.metric("표준편차", int(표준편차))
        with col3:
            st.metric("최고 ELO", int(통계_전체['ELO 최고'].max()))
        
        # 랭킹 및 ELO 테이블
        st.dataframe(통계_전체[["랭킹_현재", "ELO 현재", "ELO 최고", "ELO 최저"]]
                    .sort_values('랭킹_현재', ascending=True)
                    .style.background_gradient(subset=['ELO 현재'], cmap='Blues'),
                    use_container_width=True)
        
        # 선수별 ELO 추이 분석
        st.subheader("선수별 ELO 추이 분석")
        selected_players_ranking = st.multiselect(
            "분석하고 싶은 선수를 선택하세요",
            options=등록선수,
            default=등록선수.tolist(),
            key="ranking_players"
        )
        
        if selected_players_ranking:
            fig = create_elo_trend_plot(elo_trend, selected_players_ranking)
            st.plotly_chart(fig, use_container_width=True)
    
    # 경기 탭
    with tab2:
        st.subheader("경기 통계")
        
        종류_select = st.pills("종류", ["승률", "승리 수", "경기 수"], default="승률")
        단복_select = st.segmented_control("단식복식", ["전체", "단식", "복식"], default="전체")
        
        fig, df = create_match_stats_plot(통계_전체, 종류_select, 단복_select)
        st.plotly_chart(fig, use_container_width=True)
        
        # 데이터프레임 표시
        config = {
            "승률": st.column_config.NumberColumn(format="%d %%"),
            "경기": st.column_config.NumberColumn(format="%d 경기"),
            "승리": st.column_config.NumberColumn(format="%d 승"),
            "패배": st.column_config.NumberColumn(format="%d 패")
        }
        st.dataframe(df.head(10), column_config=config)
    
    # 대회 탭
    with tab3:
        st.subheader("대회 통계")
        
        fig = create_tournament_stats_plot(games_hist)
        st.plotly_chart(fig, use_container_width=True)
        
        # 최근 대회 결과
        st.subheader("최근 대회 결과")
        최근_대회 = games_hist.sort_values('날짜', ascending=False).head(20)
        st.dataframe(최근_대회[['날짜', '대회명', '이름1', '이름2', '점수1', '점수2', '복식여부']],
                    use_container_width=True)

if __name__ == "__main__":
    main()
