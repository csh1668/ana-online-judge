# AOJ CLI

ANA Online Judge 관리자 CLI 도구. 서버의 API Registry에서 스키마를 동적으로 가져와 커맨드를 자동 생성합니다.

## 설치

프로젝트 루트에서 한 번에 빌드 후 전역 설치:

```bash
make cli           # cd cli && pnpm install && pnpm build && npm install -g .
make cli-uninstall # 제거
```

설치 후 어디서든 `aoj` 명령으로 사용할 수 있습니다.


## 초기 설정

```bash
# 서버 연결 설정
aoj config --url http://localhost:3000 --key <API_KEY>

# 설정 확인
aoj status
```

API Key는 Web 관리자 페이지 설정에서 발급할 수 있습니다.

## 도움말

```bash
aoj --help
aoj problems --help
aoj <command> -h
```

`aoj --help`는 서버에서 가져온 동적 커맨드 트리를 함께 출력합니다 (서버가 실행 중일 때).

## 출력 포맷

기본은 표(테이블) 형식. 자동화 스크립트에서 stdout을 파싱하려면 어떤 명령에든 `--json` 플래그를 붙이면 원본 JSON이 그대로 출력됩니다 (위치 무관).

```bash
# 생성된 problem id를 jq로 추출
aoj --json problems create --body-file problem.json | jq -r '.id'
aoj problems create --body-file problem.json --json | jq -r '.id'
```

## 커맨드

CLI는 서버의 `GET /api/v1/admin/meta/endpoints`에서 API 스키마를 자동으로 가져와 커맨드를 생성합니다. **서버가 실행 중이어야** 합니다 (`config`, `status`, `--help`, `translate` 제외).

### 문제 관리

```bash
aoj problems list
aoj problems list --page 2 --limit 10
aoj problems get <id>
aoj problems create --body-file problem.json
aoj problems update <id> --title "새 제목"
aoj problems delete <id>

# Public(가시성 필터 적용) 조회
aoj public problems-list
aoj public problems-get <id>

# 통계 / 정답자 랭킹
aoj problems stats-list <id>
aoj problems ranking-list <id>
```

복잡한 본문(`translations`, `allowedLanguages` 등)은 `--body-file` 사용 권장.

### 번역 / 스탭 / 출처 / 태그

```bash
# 번역 (translations)
aoj problems translations-list <id>
aoj problems translations <id> <language> --body-file ko.json   # POST upsert
aoj problems translations-delete <id> <language>
# 지문 + 이미지 동시 업로드 (커스텀 명령 - multipart)
# 마크다운의 로컬 이미지 참조(![](img/fig.png), <img src>)를 --content-file 기준으로 자동 수집해 첨부하고,
# 서버가 images/problems/{id}/{파일명}에 저장한 뒤 본문 URL을 치환한다. --image로 명시 지정도 가능.
aoj problems translations-upload <id> <language> -t "제목" -c ko.md [--image a.png b.png]
aoj problems translations-promote-update <id> <language>        # 원본 언어 변경

# 출제진/검토진 (staff)
aoj problems staff-list <id>
aoj problems staff <id> --user-id 7 --role author
aoj problems staff-delete <id> <userId>

# 출처 (sources) — 트리 구조
aoj sources list
aoj sources list --parent <parentId>
aoj sources search --q "USACO"
aoj sources get <id>
aoj sources create --body-file source.json
aoj sources update <id> --name "새 이름"
aoj sources delete <id>
aoj sources problems-list <id>

# 알고리즘 태그 (tags)
aoj tags list
aoj tags roots-list
aoj tags search-list --q "dp"
aoj tags by-slug-get <slug>
aoj tags get <id>
aoj tags create --body-file tag.json
aoj tags update <id> --name "..."
aoj tags delete <id>
aoj tags children-list <id>
```

### 테스트케이스

```bash
# 단일 쌍 업로드 (커스텀 명령 - multipart)
aoj problems testcases-upload <problemId> -i input.txt -o output.txt -s 10

# 디렉터리 단위 bulk 업로드 (권장 — 1 HTTP 요청으로 다수 쌍 업로드)
# 파일명 패턴: 1.in/1.out, 1.in/1.ans 등
aoj problems testcases-bulk-upload <problemId> -d ./testcases -s 10

aoj problems testcases-list <problemId>
aoj problems testcases-delete <problemId> <testcaseId>
```

### Checker / Validator

```bash
aoj problems checker <problemId> --source-code "$(cat checker.cpp)"
aoj problems validator <problemId> --source-code "$(cat validator.cpp)"
aoj problems validate <problemId>
aoj problems validation-result-list <problemId>
```

### 유저 관리

```bash
aoj users list
aoj users search-list --q "홍길동"
aoj users by-username-get <username>
aoj users role-update <userId> --role admin
aoj users profile-update <userId> --body-file profile.json
aoj users playground-quota-update <userId> --quota 10
aoj users workshop-quota-update <userId> --quota 5
aoj users delete <userId>
```

### 대회 관리

