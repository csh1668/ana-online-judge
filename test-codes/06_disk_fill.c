// 테스트 6: 디스크 공간 채우기 시도
// 파일 크기 제한 테스트
#include <stdio.h>
#include <string.h>

int main() {
    printf("디스크 채우기 시도...\n");
    
    FILE *f = fopen("bomb.txt", "w");
    if (!f) {
        printf("파일 생성 실패!\n");
        return 1;
    }
    
    char buf[1024 * 1024]; // 1MB 버퍼
    memset(buf, 'X', sizeof(buf));
    
    long long written = 0;
    while(1) {
        size_t n = fwrite(buf, 1, sizeof(buf), f);
        if (n != sizeof(buf)) {
            printf("쓰기 실패! 디스크 용량 제한됨\n");
            break;
        }
        written += n;
        printf("기록됨: %lld MB\n", written / (1024*1024));
        fflush(stdout);
    }
    
    fclose(f);
    return 0;
}





