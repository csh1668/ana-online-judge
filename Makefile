.PHONY: dev-up dev-down prod-up prod-down db-push reset

# 개발 환경
dev-up:
	docker compose up -d

dev-down:
	docker compose down

dev-db-push:
	cd web && pnpm db:push

dev-reset:
	docker compose down -v
	docker compose up -d --build
	make dev-db-push

# 프로덕션 환경
prod-up:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --build

prod-down:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod down

prod-db-push:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile migrate run --rm --build migrate

# prod-reset:
# 	docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod down -v
# 	docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d --build
# 	docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile migrate run --rm migrate