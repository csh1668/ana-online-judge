개인적으로 AOJ를 개발하면서 막혔던 부분과 해결 방법 (기록용)


1. 아침까지 잘 동작하던 Judge가 배포 후 갑자기 동작하지 않는 문제 
- Docker 확인 결과 라이브러리의 버전을 고정하지 않아서 어제는 됐는데 오늘은 안되는 문제였음.
- isolate가 2.2에서 2.3으로 올라가면서 Debian 패키지가 직접 isolate 시스템 유저와 sub 유저 id 범위를 만드는 변경이 추가되었다.
- judge/Dockerfile에서 직접 유저 id를 할당해줘야 한다.
- 이때 isolate, rust, debian 등의 버전을 pin하기로 했다.

2. CLI를 이용한 문제 업로드 속도가 형편없었다
- 원인이 네 개 겹쳐 있었다.
- CLI 자체 병목: 매 호출마다 /meta/endpoints 재조회 + testcase 쌍마다 단건 업로드. contracts를 ~/.aoj-cache.json에 1h TTL로 캐싱하고, testcases/bulk 엔드포인트 + testcases-bulk-upload 명령으로 multipart 한 번에 올리도록 변경. client.ts에는 fetch 재시도(3회 backoff)와 업로드 5분 타임아웃 추가.
- WSL2 NAT 업로드 throttle: curl 직접 업로드도 100KB/s 수준. 브라우저는 같은 망에서 20MB/s. .wslconfig에 networkingMode=mirrored 추가 → AOJ 10MB 업로드가 1.47s로 복귀.
- Mirrored 전환 후 DNS 회귀: 매 쿼리 0.7~1s로 느려져 작은 호출이 5~12s. /etc/systemd/resolved.conf.d/fast-dns.conf에 DNS=1.1.1.1, Cache=yes 설정하고 systemd-resolved 재시작 → 17ms(첫) / 1ms(캐시).
- Hyper V Firewall로 인한 TCP 연결 Drop -> .wslconfig에 firewall=false 추가
- 결과: 전체 파이프라인 1.54s로 안정화, 48문제 시즌 import이 39분 → 약 1분으로 단축.