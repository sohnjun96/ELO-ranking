from ELO import *
import pandas as pd
import streamlit as st
import pickle
import os
from datetime import datetime
import plotly.express as px
import plotly.graph_objects as go
from 홈 import create_recent_games_form

# 파일 경로 설정
data_file_path = "data/data.xlsx"
state_file_path = "data/state.pickle"

# 데이터 초기화
elo_hist, games_hist = load_excel(data_file_path)
ranking_table = create_ranking_table(elo_hist)
등록선수 = ranking_table["이름"].unique()

# 색상 테마 설정
COLOR_WIN = '#1E88E5'  # 승리 색상 (파란색)
COLOR_LOSE = '#F44336'  # 패배 색상 (빨간색)
COLOR_PRIMARY = '#1E88E5'  # 주요 차트 색상 (파란색)

# 상대 선수 분석 함수
def analyze_opponents(games_df, player_name):
    """상대 선수별 전적 분석"""
    if games_df.empty:
        return pd.DataFrame()
    
    # 단식 경기만 필터링
    singles = games_df[games_df['복식여부'] == '단식']
    
    opponents = []
    for _, game in singles.iterrows():
        # 상대방 찾기
        if game['이름1'] == player_name or game['이름1A'] == player_name:
            opponent = game['이름2'] if game['이름2'] != player_name else game['이름2A']
            my_score = game['점수1']
            opponent_score = game['점수2']
        else:
            opponent = game['이름1'] if game['이름1'] != player_name else game['이름1A']
            my_score = game['점수2']
            opponent_score = game['점수1']
        
        # 승패 판정
        win = my_score > opponent_score
        opponents.append({
            '상대선수': opponent,
            '승리': win,
            '내점수': my_score,
            '상대점수': opponent_score,
            '대회명': game['대회명'],
            '날짜': game['날짜']
        })
    
    # 상대 선수별 전적 집계
    if not opponents:
        return pd.DataFrame()
        
    opponents_df = pd.DataFrame(opponents)
    opponent_stats = opponents_df.groupby('상대선수').agg(
        경기수=('승리', 'count'),
        승리=('승리', 'sum'),
        총득점=('내점수', 'sum'),
        총실점=('상대점수', 'sum')
    ).reset_index()
    
    opponent_stats['패배'] = opponent_stats['경기수'] - opponent_stats['승리']
    opponent_stats['승률'] = opponent_stats['승리'] / opponent_stats['경기수'] * 100
    opponent_stats['승률'] = opponent_stats['승률'].round(0).astype(int).astype(str) + '%'
    opponent_stats['평균득점'] = round(opponent_stats['총득점'] / opponent_stats['경기수'], 1)
    opponent_stats['평균실점'] = round(opponent_stats['총실점'] / opponent_stats['경기수'], 1)
    
    # 최근 경기 날짜 추가
    recent_dates = opponents_df.groupby('상대선수')['날짜'].max().reset_index()
    opponent_stats = opponent_stats.merge(recent_dates, on='상대선수')
    
    # 최근 대회명 추가
    recent_tournaments = opponents_df.groupby('상대선수')['대회명'].last().reset_index()
    opponent_stats = opponent_stats.merge(recent_tournaments, on='상대선수')
    
    # 컬럼 순서 재정렬
    opponent_stats = opponent_stats[['상대선수', '경기수', '승리', '패배', '승률', '평균득점', '평균실점', '날짜', '대회명']]
    
    # 경기수 내림차순, 승리 내림차순으로 정렬
    opponent_stats = opponent_stats.sort_values(['경기수', '승리'], ascending=False)
    
    return opponent_stats

