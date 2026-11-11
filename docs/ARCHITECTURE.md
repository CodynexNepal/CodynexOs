# CodyNex OS — System Architecture

## 1. Overview
CodyNex OS is an autonomous AI-powered software company operating system where a human **CEO** issues natural-language strategic instructions, and a central **PostgreSQL-backed orchestrator** coordinates 20 logical AI employee roles across 5 departments (Executive, Engineering, Marketing, Sales, Operations).

## 2. Layered Backend Architecture (Mirrored from HostelGhar)
`HTTP Request -> Route -> Middleware/Decorator -> Controller -> Service -> Repository -> TypeORM/PostgreSQL`

- **Routes (`src/routes/`)**: Declarative endpoint definitions and middleware chains.
- **Decorators (`src/decorators/`)**: Route param validation (`requireParam`) and `Idempotency-Key` deduplication.
- **Controllers (`src/controller/`)**: Thin HTTP adapters; translate requests/responses only.
- **Services (`src/services/`)**: Business logic, orchestrator state transitions, AI routing, and audit event emission.
- **Repositories (`src/repository/`)**: Exclusive TypeORM data access layer.
- **Factories (`src/factory/`)**: Composition roots wiring repositories, services, and controllers.

## 3. Durable Task Execution (Laptop-Off Resilience)
- **PostgreSQL as Source of Truth**: Every project, task, dependency edge (`task_dependencies`), attempt (`task_executions`), and log (`task_logs`) is stored in PostgreSQL.
- **Lease Locking**: Workers claim ready `QUEUED` tasks (all dependencies `COMPLETED`) using `SELECT ... FOR UPDATE SKIP LOCKED` with `lease_owner` and `lease_expires_at`.
- **Bounded Retries & Backoff**: Failures increment `retry_count` and compute `next_run_at = NOW() + min(300s, 2^retry_count * 5s)`. Exceeding `max_retries` marks the task `FAILED` and raises a CEO notification.
- **Stuck-Task Reaper**: Reclaims expired leases (`RUNNING` with `lease_expires_at < NOW()`), allowing recovery after process crashes or host restarts.
- **Cloud Heartbeat**: Can run both via persistent Node worker (`ENABLE_WORKERS=true`) and signed `/api/v1/codynex/workers/tick` invocations from Cloudflare Workers Cron or GitHub Actions.

## 4. AI Adapter & NPR 0 Cost Guardrails
- `AiProviderAdapter` abstracts **Gemini Free Tier**, **Groq Free Tier**, optional local **Ollama**, and optional **OpenAI** (disabled by default via `ALLOW_PAID_PROVIDERS=false`).
- Budget policies enforce daily token limits and concurrency caps before dispatching AI requests.
- When free-tier quotas return `429` or daily limits are reached, the router falls back to secondary free providers or pauses queued work with `QUOTA_EXHAUSTED` status—never silently upgrading to paid APIs.

## 5. Security & Governance
- HttpOnly `access_token` + `refresh_token` cookies (with Bearer mirror support for API clients), `bcrypt` password hashing, `helmet`, strict CORS, and tiered rate limiting.
- AES-256-GCM encryption (`encryption.util.ts`) for stored integration tokens (GitHub PAT, Telegram bot token, SMTP credentials, AI keys).
- Strict tool allowlists (`allowed_tools`) per AI employee and untrusted-input delimiting (`prompt-guard.ts`) to prevent prompt injection.
- Mandatory CEO approval gates (`approval_requests`) for production deploys, merging to default branch, sending initial outreach campaigns, and budget overrides.
