// 테스트 8: 심볼릭 링크 공격 시도
// 샌드박스 외부 파일 접근 시도
#include <stdio.h>
#include <unistd.h>

int main() {
    printf("심볼릭 링크 공격 시도...\n");
    
    // /etc/shadow 심볼릭 링크 생성 시도
    if (symlink("/etc/shadow", "shadow_link") == 0) {
        printf("심볼릭 링크 생성 성공!\n");
        
        FILE *f = fopen("shadow_link", "r");
        if (f) {
            char buf[1024];
            while(fgets(buf, sizeof(buf), f)) {
                printf("%s", buf);
            }
            fclose(f);
        } else {
            printf("링크 파일 열기 실패\n");
        }
    } else {
        printf("심볼릭 링크 생성 실패 - 차단됨!\n");
    }
    
    // /proc 접근 시도
    printf("\n/proc/1/cmdline 읽기 시도...\n");
    FILE *f = fopen("/proc/1/cmdline", "r");
    if (f) {
        char buf[256];
        fgets(buf, sizeof(buf), f);
        printf("PID 1 cmdline: %s\n", buf);
        fclose(f);
    } else {
        printf("/proc 접근 차단됨!\n");
    }
    
    return 0;
}