```bash
aoj contests list --status running
aoj contests create --title "연습대회" --start 2026-04-05T10:00:00Z --end 2026-04-05T15:00:00Z
aoj contests get <id>
aoj contests update <id> --title "수정된 제목"
aoj contests delete <id>
aoj contests freeze <id>
aoj contests refresh-scoreboard <id>
aoj contests source-update <id> --source-id 42
```

### 대회 문제

```bash
aoj contests problems <contestId> --problem-id 1 --label A
aoj contests problems-reorder-update <contestId> --problem-ids 3,1,2
aoj contests problems-delete <contestId> <contestProblemId>
```

### 대회 참가자

```bash
aoj contests participants-list <contestId>
aoj contests participants <contestId> --user-id 5
aoj contests participants-delete <contestId> <userId>
```

### 제출 (테스트용)

```bash
aoj submissions list --problem-id 1 --verdict accepted
aoj submissions admin-list                                  # 관리자 뷰
aoj submissions create --problem-id 1 --user-id 1 --language cpp --code "$(cat solution.cpp)"
aoj submissions get <id>
aoj submissions rejudge <id>
aoj submissions rejudge-by-ids --ids 1,2,3
aoj submissions rejudge-by-filter --body-file filter.json
aoj submissions user-problem-statuses-list --user-id 1 --problem-ids 1,2,3
```

### 설정

```bash
aoj settings registration-list
aoj settings registration-update --enabled true
aoj settings google-registration-list
aoj settings google-registration-update --enabled true
aoj settings get <key>
aoj settings update <key> --value "some_value"
```

### 파일

```bash
aoj files list
aoj files delete --key "images/some/file.png"
aoj files download <storagePath> -o output.txt   # 커스텀 명령
```

> 위 트리는 `cli/src/auto-commands.ts`의 `endpointToCommandInfo()`가 `web/src/lib/services/api-registry.ts`의 endpoint 메서드/경로로부터 동적으로 생성합니다. 정확한 인자/타입은 `aoj <command> -h`로 확인하세요.

## LLM 한국어 번역 (`aoj translate`)

해외 대회 문제를 Google Gemini로 한국어 번역해 저장.

### 사전 설정

```bash
# Gemini API 키 등록 (한 번만)
aoj config --gemini-key <your-gemini-api-key>

# (선택) 인물 풀 작성 — 동아리 부원 이름을 등장인물에 사용
cp cli/translate-characters.example.txt ~/.aoj-characters.txt
# 한 줄에 한 명씩, 빈 줄과 #로 시작하는 줄은 무시됨.
# 위치는 홈 디렉토리(~/.aoj-characters.txt) — `aoj` 글로벌 설치 후 어디서 실행해도 자동 로드.
# 다른 위치 쓰려면 `aoj translate <id> --characters <path>` 옵션 사용.
```

### 사용법

```bash
# 특정 문제 번역
aoj translate 101 102 103

# 한국어 번역이 없는 모든 문제 일괄 (먼저 5개만 dry-run으로 품질 확인 권장)
aoj translate --all-missing --limit 5 --dry-run
aoj translate --all-missing
```

### 옵션

| Flag | Default | 설명 |
|------|---------|------|
| `--to <lang>` | `ko` | 타깃 언어 (현재 ko만 지원) |
| `--from <lang\|auto>` | `auto` | 원문 언어 강제 (auto면 problems.translations.original 사용) |
| `--model <id>` | `gemini-3-flash-preview` | Gemini 모델 ID |
| `--concurrency <n>` | `5` | 동시 실행 개수 |
| `--force` | off | 이미 ko 번역이 있어도 덮어쓰기 |
| `--dry-run` | off | LLM 호출만, DB 저장 안 함, 결과는 stdout |
| `--all-missing` | off | 한국어 번역이 없는 모든 문제 처리 |
| `--characters <path>` | `~/.aoj-characters.txt` | 인물 풀 텍스트 (한 줄에 한 명) |
| `--prompt <path>` | (내장) | 시스템 프롬프트 마크다운 경로 |
| `--limit <n>` | (없음) | `--all-missing` 사용 시 최대 처리 개수 |

### 비용 통제 팁

대량 처리 전, 한두 개를 `--dry-run`으로 먼저 돌려 결과 품질 확인 권장:

```bash
aoj translate <id> --dry-run
```

## 캐시 / 재빌드

```bash
aoj refresh                       # 캐시된 API 스키마 삭제 (다음 실행 시 재-fetch)

# 소스 변경 후 전역 설치 재반영
make cli                          # 다시 빌드 + 재설치
```

## 핵심 포인트

- **서버가 반드시 실행 중이어야 함** — 동적 커맨드 등록을 위해 시작 시 `/meta/endpoints` 호출 (단, `config`/`status`/`--help`/`translate`는 서버 불필요)
- `web/src/lib/services/api-registry.ts`에 새 endpoint 추가 시 CLI에 자동 반영 — CLI 코드 수정 불필요
- 단, README 예시는 `endpointToCommandInfo()` 매핑 규칙(예: `GET /foo/bar` → `foo bar-list`, `PUT /users/:id/x` → `users x-update`)에 의존. 새 endpoint를 만들면 `aoj <group> --help`로 실제 이름을 확인하세요