# 대회별 성적 분석 함수
def analyze_tournaments(games_df):
    """대회별 성적 분석"""
    if games_df.empty:
        return pd.DataFrame()
        
    tournaments = games_df.groupby('대회명').agg(
        경기수=('승패', 'count'),
        승리=('승패', lambda x: (x == '승리').sum()),
        날짜=('날짜', 'max')  # 가장 최근 날짜 사용
    ).reset_index()
    
    tournaments['패배'] = tournaments['경기수'] - tournaments['승리']
    tournaments['승률'] = tournaments['승리'] / tournaments['경기수'] * 100
    tournaments['승률'] = tournaments['승률'].round(0).astype(int).astype(str) + '%'
    
    # 날짜순으로 정렬
    tournaments = tournaments.sort_values('날짜', ascending=False)
    
    # 컬럼 순서 재정렬
    tournaments = tournaments[['날짜', '대회명', '경기수', '승리', '패배', '승률']]
    
    return tournaments

# 연도별 성적 분석 함수
def analyze_yearly_performance(games_df):
    """연도별 성적 분석"""
    if games_df.empty:
        return pd.DataFrame()
    
    # 날짜에서 연도 추출
    games_df['연도'] = pd.to_datetime(games_df['날짜']).dt.year
    
    yearly_stats = games_df.groupby('연도').agg(
        경기수=('승패', 'count'),
        승리=('승패', lambda x: (x == '승리').sum())
    ).reset_index()
    
    yearly_stats['패배'] = yearly_stats['경기수'] - yearly_stats['승리']
    yearly_stats['승률'] = round(yearly_stats['승리'] / yearly_stats['경기수'] * 100, 1)
    
    return yearly_stats.sort_values('연도', ascending=False)

def analyze_monthly_performance(games_df):
    """월별 성적 분석"""
    if games_df.empty:
        return pd.DataFrame()
    
    # 날짜에서 연도-월 추출
    games_df['날짜'] = pd.to_datetime(games_df['날짜'])
    games_df['연월'] = games_df['날짜'].dt.strftime('%Y-%m')
    
    monthly_stats = games_df.groupby('연월').agg(
        경기수=('승패', 'count'),
        승리=('승패', lambda x: (x == '승리').sum())
    ).reset_index()
    
    monthly_stats['패배'] = monthly_stats['경기수'] - monthly_stats['승리']
    monthly_stats['승률'] = monthly_stats['승리'] / monthly_stats['경기수'] * 100
    monthly_stats['승률'] = monthly_stats['승률'].round(0).astype(int).astype(str) + '%'
    
    # 연월을 'YYYY년 MM월' 형식으로 변환
    monthly_stats['연월_표시'] = monthly_stats['연월'].apply(lambda x: f"{x[:4]}년 {int(x[5:])}월")
    
    return monthly_stats.sort_values('연월', ascending=False)

def format_names(row):
    """이름 포맷팅 함수"""
    if pd.isna(row['이름1A']):
        player1 = row['이름1']
    else:
        player1 = f"{row['이름1']}/{row['이름1A']}"
    
    if pd.isna(row['이름2A']):
        player2 = row['이름2']
    else:
        player2 = f"{row['이름2']}/{row['이름2A']}"
    
    return player1, player2

def process_matches(df, name):
    """경기 데이터 처리 함수"""
    if df.empty:
        return pd.DataFrame()
    
    # 팀1, 팀2 컬럼 추가
    df[['팀1', '팀2']] = df.apply(lambda row: pd.Series(format_names(row)), axis=1)
    
    # 결과 컬럼 추가
    df['승패'] = '패배'  # 기본값을 패배로 설정
    
    # 1팀에 있는 경우
    mask_team1 = ((df['이름1'] == name) | (df['이름1A'] == name)) & (df['점수1'] > df['점수2'])
    # 2팀에 있는 경우
    mask_team2 = ((df['이름2'] == name) | (df['이름2A'] == name)) & (df['점수2'] > df['점수1'])
    
    df.loc[mask_team1 | mask_team2, '승패'] = '승리'
    
    return df

# 입력_이름의 전적 검색
def 검색_게임(games_hist, 입력_이름):
    try:
        # 1팀 또는 2팀에 있는 경우 모두 검색
        조건 = ((games_hist["이름1"] == 입력_이름) | (games_hist["이름1A"] == 입력_이름) | 
                (games_hist["이름2"] == 입력_이름) | (games_hist["이름2A"] == 입력_이름))
        df = games_hist.loc[조건]
        result = process_matches(df, 입력_이름)
        return result.reset_index(drop=True)
    except Exception as e:
        st.error(f"경기 기록 검색 중 오류 발생: {str(e)}")
        return None

