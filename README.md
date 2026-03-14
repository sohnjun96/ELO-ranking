# ELO Operations Hub (Cloudflare Pages + D1)

테니스/배드민턴식 리그 운영에 맞춘 ELO 관리 웹앱입니다.  
프론트엔드는 Vue 3 SPA, 백엔드는 Cloudflare Pages Functions + D1(SQLite)로 구성되어 있습니다.

## 핵심 기능

- 대시보드
  - KPI(총 선수/총 경기/총 대회/평균 레이팅)
  - 현재 랭킹(전적, 승률 포함)
  - 최근 경기 카드
- 대회 진행
  - 동시에 1개 대회만 진행
  - 참가자 다중 선택(클릭 토글) + 검색 추가
  - 경기 결과 입력 모달(단식/복식 토글)
  - 진행 중 대회 설정 변경(이름/날짜/타입/참가자)
  - 대회 취소/종료
- 대회 기록
  - 종료 대회 리포트 조회
  - 대시보드/카드에서 대회 클릭 이동
- 선수별 기록
  - 선수 검색 후 즉시 로딩
  - 최근 경기 5개 + 전체보기 모달
  - 경기 통계 그래프
  - ELO 변동 추이 그래프(라인) + 변동량(바)
  - 상대 전적
- 관리
  - 선수 이름 변경
  - 선수 ELO 관리자 조정
  - 선수 비활성화(삭제)
  - 대회 타입별 점수 규칙 조정
    - 정규 대회(REGULAR)
    - 상시 대회(ADHOC)
    - 친선전(FRIENDLY)
  - ELO 시뮬레이터 모달

## 기술 스택

- Frontend: Vue 3 (ESM), Chart.js
- Backend: Cloudflare Pages Functions (advanced mode)
- Database: Cloudflare D1
- Deploy: Cloudflare Pages + GitHub 연동

## 프로젝트 구조

- `index.html`, `styles.css`, `app.js`: 프론트엔드 SPA
- `_worker.js`: Pages Functions advanced mode 엔트리
- `functions/_worker.js`: API 라우터
- `functions/_lib/*`: ELO 계산/유틸
- `schema.sql`: D1 스키마
- `wrangler.toml.example`: 로컬/CLI 참고용 예시 파일

## D1 준비

1. D1 데이터베이스 생성

```bash
npx wrangler d1 create elo-prod
```

2. 스키마 적용

```bash
npx wrangler d1 execute elo-prod --remote --file=schema.sql
```

## Cloudflare Pages 배포 (권장)

이 저장소는 루트의 `wrangler.toml` 없이 Pages 대시보드에서 설정하는 방식을 기준으로 합니다.

1. GitHub 저장소를 Cloudflare Pages에 연결
2. Build command 비움(또는 생략)
3. Build output directory는 저장소 루트(`.`)
4. Pages 프로젝트 설정에서 D1 바인딩 추가
   - Variable name: `DB`
   - Database: `elo-prod`
5. Deploy

## 로컬 개발

```bash
npm install
npm run dev
```

기본 dev 명령은 `wrangler pages dev .` 입니다.  
로컬에서 D1까지 함께 검증하려면 `wrangler.toml.example`를 참고해 환경을 구성하세요.
