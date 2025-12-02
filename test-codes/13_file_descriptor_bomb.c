// 테스트 13: 파일 디스크립터 폭탄
// 파일 열기 제한 테스트
#include <stdio.h>
#include <fcntl.h>
#include <unistd.h>

int main() {
    printf("파일 디스크립터 폭탄 시작...\n");
    
    int count = 0;
    while(1) {
        int fd = open("/dev/null", O_RDONLY);
        if (fd < 0) {
            printf("파일 열기 실패! 총 열린 파일: %d\n", count);
            break;
        }
        count++;
        if (count % 50 == 0) {
            printf("열린 파일 수: %d\n", count);
        }
    }
    
    return 0;
}





