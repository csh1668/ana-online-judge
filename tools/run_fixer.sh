#!/bin/bash
# Edit Distance Fixer 실행 스크립트 (프로덕션 환경용)
#
# Usage:
#   ./run_fixer.sh <contest_id> [--dry-run]
#
# Example:
#   ./run_fixer.sh 1 --dry-run    # Dry run
#   ./run_fixer.sh 1              # 실제 DB 업데이트

set -e

if [ $# -lt 1 ]; then
    echo "Usage: $0 <contest_id> [--dry-run]"
    echo "Example: $0 1 --dry-run"
    exit 1
fi

CONTEST_ID=$1
DRY_RUN_FLAG=""

if [ "$2" = "--dry-run" ]; then
    DRY_RUN_FLAG="--dry-run"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Edit Distance Fixer ==="
echo "Contest ID: $CONTEST_ID"
echo "Dry Run: ${DRY_RUN_FLAG:-false}"
echo ""

# 1. 스크립트를 web 컨테이너로 복사
echo "[1/4] Copying script to container..."
docker cp "$SCRIPT_DIR/edit_distance_fixer.py" aoj-web:/app/
docker cp "$SCRIPT_DIR/requirements.txt" aoj-web:/app/

# 2. 의존성 설치
echo "[2/4] Installing dependencies..."
docker exec aoj-web pip install -q -r /app/requirements.txt

# 3. 스크립트 실행
echo "[3/4] Running edit_distance_fixer.py..."
docker exec aoj-web python3 /app/edit_distance_fixer.py "$CONTEST_ID" $DRY_RUN_FLAG --inside-docker

# 4. 정리
echo "[4/4] Cleaning up..."
docker exec aoj-web rm -f /app/edit_distance_fixer.py /app/requirements.txt

echo ""
echo "=== Done ==="

