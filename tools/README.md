# Contest Submission Graph Generator

Docker로 관리되는 PostgreSQL 데이터베이스에서 대회 제출 기록을 가져와 그래프를 생성하는 도구입니다.

## 요구사항

- Python 3.7+
- matplotlib
- boto3 (MinIO/S3 client)
- python-Levenshtein (Edit distance calculation)
- Docker (aoj-postgres 컨테이너가 실행 중이어야 함)

## 환경 변수 설정

### 로컬 환경에서 실행 시

`edit_distance_fixer.py`를 로컬에서 실행하려면 다음 환경 변수가 필요합니다:

```bash
export MINIO_ENDPOINT=http://localhost:9000
export MINIO_ACCESS_KEY=minioadmin
export MINIO_SECRET_KEY=minioadmin
```

### Docker 컨테이너 내부에서 실행 시

Docker 컨테이너(web) 내부에서 실행할 때는 환경 변수가 이미 설정되어 있습니다:
- `MINIO_ENDPOINT=minio`
- `MINIO_PORT=9000`
- `MINIO_ACCESS_KEY=minioadmin`
- `MINIO_SECRET_KEY=minioadmin`
- `DATABASE_URL=postgresql://postgres:postgres@postgres:5432/aoj`

따라서 별도의 환경 변수 설정 없이 바로 실행할 수 있습니다.

## 설치

### pip를 사용한 설치 (권장)

```bash
pip install -r requirements.txt
```

### 시스템 패키지로 설치

```bash
sudo apt install python3-matplotlib
pip install boto3 python-Levenshtein
```

## 사용법

### 제출 그래프만 생성

```bash
python3 generate_graphs.py <contest_id> [output_dir]
```

### Edit Distance 그래프만 생성

```bash
python3 generate_edit_distance_graph.py <contest_id> [output_dir]
```

### 통합 그래프 생성 (제출 + Edit Distance)

```bash
python3 generate_combined_graph.py <contest_id> [output_dir]
```

이 명령어는 제출 그래프와 edit distance 그래프를 하나의 이미지로 합쳐서 생성합니다.

### Edit Distance 재계산 및 수정

Anigma 문제의 edit_distance를 재계산하여 DB를 업데이트합니다.
줄바꿈 문자 정규화(\r\n -> \n)를 적용하여 일관된 결과를 보장합니다.

#### 로컬 환경에서 실행

```bash
python3 edit_distance_fixer.py <contest_id> [--dry-run]
```

#### Docker 컨테이너 내부에서 실행 (프로덕션 환경 권장)

**방법 1: 편리한 쉘 스크립트 사용 (권장)**

```bash
# Dry run
./run_fixer.sh 1 --dry-run

# 실제 DB 업데이트
./run_fixer.sh 1
```

**방법 2: 수동 실행**

```bash
# 1. 스크립트를 web 컨테이너로 복사
docker cp tools/edit_distance_fixer.py aoj-web:/app/
docker cp tools/requirements.txt aoj-web:/app/

# 2. 컨테이너 내부에서 의존성 설치
docker exec aoj-web pip install -r /app/requirements.txt

# 3. 컨테이너 내부에서 스크립트 실행 (Dry run)
docker exec aoj-web python3 /app/edit_distance_fixer.py 1 --dry-run --inside-docker

# 4. 실제 DB 업데이트
docker exec aoj-web python3 /app/edit_distance_fixer.py 1 --inside-docker
```

`--dry-run` 옵션을 사용하면 실제 DB를 변경하지 않고 변경 사항만 확인할 수 있습니다.
`--inside-docker` 옵션은 Docker 컨테이너 내부에서 실행할 때 필수입니다.

### 예시

```bash
# Contest 1의 모든 문제에 대한 그래프 생성 (output 디렉토리에 저장)
python generate_graphs.py 1

# Contest 1의 모든 문제에 대한 그래프 생성 (custom_output 디렉토리에 저장)
python generate_graphs.py 1 custom_output

# Contest 1의 edit distance 재계산 (Dry run) - 로컬
python3 edit_distance_fixer.py 1 --dry-run

# Contest 1의 edit distance 재계산 (Dry run) - Docker 내부
docker exec aoj-web python3 /app/edit_distance_fixer.py 1 --dry-run --inside-docker

# Contest 1의 edit distance 재계산 및 DB 업데이트 - Docker 내부
docker exec aoj-web python3 /app/edit_distance_fixer.py 1 --inside-docker
```

## 출력

### 제출 그래프 (`generate_graphs.py`)

각 문제별로 `contest_{contest_id}_problem_{label}.png` 형식의 그래프 파일이 생성됩니다.

예: `contest_1_problem_A.png`, `contest_1_problem_B.png`, ...

### Edit Distance 그래프 (`generate_edit_distance_graph.py`)

각 문제별로 시간에 따른 max(edit_distance) 변화를 보여주는 선그래프가 생성됩니다.

출력 파일 형식: `contest_{contest_id}_problem_{label}_edit_distance.png`

예: `contest_1_problem_A_edit_distance.png`

### 통합 그래프 (`generate_combined_graph.py`)

제출 그래프와 edit distance 그래프를 하나의 이미지로 합친 통합 그래프가 생성됩니다.

출력 파일 형식: `contest_{contest_id}_problem_{label}_combined.png`

예: `contest_1_problem_A_combined.png`

- 상단: 제출 그래프 (bar chart)
- 하단: Edit Distance 변화 그래프 (line chart)
- 두 그래프가 같은 시간 축을 공유하여 시간대별 비교가 용이합니다.

## 파일 구조

- `db_connector.py`: PostgreSQL 데이터베이스에서 데이터를 가져오는 모듈
- `db_to_model.py`: DB 데이터를 Submission 모델로 변환하는 모듈
- `generate_graphs.py`: 제출 그래프 생성 스크립트
- `generate_edit_distance_graph.py`: Edit Distance 변화 그래프 생성 스크립트
- `generate_combined_graph.py`: 제출 + Edit Distance 통합 그래프 생성 스크립트
- `edit_distance_fixer.py`: Anigma edit_distance 재계산 및 DB 업데이트 스크립트
- `run_fixer.sh`: edit_distance_fixer.py를 Docker 컨테이너에서 실행하는 편리한 쉘 스크립트
- `graph.py`: 그래프 생성 로직
- `model.py`: 데이터 모델 정의
- `requirements.txt`: Python 의존성 패키지 목록

## 프로덕션 배포 시 주의사항

프로덕션 환경에서는 MinIO, Redis, PostgreSQL이 내부 네트워크에서만 접근 가능합니다. 따라서:

1. **Edit Distance Fixer**: 반드시 `run_fixer.sh` 스크립트를 사용하거나, `--inside-docker` 옵션과 함께 컨테이너 내부에서 실행해야 합니다.
2. **그래프 생성 도구**: 현재 `docker exec` 명령어를 사용하므로 호스트에서 실행 가능합니다.
3. **환경 변수**: Docker Compose에서 자동으로 설정되므로 별도 설정이 불필요합니다.

