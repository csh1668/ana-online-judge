// 테스트 20: ptrace를 이용한 공격
#include <stdio.h>
#include <stdlib.h>
#include <sys/ptrace.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

int main() {
    printf("ptrace 공격 시도...\n");
    
    // 1. 자기 자신 추적 시도
    printf("\n[1] 자기 자신 TRACEME:\n");
    if (ptrace(PTRACE_TRACEME, 0, NULL, NULL) == 0) {
        printf("TRACEME 성공!\n");
    } else {
        printf("실패 - ptrace 차단됨\n");
    }
    
    // 2. 다른 프로세스 attach 시도
    printf("\n[2] PID 1 attach 시도:\n");
    if (ptrace(PTRACE_ATTACH, 1, NULL, NULL) == 0) {
        printf("PID 1 attach 성공!!!\n");
        ptrace(PTRACE_DETACH, 1, NULL, NULL);
    } else {
        printf("실패 - 접근 거부됨\n");
    }
    
    // 3. 부모 프로세스 attach
    pid_t ppid = getppid();
    printf("\n[3] 부모 프로세스(PPID=%d) attach:\n", ppid);
    if (ptrace(PTRACE_ATTACH, ppid, NULL, NULL) == 0) {
        printf("부모 프로세스 attach 성공!\n");
        ptrace(PTRACE_DETACH, ppid, NULL, NULL);
    } else {
        printf("실패\n");
    }
    
    // 4. fork 후 자식 추적
    printf("\n[4] fork 후 자식 추적:\n");
    pid_t pid = fork();
    if (pid == 0) {
        // 자식
        ptrace(PTRACE_TRACEME, 0, NULL, NULL);
        execl("/bin/ls", "ls", NULL);
        exit(0);
    } else if (pid > 0) {
        // 부모
        int status;
        waitpid(pid, &status, 0);
        printf("자식 프로세스 추적 완료\n");
    }
    
    return 0;
}





