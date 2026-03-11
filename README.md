# ELO Operations Hub (Cloudflare Pages + D1)

테니스 ELO 운영용 웹앱입니다.

## 구현된 기능

- 선수 등록 (초기 ELO 자동/수동)
- 진행 중 대회 1개 관리
- 단식/복식 경기 기록 및 삭제
- 대회 종료 시 ELO 일괄 반영
- 대회 기록 조회
- 선수별 전적/ELO 이력/상대 전적
- 전체 통계 및 ELO 분포

## 프로젝트 구조

- `index.html`, `styles.css`, `app.js`: 프론트엔드 SPA
- `_worker.js`: Pages Functions advanced mode 엔트리
- `functions/_worker.js`: API 라우터 본체
- `functions/_lib/*`: ELO 계산/공통 유틸
- `schema.sql`: D1 스키마

## 배포 전 필수

1. D1 생성
```bash
npx wrangler d1 create elo-prod
```

2. `wrangler.toml`의 `database_id` 채우기

3. 스키마 적용
```bash
npx wrangler d1 execute elo-prod --remote --file=schema.sql
```

## 로컬 실행

```bash
npm install
npm run dev
```

## 배포

```bash
npm run deploy
```
