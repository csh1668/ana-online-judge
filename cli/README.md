# AOJ CLI

ANA Online Judge 관리자 CLI 도구. 서버의 API Registry에서 스키마를 동적으로 가져와 커맨드를 자동 생성합니다.

## 초기 설정

```bash
cd cli
pnpm install

# 서버 연결 설정
pnpm dev -- config --url http://localhost:3000 --key <API_KEY>
```

API Key는 Web 관리자 페이지 설정에서 발급 및 설정할 수 있습니다.

## 기본 사용

```bash
# 설정 확인
pnpm dev -- status

# 도움말
pnpm dev -- --help
pnpm dev -- problems --help
```

## 커맨드

CLI는 서버의 `GET /api/v1/admin/meta/endpoints`에서 API 스키마를 자동으로 가져와 커맨드를 생성합니다. **서버가 실행 중이어야** 합니다.

### 문제 관리

```bash
pnpm dev -- problems list
pnpm dev -- problems list --page 2 --limit 10
pnpm dev -- problems get <id>
pnpm dev -- problems create --title "A+B" --content "..." --time-limit 1000
pnpm dev -- problems update <id> --title "새 제목"
pnpm dev -- problems delete <id>
```

### 테스트케이스

```bash
pnpm dev -- problems testcases-upload <problemId> -i input.txt -o output.txt -s 10
pnpm dev -- problems testcases-list <problemId>
pnpm dev -- problems testcases-delete <problemId> <testcaseId>
```

### Checker / Validator

```bash
pnpm dev -- problems checker <problemId> --source-code "$(cat checker.cpp)"
pnpm dev -- problems validator <problemId> --source-code "$(cat validator.cpp)"
pnpm dev -- problems validate <problemId>
pnpm dev -- problems validation-result-get <problemId>
```

### 유저 관리

```bash
pnpm dev -- users list
pnpm dev -- users search --q "홍길동"
pnpm dev -- users role-update <userId> --role admin
pnpm dev -- users playground-update <userId> --has-access true
pnpm dev -- users delete <userId>
```

### 대회 관리

```bash
pnpm dev -- contests list --status running
pnpm dev -- contests create --title "연습대회" --start 2026-04-05T10:00:00Z --end 2026-04-05T15:00:00Z
pnpm dev -- contests get <id>
pnpm dev -- contests update <id> --title "수정된 제목"
pnpm dev -- contests delete <id>
pnpm dev -- contests freeze <id>
pnpm dev -- contests refresh-scoreboard <id>
```

### 대회 문제

```bash
pnpm dev -- contests problems <contestId> --problem-id 1 --label A
pnpm dev -- contests problems-reorder-update <contestId> --problem-ids 3,1,2
pnpm dev -- contests problems-remove <contestId> <contestProblemId>
```

### 대회 참가자

```bash
pnpm dev -- contests participants-list <contestId>
pnpm dev -- contests participants <contestId> --user-id 5
pnpm dev -- contests participants-remove <contestId> <userId>
```

### 제출 (테스트용)

```bash
pnpm dev -- submissions list --problem-id 1 --verdict accepted
pnpm dev -- submissions create --problem-id 1 --user-id 1 --language cpp --code "$(cat solution.cpp)"
pnpm dev -- submissions get <id>
pnpm dev -- submissions rejudge <id>
```

### 설정

```bash
pnpm dev -- settings registration
pnpm dev -- settings registration-update --enabled true
pnpm dev -- settings get <key>
pnpm dev -- settings update <key> --value "some_value"
```

### 파일

```bash
pnpm dev -- files list
pnpm dev -- files delete --key "images/some/file.png"
pnpm dev -- files download <storagePath> -o output.txt
```

## 빌드 후 사용

```bash
pnpm build
node dist/index.js problems list
```

## 핵심 포인트

- **서버가 반드시 실행 중이어야 함** — CLI가 시작할 때 `/meta/endpoints`를 호출하여 사용 가능한 커맨드 목록을 동적으로 생성
- `config`, `status`, `--help`는 서버 없이도 동작
- `web/src/lib/services/api-registry.ts`에 새 endpoint를 추가하면 CLI에 자동 반영 — CLI 코드 수정 불필요
