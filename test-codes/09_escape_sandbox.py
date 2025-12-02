# 테스트 9: Python 샌드박스 탈출 시도
import os
import sys
import subprocess

print("=== Python 샌드박스 탈출 테스트 ===\n")

# 1. os.system 실행
print("[1] os.system('id'):")
try:
    os.system('id')
except Exception as e:
    print(f"실패: {e}")

# 2. subprocess 사용
print("\n[2] subprocess.run('ls -la /'):")
try:
    result = subprocess.run(['ls', '-la', '/'], capture_output=True, text=True)
    print(result.stdout[:500])
except Exception as e:
    print(f"실패: {e}")

# 3. 파일 시스템 탐색
print("\n[3] /etc/passwd 읽기:")
try:
    with open('/etc/passwd', 'r') as f:
        print(f.read()[:500])
except Exception as e:
    print(f"실패: {e}")

# 4. 환경변수 출력
print("\n[4] 환경변수:")
for key in list(os.environ.keys())[:10]:
    print(f"  {key}={os.environ[key]}")

# 5. 현재 디렉토리
print(f"\n[5] 현재 디렉토리: {os.getcwd()}")
print(f"파일 목록: {os.listdir('.')}")

# 6. 프로세스 정보
print(f"\n[6] PID: {os.getpid()}, UID: {os.getuid()}, GID: {os.getgid()}")

# 7. 네트워크 시도
print("\n[7] 네트워크 연결 시도:")
try:
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(3)
    s.connect(('1.1.1.1', 80))
    print("연결 성공! 네트워크 접근 가능!")
    s.close()
except Exception as e:
    print(f"실패: {e}")

# 8. import 제한 테스트
print("\n[8] 위험한 모듈 import:")
dangerous_modules = ['ctypes', 'multiprocessing', 'threading']
for mod in dangerous_modules:
    try:
        __import__(mod)
        print(f"  {mod}: 성공!")
    except Exception as e:
        print(f"  {mod}: 차단됨 - {e}")





