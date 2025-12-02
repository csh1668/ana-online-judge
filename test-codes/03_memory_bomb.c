// 테스트 3: 메모리 폭탄 - 무한 메모리 할당
// 메모리 제한 테스트
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main() {
    long long total = 0;
    printf("메모리 폭탄 시작...\n");
    
    while(1) {
        char *p = malloc(1024 * 1024); // 1MB씩 할당
        if (p) {
            memset(p, 'A', 1024 * 1024); // 실제로 사용해야 메모리 커밋됨
            total += 1;
            printf("할당됨: %lld MB\n", total);
        } else {
            printf("할당 실패!\n");
            break;
        }
    }
    return 0;
}





