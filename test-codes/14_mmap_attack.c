// 테스트 14: mmap을 이용한 메모리 공격
#include <stdio.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <string.h>

int main() {
    printf("mmap 메모리 공격 시작...\n");
    
    size_t page_size = 4096;
    size_t chunk = 1024 * 1024 * 10; // 10MB씩
    long long total = 0;
    
    while(1) {
        void *ptr = mmap(NULL, chunk, 
                         PROT_READ | PROT_WRITE,
                         MAP_PRIVATE | MAP_ANONYMOUS,
                         -1, 0);
        
        if (ptr == MAP_FAILED) {
            printf("mmap 실패! 총 매핑: %lld MB\n", total);
            break;
        }
        
        // 메모리 터치 (실제 할당)
        memset(ptr, 0, chunk);
        total += chunk / (1024 * 1024);
        printf("매핑됨: %lld MB\n", total);
    }
    
    return 0;
}





