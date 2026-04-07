개인적으로 AOJ를 개발하면서 막혔던 부분과 해결 방법 (기록용)


1. 아침까지 잘 동작하던 Judge가 배포 후 갑자기 동작하지 않는 문제 
- Docker 확인 결과 라이브러리의 버전을 고정하지 않아서 어제는 됐는데 오늘은 안되는 문제였음.
- isolate가 2.2에서 2.3으로 올라가면서 Debian 패키지가 직접 isolate 시스템 유저와 sub 유저 id 범위를 만드는 변경이 추가되었다.
- judge/Dockerfile에서 직접 유저 id를 할당해줘야 한다.
- 이때 isolate, rust, debian 등의 버전을 pin하기로 했다. 18a242679e8bb250baa58ce1e8d6c9df9874a6db

2. 