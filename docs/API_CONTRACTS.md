# CodyNex OS — API Contracts (`/api/v1/codynex`)

## Authentication (`/auth`)
- `POST /auth/login` — Email/password login; sets `HttpOnly` `access_token` & `refresh_token` cookies and returns `{ user, accessToken }`.
- `POST /auth/refresh` — Rotates `access_token` using active `sessions` record.
- `POST /auth/logout` — Revokes current or all sessions (`{ logoutAll?: boolean }`) and clears cookies.
- `GET /auth/me` — Returns authenticated user profile.
- `PUT /auth/password` — Updates password and revokes existing sessions.

## Executive & Orchestrator
- `GET /overview` — Live PostgreSQL counts (AI employees, tasks, projects, token usage, provider availability, department performance, recent audit logs).
- `GET /departments` — Lists all 5 departments and token budgets.
- `GET /employees` — Lists all 20 logical AI employees, tool allowlists, and model routing config.
- `POST /command` — Issues a natural-language CEO directive (`Idempotency-Key` supported); returns project, clarification questions if ambiguous, and created DAG tasks.
- `GET /projects` — Lists all projects.
- `GET /tasks` — Filterable by `projectId`, `status`, `departmentId`.
- `POST /tasks` — Creates a task with optional `dependsOnTaskIds`.
- `GET /tasks/:id/logs` — Returns persistent execution logs.
- `POST /tasks/:id/retry` — Re-queues a failed/blocked/cancelled task.
- `POST /tasks/:id/cancel` — Cancels a queued/blocked/pending task.
- `POST /workers/tick` — Signed (`X-Worker-Secret`) batch execution trigger for cloud cron workers.

## Approvals, Memory & Knowledge
- `GET /approvals` & `POST /approvals/:id/review` — CEO-only (`CEO` role) approve/reject gate.
- `GET /memory` & `POST /memory` — Full-text/filterable organizational memory.
- `GET /knowledge` & `POST /knowledge` — Trusted SOP and playbook repository.

## Engineering & QA
- `GET /github/repos` & `POST /github/repos` — Authorize repositories.
- `POST /github/repos/:id/sync` — Sync open PRs from GitHub REST API.
- `POST /github/repos/:id/branch-pr` — Create a task-isolated branch & PR (rejects default branch direct push).
- `GET /github/repos/:id/analyze` — Inspect repository metadata and recent commits/branches.
- `GET /github/pull-requests` — List synced pull requests.
- `GET /qa/reports` & `POST /qa/reports` — Record QA verification reports; `FAILED` verdicts automatically spawn a linked correction task.

## Marketing, Sales CRM, Cost & Governance
- `GET /marketing/campaigns` & `POST /marketing/campaigns` — Campaigns require CEO approval before activation.
- `GET /crm/leads`, `POST /crm/leads`, `POST /crm/leads/:id/opt-out`
- `POST /crm/leads/:id/outreach`, `POST /crm/leads/:id/follow-up`, `PATCH /crm/leads/:id/stage`
- `GET /crm/interactions` & `POST /crm/interactions/:id/classify`
- `GET /ai-usage` & `PUT /ai-usage/budget` (CEO-only; `allowPaidProviders` defaults to `false`).
- `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all`
- `GET /audit-logs`
- `GET /settings` & `PUT /settings` (CEO-only; secret keys encrypted with AES-256-GCM).
