// 테스트 12: 스레드 폭탄 - 무한 스레드 생성
#include <iostream>
#include <thread>
#include <vector>
#include <atomic>

std::atomic<int> thread_count(0);

void dummy_thread() {
    thread_count++;
    while(true) {
        std::this_thread::sleep_for(std::chrono::hours(1));
    }
}

int main() {
    std::cout << "스레드 폭탄 시작..." << std::endl;
    std::vector<std::thread> threads;
    
    try {
        while(true) {
            threads.emplace_back(dummy_thread);
            if (thread_count % 10 == 0) {
                std::cout << "생성된 스레드: " << thread_count << std::endl;
            }
        }
    } catch (const std::exception& e) {
        std::cout << "예외 발생: " << e.what() << std::endl;
        std::cout << "최종 스레드 수: " << thread_count << std::endl;
    }
    
    return 0;
}





