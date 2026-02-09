.PHONY: dev-up dev-down dev-up-quick dev-judge-build prod-up prod-down db-migrate reset

# BuildKit: 레이어 캐시 활용으로 apt-get/의존성 단계는 캐시됨 (코드만 바뀌면 cargo build만 재실행)
export DOCKER_BUILDKIT := 1
export COMPOSE_DOCKER_CLI_BUILD := 1

# 개발 환경
dev-up:
	docker compose up -d --build

# 코드만 바뀐 경우: judge만 캐시 활용해 빌드 후 기동 (apt/isolate 등은 캐시에서 스킵)
dev-up-q:
	docker compose build judge && docker compose up -d

# judge 이미지만 빌드 (캐시 활용, 다른 서비스는 그대로)
dev-judge-build:
	docker compose build judge

dev-down:
	docker compose down

dev-db-migrate:
	cd web && pnpm db:migrate

dev-reset:
	docker compose down -v
	docker compose up -d --build
	make dev-db-migrate

# 프로덕션 환경
prod-up:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --build

prod-down:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod down

prod-db-migrate:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile migrate run --rm --build migrate

# prod-reset:
# 	docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod down -v
# 	docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --build
# 	docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile migrate run --rm migrate