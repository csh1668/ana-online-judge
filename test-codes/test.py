#!/usr/bin/env python3
"""
배치 테스트 스크립트 - 여러 위험한 코드를 한번에 테스트

사용법:
    python batch_test.py              # 모든 테스트 실행
    python batch_test.py --quick      # 빠른 테스트 (일부만)
    python batch_test.py --pattern "fork"  # 패턴 매칭
"""

import argparse
import json
import os
import random
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import redis
from minio import Minio
from io import BytesIO


# 기본 설정
REDIS_HOST = "localhost"
REDIS_PORT = 6379
MINIO_ENDPOINT = "localhost:9000"
MINIO_ACCESS_KEY = "minioadmin"
MINIO_SECRET_KEY = "minioadmin"
MINIO_BUCKET = "aoj-storage"

QUEUE_NAME = "judge:queue"
RESULT_KEY_PREFIX = "judge:result:"

# 테스트 케이스 정의
TEST_CASES = [
    # (파일명, 언어, 설명, 예상 결과들)
    ("01_fork_bomb.c", "c", "Fork Bomb", ["runtime_error", "time_limit_exceeded"]),
    ("02_read_passwd.c", "c", "/etc/passwd 읽기", ["accepted", "runtime_error", "wrong_answer"]),
    ("03_memory_bomb.c", "c", "메모리 폭탄", ["memory_limit_exceeded", "runtime_error"]),
    ("04_network_attack.c", "c", "네트워크 연결", ["runtime_error", "accepted", "wrong_answer"]),
    ("05_system_exec.c", "c", "system() 실행", ["accepted", "runtime_error", "wrong_answer"]),
    ("06_disk_fill.c", "c", "디스크 채우기", ["runtime_error", "wrong_answer"]),
    ("07_infinite_loop.c", "c", "무한 루프", ["time_limit_exceeded"]),
    ("08_symlink_attack.c", "c", "심볼릭 링크", ["runtime_error", "accepted", "wrong_answer"]),
    ("09_escape_sandbox.py", "python", "Python 탈출", ["accepted", "runtime_error", "wrong_answer"]),
    ("10_stack_overflow.cpp", "cpp", "스택 오버플로우", ["runtime_error"]),
    ("11_execve_attack.c", "c", "execve 공격", ["runtime_error", "accepted"]),
    ("12_thread_bomb.cpp", "cpp", "스레드 폭탄", ["runtime_error", "time_limit_exceeded"]),
    ("13_file_descriptor_bomb.c", "c", "FD 폭탄", ["runtime_error", "wrong_answer"]),
    ("14_mmap_attack.c", "c", "mmap 공격", ["memory_limit_exceeded", "runtime_error"]),
    ("15_signal_attack.c", "c", "시그널 공격", ["runtime_error", "accepted", "wrong_answer"]),
    ("16_java_escape.java", "java", "Java 탈출", ["accepted", "runtime_error", "wrong_answer"]),
    ("17_js_escape.js", "javascript", "JS 탈출", ["accepted", "runtime_error", "wrong_answer"]),
    ("18_rust_escape.rs", "rust", "Rust 탈출", ["accepted", "runtime_error", "wrong_answer"]),
    ("19_chroot_escape.c", "c", "chroot 탈출", ["runtime_error", "accepted"]),
    ("20_ptrace_attack.c", "c", "ptrace 공격", ["runtime_error", "accepted"]),
]

# 색상
class Colors:
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    MAGENTA = '\033[95m'
    CYAN = '\033[96m'
    RESET = '\033[0m'
    BOLD = '\033[1m'


def colorize(text, color):
    return f"{color}{text}{Colors.RESET}"


def verdict_color(verdict):
    colors = {
        "accepted": Colors.GREEN,
        "wrong_answer": Colors.RED,
        "time_limit_exceeded": Colors.YELLOW,
        "memory_limit_exceeded": Colors.MAGENTA,
        "runtime_error": Colors.RED,
        "compile_error": Colors.RED,
        "system_error": Colors.RED,
    }
    return colors.get(verdict.lower(), Colors.RESET)


