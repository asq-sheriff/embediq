.PHONY: help install build check test test-watch test-coverage test-snapshots typecheck \
       start start-web dev dev-web \
       docker docker-up docker-down \
       otel-dev evaluate benchmark drift sanitize-public publish-public-dry docs-lint \
       verify-audit-log clean

# ─── Default ─────────────────────────────────────────────────────────
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ─── Setup ───────────────────────────────────────────────────────────
install: ## Install all dependencies
	npm install

# ─── Quality ─────────────────────────────────────────────────────────
typecheck: ## Type-check without emitting
	npx tsc --noEmit

test: ## Run test suite
	npm test

test-watch: ## Run tests in watch mode
	npm run test:watch

test-coverage: ## Run tests with coverage report
	npm run test:coverage

test-snapshots: ## Update test snapshots (writes — run intentionally)
	npm run test:snapshots

check: typecheck test ## Type-check + run tests (CI equivalent)

# ─── Build ───────────────────────────────────────────────────────────
build: check ## Build (type-check + test + compile)
	npm run build

# ─── Run ─────────────────────────────────────────────────────────────
start: ## Run CLI wizard
	npm start

start-web: ## Run web server (port 3000)
	npm run start:web

dev: ## Watch mode for CLI
	npm run dev

dev-web: ## Watch mode for web server
	npm run dev:web

otel-dev: ## Run web server with OpenTelemetry enabled
	EMBEDIQ_OTEL_ENABLED=true npm run dev:web

# ─── Evaluation ──────────────────────────────────────────────────────
evaluate: ## Run evaluation harness against golden configs
	npm run evaluate

benchmark: ## Run benchmark mode (requires --candidate/--candidate-label args)
	npm run benchmark

drift: ## Run drift detection (requires --target and --answers or --archetype)
	npm run drift

# ─── Public-release overlay ──────────────────────────────────────────
sanitize-public: ## Dry-run the public-release overlay (writes nothing). Add -- --out <dir> to materialize.
	npm run sanitize-public

publish-public-dry: ## Dry-run the full publish pipeline (sanitize + clone public + show diff; no commit, no push).
	./scripts/publish-public.sh --dry-run

# ─── Docs hygiene ─────────────────────────────────────────────────────
docs-lint: ## Lint markdown: audience frontmatter, leak markers in public files, broken links.
	npm run docs-lint

# ─── Governance ───────────────────────────────────────────────────────
verify-audit-log: ## Verify integrity of a tamper-evident audit log (pass --input <path>).
	npm run verify-audit-log --

# ─── Docker ──────────────────────────────────────────────────────────
docker: ## Build Docker image
	docker build -t embediq .

docker-up: ## Start with docker-compose
	docker compose up -d

docker-down: ## Stop docker-compose services
	docker compose down

# ─── Cleanup ─────────────────────────────────────────────────────────
clean: ## Remove build artifacts
	rm -rf dist/ coverage/ .vitest/
