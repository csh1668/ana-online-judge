// 테스트 7: 무한 루프 - CPU 시간 제한 테스트
#include <stdio.h>

int main() {
    printf("무한 루프 시작...\n");
    long long count = 0;
    while(1) {
        count++;
        if (count % 100000000 == 0) {
            printf("반복: %lld억\n", count / 100000000);
        }
    }
    return 0;
}





