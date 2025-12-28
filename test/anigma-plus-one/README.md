# ANIGMA 테스트 제출 코드

## 문제
args를 이용한 파일 입력으로 정수 하나가 입력되는데 그 정수 + 1 한 값을 출력하시오

## 예제
- 입력: 1
- 출력: 2

## 파일 구조
```
anigma-plus-one/
├── main.cpp                  # C++ 소스 코드 (제출용)
├── Makefile                  # 빌드 및 실행 타겟 (제출용)
├── anigma-plus-one.zip       # 제출용 ZIP 파일
├── reference_code/           # 원본 코드 (편집 거리 계산용)
│   ├── main.cpp
│   └── Makefile
├── reference_code.zip        # 원본 코드 ZIP (문제 생성 시 업로드)
├── create_zip.py             # 제출용 ZIP 생성 스크립트
├── create_reference_zip.py   # Reference code ZIP 생성 스크립트
├── test_local.sh             # 로컬 테스트 스크립트
└── README.md                 # 이 파일
```

## Makefile 타겟
- `make build`: 소스 코드를 컴파일하여 실행 파일 생성
- `make run file=<파일경로>`: 프로그램 실행 (입력 파일 경로 전달)
- `make clean`: 빌드된 파일 정리

## 로컬 테스트 방법

1. 테스트 실행:
```bash
cd /home/tjgus1668/works/ana-online-judge/test/anigma-plus-one
./test_local.sh
```

## ZIP 파일 생성 방법

### 제출용 ZIP 파일
```bash
python3 create_zip.py
```

### Reference Code ZIP 파일
```bash
python3 create_reference_zip.py
```

**중요**: ZIP 파일의 최상위에 `Makefile`과 `main.cpp`가 있어야 합니다.

## 문제 생성 방법

1. **Admin 페이지에서 문제 생성**
   - 문제 유형: ANIGMA 선택
   - 제목: "ANIGMA TEST"
   - 시간 제한: 1000ms
   - 메모리 제한: 256MB
   - **원본 코드 (ZIP 파일)**: `reference_code.zip` 업로드 ← **새로운 기능**

2. **테스트케이스 추가**
   - 입력 1: `1`
   - 출력 1: `2`

3. **제출**
   - `anigma-plus-one.zip` 파일 업로드

## 제출 후 채점 과정

1. ZIP 파일 검증 (Makefile 존재 및 build, run 타겟 확인)
2. MinIO에 ZIP 파일 업로드
3. Judge 서버에서 ZIP 파일 다운로드 및 압축 해제
4. `make build` 실행하여 컴파일
5. 각 테스트케이스마다 `make run file=<테스트케이스>` 실행
6. 출력 결과와 예상 출력 비교
7. **편집 거리 계산** (reference code와 제출 코드 비교) ← **새로운 기능**
8. ANIGMA 점수 계산 (런타임 수정 점수 + 편집 거리 보너스)

## 구현 변경 사항

### 1. Judge 서버 수정 (`judge/src/anigma/mod.rs`)
- `reference_code_path`가 비어있는 경우 처리 추가
- `reference_code_path`가 `.zip`으로 끝나면 ZIP으로 처리
- ZIP 압축 해제 후 모든 소스 파일 읽기
- 일반 텍스트 파일인 경우 기존 방식 유지

```rust
// 원본 코드 다운로드 (편집 거리 계산용)
let reference_code = if job.reference_code_path.is_empty() {
    String::new()  // 빈 문자열 (편집 거리 보너스 없음)
} else if job.reference_code_path.ends_with(".zip") {
    // ZIP 파일 압축 해제 후 소스 파일 읽기
    let ref_temp_dir = tempfile::tempdir()?;
    let ref_zip_data = storage.download(&job.reference_code_path).await?;
    let ref_cursor = std::io::Cursor::new(ref_zip_data);
    extract_zip(ref_cursor, ref_temp_dir.path())?;
    read_all_source_files(ref_temp_dir.path())?
} else {
    // 일반 텍스트 파일
    storage.download_string(&job.reference_code_path).await?
};
```

### 2. 웹 UI 수정 (`web/src/app/admin/problems/problem-form.tsx`)
- ANIGMA 문제 타입일 때 Reference Code ZIP 업로드 필드 추가
- 파일 상태 관리 및 FormData에 포함

### 3. 백엔드 수정 (`web/src/actions/admin.ts`)
- `createProblem`: reference code ZIP 업로드 처리
- `updateProblem`: reference code ZIP 업데이트 처리
- MinIO에 `problems/{problemId}/reference_code.zip` 경로로 저장

## 문제 해결 내역

### 이전 문제
- Judge 서버가 `reference_code_path`가 빈 문자열일 때 "Failed to download" 에러 발생
- ANIGMA 문제 생성 시 reference code를 설정할 방법이 없었음

### 해결 방법
1. Judge 서버에서 빈 경로 처리 로직 추가
2. ZIP 파일 형식 지원 추가
3. 웹 UI에 파일 업로드 기능 추가
4. 백엔드에서 MinIO 업로드 처리

## 다음 단계

1. 문제 생성 페이지에서 ANIGMA 문제 생성
2. Reference code ZIP 업로드
3. 테스트케이스 추가
4. 제출용 ZIP으로 제출
5. 편집 거리 보너스가 포함된 점수 확인