입력_이름 = st.selectbox("선수를 선택해주세요. ",등록선수)

try:
    대회수 = num_of_matchs(검색_ELO(elo_hist, 입력_이름))
    경기수 = num_of_games(검색_게임(games_hist, 입력_이름))
    
    # 선수 정보 검색
    검색결과 = 검색_게임(games_hist, 입력_이름)
    if 검색결과 is None or 검색결과.empty:
        st.error(f"선수 '{입력_이름}'의 경기 기록을 찾을 수 없습니다.")
        st.stop()
        
    게임_전적 = 전적계산(검색결과)
    단식_전적 = 전적계산(검색결과[검색결과['복식여부']=='단식'])
    복식_전적 = 전적계산(검색결과[검색결과['복식여부']=='복식'])
    ELO_전적 = 검색_ELO(elo_hist, 입력_이름)
    
    검색결과.index = 검색결과.index+1
    ELO_현재 = round(elo_check(ranking_table, 입력_이름))
    랭킹_현재 = ranking_table.index[(ranking_table["이름"]==입력_이름)][0]
    
    # 추가 분석
    try:
        상대선수_분석 = analyze_opponents(검색결과, 입력_이름)
    except Exception as e:
        st.warning(f"상대 선수 분석 중 오류 발생: {str(e)}")
        상대선수_분석 = pd.DataFrame()
        
    try:
        대회_분석 = analyze_tournaments(검색결과)
    except Exception as e:
        st.warning(f"대회별 성적 분석 중 오류 발생: {str(e)}")
        대회_분석 = pd.DataFrame()
        
    try:
        연도별_성적 = analyze_yearly_performance(검색결과)
    except Exception as e:
        st.warning(f"연도별 성적 분석 중 오류 발생: {str(e)}")
        연도별_성적 = pd.DataFrame()
    
    if 랭킹_현재 < 4:
        이모지 = rank_emoji(랭킹_현재) + " "
    else:
        이모지 = ""
        
    st.write(f'### {이모지}{입력_이름}')
    st.write(f'**대회**: 총 {대회수} 회')
    st.write(f'**전적**: 총 {게임_전적["전체"]} 경기 ({게임_전적["승리"]} 승 / {게임_전적["패배"]} 패)')
    if 단식_전적["전체"]:
        st.write(f' - 단식: 총 {단식_전적["전체"]} 경기 ({단식_전적["승리"]} 승 / {단식_전적["패배"]} 패) / 승률 {round(단식_전적["승리"]/단식_전적["전체"]*100)}%')
    if 복식_전적["전체"]:
        st.write(f' - 복식: 총 {복식_전적["전체"]} 경기 ({복식_전적["승리"]} 승 / {복식_전적["패배"]} 패) / 승률 {round(복식_전적["승리"]/복식_전적["전체"]*100)}%')
    st.write(f'**ELO**: {ELO_현재} 점 ({랭킹_현재} 위)')
    st.write(f'**최근 참가 대회**: {검색결과["대회명"][len(검색결과)-1]} ({검색결과["날짜"][len(검색결과)-1]})')
    
    tabs = st.tabs(["전적", "ELO변동", "랭킹변동", "분석"])
    
    with tabs[0]:
        st.header("경기 결과")
        with st.container(border=True, height = 800):
            for idx, game in 검색결과.iloc[::-1].iterrows():
                create_recent_games_form(game)
        
        # 승패 파이 차트
        if 게임_전적["전체"] > 0:
            fig = go.Figure(data=[go.Pie(
                labels=['승리', '패배'],
                values=[게임_전적["승리"], 게임_전적["패배"]],
                hole=.3,
                marker_colors=[COLOR_WIN, COLOR_LOSE]
            )])
            fig.update_layout(title='전체 승패 비율')
            st.plotly_chart(fig, use_container_width=True)
        
        # 단복식 비교 차트
        if 단식_전적["전체"] > 0 or 복식_전적["전체"] > 0:
            categories = []
            승리 = []
            패배 = []
            
            if 단식_전적["전체"] > 0:
                categories.append("단식")
                승리.append(단식_전적["승리"])
                패배.append(단식_전적["패배"])
            
            if 복식_전적["전체"] > 0:
                categories.append("복식")
                승리.append(복식_전적["승리"])
                패배.append(복식_전적["패배"])
            
            fig = go.Figure(data=[
                go.Bar(name='승리', x=categories, y=승리, marker_color=COLOR_WIN),
                go.Bar(name='패배', x=categories, y=패배, marker_color=COLOR_LOSE)
            ])
            fig.update_layout(
                title='단/복식 승패 비교',
                barmode='group'
            )
            st.plotly_chart(fig, use_container_width=True)
    
    with tabs[1]:
        st.write("##### ELO 변동")
        st.write(ELO_전적[["날짜", "대회명", "K값", "ELO"]].set_index(ELO_전적.columns[0]))
        
        # ELO 변동 그래프
        fig = go.Figure()
        
        # ELO 선 그래프
        fig.add_trace(go.Scatter(
            x=ELO_전적['대회명'],
            y=ELO_전적['ELO'],
            mode='lines+markers+text',
            name='ELO',
            line=dict(color=COLOR_PRIMARY, width=2),
            marker=dict(size=8),
            text=[f"{e}" for e in ELO_전적['ELO']],
            textposition='top center'
        ))
        
        # 레이아웃 설정
        fig.update_layout(
            title='ELO 변동 추이',
            xaxis_title='대회명',
            yaxis_title='ELO 점수',
            height=500,
            showlegend=True,
            legend=dict(
                orientation="h",
                yanchor="bottom",
                y=1.02,
                xanchor="right",
                x=1
            )
        )
        
        # x축 레이블 회전
        fig.update_xaxes(tickangle=45)
        
        st.plotly_chart(fig, use_container_width=True)
    
    with tabs[2]:
        # 랭킹 데이터 불러오기
        st.write("##### 랭킹 변동")
        data_랭킹 = 랭킹_hist(elo_hist)
        data_랭킹 = data_랭킹.loc[data_랭킹['이름'] == 입력_이름]
        
        # 날짜를 datetime 형식으로 변환
        data_랭킹['날짜'] = pd.to_datetime(data_랭킹['날짜'])
        
        # 대회명에 날짜 추가
        data_랭킹['대회명_날짜'] = data_랭킹['대회명'] + ' (' + data_랭킹['날짜'].dt.strftime('%Y-%m-%d') + ')'
        
        st.write(data_랭킹[["날짜", "대회명", "K값", "ELO", "순위"]].set_index(["날짜"]))
        
        # 랭킹 변동 그래프
        fig = go.Figure()
        
        # 순위 선 그래프 (낮을수록 좋은 순위)
        fig.add_trace(go.Scatter(
            x=data_랭킹['대회명_날짜'],
            y=data_랭킹['순위'],
            mode='lines+markers+text',
            name='순위',
            line=dict(color='#FF9800', width=2),
            marker=dict(size=8),
            text=[f"{r}위" for r in data_랭킹['순위']],
            textposition='top center'
        ))
        
        # 레이아웃 설정
        fig.update_layout(
            title='랭킹 변동 추이',
            xaxis_title='대회명 (날짜)',
            yaxis_title='순위 (낮을수록 좋음)',
            height=500,
            showlegend=True,
            legend=dict(
                orientation="h",
                yanchor="bottom",
                y=1.02,
                xanchor="right",
                x=1
            )
        )
        
        # y축 반전 (순위는 낮을수록 좋으므로)
        fig.update_yaxes(autorange="reversed")
        
        # x축 레이블 회전
        fig.update_xaxes(tickangle=45)
        
        st.plotly_chart(fig, use_container_width=True)
    
    with tabs[3]:
        # 대회별 성적 분석
        st.write("##### 대회별 성적")
        if not 대회_분석.empty:
            st.dataframe(대회_분석, use_container_width=True, hide_index=True)
            
            # 대회별 성적 차트
            fig = go.Figure()
            
            # 승리/패배 막대 그래프
            fig.add_trace(go.Bar(
                x=대회_분석['대회명'],
                y=대회_분석['승리'],
                name='승리',
                marker_color=COLOR_WIN
            ))
            
            fig.add_trace(go.Bar(
                x=대회_분석['대회명'],
                y=대회_분석['패배'],
                name='패배',
                marker_color=COLOR_LOSE
            ))
            
            # 승률 선 그래프 추가
            fig.add_trace(go.Scatter(
                x=대회_분석['대회명'],
                y=대회_분석['승률'].str.rstrip('%').astype(float),
                mode='lines+markers+text',
                name='승률',
                yaxis='y2',
                line=dict(color='black', width=2),
                marker=dict(size=8),
                text=대회_분석['승률'],
                textposition='top center'
            ))
            
            # 레이아웃 설정 (두 번째 Y축 추가)
            fig.update_layout(
                title='대회별 성적',
                xaxis_title='대회명',
                yaxis_title='경기 수',
                barmode='stack',
                yaxis2=dict(
                    title='승률 (%)',
                    title_font=dict(color='black'),
                    tickfont=dict(color='black'),
                    anchor='x',
                    overlaying='y',
                    side='right',
                    range=[0, 100]
                ),
                height=500
            )
            
            # x축 레이블 회전
            fig.update_xaxes(tickangle=45)
            
            st.plotly_chart(fig, use_container_width=True)
        
        # 월별 성적 분석
        st.write("##### 월별 성적")
        월별_성적 = analyze_monthly_performance(검색결과)
        if not 월별_성적.empty:
            # 연월_표시 컬럼을 제외하고 표시
            st.dataframe(월별_성적[['연월', '경기수', '승리', '패배', '승률']], use_container_width=True, hide_index=True)
            
            # 월별 성적 차트
            fig = go.Figure()
            
            # 승리/패배 막대 그래프
            fig.add_trace(go.Bar(
                x=월별_성적['연월_표시'],
                y=월별_성적['승리'],
                name='승리',
                marker_color=COLOR_WIN
            ))
            
            fig.add_trace(go.Bar(
                x=월별_성적['연월_표시'],
                y=월별_성적['패배'],
                name='패배',
                marker_color=COLOR_LOSE
            ))
            
            # 승률 선 그래프 추가
            fig.add_trace(go.Scatter(
                x=월별_성적['연월_표시'],
                y=월별_성적['승률'].str.rstrip('%').astype(float),
                mode='lines+markers+text',
                name='승률',
                yaxis='y2',
                line=dict(color='black', width=2),
                marker=dict(size=8),
                text=월별_성적['승률'],
                textposition='top center'
            ))
            
            # 레이아웃 설정 (두 번째 Y축 추가)
            fig.update_layout(
                title='월별 성적',
                xaxis_title='연월',
                yaxis_title='경기 수',
                barmode='stack',
                yaxis2=dict(
                    title='승률 (%)',
                    title_font=dict(color='black'),
                    tickfont=dict(color='black'),
                    anchor='x',
                    overlaying='y',
                    side='right',
                    range=[0, 100]
                ),
                height=500,
                xaxis=dict(
                    type='category',  # 카테고리형으로 설정하여 실제 데이터만 표시
                    tickangle=45
                )
            )
            
            st.plotly_chart(fig, use_container_width=True)
        
        # 상대 선수 분석
        st.write("##### 상대 선수별 전적 (단식)")
        if not 상대선수_분석.empty:
            # 상세 통계 표시
            st.dataframe(상대선수_분석, use_container_width=True, hide_index=True)
            
            # 상위 5명 상대 선수 차트
            if len(상대선수_분석) > 0:
                top_opponents = 상대선수_분석.head(min(5, len(상대선수_분석)))
                
                fig = go.Figure()
                
                # 승리/패배 막대 그래프
                fig.add_trace(go.Bar(
                    x=top_opponents['상대선수'],
                    y=top_opponents['승리'],
                    name='승리',
                    marker_color=COLOR_WIN
                ))
                
                fig.add_trace(go.Bar(
                    x=top_opponents['상대선수'],
                    y=top_opponents['패배'],
                    name='패배',
                    marker_color=COLOR_LOSE
                ))
                
                # 승률 선 그래프 추가
                fig.add_trace(go.Scatter(
                    x=top_opponents['상대선수'],
                    y=top_opponents['승률'].str.rstrip('%').astype(float),
                    mode='lines+markers+text',
                    name='승률',
                    yaxis='y2',
                    line=dict(color='black', width=2),
                    marker=dict(size=8),
                    text=top_opponents['승률'],
                    textposition='top center'
                ))
                
                # 레이아웃 설정 (두 번째 Y축 추가)
                fig.update_layout(
                    title='주요 상대 선수별 전적',
                    xaxis_title='상대 선수',
                    yaxis_title='경기 수',
                    barmode='stack',
                    yaxis2=dict(
                        title='승률 (%)',
                        title_font=dict(color='black'),
                        tickfont=dict(color='black'),
                        anchor='x',
                        overlaying='y',
                        side='right',
                        range=[0, 100]
                    ),
                    height=400
                )
                
                st.plotly_chart(fig, use_container_width=True)
                
                # 승률 기준 상대 선수 분류
                if len(상대선수_분석) >= 3:
                    st.write("##### 상대 선수 분류")
                    
                    # 승률에 따른 상대 분류
                    상대선수_분석['승률_값'] = 상대선수_분석['승률'].str.rstrip('%').astype(float)
                    강한상대 = 상대선수_분석[상대선수_분석['승률_값'] < 40]
                    비등한상대 = 상대선수_분석[(상대선수_분석['승률_값'] >= 40) & (상대선수_분석['승률_값'] <= 60)]
                    약한상대 = 상대선수_분석[상대선수_분석['승률_값'] > 60]
                    
                    col1, col2, col3 = st.columns(3)
                    
                    with col1:
                        st.markdown(f"### 😱 강한 상대 ({len(강한상대)}명)")
                        if not 강한상대.empty:
                            for _, row in 강한상대.iterrows():
                                st.markdown(f"**{row['상대선수']}**: {row['승리']}승 {row['패배']}패 ({row['승률']})")
                                st.markdown(f"평균 점수: {row['평균득점']}-{row['평균실점']}")
                                st.markdown(f"최근 대회: {row['대회명']} ({row['날짜']})")
                        else:
                            st.write("없음")
                    
                    with col2:
                        st.markdown(f"### 🤝 비등한 상대 ({len(비등한상대)}명)")
                        if not 비등한상대.empty:
                            for _, row in 비등한상대.iterrows():
                                st.markdown(f"**{row['상대선수']}**: {row['승리']}승 {row['패배']}패 ({row['승률']})")
                                st.markdown(f"평균 점수: {row['평균득점']}-{row['평균실점']}")
                                st.markdown(f"최근 대회: {row['대회명']} ({row['날짜']})")
                        else:
                            st.write("없음")
                            
                    with col3:
                        st.markdown(f"### 😎 유리한 상대 ({len(약한상대)}명)")
                        if not 약한상대.empty:
                            for _, row in 약한상대.iterrows():
                                st.markdown(f"**{row['상대선수']}**: {row['승리']}승 {row['패배']}패 ({row['승률']})")
                                st.markdown(f"평균 점수: {row['평균득점']}-{row['평균실점']}")
                                st.markdown(f"최근 대회: {row['대회명']} ({row['날짜']})")
                        else:
                            st.write("없음")
    
except KeyError as e:
    st.error(f"데이터 구조 오류: 필수 컬럼이 없습니다. ({str(e)})")
    st.error("데이터 파일을 확인해주세요.")
except ValueError as e:
    st.error(f"데이터 처리 오류: {str(e)}")
except Exception as e:
    st.error(f"예상치 못한 오류가 발생했습니다: {str(e)}")
    st.error("오류가 지속되면 관리자에게 문의해주세요.")
    
