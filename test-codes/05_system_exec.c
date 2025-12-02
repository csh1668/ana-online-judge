// 테스트 5: 시스템 명령어 실행 시도
// system() 함수 및 쉘 접근 차단 테스트
#include <stdio.h>
#include <stdlib.h>

int main() {
    printf("시스템 명령어 실행 시도...\n");
    
    // 1. system() 함수
    printf("\n[1] system('whoami'):\n");
    int ret = system("whoami");
    printf("반환값: %d\n", ret);
    
    // 2. 호스트 정보
    printf("\n[2] system('uname -a'):\n");
    system("uname -a");
    
    // 3. 프로세스 목록
    printf("\n[3] system('ps aux'):\n");
    system("ps aux | head -5");
    
    // 4. 환경변수
    printf("\n[4] system('env'):\n");
    system("env | head -10");
    
    // 5. 디렉토리 탐색
    printf("\n[5] system('ls -la /'):\n");
    system("ls -la /");
    
    return 0;
}