def run_single_test(redis_client, minio_client, test_dir, filename, language, timeout=30):
    """단일 테스트 실행"""
    filepath = test_dir / filename
    if not filepath.exists():
        return None, f"파일 없음: {filename}"
    
    with open(filepath, 'r') as f:
        code = f.read()
    
    submission_id = random.randint(800000, 899999)
    testcase_id = random.randint(100000, 199999)
    
    # 테스트케이스 업로드 (빈 입출력)
    input_path = f"testcases/batch-test/{testcase_id}/input.txt"
    output_path = f"testcases/batch-test/{testcase_id}/output.txt"
    
    try:
        input_data = BytesIO(b"")
        minio_client.put_object(MINIO_BUCKET, input_path, input_data, 0)
        output_data = BytesIO(b"")
        minio_client.put_object(MINIO_BUCKET, output_path, output_data, 0)
    except Exception as e:
        return None, f"MinIO 오류: {e}"
    
    # Job 생성
    job = {
        "submission_id": submission_id,
        "problem_id": 1,
        "code": code,
        "language": language,
        "time_limit": 2000,  # 2초
        "memory_limit": 256,  # 256MB
        "testcases": [{
            "id": testcase_id,
            "input_path": input_path,
            "output_path": output_path,
        }]
    }
    
    # 작업 전송
    redis_client.rpush(QUEUE_NAME, json.dumps(job))
    
    # 결과 대기
    result_key = f"{RESULT_KEY_PREFIX}{submission_id}"
    start_time = time.time()
    result = None
    
    while time.time() - start_time < timeout:
        result_json = redis_client.get(result_key)
        if result_json:
            result = json.loads(result_json)
            redis_client.delete(result_key)
            break
        time.sleep(0.3)
    
    # 테스트케이스 파일 정리 (MinIO에서 삭제)
    try:
        minio_client.remove_object(MINIO_BUCKET, input_path)
        minio_client.remove_object(MINIO_BUCKET, output_path)
    except Exception:
        pass  # 삭제 실패해도 무시
    
    if result:
        return result, None
    return None, "타임아웃"


