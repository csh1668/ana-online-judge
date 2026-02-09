크게 Rust 채점 서버 `judge`와, Next.js 웹 서버 `web`으로 구성되어있고, docker-compose를 이용해 배포된다.

## 테스트 방법
- web의 경우 pnpm dev 사용
- judge의 경우 개발 환경의 경우 make dev-up으로 이미 배포되어있음

## 코드 스타일
- 파일이 300줄 이상이면 분리 검토
- 함수가 50줄 이상이면 분리 검토
- 중복 코드는 공통 함수/컴포넌트로 추출
- 불필요한 리렌더링, 중복 API 호출 최적화
- Race condition 방지 (비동기 처리 시 상태 동기화 주의)
- 코드 작성/수정 후 반드시 cd web && pnpm lint:fix로 검증
- 개발 중 애매한 점이 있다면 반드시 질의 후 개발