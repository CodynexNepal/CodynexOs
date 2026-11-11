# CodyNex OS — Security & Threat Model

## 1. Authentication & RBAC
- Passwords hashed with `bcrypt` (`SALT_ROUNDS >= 10`).
- Short-lived JWT access tokens (`15m`) + session-backed refresh tokens (`7d`, SHA-256 hashed in `sessions` table).
- Roles: `CEO`, `ADMIN`, `OPERATOR`, `VIEWER`. Sensitive endpoints (approvals, budget overrides, secret settings, task cancellation) strictly require `CEO` or `ADMIN`.

## 2. Secret Management
- Secrets saved via `/settings` (`isSecret: true`) are encrypted at rest with **AES-256-GCM** (`enc:v1:<iv>:<tag>:<ciphertext>`) derived from `ENCRYPTION_KEY`.
- API responses and structured logs redact secrets (`maskSecret`, `logger.util.ts` key redaction).

## 3. Prompt Injection & Least-Privilege AI Guardrails
- External text (GitHub files/comments, web research, inbound CRM replies, user prompts) is wrapped in `[UNTRUSTED_DATA ...]` envelopes and scanned for injection patterns (`prompt-guard.ts`).
- Every AI employee carries an explicit `allowedTools` list enforced server-side before tool execution.
- Agents communicate solely through validated PostgreSQL task records — recursive agent-to-agent loops are disallowed.

## 4. Engineering & Outreach Safeguards
- Direct pushes to `defaultBranch` (`main`/`master`) are rejected at the service boundary.
- Initial marketing campaigns and outbound outreach require explicit CEO approval (`approval_requests`).
- CRM opt-out flags (`is_opted_out = true`) permanently block outbound drafting and re-enrollment.

## 5. HTTP & Abuse Protections
- `helmet` security headers, strict `CORS_ORIGIN` allowlist with credentials, `x-powered-by` disabled, and tiered `express-rate-limit` policies (`globalRateLimiter`, `authRateLimiter`, `commandRateLimiter`).
- Timing-safe comparison (`crypto.timingSafeEqual`) for `X-Worker-Secret` on `/workers/tick`.