def main():
    parser = argparse.ArgumentParser(description="배치 테스트 스크립트")
    parser.add_argument("--quick", action="store_true", help="빠른 테스트 (일부만)")
    parser.add_argument("--pattern", help="파일명 패턴 필터")
    parser.add_argument("--timeout", type=int, default=30, help="테스트당 타임아웃 (초)")
    parser.add_argument("--parallel", type=int, default=1, help="병렬 실행 수 (기본: 1)")
    args = parser.parse_args()
    
    # 테스트 디렉토리
    test_dir = Path(__file__).parent
    
    # 테스트 케이스 필터링
    tests = TEST_CASES
    if args.pattern:
        tests = [t for t in tests if args.pattern.lower() in t[0].lower()]
    
    if not tests:
        print(colorize("테스트할 항목이 없습니다.", Colors.YELLOW))
        sys.exit(0)
    
    print(colorize(f"\n{'='*70}", Colors.BLUE))
    print(colorize("🧪 샌드박스 보안 배치 테스트", Colors.BOLD))
    print(colorize(f"{'='*70}", Colors.BLUE))
    print(f"  테스트 수: {len(tests)}")
    print(f"  타임아웃: {args.timeout}초")
    print(f"  병렬 실행: {args.parallel}")
    
    # 연결
    print(colorize("\n🔗 서비스 연결 중...", Colors.CYAN))
    try:
        redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
        redis_client.ping()
        print(colorize("  ✓ Redis 연결 성공", Colors.GREEN))
    except Exception as e:
        print(colorize(f"  ✗ Redis 연결 실패: {e}", Colors.RED))
        sys.exit(1)
    
    try:
        minio_client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=False
        )
        if not minio_client.bucket_exists(MINIO_BUCKET):
            minio_client.make_bucket(MINIO_BUCKET)
        print(colorize("  ✓ MinIO 연결 성공", Colors.GREEN))
    except Exception as e:
        print(colorize(f"  ✗ MinIO 연결 실패: {e}", Colors.RED))
        sys.exit(1)
    
    # 테스트 실행
    print(colorize(f"\n{'='*70}", Colors.BLUE))
    print(colorize("📋 테스트 결과", Colors.BOLD))
    print(colorize(f"{'='*70}", Colors.BLUE))
    
    results_summary = {
        "passed": 0,
        "warning": 0,
        "failed": 0,
        "error": 0,
    }
    
    all_results = []
    
    for filename, language, description, expected_verdicts in tests:
        print(f"\n▶ {colorize(filename, Colors.CYAN)} ({language})")
        print(f"  📝 {description}")
        
        result, error = run_single_test(
            redis_client, minio_client, test_dir,
            filename, language, args.timeout
        )
        
        if error:
            status = colorize("❌ ERROR", Colors.RED)
            print(f"  결과: {status} - {error}")
            results_summary["error"] += 1
            all_results.append((filename, "error", error))
            continue
        
        verdict = result.get("verdict", "unknown")
        exec_time = result.get("execution_time", "N/A")
        memory = result.get("memory_used", "N/A")
        
        verdict_str = colorize(verdict.upper(), verdict_color(verdict))
        
        # 결과 평가
        if verdict in expected_verdicts:
            status = colorize("✓ PASS", Colors.GREEN)
            results_summary["passed"] += 1
            all_results.append((filename, "pass", verdict))
        elif verdict == "accepted":
            # accepted인데 예상하지 않은 경우 - 보안 경고!
            status = colorize("⚠ WARNING - 보안 취약점 가능!", Colors.YELLOW + Colors.BOLD)
            results_summary["warning"] += 1
            all_results.append((filename, "warning", verdict))
        else:
            status = colorize("✗ UNEXPECTED", Colors.MAGENTA)
            results_summary["failed"] += 1
            all_results.append((filename, "unexpected", verdict))
        
        print(f"  결과: {status}")
        print(f"  판정: {verdict_str} ({exec_time}ms, {memory}KB)")
        print(f"  예상: {', '.join(expected_verdicts)}")
        
        if result.get("error_message"):
            msg = result["error_message"][:200]
            print(f"  에러: {msg}...")
        
        # 프로그램 출력 표시 (testcase_results에서 가져옴)
        tc_results = result.get("testcase_results", [])
        for tc in tc_results:
            if tc.get("output"):
                output = tc["output"]
                # 출력을 보기 좋게 정리
                lines = output.strip().split('\n')
                print(colorize("  ─── 프로그램 출력 ───", Colors.YELLOW))
                for line in lines[:15]:  # 최대 15줄
                    print(f"  │ {line}")
                if len(lines) > 15:
                    print(f"  │ ... ({len(lines) - 15}줄 더)")
                print(colorize("  ─────────────────────", Colors.YELLOW))
    
    # 요약
    print(colorize(f"\n{'='*70}", Colors.BLUE))
    print(colorize("📊 테스트 요약", Colors.BOLD))
    print(colorize(f"{'='*70}", Colors.BLUE))
    
    total = len(tests)
    print(f"  총 테스트: {total}")
    print(f"  {colorize('✓ PASS', Colors.GREEN)}: {results_summary['passed']}")
    print(f"  {colorize('⚠ WARNING', Colors.YELLOW)}: {results_summary['warning']}")
    print(f"  {colorize('✗ UNEXPECTED', Colors.MAGENTA)}: {results_summary['failed']}")
    print(f"  {colorize('❌ ERROR', Colors.RED)}: {results_summary['error']}")
    
    if results_summary["warning"] > 0:
        print(colorize("\n🚨 보안 경고!", Colors.RED + Colors.BOLD))
        print("  다음 테스트에서 예상치 못한 성공(accepted)이 발생했습니다:")
        for filename, status, verdict in all_results:
            if status == "warning":
                print(f"    - {filename}: {verdict}")
        print("  샌드박스 보안을 점검하세요!")
    
    print(colorize(f"\n{'='*70}\n", Colors.BLUE))
    
    # 종료 코드
    if results_summary["warning"] > 0 or results_summary["error"] > 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()

