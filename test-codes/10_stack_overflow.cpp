// 테스트 10: 스택 오버플로우
// 재귀 호출로 스택 메모리 고갈
#include <iostream>

void infinite_recursion(int depth) {
    char buffer[1024]; // 스택에 1KB 할당
    buffer[0] = 'A';
    
    if (depth % 1000 == 0) {
        std::cout << "Depth: " << depth << std::endl;
    }
    infinite_recursion(depth + 1);
}

int main() {
    std::cout << "스택 오버플로우 테스트 시작..." << std::endl;
    infinite_recursion(0);
    return 0;
}





