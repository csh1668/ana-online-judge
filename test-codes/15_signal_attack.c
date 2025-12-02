// 테스트 15: 시그널 조작 시도
#include <stdio.h>
#include <signal.h>
#include <unistd.h>

void handler(int sig) {
    printf("시그널 %d 캐치!\n", sig);
}

int main() {
    printf("시그널 공격 시도...\n");
    
    // SIGKILL, SIGSTOP은 catch 불가
    // 다른 시그널들 catch 시도
    signal(SIGTERM, handler);
    signal(SIGINT, handler);
    signal(SIGALRM, handler);
    signal(SIGSEGV, handler);
    
    printf("\n[1] 다른 프로세스에 시그널 보내기 시도 (kill):\n");
    
    // PID 1 (init)에 시그널 보내기 시도
    if (kill(1, SIGTERM) == 0) {
        printf("PID 1에 SIGTERM 전송 성공!\n");
    } else {
        printf("PID 1에 시그널 전송 실패 - 차단됨!\n");
    }
    
    // 부모 프로세스에 시그널
    printf("\n[2] 부모 프로세스(PPID=%d)에 시그널:\n", getppid());
    if (kill(getppid(), SIGTERM) == 0) {
        printf("부모에게 SIGTERM 전송 성공!\n");
    } else {
        printf("부모에게 시그널 전송 실패!\n");
    }
    
    // 자신에게 알람 설정
    printf("\n[3] 자신에게 SIGALRM:\n");
    alarm(1);
    sleep(2);
    
    printf("완료\n");
    return 0;
}





