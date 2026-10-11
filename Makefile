.DEFAULT_GOAL := help

COMPOSE := docker compose
DEPS := redis mailpit
ENV_FILE := .env

.PHONY: help deps deps-up up deps-down down ports sync-env api worker typecheck enqueue ps logs reset

help:
	@echo "bullmq-mail"
	@echo
	@echo "  make deps        Start Redis + Mailpit, wait healthy, print ports, sync .env"
	@echo "  make deps-down   Stop Redis + Mailpit"
	@echo "  make ports       Show mapped host ports for deps"
	@echo "  make sync-env    Write REDIS_PORT / Mailpit ports into .env"
	@echo "  make api         Run API on the host (bun)"
	@echo "  make worker      Run Worker on the host (bun)"
	@echo "  make typecheck   tsc --noEmit"
	@echo "  make enqueue TO=a@b.com   Enqueue a sample mail job"
	@echo "  make ps / logs   Compose status / dep logs"
	@echo "  make reset       Wipe dep containers + volumes, then deps again"

deps deps-up up: $(ENV_FILE)
	$(COMPOSE) up -d --wait $(DEPS)
	@$(MAKE) --no-print-directory ports
	@$(MAKE) --no-print-directory sync-env

deps-down down:
	$(COMPOSE) stop $(DEPS)

ports:
	@redis_port=$$($(COMPOSE) port redis 6379 | cut -d: -f2); \
	mailpit_smtp=$$($(COMPOSE) port mailpit 1025 | cut -d: -f2); \
	mailpit_ui=$$($(COMPOSE) port mailpit 8025 | cut -d: -f2); \
	printf 'redis        127.0.0.1:%s  -> 6379\n' "$$redis_port"; \
	printf 'mailpit smtp 127.0.0.1:%s -> 1025\n' "$$mailpit_smtp"; \
	printf 'mailpit ui   http://127.0.0.1:%s  (8025)\n' "$$mailpit_ui"

sync-env: $(ENV_FILE)
	@set -e; \
	redis_port=$$($(COMPOSE) port redis 6379 | cut -d: -f2); \
	mailpit_smtp=$$($(COMPOSE) port mailpit 1025 | cut -d: -f2); \
	mailpit_ui=$$($(COMPOSE) port mailpit 8025 | cut -d: -f2); \
	upsert() { \
	  key="$$1"; value="$$2"; tmp=$$(mktemp); \
	  if grep -q "^$${key}=" $(ENV_FILE); then \
	    awk -v k="$$key" -v v="$$value" 'BEGIN{FS=OFS="="} $$1==k{$$0=k"="v} {print}' $(ENV_FILE) > "$$tmp" && mv "$$tmp" $(ENV_FILE); \
	  else \
	    printf '%s=%s\n' "$$key" "$$value" >> $(ENV_FILE); \
	  fi; \
	}; \
	upsert REDIS_HOST 127.0.0.1; \
	upsert REDIS_PORT "$$redis_port"; \
	upsert MAILPIT_SMTP_HOST 127.0.0.1; \
	upsert MAILPIT_SMTP_PORT "$$mailpit_smtp"; \
	upsert MAILPIT_UI_URL "http://127.0.0.1:$$mailpit_ui"; \
	printf 'synced %s: REDIS_PORT=%s MAILPIT_SMTP_PORT=%s\n' $(ENV_FILE) "$$redis_port" "$$mailpit_smtp"

$(ENV_FILE):
	cp .env.example $(ENV_FILE)

api: $(ENV_FILE)
	bun run api

worker: $(ENV_FILE)
	bun run worker

typecheck:
	bun run typecheck

enqueue: $(ENV_FILE)
	@test -n "$(TO)" || (echo "usage: make enqueue TO=you@example.com"; exit 1)
	bun run scripts/enqueue-sample.ts --to "$(TO)" $(if $(SUBJECT),--subject "$(SUBJECT)",)

ps:
	$(COMPOSE) ps $(DEPS)

logs:
	$(COMPOSE) logs -f --tail=100 $(DEPS)

reset:
	$(COMPOSE) rm -sfv $(DEPS)
	$(COMPOSE) down -v --remove-orphans
	$(MAKE) deps
