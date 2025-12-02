// 테스트 2: /etc/passwd 파일 읽기 시도
// 파일 시스템 접근 제한 테스트
#include <stdio.h>

int main() {
    FILE *f = fopen("/etc/passwd", "r");
    if (f) {
        char buf[1024];
        while(fgets(buf, sizeof(buf), f)) {
            printf("%s", buf);
        }
        fclose(f);
    } else {
        printf("파일 열기 실패 - 접근 차단됨!\n");
    }
    return 0;
}





