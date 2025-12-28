#!/bin/bash

# ANIGMA 로컬 테스트 스크립트

# 현재 스크립트 위치
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== ANIGMA 로컬 테스트 시작 ==="
echo ""

# 1. 테스트 입력 파일 생성
echo "1️⃣ 테스트 입력 파일 생성"
echo "1" > "$SCRIPT_DIR/input.txt"
echo "✅ input.txt 생성 완료"
echo ""

# 2. 빌드
echo "2️⃣ 소스 코드 빌드 (make build)"
cd "$SCRIPT_DIR"
if make build; then
    echo "✅ 빌드 성공"
else
    echo "❌ 빌드 실패"
    exit 1
fi
echo ""

# 3. 실행
echo "3️⃣ 프로그램 실행 (make run file=input.txt)"
if make run file="$SCRIPT_DIR/input.txt"; then
    echo "✅ 실행 성공"
else
    echo "❌ 실행 실패"
    exit 1
fi
echo ""

# 4. 정리
echo "4️⃣ 정리 (make clean)"
make clean
rm -f "$SCRIPT_DIR/input.txt"
echo "✅ 정리 완료"
echo ""

echo "=== 테스트 완료 ==="




