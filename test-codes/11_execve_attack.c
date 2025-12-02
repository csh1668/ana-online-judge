// 테스트 11: execve 시스템 콜로 쉘 실행 시도
#include <stdio.h>
#include <unistd.h>

int main() {
    printf("execve로 쉘 실행 시도...\n");
    
    char *argv[] = {"/bin/sh", "-c", "echo '쉘 실행 성공!'; whoami; id", NULL};
    char *envp[] = {NULL};
    
    execve("/bin/sh", argv, envp);
    
    // execve가 실패하면 여기 도달
    printf("execve 실패 - 차단됨!\n");
    
    // 다른 쉘 시도
    printf("\n/bin/bash 시도...\n");
    char *argv2[] = {"/bin/bash", "-c", "echo 'bash 실행!'; pwd", NULL};
    execve("/bin/bash", argv2, envp);
    printf("/bin/bash 실패\n");
    
    return 0;
}





