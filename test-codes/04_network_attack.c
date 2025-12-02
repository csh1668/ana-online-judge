// 테스트 4: 네트워크 연결 시도
// 네트워크 접근 차단 테스트
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

int main() {
    printf("네트워크 연결 시도...\n");
    
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        printf("소켓 생성 실패 - 차단됨!\n");
        return 1;
    }
    
    struct sockaddr_in server;
    server.sin_family = AF_INET;
    server.sin_port = htons(80);
    server.sin_addr.s_addr = inet_addr("1.1.1.1"); // Cloudflare DNS
    
    if (connect(sock, (struct sockaddr*)&server, sizeof(server)) < 0) {
        printf("연결 실패 - 네트워크 차단됨!\n");
    } else {
        printf("연결 성공! 네트워크 접근 가능!!\n");
        char *request = "GET / HTTP/1.1\r\nHost: 1.1.1.1\r\n\r\n";
        send(sock, request, strlen(request), 0);
    }
    
    close(sock);
    return 0;
}





