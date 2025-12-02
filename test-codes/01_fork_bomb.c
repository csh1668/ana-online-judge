// 테스트 1: Fork Bomb - 프로세스 무한 생성 시도
// 샌드박스가 프로세스 수를 제한하는지 테스트
#include <stdio.h>
#include <unistd.h>

int main() {
    printf("Fork bomb 시작...\n");
    while(1) {
        fork();
    }
    return 0;
}





